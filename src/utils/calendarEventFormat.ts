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

/** 比對標題用：去掉空白和標點符號，英文不分大小寫 */
export function normalizeEventTitle(title: string): string {
  return title.replace(/[\s\p{P}\p{S}]/gu, "").toLowerCase();
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

const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];

/** 「10/24（六）」 */
export function formatMonthDayWeekday(date: string): string {
  const d = new Date(`${date}T00:00:00`);
  return `${d.getMonth() + 1}/${d.getDate()}（${WEEKDAYS[d.getDay()]}）`;
}

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00`);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * 給 AI 看的使用者行事曆（{{userCalendar}}）：today 起 7 天內的行程和經期紀錄，最多 10 筆；
 * 角色在這個聊天幫忙記的標出來。沒有行程回傳空字串（條目就不輸出）
 */
export function buildUserCalendarPromptText(
  events: CalendarEvent[],
  options: { today: string; chatId: string; charName: string },
): string {
  const last = addDays(options.today, 6);
  const lines = events
    .filter((e) => e.type !== "holiday" && eventLastDate(e) >= options.today && e.date <= last)
    .sort(compareCalendarEvents)
    .slice(0, 10)
    .map((e) => {
      const end = eventLastDate(e);
      const days = end !== e.date ? `${formatMonthDayWeekday(e.date)}–${formatMonthDayWeekday(end)}` : formatMonthDayWeekday(e.date);
      const time = formatEventTime(e);
      const notes = eventNotes(e);
      const kind = e.type === "period" ? "經期：" : "";
      const helped = e.sourceChatId === options.chatId ? `（${options.charName}幫忙記的）` : "";
      return `- ${days}${time ? ` ${time}` : ""} ${kind}${e.title}${notes ? `（${notes}）` : ""}${helped}`;
    });
  return lines.join("\n");
}
