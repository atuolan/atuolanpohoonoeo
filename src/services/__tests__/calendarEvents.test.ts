import "fake-indexeddb/auto";
import { deleteDB } from "idb";
import { beforeEach, describe, expect, it } from "vitest";
import { closeDatabase, db, DB_STORES } from "@/db/database";
import {
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
