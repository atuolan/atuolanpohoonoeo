/**
 * 頭盔TA 畫面用的小工具：鎖屏通知、電量、心情句……
 * 都是從既有的 PeekPhoneData 推出來，不會另外呼叫 AI。
 */

import type { GroupStatus } from "@/stores/peekPhone";
import type { CharPlan, CharTodo } from "@/types/charPlanner";
import type {
  PeekChatThread,
  PeekDiaryEntry,
  PeekMemo,
  PeekPhoneTab,
  PeekScheduleItem,
} from "@/types/peekPhone";
import { comparePlans, compareTodos } from "@/utils/charPlanner";
import type { Component } from "vue";

const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];

/** 聯絡人頭像底色：同一個名字永遠同一色 */
const AVATAR_COLORS = ["#8E5C68", "#5C7A6B", "#7A6A4F", "#5E5A8C", "#3D5A80", "#86624A"];

export function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function avatarColor(seed: string): string {
  return AVATAR_COLORS[hashString(seed) % AVATAR_COLORS.length];
}

/** 名字第一個字（處理 emoji / 罕用字的代理對） */
export function initialOf(name: string): string {
  return Array.from(name.trim())[0] ?? "?";
}

/** 角色手機的電量：同一支手機固定，落在 12%–86% */
export function batteryLevel(seed: string): number {
  return 12 + (hashString(seed) % 75);
}

/** AI 給的時間戳可能是秒、毫秒或亂填，統一成毫秒；不合理回傳 0 */
export function toMillis(ts: number): number {
  if (!Number.isFinite(ts) || ts <= 0) return 0;
  return ts < 1e11 ? ts * 1000 : ts;
}

export function formatClock(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** 例：10月18日 星期日 */
export function formatLockDate(d: Date): string {
  return `${d.getMonth() + 1}月${d.getDate()}日 星期${WEEKDAYS[d.getDay()]}`;
}

/** 通知用：剛剛 / N分鐘前 / 今天的 HH:mm / M/D */
export function formatRelative(ts: number, now: Date): string {
  const ms = toMillis(ts);
  if (!ms) return "";
  const diff = now.getTime() - ms;
  if (diff >= 0 && diff < 60_000) return "剛剛";
  if (diff >= 0 && diff < 3_600_000) return `${Math.floor(diff / 60_000)}分鐘前`;
  const d = new Date(ms);
  if (d.toDateString() === now.toDateString()) return formatClock(d);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

export interface PeekNotification {
  threadId: string;
  contactName: string;
  content: string;
  timestamp: number;
}

/** 鎖屏通知：每個聊天串最後一則「對方」傳來的訊息，新的在前 */
export function latestNotifications(
  chats: PeekChatThread[],
  limit: number,
): PeekNotification[] {
  const items: PeekNotification[] = [];
  for (const thread of chats) {
    // 收回的訊息不會留在通知裡
    const last = [...thread.messages].reverse().find((m) => !m.isSelf && !m.recalled);
    if (!last) continue;
    items.push({
      threadId: thread.id,
      contactName: thread.contactName,
      // 非中文角色的訊息是「原文＋換行＋翻譯」，通知只放第一行
      content: last.content.split("\n")[0].trim(),
      timestamp: last.timestamp,
    });
  }
  return items
    .sort((a, b) => toMillis(b.timestamp) - toMillis(a.timestamp))
    .slice(0, limit);
}

/** 鎖屏上的下一個行程：第一個還沒完成、有時間的；都過了就最後一個；只有整天的就整天的 */
export function nextScheduleItem(schedule: PeekScheduleItem[]): PeekScheduleItem | null {
  const titled = schedule.filter((s) => s.title?.trim());
  const timed = titled.filter((s) => s.time).sort((a, b) => a.time.localeCompare(b.time));
  return timed.find((s) => !s.done) ?? timed[timed.length - 1] ?? titled[0] ?? null;
}

/** 桌面週曆下的一句話：最新一篇日記的第一句，最多 14 字 */
export function moodLine(diary: PeekDiaryEntry[]): string {
  const latest = [...diary]
    .filter((d) => d.content?.trim())
    .sort((a, b) => b.date.localeCompare(a.date))[0];
  if (!latest) return "";
  const first = latest.content.trim().split(/[。！？!?\n]/)[0].trim();
  return first.length > 14 ? `${first.slice(0, 14)}…` : first;
}

export const MOOD_LABELS: Record<PeekDiaryEntry["mood"], string> = {
  happy: "開心",
  neutral: "平靜",
  sad: "低落",
  angry: "生氣",
  excited: "興奮",
};

/** 相簿縮圖沒有真的照片，用描述算出一組固定的漸層 */
const PHOTO_TONES = [
  ["#5E7FA8", "#C9A58E"],
  ["#4B5D52", "#A9B79A"],
  ["#6B5C53", "#D8B49A"],
  ["#3E4A63", "#8C9AB8"],
  ["#7A5A64", "#D6A8A0"],
  ["#55606B", "#C2C8C9"],
];

export function photoTone(seed: string): string {
  const [a, b] = PHOTO_TONES[hashString(seed) % PHOTO_TONES.length];
  return `linear-gradient(160deg, ${a} 0%, ${b} 100%)`;
}

/** 桌面上的一個 App 圖示 */
export interface HomeApp {
  key: PeekPhoneTab;
  label: string;
  icon: Component;
  badge: number;
  status: GroupStatus;
  /** 這個 App 裡還有沒找到的秘密 */
  secret: boolean;
}

/** 偷窺手機上顯示的行程、待辦：多一個「秘密」標記 */
export type PeekScheduleView = PeekScheduleItem & { secret?: boolean };
export type PeekMemoView = PeekMemo & { secret?: boolean };

/** 角色今天的行程換成偷窺手機的格式；整天的沒有時間；時間過了算做完 */
export function scheduleFromPlanner(plans: CharPlan[], today: string, now: Date): PeekScheduleView[] {
  const clock = formatClock(now);
  return plans
    .filter((p) => p.date === today)
    .sort(comparePlans)
    .map((p) => ({
      id: p.id,
      time: p.time ?? "",
      title: p.title,
      location: p.place,
      done: !!p.time && p.time <= clock,
      secret: p.secret,
    }));
}

/** 角色的待辦換成偷窺手機備忘錄的格式（秘密的也在，偷看就是要看這個） */
export function memosFromPlanner(todos: CharTodo[]): PeekMemoView[] {
  return [...todos].sort(compareTodos).map((t) => ({
    id: t.id,
    content: t.text,
    done: t.done,
    createdAt: t.createdAt,
    secret: t.secret,
  }));
}
