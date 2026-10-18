import { afterEach, describe, expect, it, vi } from "vitest";
import {
  addToPhoneCalendar,
  buildGoogleCalendarUrl,
  buildIcs,
  buildShortcutUrl,
  DEFAULT_SHORTCUT_NAME,
  detectInAppBrowser,
  detectPlatform,
  loadPhoneCalendarSettings,
  needsMethodChoice,
  phoneCalendarHint,
  phoneCalendarMethodLabel,
  resolvePhoneCalendarMethod,
  resolveRange,
  savePhoneCalendarSettings,
  toPhoneCalendarEvent,
} from "./phoneCalendar";

const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const IPAD_AS_MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";
const ANDROID = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36";
const WINDOWS = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36";

const DENTIST = { title: "看牙醫", date: "2026-10-20", startTime: "15:00", endTime: "16:00", description: "帶健保卡" };

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("裝置與加入方式", () => {
  it("分得出 iPhone、假裝成 Mac 的 iPad、Android", () => {
    expect(detectPlatform(IPHONE, 5)).toBe("ios");
    expect(detectPlatform(IPAD_AS_MAC, 5)).toBe("ios");
    expect(detectPlatform(IPAD_AS_MAC, 0)).toBe("other");
    expect(detectPlatform(ANDROID, 5)).toBe("android");
    expect(detectPlatform(WINDOWS, 0)).toBe("other");
  });

  it("自動用行事曆檔；手動選的照選", () => {
    expect(resolvePhoneCalendarMethod("auto")).toBe("ics");
    expect(resolvePhoneCalendarMethod("shortcut")).toBe("shortcut");
    expect(resolvePhoneCalendarMethod("google")).toBe("google");
  });

  it("Android 選「自動」時第一次要先問；選過、或不是 Android 就不問", () => {
    expect(needsMethodChoice("auto", "android")).toBe(true);
    expect(needsMethodChoice("ics", "android")).toBe(false);
    expect(needsMethodChoice("google", "android")).toBe(false);
    expect(needsMethodChoice("auto", "ios")).toBe(false);
    expect(needsMethodChoice("auto", "other")).toBe(false);
  });

  it("Android 的行事曆檔叫「手機日曆」", () => {
    expect(phoneCalendarMethodLabel("ics", "android")).toBe("手機日曆（行事曆檔）");
    expect(phoneCalendarMethodLabel("ics", "ios")).toBe("行事曆檔");
    expect(phoneCalendarMethodLabel("google", "android")).toBe("Google 日曆");
  });

  it("認得出微信、QQ 裡的瀏覽器，QQ 瀏覽器不算", () => {
    const wechat = `${ANDROID} MicroMessenger/8.0.50.2700(0x28003252) WeChat/arm64 NetType/WIFI`;
    const qq = `${ANDROID} V1_AND_SQ_9.0.0_6250_YYB_D QQ/9.0.0.14110 NetType/WIFI`;
    const qqBrowser = "Mozilla/5.0 (Linux; U; Android 14; zh-cn; 23013RK75C) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/109.0 MQQBrowser/15.0 Mobile Safari/537.36";
    expect(detectInAppBrowser(wechat)).toBe("微信");
    expect(detectInAppBrowser(qq)).toBe("QQ");
    expect(detectInAppBrowser(qqBrowser)).toBeUndefined();
    expect(detectInAppBrowser(ANDROID)).toBeUndefined();
  });

  it("行事曆檔的提示：Android 要自己點開檔案，微信裡要換瀏覽器", () => {
    expect(phoneCalendarHint("ics", "android", ANDROID)).toContain("檔案管理");
    expect(phoneCalendarHint("ics", "ios", IPHONE)).toBe("已產生行事曆檔，照手機的提示加入日曆");
    expect(phoneCalendarHint("ics", "android", `${ANDROID} MicroMessenger/8.0.50`)).toContain("在瀏覽器打開");
    expect(phoneCalendarHint("google", "android", ANDROID)).toContain("Google 日曆");
  });
});

