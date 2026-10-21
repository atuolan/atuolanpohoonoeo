/**
 * 廣場版主（純函式）：洗版判斷、禁言狀態、申訴進度、規定文字、讚的通知分組
 */

import type { PlurkAppeal, PlurkBan, PlurkSystemNotice, QZonePost } from "@/types/qzone";
import type { DirectorStrictness } from "@/utils/plurkDirectorConfig";
import { isSquarePost } from "@/utils/plurkSquare";

const H = 3600_000;
const DAY = 24 * H;
const SPAM_WINDOW = DAY;
const SPAM_MIN_LENGTH = 4;
/** 送出後 10 分鐘內算「已送出」，之後「審核中」 */
const APPEAL_RECEIVED_MS = 10 * 60_000;
export const MAX_SYSTEM_NOTICES = 50;

export const BAN_IMPACT = "不能在廣場發噗和回應別人的噗，河道不受影響";
export const COMMUNITY_RULES = [
  "同樣的話不要貼在很多篇噗下面（洗版）。",
  "不引戰、不人身攻擊，不同意可以好好說。",
  "求助、分享、閒聊都歡迎；吵架請私訊。",
  "被摺疊或禁言可以申訴，版主會看。",
];

/** 洗版比對用：去掉空白 */
export function normalizeForSpam(text: string): string {
  return text.replace(/\s+/g, "");
}

/** 使用者 24 小時內在「其他」別人的廣場噗下留過幾次一樣的話 */
export function countDuplicateReplies(posts: QZonePost[], postId: string, content: string, now: number): number {
  const target = normalizeForSpam(content);
  if (target.length < SPAM_MIN_LENGTH) return 0;
  let count = 0;
  for (const post of posts) {
    if (post.id === postId || post.authorType === "user" || !isSquarePost(post)) continue;
    const hit = post.comments.some(
      (c) => c.authorType === "user" && now - c.timestamp <= SPAM_WINDOW && normalizeForSpam(c.content) === target,
    );
    if (hit) count++;
  }
  return count;
}

/** 洗版的處分：普通＝第 3 篇起（前面已有 2 篇）摺疊＋禁言 1 天；嚴格＝第 2 篇起＋3 天 */
export function spamVerdict(strictness: DirectorStrictness, duplicates: number): { fold: boolean; banDays: number } {
  if (strictness === "mid" && duplicates >= 2) return { fold: true, banDays: 1 };
  if (strictness === "hard" && duplicates >= 1) return { fold: true, banDays: 3 };
  return { fold: false, banDays: 0 };
}

/** AI 判的禁言天數：寬鬆不禁、普通最多 1 天、嚴格最多 3 天 */
export function clampBanDays(strictness: DirectorStrictness, days: number): number {
  const max = strictness === "hard" ? 3 : strictness === "mid" ? 1 : 0;
  return Math.max(0, Math.min(max, Math.round(Number(days) || 0)));
}

export function isBanActive(ban: PlurkBan | undefined, now: number): ban is PlurkBan {
  return !!ban && now < ban.until && ban.appeal?.status !== "approved";
}

export function banRemaining(ban: PlurkBan, now: number): { days: number; hours: number } {
  // 不足一小時算一小時，免得還剩幾分鐘卻顯示 0 天 0 小時
  const totalHours = Math.ceil(Math.max(0, ban.until - now) / H);
  return { days: Math.floor(totalHours / 24), hours: totalHours % 24 };
}

export function banDays(ban: PlurkBan): number {
  return Math.max(1, Math.round((ban.until - ban.at) / DAY));
}

/** 申訴進度：0 已送出、1 審核中、2 結果 */
export function appealStage(appeal: PlurkAppeal, now: number): 0 | 1 | 2 {
  if (appeal.status !== "pending") return 2;
  return now - appeal.sentAt < APPEAL_RECEIVED_MS ? 0 : 1;
}

/** 送出申訴：1–6 小時後出結果 */
export function makeAppeal(reason: string, now: number, random: () => number = Math.random): PlurkAppeal {
  return { reason, sentAt: now, decideAt: now + Math.round((1 + random() * 5) * H), status: "pending" };
}

export function makeNoticeId(): string {
  return `sys-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** 加一則系統通知（新的在前，最多 50 則） */
export function withNotice(list: PlurkSystemNotice[] | undefined, notice: PlurkSystemNotice): PlurkSystemNotice[] {
  return [notice, ...(list ?? [])].slice(0, MAX_SYSTEM_NOTICES);
}

export interface LikeNotice {
  postId: string;
  /** 新的在前，不重複 */
  likerIds: string[];
  at: number;
}

/** 讚的通知：使用者的每則噗一列 */
export function groupLikeNotices(posts: QZonePost[], now: number): LikeNotice[] {
  const result: LikeNotice[] = [];
  for (const post of posts) {
    if (post.authorType !== "user") continue;
    const events = (post.likeEvents ?? []).filter((e) => e.at <= now).sort((a, b) => b.at - a.at);
    if (events.length === 0) continue;
    result.push({ postId: post.id, likerIds: [...new Set(events.map((e) => e.by))], at: events[0].at });
  }
  return result.sort((a, b) => b.at - a.at);
}
