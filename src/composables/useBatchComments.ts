/**
 * 批量評論生成 Composable
 * 提供帶有 replyTo 機制的多角色評論生成功能
 */

import { generateBatchComments } from "@/services/AIService";
import { useAIGenerationStore } from "@/stores/aiGeneration";
import { useCharactersStore } from "@/stores/characters";
import { useQzoneStore } from "@/stores/qzone";
import { useSettingsStore } from "@/stores/settings";
import { useUserStore } from "@/stores/user";
import type { StoredCharacter } from "@/types/character";
import type { GeneratedComment, QZonePost } from "@/types/qzone";
import { computed } from "vue";

export function useBatchComments() {
  const settingsStore = useSettingsStore();
  const qzoneStore = useQzoneStore();
  const charactersStore = useCharactersStore();
  const aiGenerationStore = useAIGenerationStore();
  const userStore = useUserStore();

  // 使用全局 store 的狀態
  const isGenerating = computed(() =>
    aiGenerationStore.isTaskGenerating("qzone", "qzone-comments"),
  );

  /**
   * 為指定貼文生成批量評論
   * @param postId 貼文 ID
   * @param characterIds 參與評論的角色 ID 列表（可選，不傳則自動選擇）
   * @param options 生成選項
   */
  async function generateCommentsForPost(
    postId: string,
    characterIds?: string[],
    options?: {
      minComments?: number;
      maxComments?: number;
      includeExistingComments?: boolean;
      useStreaming?: boolean;
      replyToCharacterId?: string; // 被回覆的角色 ID（確保該角色參與）
      chatContext?: Record<string, string>; // 每個角色各自的聊天記錄
    },
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

    // 使用全局 AI 生成 store 註冊任務
    const startResult = aiGenerationStore.startGeneration(
      "qzone",
      "qzone-comments",
      { characterName: "噗浪評論" },
    );

    if (!startResult.success) {
      return { success: false, addedCount: 0, error: startResult.error };
    }

    try {
      // 根據可見性模式決定評論邏輯
      let characters: StoredCharacter[] = [];
      let passerbyOnly = false;

      if (post.visibilityMode === "group-only") {
        // 群組發文模式 - 只能調用群組成員
        const groupMemberCount = post.groupMemberIds?.length || 0;

        if (groupMemberCount === 0) {
          // 群組沒有成員，只讓路人評論
          passerbyOnly = true;
          console.log("[QZone] 群組發文但無成員，僅生成路人評論");
        } else {
          // 群組有成員，只使用群組成員
          if (characterIds) {
            // 如果指定了角色，過濾出群組成員
            characters = charactersStore.characters.filter(
              (c) =>
                characterIds.includes(c.id) &&
                post.groupMemberIds!.includes(c.id),
            );
          } else {
            // 自動選擇群組成員
            characters = getEligibleCharacters(post);
          }
          console.log(
            `[QZone] 群組發文模式，使用 ${characters.length} 個群組成員`,
          );
        }
      } else {
        // 全體可見模式 - 最多隨機調用 3 個角色
        const eligibleCharacters = characterIds
          ? charactersStore.characters.filter((c) =>
              characterIds.includes(c.id),
            )
          : getEligibleCharacters(post);

        // 如果有被回覆的角色，確保該角色參與
        const replyToCharacterId = options?.replyToCharacterId;
        let selectedCharacters: StoredCharacter[] = [];

        if (replyToCharacterId) {
          // 找到被回覆的角色
          const replyToCharacter = eligibleCharacters.find(
            (c) => c.id === replyToCharacterId,
          );
          if (replyToCharacter) {
            selectedCharacters.push(replyToCharacter);
          }

          // 從剩餘角色中隨機選擇，湊滿 3 個
          const remainingCharacters = eligibleCharacters.filter(
            (c) => c.id !== replyToCharacterId,
          );
          const additionalCount = Math.min(2, remainingCharacters.length);
          const shuffled = shuffleArray(remainingCharacters);
          selectedCharacters.push(...shuffled.slice(0, additionalCount));
        } else {
          // 沒有被回覆的角色，隨機選擇最多 3 個
          selectedCharacters = shuffleArray(eligibleCharacters).slice(0, 3);
        }

        characters = selectedCharacters;
        console.log(
          `[QZone] 全體可見模式，選擇 ${characters.length} 個角色${replyToCharacterId ? "（包含被回覆角色）" : ""}`,
        );
      }

      // 準備角色資料（可能為空陣列，表示只有路人評論）
      const characterData = characters.map((char) => {
        // 找出綁定了此角色的 persona，取第一個的名稱
        const boundPersonaIds = userStore.getPersonasByBoundCharacter(char.id);
        const boundPersona =
          boundPersonaIds.length > 0
            ? userStore.personas.find((p) => p.id === boundPersonaIds[0])
            : null;
        return {
          id: char.id,
          name: char.data?.name || char.nickname || "未知角色",
          personality: char.data?.personality || "",
          description: char.data?.description || "",
          boundUserName: boundPersona?.name,
        };
      });

      // 準備已有評論（用於 replyTo 和歷史對話上下文）
      const existingComments =
        options?.includeExistingComments !== false ? post.comments : [];

      // 調用批量評論生成
      const result = await generateBatchComments({
        characters: characterData,
        post,
        existingComments,
        minComments:
          options?.minComments ??
          (passerbyOnly ? 2 : Math.max(characters.length, 3)),
        maxComments:
          options?.maxComments ??
          (passerbyOnly ? 5 : Math.max(characters.length * 2, 8)),
        useStreaming: options?.useStreaming ?? false,
        passerbyOnly, // 傳遞路人模式標記
        chatContext: options?.chatContext || {},
        replyToCharacterId: options?.replyToCharacterId,
      });

      if (!result.success) {
        aiGenerationStore.setError(
          "qzone",
          result.error || "生成失敗",
          "qzone-comments",
        );
        return { success: false, addedCount: 0, error: result.error };
      }

      // 將生成的評論添加到貼文
      const addedCount = await addGeneratedComments(
        postId,
        result.comments,
        characters,
      );

      // 完成任務
      aiGenerationStore.completeGeneration("qzone", "qzone-comments");

      return { success: true, addedCount };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      aiGenerationStore.setError("qzone", errorMsg, "qzone-comments");
      return { success: false, addedCount: 0, error: errorMsg };
    }
  }

  /**
   * 隨機打亂陣列（Fisher-Yates 洗牌算法）
   */
  function shuffleArray<T>(array: T[]): T[] {
    const result = [...array];
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }

  /**
   * 重新生成貼文的所有 AI 評論
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
      // 刪除所有評論（包含 AI 和用戶評論）
      const allComments = [...post.comments];
      for (const comment of allComments) {
        await qzoneStore.deleteComment(postId, comment.id);
      }

      return await generateCommentsForPost(postId, characterIds, {
        includeExistingComments: false,
        useStreaming: false,
      });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      return { success: false, addedCount: 0, error: errorMsg };
    }
  }

  /**
   * 獲取可以評論指定貼文的角色
   */
  function getEligibleCharacters(post: QZonePost) {
    const blacklist =
      qzoneStore.autoInteractionConfig.characterSelection.blacklist;
    let eligible = charactersStore.characters.filter(
      (char) => !blacklist.includes(char.id),
    );

    // 如果是群組限定貼文，只有群組成員可以回覆
    if (post.visibilityMode === "group-only" && post.groupMemberIds?.length) {
      eligible = eligible.filter((char) =>
        post.groupMemberIds!.includes(char.id),
      );
    }

    return eligible;
  }

  /**
   * 將生成的評論添加到貼文
   */
  async function addGeneratedComments(
    postId: string,
    comments: GeneratedComment[],
    characters: StoredCharacter[],
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

    // 按順序添加評論（保持回覆關係）
    for (const genComment of comments) {
      // 檢查是否是路人評論
      const isPasserby = genComment.characterId.startsWith("passerby-");

      // 如果是角色評論，檢查角色是否存在
      const character = isPasserby
        ? null
        : characters.find((c) => c.id === genComment.characterId);

      // 如果不是路人且找不到角色，跳過
      if (!isPasserby && !character) continue;

      // 解析 replyTo
      let replyToId: string | undefined;
      let replyToUsername: string | undefined;

      if (genComment.replyTo) {
        // 先檢查是否是生成的臨時 ID
        const mappedId = idMapping.get(genComment.replyTo);
        if (mappedId) {
          replyToId = mappedId;
          // 找到被回覆的評論以獲取用戶名
          const replyToComment = post?.comments.find((c) => c.id === mappedId);
          if (replyToComment) {
            replyToUsername = replyToComment.username;
          }
        }
      }

      // 添加評論
      const newComment = await qzoneStore.addComment(postId, {
        authorId: isPasserby ? genComment.characterId : character!.id,
        username: isPasserby
          ? genComment.characterName
          : character!.nickname || character!.data?.name || "未知角色",
        avatar: isPasserby
          ? getDefaultAvatar(genComment.characterId)
          : character!.avatar || getDefaultAvatar(character!.id),
        content: genComment.content,
        authorType: "ai",
        replyToId,
        replyToUsername,
      });

      // 記錄 ID 映射（用於後續評論的 replyTo）
      if (genComment.id) {
        idMapping.set(genComment.id, newComment.id);
      }

      addedCount++;

      // 小延遲，避免時間戳完全相同
      await new Promise((resolve) => setTimeout(resolve, 50));
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
    getEligibleCharacters,
  };
}
