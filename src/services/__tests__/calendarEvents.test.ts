import "fake-indexeddb/auto";
import { deleteDB } from "idb";
import { beforeEach, describe, expect, it } from "vitest";
import { closeDatabase, db, DB_STORES } from "@/db/database";
import {
  findSameCalendarEvent,
  listCalendarEvents,
  loadCalendarEvents,
  saveCalendarEvent,
  saveCalendarEventOnce,
  updateCalendarEvent,
  withdrawCalendarEvent,
} from "@/services/calendarEvents";
import type { CalendarEvent } from "@/types/calendar";

const all = () => db.getAll<CalendarEvent>(DB_STORES.CALENDAR_EVENTS);

beforeEach(async () => {
  closeDatabase();
  await deleteDB("aguaphone-db");
  await db.init();
});

describe("角色加行程不重複", () => {
  it("同一天、標題一樣（不管空白和標點）就不再新增，多給的時間補進原本那筆", async () => {
    const first = await saveCalendarEventOnce({ type: "user", title: "一起吃飯", date: "2026-10-24" });
    const again = await saveCalendarEventOnce({
      type: "user",
      title: "一起 吃飯！",
      date: "2026-10-24",
      startTime: "19:00",
    });

    expect(first.created).toBe(true);
    expect(again.created).toBe(false);
    expect(again.event.id).toBe(first.event.id);
    const stored = await all();
    expect(stored).toHaveLength(1);
    expect(stored[0].startTime).toBe("19:00");
  });

  it("使用者自己先記了，角色再加也不會多一筆", async () => {
    await saveCalendarEvent({ type: "user", title: "看牙醫", date: "2026-10-20", startTime: "15:00" });
    const result = await saveCalendarEventOnce({ type: "user", title: "看牙醫", date: "2026-10-20", startTime: "16:00" });

    expect(result.created).toBe(false);
    // 原本的時間不會被蓋掉
    expect((await all())[0].startTime).toBe("15:00");
  });

  it("不同天、不同類型的照樣新增", async () => {
    await saveCalendarEventOnce({ type: "user", title: "一起吃飯", date: "2026-10-24" });
    await saveCalendarEventOnce({ type: "user", title: "一起吃飯", date: "2026-10-25" });
    await saveCalendarEventOnce({ type: "period", title: "一起吃飯", date: "2026-10-24" });

    expect(await all()).toHaveLength(3);
  });
});

describe("收回角色加的行程", () => {
  it("沒改過的收回；照原 id 加回去", async () => {
    const { event } = await saveCalendarEventOnce({ type: "user", title: "一起吃飯", date: "2026-10-24" });

    await withdrawCalendarEvent(event.id);
    expect(await all()).toHaveLength(0);

    const restored = await saveCalendarEventOnce({ type: "user", title: "一起吃飯", date: "2026-10-24" }, {}, event.id);
    expect(restored.event.id).toBe(event.id);
  });

  it("使用者在行事曆改過的留著", async () => {
    const { event } = await saveCalendarEventOnce({ type: "user", title: "一起吃飯", date: "2026-10-24" });
    await updateCalendarEvent({ ...event, startTime: "18:30" }, { byUser: true });

    await withdrawCalendarEvent(event.id);

    expect(await all()).toHaveLength(1);
  });
});

