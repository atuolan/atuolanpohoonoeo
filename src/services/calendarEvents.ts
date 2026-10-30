/**
 * 行事曆事件的讀寫。行事曆 App、聊天裡的 <calendar-event> 標籤、主動訊息和角色工具都走這裡。
 */
import { db, DB_STORES } from "@/db/database";
import type { CalendarEvent, CalendarEventData, CalendarEventScope } from "@/types/calendar";
import type { Chat } from "@/types/chat";
import { compareCalendarEvents, eventLastDate, isEventVisibleTo, normalizeEventTitle } from "@/utils/calendarEventFormat";

/** 聊天綁定的 user；聊天刪了或沒綁回傳 undefined */
async function chatPersonaId(chatId: string): Promise<string | undefined> {
  const chat = await db.get<Chat>(DB_STORES.CHATS, chatId);
  return chat?.metadata?.personaOverride?.personaId || undefined;
}

/** 補上 user：舊資料沒記，照來源聊天現在綁定的算 */
async function withEventPersona(events: CalendarEvent[]): Promise<CalendarEvent[]> {
  const personaOfChat = new Map<string, Promise<string | undefined>>();
  return Promise.all(
    events.map(async (event) => {
      if (event.personaId || !event.sourceChatId) return event;
      const chatId = event.sourceChatId;
      if (!personaOfChat.has(chatId)) personaOfChat.set(chatId, chatPersonaId(chatId));
      return { ...event, personaId: await personaOfChat.get(chatId) };
    }),
  );
}

/** scope 這個角色、這個 user 讀得到的全部事件 */
async function eventsVisibleTo(scope: CalendarEventScope): Promise<CalendarEvent[]> {
  const viewer = !scope.personaId && scope.chatId ? { ...scope, personaId: await chatPersonaId(scope.chatId) } : scope;
  const all = await db.getAll<CalendarEvent>(DB_STORES.CALENDAR_EVENTS);
  // 先篩掉別的角色的，舊資料才不用為了它們去讀聊天
  const own = await withEventPersona(all.filter((event) => isEventVisibleTo(event, viewer)));
  return own.filter((event) => isEventVisibleTo(event, viewer));
}

/** 寫入一筆行事曆事件；寫不進去會丟錯。id 只有加回收回過的事件時才指定 */
export async function saveCalendarEvent(
  data: CalendarEventData,
  source: CalendarEventScope = {},
  id?: string,
): Promise<CalendarEvent> {
  const now = Date.now();
  const personaId = source.personaId ?? (source.chatId ? await chatPersonaId(source.chatId) : undefined);
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
    personaId,
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
 * 這個角色、這個 user 讀得到的行程裡，同一天、同類型、標題一樣（不管空白和標點）的已經有了就不再新增；
 * 新的多了時間或說明，就補進原本那筆
 */
export async function saveCalendarEventOnce(
  data: CalendarEventData,
  source: CalendarEventScope = {},
  id?: string,
): Promise<SaveOnceResult> {
  const same = await findSameCalendarEvent(data, source);
  if (!same) return { event: await saveCalendarEvent(data, source, id), created: true };

  const patch: Partial<CalendarEvent> = {};
  if (!same.startTime && data.startTime) patch.startTime = data.startTime;
  if (!same.endTime && data.endTime) patch.endTime = data.endTime;
  if (!same.endDate && data.endDate) patch.endDate = data.endDate;
  if (!same.description && data.description) patch.description = data.description;
  if (Object.keys(patch).length === 0) return { event: same, created: false };
  return { event: await updateCalendarEvent({ ...same, ...patch }), created: false };
}

/** scope 讀得到的行程裡，同一天、同類型、標題一樣（不管空白和標點）的那筆 */
export async function findSameCalendarEvent(
  data: Pick<CalendarEventData, "date" | "type" | "title">,
  scope: CalendarEventScope,
): Promise<CalendarEvent | undefined> {
  const title = normalizeEventTitle(data.title);
  const visible = await eventsVisibleTo(scope);
  return visible.find((e) => e.date === data.date && e.type === data.type && normalizeEventTitle(e.title) === title);
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

/** 行事曆 App 用：全部事件，不分角色和 user */
export async function loadCalendarEvents(): Promise<CalendarEvent[]> {
  const all = await withEventPersona(await db.getAll<CalendarEvent>(DB_STORES.CALENDAR_EVENTS));
  return all.sort(compareCalendarEvents);
}

/** 列出 scope 讀得到、日期範圍內（含頭尾）的事件；跨天的行程只要有一天落在範圍內就算。日期都是 YYYY-MM-DD */
export async function listCalendarEvents(
  range: { from?: string; to?: string; limit?: number },
  scope: CalendarEventScope,
): Promise<CalendarEvent[]> {
  const visible = await eventsVisibleTo(scope);
  const matched = visible
    .filter((event) => (!range.from || eventLastDate(event) >= range.from) && (!range.to || event.date <= range.to))
    .sort(compareCalendarEvents);
  return range.limit ? matched.slice(0, range.limit) : matched;
}
