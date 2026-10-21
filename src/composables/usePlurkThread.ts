/**
 * 回應串的動作：送出回應、接話快捷、單則重生、刪除、消音
 */

import type { ThreadQuickAction } from "@/components/plurk/types";
import { useBatchComments, type RegenerateTone } from "@/composables/useBatchComments";
import { buildCastContext, getViewerIds, type CastContext } from "@/services/plurkCast";
import { useCharactersStore } from "@/stores/characters";
import { useQzoneStore } from "@/stores/qzone";
import { useUserStore } from "@/stores/user";
import type { QZoneComment, QZonePost } from "@/types/qzone";
import { visibleComments } from "@/utils/plurkRiver";
import { computed, ref, watch, type Ref } from "vue";

const ANONYMOUS_AVATAR = "https://api.dicebear.com/7.x/shapes/svg?seed=anonymous&backgroundColor=666666";

export interface ThreadSendInput {
  content: string;
  qualifier: string;
  personaId: string | null;
  anonymous: boolean;
}

export function usePlurkThread(postId: Ref<string | null>, now: Ref<number>) {
  const qzoneStore = useQzoneStore();
  const charactersStore = useCharactersStore();
  const userStore = useUserStore();
  const { isGenerating, generateCommentsForPost, regenerateSingleComment } = useBatchComments();

  const castCtx = ref<CastContext | null>(null);
  const replyingTo = ref<QZoneComment | null>(null);

  watch(
    postId,
    async (id) => {
      replyingTo.value = null;
      if (!id) return;
      castCtx.value = await buildCastContext();
    },
    { immediate: true },
  );

  const post = computed<QZonePost | null>(
    () => (postId.value && qzoneStore.posts.find((p) => p.id === postId.value)) || null,
  );
  const responses = computed(() => (post.value ? visibleComments(post.value, now.value) : []));
  const participantCount = computed(() => new Set(responses.value.map((c) => c.authorId)).size);
  const busy = computed(() => isGenerating.value);

  function findCharacter(id: string) {
    return charactersStore.characters.find((c) => c.id === id);
  }

  function characterName(id: string): string {
    const c = findCharacter(id);
    return c?.nickname || c?.data?.name || "角色";
  }

  function isCharacterComment(c: QZoneComment): boolean {
    return c.authorType === "ai" && !!findCharacter(c.authorId);
  }

  /** 噗主是角色時的 id */
  const opCharacterId = computed(() => {
    const p = post.value;
    return p && p.authorType === "ai" && findCharacter(p.authorId) ? p.authorId : null;
  });

  const quickActions = computed<ThreadQuickAction[]>(() => {
    const p = post.value;
    if (!p) return [];
    const actions: ThreadQuickAction[] = [];
    const charComments = responses.value.filter(isCharacterComment);

    const followId = charComments[charComments.length - 1]?.authorId ?? opCharacterId.value;
    if (followId) {
      actions.push({ id: "follow", label: `讓 ${characterName(followId)} 接話`, characterIds: [followId] });
    }

    const appeared = [...new Set([...charComments.map((c) => c.authorId), ...(opCharacterId.value ? [opCharacterId.value] : [])])];
    if (appeared.length >= 2) {
      actions.push({ id: "everyone", label: "大家都來回一句", characterIds: appeared.slice(0, 3) });
    }

    if (castCtx.value) {
      const appearedSet = new Set(appeared);
      const fresh = getViewerIds(p, castCtx.value).filter(
        (id) => !castCtx.value!.mutedIds.has(id) && !appearedSet.has(id),
      );
      if (fresh.length > 0) {
        // 依 postId 固定挑一位，畫面不會每次重算就換人
        const seed = [...p.id].reduce((sum, ch) => sum + ch.charCodeAt(0), responses.value.length);
        actions.push({ id: "newcomer", label: "找一個新角色加入", characterIds: [fresh[seed % fresh.length]] });
      }
    }
    return actions;
  });

  /** 內文 @ 到的角色 */
  function extractMentionedCharacterIds(content: string): string[] {
    const ids: string[] = [];
    for (const match of content.matchAll(/@([^\s@]+)/g)) {
      const mentioned = match[1];
      const character = charactersStore.characters.find((c) => {
        const name = c.data?.name || "";
        return (
          name === mentioned ||
          c.nickname === mentioned ||
          (!!name && (name.includes(mentioned) || mentioned.includes(name)))
        );
      });
      if (character && !ids.includes(character.id)) ids.push(character.id);
    }
    return ids;
  }

  function resolveAuthor(input: ThreadSendInput) {
    if (input.anonymous) {
      return { authorId: "anonymous", username: "匿名噗友", avatar: ANONYMOUS_AVATAR };
    }
    const persona =
      (input.personaId && userStore.personas.find((p) => p.id === input.personaId)) || userStore.currentPersona;
    return {
      authorId: persona?.id || "user",
      username: persona?.name || qzoneStore.settings.nickname || "我",
      avatar: persona?.avatar || qzoneStore.settings.avatar || "",
    };
  }

  async function send(input: ThreadSendInput): Promise<void> {
    const p = post.value;
    const content = input.content.trim();
    if (!p || !content) return;
    const target = replyingTo.value;

    await qzoneStore.addComment(p.id, {
      ...resolveAuthor(input),
      content,
      authorType: "user",
      qualifier: input.qualifier || undefined,
      replyToId: target?.id,
      replyToUsername: target?.username,
    });
    replyingTo.value = null;
    await qzoneStore.markPostSeen(p.id);

    if (!qzoneStore.directorConfig.repliesAfterUser || p.replyPolicy === "none") return;
    const replyToCharacterId =
      extractMentionedCharacterIds(content)[0] ??
      (target && isCharacterComment(target) ? target.authorId : undefined) ??
      opCharacterId.value ??
      undefined;
    const result = await generateCommentsForPost(p.id, undefined, {
      includeExistingComments: true,
      replyToCharacterId,
    });
    if (!result.success) console.warn("[PlurkThread] 角色接話失敗:", result.error);
  }

  async function runQuickAction(action: ThreadQuickAction): Promise<void> {
    const p = post.value;
    if (!p || action.characterIds.length === 0) return;
    const count = action.characterIds.length;
    const result = await generateCommentsForPost(p.id, action.characterIds, {
      includeExistingComments: true,
      minComments: count,
      maxComments: count,
      allowPasserby: false,
      ignorePolicy: true,
    });
    if (!result.success) alert(result.error || "生成失敗");
  }

  async function regenerate(commentId: string, tone: RegenerateTone): Promise<void> {
    const p = post.value;
    if (!p) return;
    const result = await regenerateSingleComment(p.id, commentId, tone);
    if (!result.success) alert(result.error || "重新生成失敗");
  }

  async function remove(commentId: string): Promise<void> {
    const p = post.value;
    if (!p || !confirm("確定要刪除這則回應嗎？")) return;
    if (replyingTo.value?.id === commentId) replyingTo.value = null;
    await qzoneStore.deleteComment(p.id, commentId);
  }

  async function toggleMute(): Promise<void> {
    const p = post.value;
    if (p) await qzoneStore.setPostMuted(p.id, !p.muted);
  }

  return {
    post,
    responses,
    participantCount,
    quickActions,
    replyingTo,
    busy,
    send,
    runQuickAction,
    regenerate,
    remove,
    toggleMute,
    isCharacterComment,
  };
}