describe("行程綁定角色和 user", () => {
  const data = { type: "user" as const, title: "看牙醫", date: "2026-10-24" };
  const range = { from: "2026-10-24", to: "2026-10-24" };

  const bindChat = (id: string, personaId: string) =>
    db.put(DB_STORES.CHATS, JSON.parse(JSON.stringify({ id, metadata: { personaOverride: { personaId } } })));

  const titlesFor = async (scope: { characterId: string; chatId: string }) =>
    (await listCalendarEvents(range, scope)).map((e) => e.title);

  beforeEach(async () => {
    await bindChat("a-p", "persona-p");
    await bindChat("a-q", "persona-q");
    await bindChat("b-p", "persona-p");
    await bindChat("a-p-2", "persona-p");
  });

  it("角色記的只有同角色、同 user 讀得到，換聊天也算", async () => {
    const { event } = await saveCalendarEventOnce(data, { characterId: "a", chatId: "a-p" });
    expect(event.personaId).toBe("persona-p");

    expect(await titlesFor({ characterId: "a", chatId: "a-p" })).toEqual(["看牙醫"]);
    expect(await titlesFor({ characterId: "a", chatId: "a-p-2" })).toEqual(["看牙醫"]);
    expect(await titlesFor({ characterId: "b", chatId: "b-p" })).toEqual([]);
    expect(await titlesFor({ characterId: "a", chatId: "a-q" })).toEqual([]);
  });

  it("使用者自己記給某個 user 的，那個 user 的角色都讀得到，別的 user 讀不到", async () => {
    await saveCalendarEvent(data, { personaId: "persona-p" });

    expect(await titlesFor({ characterId: "a", chatId: "a-p" })).toEqual(["看牙醫"]);
    expect(await titlesFor({ characterId: "b", chatId: "b-p" })).toEqual(["看牙醫"]);
    expect(await titlesFor({ characterId: "a", chatId: "a-q" })).toEqual([]);
  });

  it("沒綁 user 的自記行程所有 user 都讀得到", async () => {
    await saveCalendarEvent(data);

    expect(await titlesFor({ characterId: "a", chatId: "a-p" })).toEqual(["看牙醫"]);
    expect(await titlesFor({ characterId: "a", chatId: "a-q" })).toEqual(["看牙醫"]);
  });

  it("自己記的可以只給指定角色，同一個 user 的其他角色讀不到", async () => {
    await saveCalendarEvent({ ...data, visibleCharacterIds: ["a"] }, { personaId: "persona-p" });

    expect(await titlesFor({ characterId: "a", chatId: "a-p" })).toEqual(["看牙醫"]);
    expect(await titlesFor({ characterId: "b", chatId: "b-p" })).toEqual([]);
  });

  it("自己記的可以只有自己看，哪個角色都讀不到", async () => {
    await saveCalendarEvent({ ...data, visibleCharacterIds: [] });

    expect(await titlesFor({ characterId: "a", chatId: "a-p" })).toEqual([]);
    expect(await titlesFor({ characterId: "b", chatId: "b-p" })).toEqual([]);
  });

  it("讀不到的自記行程，角色記同名的不會被併進去", async () => {
    await saveCalendarEvent({ ...data, visibleCharacterIds: ["a"] }, { personaId: "persona-p" });
    const { created } = await saveCalendarEventOnce(data, { characterId: "b", chatId: "b-p" });

    expect(created).toBe(true);
    expect(await all()).toHaveLength(2);
  });

  it("不同角色記同名行程各自一筆，同角色、同 user 才算重複", async () => {
    const first = await saveCalendarEventOnce(data, { characterId: "a", chatId: "a-p" });
    const other = await saveCalendarEventOnce(data, { characterId: "b", chatId: "b-p" });
    const again = await saveCalendarEventOnce(data, { characterId: "a", chatId: "a-p-2" });

    expect(other.created).toBe(true);
    expect(other.event.id).not.toBe(first.event.id);
    expect(again.created).toBe(false);
    expect(await all()).toHaveLength(2);
  });

  it("使用者自己記了的，角色再記不重複", async () => {
    await saveCalendarEvent(data, { personaId: "persona-p" });
    const { created } = await saveCalendarEventOnce(data, { characterId: "a", chatId: "a-p" });
    expect(created).toBe(false);
  });

  it("別的角色記的不算「已經在行事曆裡」", async () => {
    await saveCalendarEventOnce(data, { characterId: "a", chatId: "a-p" });
    expect(await findSameCalendarEvent(data, { characterId: "b", chatId: "b-p" })).toBeUndefined();
  });

  it("舊資料沒記 user：照來源聊天綁定的 user 算", async () => {
    await db.put(DB_STORES.CALENDAR_EVENTS, {
      ...data,
      id: "old",
      sourceCharacterId: "a",
      sourceChatId: "a-p",
      createdAt: 1,
      updatedAt: 1,
    });

    expect(await titlesFor({ characterId: "a", chatId: "a-p" })).toEqual(["看牙醫"]);
    expect(await titlesFor({ characterId: "a", chatId: "a-q" })).toEqual([]);
    expect((await loadCalendarEvents())[0].personaId).toBe("persona-p");
  });

  it("舊資料的來源聊天刪了：還是只有那個角色讀得到", async () => {
    await db.put(DB_STORES.CALENDAR_EVENTS, {
      ...data,
      id: "old",
      sourceCharacterId: "a",
      sourceChatId: "deleted",
      createdAt: 1,
      updatedAt: 1,
    });

    expect(await titlesFor({ characterId: "a", chatId: "a-q" })).toEqual(["看牙醫"]);
    expect(await titlesFor({ characterId: "b", chatId: "b-p" })).toEqual([]);
  });

  it("群聊裡記的沒有角色：只有那個群聊讀得到", async () => {
    await bindChat("group", "persona-p");
    await saveCalendarEventOnce(data, { chatId: "group" });

    expect(await titlesFor({ characterId: "a", chatId: "group" })).toEqual(["看牙醫"]);
    expect(await titlesFor({ characterId: "a", chatId: "a-p" })).toEqual([]);
  });
});
