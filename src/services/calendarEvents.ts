/**
 * 行事曆事件的讀寫。聊天裡的 <calendar-event> 標籤和角色工具都走這裡。
 */
import { db, DB_STORES } from "@/db/database";
import type { CalendarEvent, CalendarEventData } from "@/types/calendar";

export interface CalendarEventSource {
  characterId?: string;
  chatId?: string;
}

/** 寫入一筆行事曆事件；寫不進去會丟錯 */
export async function saveCalendarEvent(
  data: CalendarEventData,
  source: CalendarEventSource = {},
): Promise<CalendarEvent> {
  const now = Date.now();
  const event: CalendarEvent = {
    id: `cal_${now}_${Math.random().toString(36).slice(2, 8)}`,
    type: data.type,
    title: data.title,
    date: data.date,
    description: data.description,
    startTime: data.startTime,
    endTime: data.endTime,
    endDate: data.endDate,
    sourceCharacterId: source.characterId,
    sourceChatId: source.chatId,
    createdAt: now,
    updatedAt: now,
  };
  await db.put(DB_STORES.CALENDAR_EVENTS, JSON.parse(JSON.stringify(event)));
  return event;
}

/** 列出日期範圍內（含頭尾）的事件，依日期排序；日期都是 YYYY-MM-DD */
export async function listCalendarEvents(range: {
  from?: string;
  to?: string;
  limit?: number;
}): Promise<CalendarEvent[]> {
  const all = await db.getAll<CalendarEvent>(DB_STORES.CALENDAR_EVENTS);
  const matched = all
    .filter((event) => (!range.from || event.date >= range.from) && (!range.to || event.date <= range.to))
    .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt);
  return range.limit ? matched.slice(0, range.limit) : matched;
}