describe("設定只存在這台裝置", () => {
  it("存得進去、讀得回來，壞掉的資料用預設值", () => {
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, value),
    });
    expect(loadPhoneCalendarSettings()).toEqual({ method: "auto", shortcutName: DEFAULT_SHORTCUT_NAME });

    savePhoneCalendarSettings({ method: "shortcut", shortcutName: "我的捷徑" });
    expect(loadPhoneCalendarSettings()).toEqual({ method: "shortcut", shortcutName: "我的捷徑" });

    store.set("phone-calendar-settings", "{壞掉");
    expect(loadPhoneCalendarSettings().method).toBe("auto");
    store.set("phone-calendar-settings", JSON.stringify({ method: "fax", shortcutName: " " }));
    expect(loadPhoneCalendarSettings()).toEqual({ method: "auto", shortcutName: DEFAULT_SHORTCUT_NAME });
  });

  it("沒有 localStorage 也不會壞", () => {
    vi.stubGlobal("localStorage", undefined);
    expect(loadPhoneCalendarSettings().method).toBe("auto");
    expect(() => savePhoneCalendarSettings({ method: "ics", shortcutName: "x" })).not.toThrow();
  });
});

describe("時間", () => {
  it("有時間欄位就用；沒有就從說明裡找；都沒有是整天", () => {
    expect(toPhoneCalendarEvent({ ...DENTIST })).toMatchObject({ startTime: "15:00", endTime: "16:00" });
    expect(toPhoneCalendarEvent({ title: "聚餐", date: "2026-10-20", description: "18:30 在餐廳，21:00 散會" })).toMatchObject({
      startTime: "18:30",
      endTime: "21:00",
    });
    expect(toPhoneCalendarEvent({ title: "看醫生", date: "2026-10-20", description: "下午三點去診所" }).startTime).toBeUndefined();
  });

  it("整天、跨天、沒寫結束、跨過午夜", () => {
    expect(resolveRange({ title: "生日", date: "2026-10-20" })).toEqual({
      allDay: true,
      start: { date: "2026-10-20" },
      end: { date: "2026-10-21" },
      lastDay: "2026-10-20",
    });
    expect(resolveRange({ title: "畢旅", date: "2026-10-30", endDate: "2026-11-01" }).end).toEqual({ date: "2026-11-02" });
    expect(resolveRange({ title: "電話", date: "2026-10-20", startTime: "23:30" }).end).toEqual({ date: "2026-10-21", time: "00:30" });
    expect(resolveRange({ title: "夜班", date: "2026-10-20", startTime: "23:00", endTime: "01:00" }).end).toEqual({ date: "2026-10-21", time: "01:00" });
  });
});

describe("行事曆檔 .ics", () => {
  const now = new Date(Date.UTC(2026, 9, 17, 4, 0, 0));

  it("有時間的行程用當地時間，整天的行程用日期", () => {
    const timed = buildIcs(DENTIST, { uid: "u1", now });
    expect(timed).toContain("DTSTART:20261020T150000\r\n");
    expect(timed).toContain("DTEND:20261020T160000\r\n");
    expect(timed).toContain("DTSTAMP:20261017T040000Z\r\n");
    expect(timed).toContain("SUMMARY:看牙醫\r\n");

    const allDay = buildIcs({ title: "生日", date: "2026-10-20" }, { uid: "u2", now });
    expect(allDay).toContain("DTSTART;VALUE=DATE:20261020\r\n");
    expect(allDay).toContain("DTEND;VALUE=DATE:20261021\r\n");
    expect(allDay).not.toContain("DESCRIPTION");
  });

  it("特殊字元要跳脫，長的中文說明要照位元組折行", () => {
    const ics = buildIcs(
      { title: "A, B; C\\D", date: "2026-10-20", description: `第一行\n${"很長的說明".repeat(20)}` },
      { uid: "u3", now },
    );
    expect(ics).toContain("SUMMARY:A\\, B\\; C\\\\D\r\n");
    const encoder = new TextEncoder();
    for (const line of ics.split("\r\n")) expect(encoder.encode(line).length).toBeLessThanOrEqual(75);
    const unfolded = ics.replace(/\r\n /g, "");
    expect(unfolded).toContain(`DESCRIPTION:第一行\\n${"很長的說明".repeat(20)}\r\n`);
  });
});

