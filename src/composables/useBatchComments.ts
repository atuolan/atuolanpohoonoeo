/**
 * 批量評論生成 Composable
 * 提供帶有 replyTo 機制的多角色評論生成功能
 */

import { generateBatchComments } from "@/services/AIService";
import { allowsPasserby, buildCastContext, getViewerIds, pickResponders } from "@/services/plurkCast";
import { buildChatContextForCharacters, getChatContextOptions } from "@/services/plurkGeneration";
import { applyReplyVerdict } from "@/services/plurkModeration";
import { clearGenerating, plurkActivity, setGenerating } from "@/services/plurkReveal";
import { useAIGenerationStore } from "@/stores/aiGeneration";
import { useCharactersStore } from "@/stores/characters";
import { useQzoneStore } from "@/stores/qzone";
import { useSettingsStore } from "@/stores/settings";
import { useUserStore } from "@/stores/user";
import type { StoredCharacter } from "@/types/character";
import type { GeneratedComment, QZoneComment } from "@/types/qzone";
import type { DirectorStrictness } from "@/utils/plurkDirectorConfig";
import { spreadReplyTimes } from "@/utils/plurkReplyTiming";
import { isSquarePost, MODERATOR_NAME } from "@/utils/plurkSquare";
import { moderationDelayAt } from "@/utils/plurkSquareSchedule";
import { computed } from "vue";

export interface GenerateCommentsOptions {
  minComments?: number;
  maxComments?: number;
  includeExistingComments?: boolean;
  useStreaming?: boolean;
  replyToCharacterId?: string; // 被回覆的角色 ID（確保該角色參與）
  chatContext?: Record<string, string>; // 每個角色各自的聊天記錄
  allowPasserby?: boolean; // 沒給就照這則噗的設定
  slow?: boolean; // 沒給就照這則噗的「慢慢回」
  ignorePolicy?: boolean; // 使用者手動叫角色時，忽略「不要回應」
  background?: boolean; // 自動模式：不開串流視窗
  judgeCommentId?: string; // 廣場：順便請版主判定使用者剛留的這則
}

const TONE_HINTS = {
  again: "換個說法，意思可以不同",
  cold: "這次回得冷淡、簡短一點",
  warm: "這次回得溫柔、多一點關心",
} as const;

export type RegenerateTone = keyof typeof TONE_HINTS;

