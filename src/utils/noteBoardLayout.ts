/**
 * 便簽留言板的牆面排版：按日期分段（新的在上），回覆心情的紙條掛在那則心情下面
 */

import type { BoardCharNote, MoodPost, NoteBoardData } from "@/services/noteBoard";
import { daysAgo } from "@/utils/noteTime";

export type BoardItem =
  | { kind: "post"; post: MoodPost; replies: BoardCharNote[] }
  | { kind: "note"; note: BoardCharNote };

export interface BoardDay {
  key: string;
  label: string;
  items: BoardItem[];
}

const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];

function dayKey(timestamp: number): string {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
}

function dayLabel(timestamp: number, now: number): string {
  const diff = daysAgo(timestamp, now);
  if (diff === 0) return "今天";
  if (diff === 1) return "昨天";
  const date = new Date(timestamp);
  return `${date.getMonth() + 1}/${date.getDate()} · 星期${WEEKDAYS[date.getDay()]}`;
}

export function buildBoardDays(data: NoteBoardData, now = Date.now()): BoardDay[] {
  const postIds = new Set(data.posts.map((p) => p.id));
  const repliesByPost = new Map<string, BoardCharNote[]>();
  const entries: Array<{ at: number; item: BoardItem }> = [];

  for (const note of data.notes) {
    if (note.replyTo && postIds.has(note.replyTo)) {
      const replies = repliesByPost.get(note.replyTo) ?? [];
      replies.push(note);
      repliesByPost.set(note.replyTo, replies);
    } else {
      // 主動寫的提醒，或回覆的心情已經被上限擠掉了
      entries.push({ at: note.createdAt, item: { kind: "note", note } });
    }
  }
  for (const post of data.posts) {
    const replies = (repliesByPost.get(post.id) ?? []).sort((a, b) => a.createdAt - b.createdAt);
    entries.push({ at: post.createdAt, item: { kind: "post", post, replies } });
  }
  entries.sort((a, b) => b.at - a.at);

  const days: BoardDay[] = [];
  for (const { at, item } of entries) {
    const key = dayKey(at);
    const last = days[days.length - 1];
    if (last?.key === key) last.items.push(item);
    else days.push({ key, label: dayLabel(at, now), items: [item] });
  }
  return days;
}

/** 紙條的傾斜角度（-4～4 度），依 id 算出來，每次打開都一樣 */
export function noteTilt(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0;
  return (Math.abs(hash) % 81) / 10 - 4;
}
