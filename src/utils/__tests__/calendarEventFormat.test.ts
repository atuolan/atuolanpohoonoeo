import { describe, expect, it } from "vitest";
import { parseCalendarEventTags } from "@/services/ResponseParser";
import {
  compareCalendarEvents,
  eventLastDate,
  eventNotes,
  formatEventTime,
  isEventOnDate,
  normalizeEventTime,
} from "@/utils/calendarEventFormat";

describe("行事曆事件：日期", () => {
  it("跨天的行程每一天都算，結束日期早於開始日期時只算當天", () => {
    const trip = { date: "2026-10-17", endDate: "2026-10-19" };
    expect(eventLastDate(trip)).toBe("2026-10-19");
    expect(isEventOnDate(trip, "2026-10-18")).toBe(true);
    expect(isEventOnDate(trip, "2026-10-20")).toBe(false);
    expect(eventLastDate({ date: "2026-10-17", endDate: "2026-10-01" })).toBe("2026-10-17");
  });

  it("排序：日期 → 整天的在前 → 開始時間 → 先建立的在前", () => {
    const events = [
      { id: "c", date: "2026-10-18", startTime: "15:00", createdAt: 1 },
      { id: "d", date: "2026-10-17", startTime: "20:00", createdAt: 1 },
      { id: "b", date: "2026-10-18", createdAt: 2 },
      { id: "a", date: "2026-10-18", startTime: "09:00", createdAt: 3 },
      { id: "e", date: "2026-10-18", createdAt: 1 },
    ];
    expect([...events].sort(compareCalendarEvents).map((e) => e.id)).toEqual(["d", "e", "b", "a", "c"]);
  });
});

describe("行事曆事件：時間和說明", () => {
  it("時間文字", () => {
    expect(formatEventTime({ startTime: "15:00", endTime: "16:00" })).toBe("15:00–16:00");
    expect(formatEventTime({ startTime: "15:00" })).toBe("15:00 開始");
    expect(formatEventTime({ endTime: "16:00" })).toBe("到 16:00");
    expect(formatEventTime({})).toBe("");
  });

  it("說明開頭重複的時間和結束日期拿掉", () => {
    expect(eventNotes({ startTime: "15:00", endTime: "16:00", description: "15:00–16:00，帶健保卡" })).toBe("帶健保卡");
    expect(eventNotes({ endDate: "2026-11-01", description: "到 2026-11-01" })).toBe("");
    expect(eventNotes({ description: "15:00 在門口等" })).toBe("15:00 在門口等");
  });

  it("時間補成兩位數，看不懂的不收", () => {
    expect(normalizeEventTime("9:05")).toBe("09:05");
    expect(normalizeEventTime(" 19:30 ")).toBe("19:30");
    expect(normalizeEventTime("25:00")).toBeUndefined();
    expect(normalizeEventTime("晚上")).toBeUndefined();
    expect(normalizeEventTime(undefined)).toBeUndefined();
  });
});

describe("<calendar-event> 標籤", () => {
  it("可以帶時間和跨天的結束日期", () => {
    const [event] = parseCalendarEventTags(
      '<calendar-event type="user" date="2026-10-24" time="19:00" end="21:30" title="一起吃飯" description="訂好位了"/>',
    );
    expect(event).toEqual({
      type: "user",
      title: "一起吃飯",
      date: "2026-10-24",
      description: "訂好位了",
      startTime: "19:00",
      endTime: "21:30",
    });
  });

  it("end-date 寫在 date 前面也不會被當成開始日期", () => {
    const [event] = parseCalendarEventTags('<calendar-event end-date="2026-10-26" date="2026-10-24" title="去花蓮"/>');
    expect(event.date).toBe("2026-10-24");
    expect(event.endDate).toBe("2026-10-26");
  });

  it("沒寫時間就是整天，跟以前一樣", () => {
    const [event] = parseCalendarEventTags('<calendar-event type="period" date="2026-10-22" title="經期"/>');
    expect(event).toEqual({ type: "period", title: "經期", date: "2026-10-22", description: undefined });
  });
});