export function useBatchComments() {
  const settingsStore = useSettingsStore();
  const qzoneStore = useQzoneStore();
  const charactersStore = useCharactersStore();
  const aiGenerationStore = useAIGenerationStore();
  const userStore = useUserStore();

  // 使用全局 store 的狀態
  const isGenerating = computed(() => aiGenerationStore.isTaskGenerating("qzone", "qzone-comments"));

  function toPromptCharacter(char: StoredCharacter) {
    // 與聊天系統一致：優先使用角色／聊天解析出的 persona，而不是把貼文作者當作私聊對象
    const resolvedPersonaId = userStore.resolvePersonaForChat(char.id);
    const boundPersona = resolvedPersonaId ? userStore.personas.find((p) => p.id === resolvedPersonaId) : null;
    return {
      id: char.id,
      name: char.data?.name || char.nickname || "未知角色",
      personality: char.data?.personality || "",
      description: char.data?.description || "",
      boundUserName: boundPersona?.name,
    };
  }

  /**
   * 為指定貼文生成批量評論
   * @param characterIds 有給就照給的（仍要看得到這則噗），沒給就照噗的設定挑
   */
  async function generateCommentsForPost(
    postId: string,
    characterIds?: string[],
    options?: GenerateCommentsOptions,
  ): Promise<{ success: boolean; addedCount: number; error?: string }> {
    const post = qzoneStore.posts.find((p) => p.id === postId);
    if (!post) {
      return { success: false, addedCount: 0, error: "找不到指定的貼文" };
    }

    // 檢查 API 配置（優先使用備用 API）
    const taskConfig = settingsStore.getAPIForTask("plurkComment");
    if (!taskConfig.api.apiKey) {
      return { success: false, addedCount: 0, error: "API Key 未設定" };
    }

    // 挑角色：有指定就照指定，沒指定就照噗的設定挑
    const castCtx = await buildCastContext();
    const viewerSet = new Set(getViewerIds(post, castCtx));
    const ids = characterIds
      ? characterIds.filter((id) => viewerSet.has(id))
      : pickResponders(post, castCtx, {
          priorityIds: options?.replyToCharacterId ? [options.replyToCharacterId] : [],
          ignorePolicy: options?.ignorePolicy,
        });
    const characters = ids
      .map((id) => charactersStore.characters.find((c) => c.id === id))
      .filter((c): c is StoredCharacter => !!c);
    const passerbyAllowed = options?.allowPasserby ?? allowsPasserby(post);
    const passerbyOnly = characters.length === 0 && passerbyAllowed;
    if (characters.length === 0 && !passerbyOnly) {
      return { success: true, addedCount: 0 };
    }

    // 使用全局 AI 生成 store 註冊任務
    const startResult = aiGenerationStore.startGeneration("qzone", "qzone-comments", {
      characterName: "噗浪評論",
    });
    if (!startResult.success) {
      return { success: false, addedCount: 0, error: startResult.error };
    }

    setGenerating(
      postId,
      characters.map((c) => c.nickname || c.data?.name || "角色"),
    );
    try {
      const chatContext =
        options?.chatContext ??
        (await buildChatContextForCharacters(
          characters.map((c) => c.id),
          getChatContextOptions(),
        ));
      const selectedIds = new Set(characters.map((c) => c.id));
      const selectedChatContext = Object.fromEntries(
        Object.entries(chatContext).filter(([characterId]) => selectedIds.has(characterId)),
      );

      // 準備已有評論（用於 replyTo 和歷史對話上下文）
      const existingComments = options?.includeExistingComments !== false ? post.comments : [];
      // 廣場上的噗：版主可能刪留言
      const strictness = qzoneStore.directorConfig.strictness;
      const moderation = isSquarePost(post) && strictness !== "loose" ? { strictness } : undefined;

      const result = await generateBatchComments({
        characters: characters.map(toPromptCharacter),
        post,
        existingComments,
        minComments: options?.minComments ?? (passerbyOnly ? 2 : Math.max(characters.length, 3)),
        maxComments: options?.maxComments ?? (passerbyOnly ? 5 : Math.max(characters.length * 2, 8)),
        useStreaming: options?.useStreaming,
        useStreamingWindow: options?.background ? false : undefined,
        passerbyOnly,
        allowPasserby: passerbyAllowed,
        chatContext: selectedChatContext,
        replyToCharacterId: options?.replyToCharacterId,
        moderation,
        verdictFor:
          options?.judgeCommentId && moderation ? { commentId: options.judgeCommentId, strictness } : undefined,
      });

      if (!result.success) {
        aiGenerationStore.setError("qzone", result.error || "生成失敗", "qzone-comments");
        return { success: false, addedCount: 0, error: result.error };
      }

      // 將生成的評論添加到貼文
      const addedCount = await addGeneratedComments(
        postId,
        result.comments,
        characters,
        options?.slow ?? post.slowReplies ?? false,
        moderation?.strictness,
      );

      if (options?.judgeCommentId && result.verdict) {
        await applyReplyVerdict(postId, options.judgeCommentId, result.verdict);
      }

      aiGenerationStore.completeGeneration("qzone", "qzone-comments");
      return { success: true, addedCount };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      aiGenerationStore.setError("qzone", errorMsg, "qzone-comments");
      return { success: false, addedCount: 0, error: errorMsg };
    } finally {
      clearGenerating(postId);
    }
  }

  /**
   * 重新生成貼文的所有 AI 評論（使用者自己的回應留著）
   */
  async function regenerateAllComments(
    postId: string,
    characterIds?: string[],
  ): Promise<{ success: boolean; addedCount: number; error?: string }> {
    const post = qzoneStore.posts.find((p) => p.id === postId);
    if (!post) {
      return { success: false, addedCount: 0, error: "找不到指定的貼文" };
    }

    try {
      const aiComments = post.comments.filter((c) => c.authorType === "ai");
      for (const comment of aiComments) {
        await qzoneStore.deleteComment(postId, comment.id);
      }

      return await generateCommentsForPost(postId, characterIds, {
        includeExistingComments: true,
        ignorePolicy: true,
      });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      return { success: false, addedCount: 0, error: errorMsg };
    }
  }

  /** 單則重生：只換這一則的內容，id、時間、回覆對象不變 */
  async function regenerateSingleComment(
    postId: string,
    commentId: string,
    tone: RegenerateTone,
  ): Promise<{ success: boolean; error?: string }> {
    const post = qzoneStore.posts.find((p) => p.id === postId);
    const target = post?.comments.find((c) => c.id === commentId);
    if (!post || !target) return { success: false, error: "找不到這則回應" };
    const character = charactersStore.characters.find((c) => c.id === target.authorId);
    if (!character) return { success: false, error: "只有角色的回應可以重新生成" };
    if (!settingsStore.getAPIForTask("plurkComment").api.apiKey) {
      return { success: false, error: "API Key 未設定" };
    }

    plurkActivity.regenerating[commentId] = true;
    try {
      const before = post.comments.filter((c) => c.timestamp < target.timestamp);
      const replyTo = target.replyToId ? post.comments.find((c) => c.id === target.replyToId) : null;
      const chatContext = await buildChatContextForCharacters([character.id], getChatContextOptions());
      const result = await generateBatchComments({
        characters: [toPromptCharacter(character)],
        post,
        existingComments: before,
        minComments: 1,
        maxComments: 1,
        allowPasserby: false,
        onlyCharacterId: character.id,
        toneHint: TONE_HINTS[tone],
        replyContext: replyTo ? `這則是在回覆 ${replyTo.username}：「${replyTo.content}」` : undefined,
        chatContext,
      });
      const generated = result.comments.find((c) => c.characterId === character.id);
      if (!result.success || !generated) {
        return { success: false, error: result.error || "沒有生成內容" };
      }
      await qzoneStore.updateComment(postId, commentId, {
        content: generated.content,
        qualifier: generated.qualifier,
      });
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    } finally {
      delete plurkActivity.regenerating[commentId];
    }
  }

  /**
   * 將生成的評論添加到貼文
   * @param slow 慢慢回：時間錯開到之後，時間到才顯示
   */
  async function addGeneratedComments(
    postId: string,
    comments: GeneratedComment[],
    characters: StoredCharacter[],
    slow: boolean,
    strictness?: DirectorStrictness,
  ): Promise<number> {
    // 建立臨時 ID 映射（生成的 c1, c2... 到實際評論 ID）
    const idMapping = new Map<string, string>();
    let addedCount = 0;

    // 獲取已有評論的 ID 映射（用於回覆已有評論）
    const post = qzoneStore.posts.find((p) => p.id === postId);
    if (post) {
      post.comments.forEach((c) => {
        idMapping.set(c.id, c.id);
      });
    }

    const times = slow ? spreadReplyTimes(comments.length, Date.now()) : [];
    let removals = 0;
    // 角色回使用者的噗時，一半機會順便按讚（每人一次）
    const likers = new Set<string>();

    // 按順序添加評論（保持回覆關係）
    for (const [index, genComment] of comments.entries()) {
      // 檢查是否是路人評論
      const isPasserby = genComment.characterId.startsWith("passerby-");

      // 如果是角色評論，檢查角色是否存在
      const character = isPasserby ? null : characters.find((c) => c.id === genComment.characterId);

      // 如果不是路人且找不到角色，跳過
      if (!isPasserby && !character) continue;

      // 解析 replyTo
      let replyToId: string | undefined;
      let replyToUsername: string | undefined;

      if (genComment.replyTo) {
        const mappedId = idMapping.get(genComment.replyTo);
        if (mappedId) {
          replyToId = mappedId;
          const replyToComment = post?.comments.find((c) => c.id === mappedId);
          if (replyToComment) {
            replyToUsername = replyToComment.username;
          }
        }
      }

      // 版主刪除：普通最多一則，角色的留言不刪；回應出現後 10–90 分鐘才刪
      let moderation: QZoneComment["moderation"];
      if (strictness && genComment.removed && isPasserby && (strictness === "hard" || removals === 0)) {
        removals++;
        const at = moderationDelayAt(times[index] ?? Date.now());
        moderation = { action: "delete", reason: genComment.removed, by: MODERATOR_NAME, at };
      }

      const newComment = await qzoneStore.addComment(
        postId,
        {
          authorId: isPasserby ? genComment.characterId : character!.id,
          username: isPasserby
            ? genComment.characterName
            : character!.nickname || character!.data?.name || "未知角色",
          avatar: isPasserby
            ? getDefaultAvatar(genComment.characterId)
            : character!.avatar || getDefaultAvatar(character!.id),
          content: genComment.content,
          authorType: "ai",
          qualifier: genComment.qualifier,
          replyToId,
          replyToUsername,
          moderation,
        },
        { timestamp: times[index] },
      );

      if (character && post?.authorType === "user" && !likers.has(character.id) && Math.random() < 0.5) {
        likers.add(character.id);
        await qzoneStore.addLikeEvent(postId, character.id, newComment.timestamp);
      }

      // 記錄 ID 映射（用於後續評論的 replyTo）
      if (genComment.id) {
        idMapping.set(genComment.id, newComment.id);
      }

      addedCount++;

      // 小延遲，避免時間戳完全相同
      if (!slow) await new Promise((resolve) => setTimeout(resolve, 50));
    }

    return addedCount;
  }

  /**
   * 獲取默認頭像
   */
  function getDefaultAvatar(seed: string): string {
    return `https://api.dicebear.com/7.x/lorelei/svg?seed=${seed}&backgroundColor=b6e3f4,c0aede,d1d4f9`;
  }

  return {
    isGenerating,
    generateCommentsForPost,
    regenerateAllComments,
    regenerateSingleComment,
  };
}
