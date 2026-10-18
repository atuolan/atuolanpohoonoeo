/**
 * 行事曆事件的讀寫。行事曆 App、聊天裡的 <calendar-event> 標籤、主動訊息和角色工具都走這裡。
 */
import { db, DB_STORES } from "@/db/database";
import type { CalendarEvent, CalendarEventData } from "@/types/calendar";
import { compareCalendarEvents, eventLastDate, normalizeEventTitle } from "@/utils/calendarEventFormat";

export interface CalendarEventSource {
  characterId?: string;
  chatId?: string;
}

/** 寫入一筆行事曆事件；寫不進去會丟錯。id 只有加回收回過的事件時才指定 */
export async function saveCalendarEvent(
  data: CalendarEventData,
  source: CalendarEventSource = {},
  id?: string,
): Promise<CalendarEvent> {
  const now = Date.now();
  const event: CalendarEvent = {
    id: id ?? `cal_${now}_${Math.random().toString(36).slice(2, 8)}`,
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

export interface SaveOnceResult {
  event: CalendarEvent;
  /** false：行事曆裡本來就有，沒有新增 */
  created: boolean;
}

/**
 * 角色加的行程走這裡（聊天標籤、主動訊息、角色工具）：
 * 同一天、同類型、標題一樣（不管空白和標點）的已經有了就不再新增；新的多了時間或說明，就補進原本那筆
 */
export async function saveCalendarEventOnce(
  data: CalendarEventData,
  source: CalendarEventSource = {},
  id?: string,
): Promise<SaveOnceResult> {
  const same = await findSameCalendarEvent(data);
  if (!same) return { event: await saveCalendarEvent(data, source, id), created: true };

  const patch: Partial<CalendarEvent> = {};
  if (!same.startTime && data.startTime) patch.startTime = data.startTime;
  if (!same.endTime && data.endTime) patch.endTime = data.endTime;
  if (!same.endDate && data.endDate) patch.endDate = data.endDate;
  if (!same.description && data.description) patch.description = data.description;
  if (Object.keys(patch).length === 0) return { event: same, created: false };
  return { event: await updateCalendarEvent({ ...same, ...patch }), created: false };
}

/** 行事曆裡同一天、同類型、標題一樣（不管空白和標點）的那筆 */
export async function findSameCalendarEvent(
  data: Pick<CalendarEventData, "date" | "type" | "title">,
): Promise<CalendarEvent | undefined> {
  const title = normalizeEventTitle(data.title);
  const all = await db.getAll<CalendarEvent>(DB_STORES.CALENDAR_EVENTS);
  return all.find((e) => e.date === data.date && e.type === data.type && normalizeEventTitle(e.title) === title);
}

/** 收回角色加的行程（重新生成、換到別的候選回覆時）；使用者在行事曆 App 改過的留著 */
export async function withdrawCalendarEvent(id: string): Promise<void> {
  const event = await db.get<CalendarEvent>(DB_STORES.CALENDAR_EVENTS, id);
  if (!event || event.editedAt) return;
  await db.delete(DB_STORES.CALENDAR_EVENTS, id);
}

/** 改一筆已經有的事件；寫不進去會丟錯。byUser：使用者在行事曆 App 改的 */
export async function updateCalendarEvent(
  event: CalendarEvent,
  options: { byUser?: boolean } = {},
): Promise<CalendarEvent> {
  const now = Date.now();
  const updated: CalendarEvent = { ...event, updatedAt: now };
  if (options.byUser) updated.editedAt = now;
  await db.put(DB_STORES.CALENDAR_EVENTS, JSON.parse(JSON.stringify(updated)));
  return updated;
}

export async function deleteCalendarEvent(id: string): Promise<void> {
  await db.delete(DB_STORES.CALENDAR_EVENTS, id);
}

export async function loadCalendarEvents(): Promise<CalendarEvent[]> {
  const all = await db.getAll<CalendarEvent>(DB_STORES.CALENDAR_EVENTS);
  return all.sort(compareCalendarEvents);
}

/** 列出日期範圍內（含頭尾）的事件；跨天的行程只要有一天落在範圍內就算。日期都是 YYYY-MM-DD */
export async function listCalendarEvents(range: {
  from?: string;
  to?: string;
  limit?: number;
}): Promise<CalendarEvent[]> {
  const all = await db.getAll<CalendarEvent>(DB_STORES.CALENDAR_EVENTS);
  const matched = all
    .filter((event) => (!range.from || eventLastDate(event) >= range.from) && (!range.to || event.date <= range.to))
    .sort(compareCalendarEvents);
  return range.limit ? matched.slice(0, range.limit) : matched;
}
