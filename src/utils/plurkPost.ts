/**
 * 讀噗文欄位的小工具：舊資料沒有新欄位時，從舊欄位推出來
 */

import type { PlurkAudience, QZonePost } from "@/types/qzone";

export const THEATER_KEY_PREFIX = "theater:";

export function getAudience(post: QZonePost): PlurkAudience {
  if (post.audience) return post.audience;
  return post.visibilityMode === "group-only" ? "private" : "all";
}

export function getPrivateTo(post: QZonePost): string[] {
  return post.privateTo ?? post.groupMemberIds ?? [];
}

/** 小劇場連結噗：新欄位，或舊版塞在表情裡的 theater:ID */
export function getTheaterPostId(post: QZonePost): string | undefined {
  if (post.theaterPostId) return post.theaterPostId;
  const key = Object.keys(post.emoticons ?? {}).find((k) => k.startsWith(THEATER_KEY_PREFIX));
  return key?.slice(THEATER_KEY_PREFIX.length);
}

/** 喜歡數：自己按的 likeCount、廣場路人的喜歡、角色按的讚、舊版 AI 給的表情數 */
export function getLikeTotal(post: QZonePost): number {
  const legacy = Object.entries(post.emoticons ?? {})
    .filter(([k]) => !k.startsWith(THEATER_KEY_PREFIX))
    .reduce((sum, [, v]) => sum + (Number(v) || 0), 0);
  return (post.likeCount ?? 0) + (post.crowdLikes ?? 0) + (post.likeEvents?.length ?? 0) + legacy;
}

export function audienceLabel(post: QZonePost, nameOf: (id: string) => string): string {
  const audience = getAudience(post);
  if (audience === "friends") return "好友可見";
  if (audience === "anon") return "偷偷說";
  if (audience === "all") return "全員";
  if (!post.audience && post.groupName) return post.groupName;
  const ids = getPrivateTo(post);
  const shown = ids.slice(0, 2).map(nameOf).join("、");
  return ids.length > 2 ? `私噗給 ${shown} 等 ${ids.length} 人` : `私噗給 ${shown}`;
}
