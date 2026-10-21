/**
 * 噗浪的人際關係：誰是好友、誰看得到這則噗、這次叫誰來回應
 */

import { getDatabase } from "@/db/database";
import { shouldHideFromQZone } from "@/services/BlockService";
import { useCharactersStore } from "@/stores/characters";
import { useQzoneStore } from "@/stores/qzone";
import type { Chat } from "@/types/chat";
import type { QZonePost } from "@/types/qzone";
import { getMutedIds } from "@/utils/plurkDirectorConfig";
import { getAudience, getPrivateTo } from "@/utils/plurkPost";

export interface CastContext {
  allCharacterIds: string[];
  /** 有單人聊天、沒被封鎖到要隱藏的角色 */
  friendIds: Set<string>;
  /** 導演名單「不出現」（舊版是黑名單） */
  mutedIds: Set<string>;
}

export interface PickOptions {
  /** 被 @ 的、被回覆的、噗主角色：排第一個 */
  priorityIds?: string[];
  max?: number;
  random?: () => number;
  /** 使用者手動叫角色回應時，忽略這則噗的「不要回應」 */
  ignorePolicy?: boolean;
}

/** 好友；完全沒有好友（新使用者）時退回全部角色，免得沒人回應 */
export function effectiveFriendIds(ctx: CastContext): string[] {
  if (ctx.friendIds.size === 0) return [...ctx.allCharacterIds];
  return ctx.allCharacterIds.filter((id) => ctx.friendIds.has(id));
}

export function getViewerIds(post: QZonePost, ctx: CastContext): string[] {
  if (getAudience(post) === "private") {
    const allowed = new Set(getPrivateTo(post));
    return ctx.allCharacterIds.filter((id) => allowed.has(id));
  }
  // 偷偷說的本人不會來回自己的噗
  return effectiveFriendIds(ctx).filter((id) => id !== post.anonOf);
}

export function allowsPasserby(post: QZonePost): boolean {
  const audience = getAudience(post);
  return (audience === "all" || audience === "anon") && post.allowPasserby !== false;
}

function shuffle<T>(items: T[], random: () => number): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function pickResponders(post: QZonePost, ctx: CastContext, opts: PickOptions = {}): string[] {
  const policy = opts.ignorePolicy ? "ai" : (post.replyPolicy ?? "ai");
  if (policy === "none") return [];

  const viewers = getViewerIds(post, ctx);
  const viewerSet = new Set(viewers);
  const priority = [...new Set(opts.priorityIds ?? [])].filter((id) => viewerSet.has(id));

  if (policy === "pick") {
    const picked = new Set(post.replyPickIds ?? []);
    const first = priority.filter((id) => picked.has(id));
    return [...first, ...viewers.filter((id) => picked.has(id) && !first.includes(id))];
  }

  const max = Math.max(opts.max ?? 3, priority.length);
  const pool = viewers.filter((id) => !ctx.mutedIds.has(id) && !priority.includes(id));
  return [...priority, ...shuffle(pool, opts.random ?? Math.random)].slice(0, max);
}

/** 讀 chats 表一次：好友與要從噗浪隱藏的角色 */
export async function loadCastRelations(): Promise<{ friendIds: Set<string>; hiddenIds: Set<string> }> {
  const friendIds = new Set<string>();
  const hiddenIds = new Set<string>();
  try {
    const db = await getDatabase();
    const chats = (await db.getAll("chats")) as Chat[];
    for (const chat of chats) {
      if (!chat.characterId) continue;
      if (shouldHideFromQZone(chat)) {
        hiddenIds.add(chat.characterId);
      } else if (!chat.isGroupChat) {
        friendIds.add(chat.characterId);
      }
    }
    for (const id of hiddenIds) friendIds.delete(id);
  } catch (err) {
    console.warn("[PlurkCast] 讀取聊天關係失敗:", err);
  }
  return { friendIds, hiddenIds };
}

export async function buildCastContext(): Promise<CastContext> {
  const charactersStore = useCharactersStore();
  const qzoneStore = useQzoneStore();
  const { friendIds, hiddenIds } = await loadCastRelations();
  return {
    allCharacterIds: charactersStore.characters.map((c) => c.id).filter((id) => !hiddenIds.has(id)),
    friendIds,
    mutedIds: getMutedIds(qzoneStore.directorConfig),
  };
}
