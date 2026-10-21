/**
 * 噗浪河道：時間軸排版、篩選、未讀、通知列表（純函式）
 */

import type { QZoneComment, QZonePost } from "@/types/qzone";
import { plurkPlainText } from "@/utils/plurkContent";
import { getAudience, getTheaterPostId } from "@/utils/plurkPost";

export type RiverFilter = "all" | "friends" | "private" | "anon" | "mine";

/** 只留時間已經到的回應，舊到新（不改原陣列） */
export function visibleComments(post: QZonePost, now: number): QZoneComment[] {
  return (post.comments ?? []).filter((comment) => comment.timestamp <= now).sort((a, b) => a.timestamp - b.timestamp);
}

/** 河道篩選：全部／好友／私噗／偷偷說／我的，可再疊關鍵字搜尋 */
export function filterRiverPosts(posts: QZonePost[], filter: RiverFilter, query?: string): QZonePost[] {
  const byFilter = posts.filter((post) => {
    switch (filter) {
      case "friends":
        return post.authorType === "ai" && getAudience(post) !== "anon" && !getTheaterPostId(post);
      case "private":
        return getAudience(post) === "private";
      case "anon":
        return getAudience(post) === "anon";
      case "mine":
        return post.authorType === "user";
      default:
        return true;
    }
  });
  const needle = (query ?? "").trim().toLowerCase();
  if (!needle) return byFilter;
  return byFilter.filter((post) =>
    [post.content, post.username, post.qualifier].some((field) => (field ?? "").toLowerCase().includes(needle)),
  );
}

/** 自己發的，或自己回應過的 */
export function isPostFollowed(post: QZonePost): boolean {
  if (post.authorType === "user") return true;
  return (post.comments ?? []).some((comment) => comment.authorType === "user");
}

/** 未讀回應：別人的、比 seenAt／unreadSince 新的 */
export function unreadComments(post: QZonePost, now: number, unreadSince?: number): QZoneComment[] {
  if (post.muted || !isPostFollowed(post)) return [];
  const since = Math.max(post.seenAt ?? 0, unreadSince ?? 0);
  return visibleComments(post, now).filter((comment) => comment.authorType !== "user" && comment.timestamp > since);
}

/** 有未讀回應的噗數 */
export function countUnreadPosts(posts: QZonePost[], now: number, unreadSince?: number): number {
  return posts.filter((post) => unreadComments(post, now, unreadSince).length > 0).length;
}

export interface NoticeItem {
  postId: string;
  commentId: string;
  authorId: string;
  username: string;
  avatar: string;
  text: string;
  timestamp: number;
  unread: boolean;
}

/** 通知列表：追蹤中的噗、別人的回應，新到舊 */
export function buildNoticeList(
  posts: QZonePost[],
  now: number,
  unreadSince?: number,
  limit = 100,
): NoticeItem[] {
  const items: NoticeItem[] = [];
  for (const post of posts) {
    if (post.muted || !isPostFollowed(post)) continue;
    const unread = new Set(unreadComments(post, now, unreadSince).map((comment) => comment.id));
    for (const comment of visibleComments(post, now)) {
      if (comment.authorType === "user") continue;
      items.push({
        postId: post.id,
        commentId: comment.id,
        authorId: comment.authorId,
        username: comment.username,
        avatar: comment.avatar,
        text: plurkPlainText(comment.content, 60),
        timestamp: comment.timestamp,
        unread: unread.has(comment.id),
      });
    }
  }
  return items.sort((a, b) => b.timestamp - a.timestamp).slice(0, limit);
}

export interface TimelineBubble {
  postId: string;
  x: number;
  lane: 0 | 1;
  timeLabel: string;
}

export interface TimelineDivider {
  x: number;
  label: string;
}

export interface TimelineLayout {
  bubbles: TimelineBubble[];
  dividers: TimelineDivider[];
  width: number;
}

export interface TimelineOptions {
  limit?: number;
  start?: number;
  gap?: number;
  dividerGap?: number;
}

function dayKey(timestamp: number): string {
  const d = new Date(timestamp);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function timeLabel(timestamp: number): string {
  const d = new Date(timestamp);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** 河道時間軸：由左到右越舊，上下交錯，跨日插分隔 */
export function layoutRiverTimeline(posts: QZonePost[], now: Date, opts: TimelineOptions = {}): TimelineLayout {
  const { limit = 20, start = 40, gap = 118, dividerGap = 30 } = opts;
  const shown = posts.slice(0, limit);
  if (shown.length === 0) return { bubbles: [], dividers: [], width: 0 };

  const dayBefore = new Date(now.getTime());
  dayBefore.setDate(dayBefore.getDate() - 1);
  const yesterdayKey = dayKey(dayBefore.getTime());

  const bubbles: TimelineBubble[] = [];
  const dividers: TimelineDivider[] = [];
  let x = start;
  let prevDay = dayKey(now.getTime());

  for (const post of shown) {
    const day = dayKey(post.timestamp);
    if (day !== prevDay) {
      let label: string;
      if (day === yesterdayKey) {
        label = "昨天";
      } else {
        const d = new Date(post.timestamp);
        label = `${d.getMonth() + 1}/${d.getDate()}`;
      }
      dividers.push({ x, label });
      x += dividerGap;
      prevDay = day;
    }
    bubbles.push({
      postId: post.id,
      x,
      lane: (bubbles.length % 2) as 0 | 1,
      timeLabel: timeLabel(post.timestamp),
    });
    x += gap;
  }

  const last = bubbles[bubbles.length - 1];
  return { bubbles, dividers, width: last.x + 240 };
}
