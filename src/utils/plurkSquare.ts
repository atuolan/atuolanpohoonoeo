/**
 * 廣場（純函式）：哪些噗上廣場、河道要排除誰、廣場排序與篩選、偷偷說代號、每日配額
 */

import type { QZonePost, QZoneSettings } from "@/types/qzone";
import { dayKey } from "@/utils/plurkDirectorConfig";
import { getAudience, getLikeTotal, getTheaterPostId } from "@/utils/plurkPost";
import { normalizeQualifier } from "@/utils/plurkQualifiers";
import { visibleComments } from "@/utils/plurkRiver";

export type SquareTab = "hot" | "anon" | "new";

export const SQUARE_TABS: Array<{ id: SquareTab; label: string }> = [
  { id: "hot", label: "熱門噗" },
  { id: "anon", label: "偷偷說" },
  { id: "new", label: "最新" },
];

/** 發語詞篩選：qualifier 空字串＝全部 */
export const SQUARE_FILTERS: Array<{ qualifier: string; label: string }> = [
  { qualifier: "", label: "全部" },
  { qualifier: "問", label: "求助" },
  { qualifier: "分享", label: "好物" },
  { qualifier: "愛", label: "曬娃" },
  { qualifier: "討厭", label: "吐槽" },
  { qualifier: "需要", label: "二手" },
];

export const MODERATOR_NAME = "阿杏";
export const ANON_DAILY_LIMIT = 5;

const H = 3600_000;
const HOT_WINDOW = 72 * H;
const FRESH_WINDOW = 30 * 60_000;

/** 全員與偷偷說的噗會上廣場（小劇場連結、轉噗不算） */
export function isSquarePost(post: QZonePost): boolean {
  const audience = getAudience(post);
  return (audience === "all" || audience === "anon") && !getTheaterPostId(post) && post.type !== "repost";
}

/** 河道：路人噗要加了好友才看得到；角色的偷偷說不進河道 */
export function isRiverPost(post: QZonePost, npcFriendIds: Set<string>): boolean {
  if (post.npc) return npcFriendIds.has(post.npc.id);
  return !post.anonOf;
}

/** 熱門分數：沒被刪的回應×2＋喜歡 */
export function hotScore(post: QZonePost, now: number): number {
  const replies = visibleComments(post, now).filter((c) => c.moderation?.action !== "delete").length;
  return replies * 2 + getLikeTotal(post);
}

export interface SquareFeedOptions {
  tab: SquareTab;
  qualifier?: string;
  query?: string;
  now: number;
}

export function squareFeed(posts: QZonePost[], opts: SquareFeedOptions): QZonePost[] {
  const { tab, now } = opts;
  const qualifier = opts.qualifier ? normalizeQualifier(opts.qualifier) : "";
  const needle = (opts.query ?? "").trim().toLowerCase();
  const list = posts.filter((post) => {
    if (!isSquarePost(post) || post.timestamp > now) return false;
    if (tab === "anon" && getAudience(post) !== "anon") return false;
    if (tab === "hot" && now - post.timestamp > HOT_WINDOW) return false;
    if (qualifier && normalizeQualifier(post.qualifier) !== qualifier) return false;
    if (needle) {
      const fields = [post.content, getAudience(post) === "anon" ? "" : post.username, post.npc?.name];
      if (!fields.some((f) => (f ?? "").toLowerCase().includes(needle))) return false;
    }
    return true;
  });
  if (tab === "hot") {
    return list.sort((a, b) => hotScore(b, now) - hotScore(a, now) || b.timestamp - a.timestamp);
  }
  return list.sort((a, b) => b.timestamp - a.timestamp);
}

/** 30 分鐘內有新回應 */
export function hasFreshReplies(post: QZonePost, now: number): boolean {
  return visibleComments(post, now).some((c) => now - c.timestamp <= FRESH_WINDOW);
}

/** 偷偷說裡用來算代號的 key：使用者換人設也是同一個 */
export function anonKey(authorType: string | undefined, authorId: string): string {
  return authorType === "user" ? "me" : authorId;
}

/** 偷偷說代號：同一則噗、同一個人永遠是同一個「#四位數」 */
export function anonHandle(postId: string, key: string): string {
  let h = 0x811c9dc5;
  for (const ch of `${postId}:${key}`) {
    h ^= ch.codePointAt(0)!;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `#${(h % 9000) + 1000}`;
}

/** 今天還能發幾則偷偷說 */
export function anonQuotaLeft(settings: QZoneSettings, now: number): number {
  const quota = settings.anonQuota;
  const used = quota && quota.day === dayKey(now) ? quota.count : 0;
  return Math.max(0, ANON_DAILY_LIMIT - used);
}
