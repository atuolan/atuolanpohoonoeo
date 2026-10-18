/**
 * 行事曆事件的日期、時間、說明怎麼算和怎麼顯示（純函式，行事曆 App、聊天卡片、角色工具、解析器共用）
 */
import type { CalendarEvent, CalendarEventTime } from "@/types/calendar";

/** 行程的最後一天：跨天的是結束日期，其他就是當天 */
export function eventLastDate(event: { date: string; endDate?: string }): string {
  return event.endDate && event.endDate > event.date ? event.endDate : event.date;
}

/** 這一天有沒有這個行程（跨天的每一天都算） */
export function isEventOnDate(event: { date: string; endDate?: string }, date: string): boolean {
  return event.date <= date && date <= eventLastDate(event);
}

/** 排序：日期 → 整天的在前 → 開始時間 → 先建立的在前 */
export function compareCalendarEvents(
  a: Pick<CalendarEvent, "date" | "startTime" | "createdAt">,
  b: Pick<CalendarEvent, "date" | "startTime" | "createdAt">,
): number {
  return (
    a.date.localeCompare(b.date) ||
    (a.startTime ? 1 : 0) - (b.startTime ? 1 : 0) ||
    (a.startTime ?? "").localeCompare(b.startTime ?? "") ||
    (a.createdAt ?? 0) - (b.createdAt ?? 0)
  );
}

/** 時間文字：15:00–16:00、15:00 開始、到 16:00；整天的行程回傳空字串 */
export function formatEventTime(event: CalendarEventTime): string {
  if (event.startTime && event.endTime) return `${event.startTime}–${event.endTime}`;
  if (event.startTime) return `${event.startTime} 開始`;
  if (event.endTime) return `到 ${event.endTime}`;
  return "";
}

/**
 * 說明文字。角色工具建立的說明開頭是時間和結束日期（例如「15:00–16:00，帶健保卡」「到 2026-11-01」），
 * 時間已經另外顯示，這裡去掉
 */
export function eventNotes(event: CalendarEventTime & { description?: string }): string {
  let text = event.description ?? "";
  if (event.startTime) text = text.replace(/^\d{1,2}:\d{2}(?:–\d{1,2}:\d{2}| 開始)?(?:，|$)/, "");
  if (event.endDate) text = text.replace(/^到 \d{4}-\d{2}-\d{2}(?: \d{1,2}:\d{2})?(?:，|$)/, "");
  return text.trim();
}

/** 把「9:05」補成「09:05」；不是時間就回傳 undefined */
export function normalizeEventTime(raw: string | undefined): string | undefined {
  const m = raw?.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return undefined;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return undefined;
  return `${String(h).padStart(2, "0")}:${m[2]}`;
}