describe("Google 日曆和捷徑", () => {
  it("Google 日曆：整天不帶時區，有時間的帶時區", () => {
    const allDay = new URL(buildGoogleCalendarUrl({ title: "生日", date: "2026-10-20" }, "Asia/Taipei"));
    expect(allDay.searchParams.get("dates")).toBe("20261020/20261021");
    expect(allDay.searchParams.get("ctz")).toBeNull();

    const timed = new URL(buildGoogleCalendarUrl(DENTIST, "Asia/Taipei"));
    expect(timed.searchParams.get("action")).toBe("TEMPLATE");
    expect(timed.searchParams.get("text")).toBe("看牙醫");
    expect(timed.searchParams.get("dates")).toBe("20261020T150000/20261020T160000");
    expect(timed.searchParams.get("ctz")).toBe("Asia/Taipei");
    expect(timed.searchParams.get("details")).toBe("帶健保卡");
  });

  it("捷徑：用網址把 JSON 交給指定名稱的捷徑", () => {
    const url = buildShortcutUrl(DENTIST, "加到手機日曆");
    expect(url.startsWith(`shortcuts://run-shortcut?name=${encodeURIComponent("加到手機日曆")}&input=text&text=`)).toBe(true);
    const text = decodeURIComponent(url.split("&text=")[1]);
    expect(JSON.parse(text)).toEqual({
      title: "看牙醫",
      start: "2026-10-20 15:00",
      end: "2026-10-20 16:00",
      allDay: false,
      notes: "帶健保卡",
    });

    const trip = JSON.parse(decodeURIComponent(buildShortcutUrl({ title: "畢旅", date: "2026-10-30", endDate: "2026-11-01" }).split("&text=")[1]));
    // 捷徑的整天行程寫最後一天，不是隔天
    expect(trip).toMatchObject({ start: "2026-10-30", end: "2026-11-01", allDay: true });
  });
});

describe("打開方式", () => {
  function stubDocument() {
    const clicked: Array<{ href: string; target: string; download: string }> = [];
    vi.stubGlobal("document", {
      createElement: () => {
        const link = {
          href: "",
          target: "",
          rel: "",
          download: "",
          style: {} as Record<string, string>,
          click: () => clicked.push({ href: link.href, target: link.target, download: link.download }),
          remove: () => {},
        };
        return link;
      },
      body: { appendChild: () => {} },
    });
    return clicked;
  }

  it("都是點連結打開，不換掉 App 本身的頁面", () => {
    vi.useFakeTimers();
    const clicked = stubDocument();
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:fake");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});

    expect(addToPhoneCalendar(DENTIST, { method: "shortcut", shortcutName: "加到手機日曆" })).toBe("shortcut");
    expect(addToPhoneCalendar(DENTIST, { method: "google", shortcutName: "" })).toBe("google");
    expect(addToPhoneCalendar(DENTIST, { method: "auto", shortcutName: "" })).toBe("ics");

    expect(clicked[0].href.startsWith("shortcuts://run-shortcut")).toBe(true);
    expect(clicked[1]).toMatchObject({ target: "_blank" });
    expect(clicked[1].href.startsWith("https://calendar.google.com/")).toBe(true);
    expect(clicked[2]).toMatchObject({ href: "blob:fake", download: "看牙醫.ics" });

    vi.runAllTimers();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:fake");
  });
});
