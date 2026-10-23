/** 噗浪分享的執行層：組提示詞、角色去留言、換輪次時刪掉／補回留言 */

import { useQzoneStore } from "@/stores/qzone";
import { useCharactersStore } from "@/stores/characters";
import { buildCastContext, getViewerIds } from "@/services/plurkCast";
import { getAudience, getTheaterPostId } from "@/utils/plurkPost";
import { normalizeQualifier } from "@/utils/plurkQualifiers";
import {
  buildPlurkShareGuide,
  buildPlurkShareSnapshot,
  canCharComment,
  pickShareCandidates,
  recentPlurkShares,
  registerPlurkShareCandidates,
  resolvePlurkCommentTarget,
  type ParsedPlurkComment,
} from "@/utils/plurkShare";
import type { PlurkActivity, PlurkShareSnapshot } from "@/types/chat";
import type { QZoneComment, QZonePost } from "@/types/qzone";

export type HistoryLike = Array<{ plurkShare?: PlurkShareSnapshot }>;

export interface CharRef {
  id: string;
  name: string;
  avatar?: string;
}

/** 讀一次需要的東西：store、cast、時間、看不看得到、禁言、名字 */
async function loadContext(characterId: string) {
  const qzone = useQzoneStore();
  if (!qzone.isLoaded) await qzone.loadPosts();

  const ctx = await buildCastContext();
  const now = Date.now();

  const canView = (p: QZonePost): boolean =>
    !!p.npc || !!p.onSquare || p.authorId === characterId || getViewerIds(p, ctx).includes(characterId);

  const squareBanned = (qzone.settings.characterBans ?? []).some(
    (b) => b.characterId === characterId && b.until > now
  );

  const charactersStore = useCharactersStore();
  const resolveName = (id: string, fallback?: string): string => {
    const c = charactersStore.getCharacterById(id);
    return c?.nickname || c?.data?.name || fallback || "角色";
  };

  return { qzone, ctx, now, canView, squareBanned, resolveName };
}

/** 候選噗：順便排除小劇場連結噗、轉噗、作者被隱藏的角色 */
function canPreviewForShare(p: QZonePost, canView: (p: QZonePost) => boolean, ctx: { allCharacterIds: string[] }, characterId: string): boolean {
  if (!canView(p)) return false;
  if (getTheaterPostId(p)) return false;
  if (p.type === "repost") return false;
  const hiddenAuthor =
    p.authorType === "ai" &&
    !p.npc &&
    getAudience(p) !== "anon" &&
    !ctx.allCharacterIds.includes(p.authorId) &&
    p.authorId !== characterId;
  if (hiddenAuthor) return false;
  return true;
}

/** 組 {{plurkShareGuide}}：可以留言的噗、可以傳的候選噗 */
export async function buildPlurkShareGuideForChat(input: {
  characterId: string;
  history: HistoryLike;
  shareCount: number;
}): Promise<string> {
  try {
    const { qzone, ctx, now, canView, squareBanned, resolveName } = await loadContext(input.characterId);
    const shares = recentPlurkShares(input.history);

    const commentable = shares.filter((s) => {
      const post = qzone.posts.find((p) => p.id === s.postId);
      return canCharComment(post, input.characterId, {
        canView: post ? canView(post) : false,
        squareBanned,
      });
    });

    let candidates: PlurkShareSnapshot[] = [];
    if (input.shareCount > 0) {
      const picked = pickShareCandidates(qzone.posts, {
        canView: (p) => canPreviewForShare(p, canView, ctx, input.characterId),
        excludeRefs: new Set(shares.map((s) => s.ref)),
        now,
        limit: input.shareCount,
      });
      candidates = picked.map((p) => buildPlurkShareSnapshot(p, { sharedBy: "char", resolveName }));
      registerPlurkShareCandidates(candidates);
    }

    return buildPlurkShareGuide({ commentable, candidates, charId: input.characterId });
  } catch (err) {
    console.warn("[PlurkShare] 組分享提示詞失敗:", err);
    return "";
  }
}

/** 角色在這輪回覆裡去噗浪留一則言 */
export async function applyCharPlurkComment(input: {
  character: CharRef;
  history: HistoryLike;
  comment: ParsedPlurkComment;
}): Promise<PlurkActivity | null> {
  try {
    const content = input.comment.content.trim();
    if (!content) return null;

    const target = resolvePlurkCommentTarget(input.comment.ref, input.history);
    if (!target) return null;

    const { qzone, canView, squareBanned } = await loadContext(input.character.id);
    const post = qzone.posts.find((p) => p.id === target.postId);
    if (!canCharComment(post, input.character.id, { canView: post ? canView(post) : false, squareBanned })) {
      return null;
    }

    const stillThere = target.commentId
      ? (post!.comments ?? []).find((c) => c.id === target.commentId)
      : undefined;
    const replyToId = stillThere ? target.commentId : undefined;
    const replyToUsername = stillThere ? target.commentName : undefined;

    const normalized = input.comment.qualifier ? normalizeQualifier(input.comment.qualifier) : "";
    const qualifier = normalized || undefined;

    const draft: Omit<QZoneComment, "id" | "timestamp"> = {
      authorId: input.character.id,
      username: input.character.name,
      avatar: input.character.avatar || "",
      content,
      authorType: "ai",
    };
    if (qualifier) draft.qualifier = qualifier;
    if (replyToId) {
      draft.replyToId = replyToId;
      if (replyToUsername) draft.replyToUsername = replyToUsername;
    }

    const c = await qzone.addComment(post!.id, draft);

    const activity: PlurkActivity = { postId: post!.id, commentId: c.id, content };
    if (qualifier) activity.qualifier = qualifier;
    if (replyToId) {
      activity.replyToId = replyToId;
      if (replyToUsername) activity.replyToUsername = replyToUsername;
    }
    return activity;
  } catch (err) {
    console.warn("[PlurkShare] 角色留言失敗:", err);
    return null;
  }
}

/** 換掉那一輪時，把角色留的言刪掉 */
export async function removePlurkActivity(a: PlurkActivity): Promise<void> {
  try {
    const qzone = useQzoneStore();
    if (!qzone.isLoaded) await qzone.loadPosts();
    const post = qzone.posts.find((p) => p.id === a.postId);
    if (!post) return;
    if (!(post.comments ?? []).some((c) => c.id === a.commentId)) return;
    await qzone.deleteComment(a.postId, a.commentId);
  } catch (err) {
    console.warn("[PlurkShare] 刪除角色留言失敗:", err);
  }
}

/** 換回來時，用原本的內容把留言補回去 */
export async function restorePlurkActivity(a: PlurkActivity, character: CharRef): Promise<PlurkActivity | null> {
  try {
    const qzone = useQzoneStore();
    if (!qzone.isLoaded) await qzone.loadPosts();
    const post = qzone.posts.find((p) => p.id === a.postId);
    if (!post) return null;
    if ((post.comments ?? []).some((c) => c.id === a.commentId)) return a;

    const draft: Omit<QZoneComment, "id" | "timestamp"> = {
      authorId: character.id,
      username: character.name,
      avatar: character.avatar || "",
      content: a.content,
      authorType: "ai",
    };
    if (a.qualifier) draft.qualifier = a.qualifier;
    if (a.replyToId) {
      draft.replyToId = a.replyToId;
      if (a.replyToUsername) draft.replyToUsername = a.replyToUsername;
    }

    const c = await qzone.addComment(a.postId, draft);
    return { ...a, commentId: c.id };
  } catch (err) {
    console.warn("[PlurkShare] 補回角色留言失敗:", err);
    return null;
  }
}
