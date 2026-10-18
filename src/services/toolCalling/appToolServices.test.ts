/**
 * 用 App 真正的服務跑內建角色工具：跟聊天畫面一樣透過 createAppToolServices 接線，
 * 行事曆、記憶、來電寫進（假的）IndexedDB，音樂、桌布用真的 Pinia store。
 * 只替換掉對外的網路（音樂搜尋、天氣 API）和瀏覽器的 Audio。
 * 以前的測試把服務整個換成假的，工具和 App 接不上也測不出來。
 */
import "fake-indexeddb/auto";
import { deleteDB } from "idb";
import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/api/MusicApi", () => ({
  searchMusic: vi.fn(),
  getMusicUrl: vi.fn(),
  getLyrics: vi.fn(async () => ""),
}));

import { getMusicUrl, searchMusic, type MusicTrack } from "@/api/MusicApi";
import { closeDatabase, db, DB_STORES } from "@/db/database";
import { saveCalendarEvent } from "@/services/calendarEvents";
import { useMusicStore } from "@/stores/music";
import { useThemeStore } from "@/stores/theme";
import { installThemeDomStub } from "@/stores/__tests__/helpers/themeDomStub";
import type { CalendarEvent } from "@/types/calendar";
import { createAppToolServices, type AppToolServiceOptions } from "./appToolServices";
import { CHAT_TOOLS } from "./chatTools";

const tool = (name: string) => CHAT_TOOLS.find((entry) => entry.name === name)!;

function makeContext(overrides: Partial<AppToolServiceOptions> = {}) {
  return {
    chatId: "chat-1",
    characterId: "char-1",
    characterName: "小白",
    locationCity: "Taipei",
    ...createAppToolServices({
      chatId: "chat-1",
      characterId: "char-1",
      vectorMemoryEnabled: false,
      vectorThreshold: 0.3,
      musicStore: useMusicStore(),
      themeStore: useThemeStore(),
      ...overrides,
    }),
  };
}

/** Node 沒有 Audio；只做 music store 會用到的部分 */
class FakeAudio {
  src = "";
  volume = 1;
  currentTime = 0;
  duration = 0;
  private listeners = new Map<string, Set<() => void>>();
  addEventListener(type: string, listener: () => void) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)!.add(listener);
  }
  removeEventListener(type: string, listener: () => void) {
    this.listeners.get(type)?.delete(listener);
  }
  load() {
    const type = this.src ? "canplay" : "error";
    queueMicrotask(() => [...(this.listeners.get(type) ?? [])].forEach((listener) => listener()));
  }
  play() {
    return Promise.resolve();
  }
  pause() {}
}

const track = (id: string, name: string, artist: string): MusicTrack => ({ id, name, artist, url: "", source: "online" });

beforeEach(async () => {
  closeDatabase();
  await deleteDB("aguaphone-db");
  // 先開好資料庫：store 在背景存檔時若同時各自開連線，舊連線會擋住下一個測試的 deleteDB
  await db.init();
  setActivePinia(createPinia());
  installThemeDomStub();
  vi.stubGlobal("Audio", FakeAudio);
});

afterEach(() => {
  closeDatabase();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("行事曆", () => {
  it("新增行程寫進行事曆 App 讀的同一個 store，看行程讀得到", async () => {
    const onCalendarEventCreated = vi.fn();
    const context = makeContext({ onCalendarEventCreated });

    const created = await tool("create_calendar_event").execute(
      { title: "看牙醫", start: "2026-10-20 15:00", end: "16:00", notes: "帶健保卡" },
      context,
    );
    expect(created).toBe("已加入行事曆：看牙醫（2026-10-20，15:00–16:00，帶健保卡）");
    expect(onCalendarEventCreated).toHaveBeenCalledWith({
      type: "user",
      title: "看牙醫",
      date: "2026-10-20",
      description: "15:00–16:00，帶健保卡",
      startTime: "15:00",
      endTime: "16:00",
    });

    const stored = await db.getAll<CalendarEvent>(DB_STORES.CALENDAR_EVENTS);
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({ title: "看牙醫", startTime: "15:00", endTime: "16:00", sourceCharacterId: "char-1", sourceChatId: "chat-1" });

    await saveCalendarEvent({ type: "period", title: "經期", date: "2026-10-22" });
    await saveCalendarEvent({ type: "user", title: "早就過了", date: "2026-09-01" });
    await saveCalendarEvent({ type: "user", title: "出差", date: "2026-10-17", endDate: "2026-10-21" });

    const listed = await tool("list_calendar_events").execute({ from: "2026-10-19", to: "2026-10-31" }, context);
    // 時間另外寫在日期後面，說明裡重複的時間拿掉
    expect(listed).toContain("2026-10-20 15:00–16:00：看牙醫（帶健保卡）");
    expect(listed).toContain("2026-10-22（經期紀錄）：經期");
    // 還沒結束的跨天行程也列出來
    expect(listed).toContain("2026-10-17 到 2026-10-21：出差");
    expect(listed).not.toContain("早就過了");
  });

  it("日期看不懂時不寫入，直接報錯", async () => {
    const context = makeContext();
    await expect(tool("create_calendar_event").execute({ title: "看牙醫", start: "下週一" }, context)).rejects.toThrow("start 要有日期");
    expect(await db.getAll(DB_STORES.CALENDAR_EVENTS)).toHaveLength(0);
  });
});

describe("查記憶", () => {
  async function seedMemories() {
    await db.put(DB_STORES.SUMMARIES, { id: "sum-1", chatId: "chat-1", characterId: "char-1", content: "我們一起去九份看夜景，還吃了芋圓。", createdAt: new Date(2026, 8, 1).getTime() });
    // 已經合併進元總結的不算
    await db.put(DB_STORES.SUMMARIES, { id: "sum-old", chatId: "chat-1", characterId: "char-1", content: "九份的舊總結", mergedInto: "meta-1", createdAt: 1 });
    // 別的聊天不算
    await db.put(DB_STORES.SUMMARIES, { id: "sum-other", chatId: "chat-2", characterId: "char-1", content: "在九份看夜景", createdAt: 2 });
    await db.put(DB_STORES.IMPORTANT_EVENTS, {
      id: "chat-1",
      chatId: "chat-1",
      characterId: "char-1",
      events: [{ id: "evt-1", content: "使用者說下個月要搬去台中", timestamp: new Date(2026, 9, 1).getTime() }],
      settings: {},
    });
  }

  it("向量記憶沒開也找得到總結和重要事件", async () => {
    await seedMemories();
    const context = makeContext();

    const sights = await tool("search_memory").execute({ query: "九份夜景" }, context);
    expect(sights).toBe("- [總結 2026-09-01] 我們一起去九份看夜景，還吃了芋圓。");

    const moving = await tool("search_memory").execute({ query: "搬去台中" }, context);
    expect(moving).toBe("- [重要事件 2026-10-01] 使用者說下個月要搬去台中");

    expect(await tool("search_memory").execute({ query: "演唱會" }, context)).toBe("沒有找到相關的記憶");
  });

  it("向量記憶開著但這個聊天還沒有向量時，改用文字比對", async () => {
    await seedMemories();
    const context = makeContext({ vectorMemoryEnabled: true });
    expect(await tool("search_memory").execute({ query: "九份" }, context)).toContain("九份看夜景");
  });
});

describe("音樂", () => {
  it("搜尋後用編號播放，真的交給音樂 App 播", async () => {
    vi.mocked(searchMusic).mockResolvedValue([track("t1", "晴天", "周杰倫"), track("t2", "稻香", "周杰倫")]);
    vi.mocked(getMusicUrl).mockResolvedValue("https://music.invalid/t2.mp3");
    const context = makeContext();

    const found = await tool("search_music").execute({ query: "周杰倫" }, context);
    expect(found).toContain("0. 晴天 – 周杰倫");
    expect(found).toContain("1. 稻香 – 周杰倫　trackId: t2");

    expect(await tool("play_music").execute({ index: 1 }, context)).toBe("正在播放：稻香 – 周杰倫");
    const music = useMusicStore();
    expect(music.isPlaying).toBe(true);
    expect(music.currentTrack?.id).toBe("t2");
  });

  it("下一輪也能用 trackId 播上一輪搜到的歌", async () => {
    vi.mocked(searchMusic).mockResolvedValue([track("t1", "晴天", "周杰倫")]);
    vi.mocked(getMusicUrl).mockResolvedValue("https://music.invalid/t1.mp3");
    await tool("search_music").execute({ query: "晴天" }, makeContext());

    // 每輪生成都會重新建服務
    expect(await tool("play_music").execute({ trackId: "t1" }, makeContext())).toBe("正在播放：晴天 – 周杰倫");
  });

  it("沒播成時回報失敗，不假裝在播", async () => {
    vi.mocked(searchMusic).mockResolvedValue([track("t1", "晴天", "周杰倫")]);
    vi.mocked(getMusicUrl).mockResolvedValue("");
    const context = makeContext();
    await tool("search_music").execute({ query: "晴天" }, context);

    await expect(tool("play_music").execute({ index: 0 }, context)).rejects.toThrow("沒有播成");
    expect(useMusicStore().isPlaying).toBe(false);
    await expect(tool("play_music").execute({ trackId: "nope" }, context)).rejects.toThrow("找不到這首歌");
  });
});

describe("換桌布", () => {
  it("預設樣式和純色都會真的套用到主題", async () => {
    const context = makeContext();
    const theme = useThemeStore();

    expect(await tool("set_wallpaper").execute({ preset: "gradient2" }, context)).toBe("桌布已換成「薰衣草」");
    expect(theme.wallpaperStyle).toMatchObject({ type: "gradient", value: "linear-gradient(135deg, #E6E6FA 0%, #FFF0F5 100%)" });

    expect(await tool("set_wallpaper").execute({ color: "#112233" }, context)).toBe("桌布已換成純色 #112233");
    expect(theme.wallpaperStyle).toMatchObject({ type: "color", value: "#112233" });

    await tool("set_wallpaper").execute({ preset: "time-theme" }, context);
    expect(theme.wallpaperStyle.type).toBe("time-theme");

    await expect(tool("set_wallpaper").execute({ color: "red" }, context)).rejects.toThrow("#RRGGBB");

    // 主題會存起來，重開 App 還在
    await vi.waitFor(async () => {
      const saved = await db.get<{ wallpaperStyle: { type: string } }>("settings", "user-theme");
      expect(saved?.wallpaperStyle.type).toBe("time-theme");
    });
  });
});

describe("查天氣", () => {
  it("用真的天氣服務查，回傳現在天氣和預報", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("geocoding-api")) {
        return new Response(JSON.stringify({ results: [{ latitude: 25.05, longitude: 121.53, name: "臺北市", admin1: "臺灣", country: "臺灣" }] }));
      }
      if (url.includes("api.open-meteo.com")) {
        return new Response(JSON.stringify({
          timezone: "Asia/Taipei",
          utc_offset_seconds: 28800,
          current: { time: "2026-10-17T14:00", temperature_2m: 22.4, relative_humidity_2m: 80, apparent_temperature: 23.6, weather_code: 3, wind_speed_10m: 9.7, wind_direction_10m: 45, surface_pressure: 1012, uv_index: 3 },
          daily: { time: ["2026-10-17", "2026-10-18"], temperature_2m_max: [25, 24.4], temperature_2m_min: [20, 18.6], weather_code: [3, 61] },
        }));
      }
      throw new Error(`沒預期的請求：${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const text = await tool("get_weather").execute({}, makeContext());
    expect(fetchMock.mock.calls[0][0]).toContain("name=Taipei");
    expect(text).toContain("臺北市，臺灣（當地時間 2026-10-17 14:00）");
    expect(text).toContain("22°C，體感 24°C，濕度 80%");
    expect(text).toContain("- 2026-10-18：");
    expect(text).toContain("19～24°C");
  });
});

describe("查我的位置", () => {
  const ERROR_CODES = { PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 };

  it("用手機定位查到大概的區和附近地點，不給精確座標", async () => {
    const getCurrentPosition = vi.fn((ok: (position: unknown) => void, _fail?: unknown, _options?: PositionOptions) =>
      ok({ coords: { latitude: 25.033964, longitude: 121.564468, accuracy: 35.4 } }),
    );
    vi.stubGlobal("navigator", { geolocation: { getCurrentPosition } });
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.includes("nominatim.openstreetmap.org/reverse")) {
        return new Response(JSON.stringify({ address: { suburb: "信義區", city: "臺北市", country: "臺灣", road: "信義路五段" } }));
      }
      if (url.startsWith("/image-proxy")) {
        return new Response(JSON.stringify({ elements: [{ type: "node", id: 1, lat: 25.0336, lon: 121.5646, tags: { name: "台北101", tourism: "attraction" } }] }));
      }
      throw new Error(`沒預期的請求：${url}`);
    }));

    const text = await tool("get_location").execute({}, makeContext());
    expect(text).toContain("使用者現在大約在：信義區，臺北市，臺灣（誤差約 35 公尺）");
    expect(text).toContain("附近：台北101（景點，約");
    // 不給路名和座標
    expect(text).not.toContain("信義路");
    expect(text).not.toContain("25.03");
    // 只要大概位置，不用 GPS
    expect(getCurrentPosition.mock.calls[0][2]).toMatchObject({ enableHighAccuracy: false });
  });

  it("使用者沒允許定位時回報原因", async () => {
    vi.stubGlobal("navigator", {
      geolocation: { getCurrentPosition: (_ok: unknown, fail: (error: unknown) => void) => fail({ code: 1, ...ERROR_CODES }) },
    });
    await expect(tool("get_location").execute({}, makeContext())).rejects.toThrow("拒絕");
  });
});

describe("預約來電", () => {
  it("排進真的來電排程；正在通話時不排", async () => {
    const args = { delay: "30m", reason: "想聽你的聲音" };
    expect(await tool("schedule_call").execute(args, makeContext())).toContain("已預約來電");
    expect(await db.getAll(DB_STORES.PENDING_CALLS)).toHaveLength(1);

    await expect(tool("schedule_call").execute(args, makeContext({ isInCallWithCharacter: () => true }))).rejects.toThrow("通話中");
    expect(await db.getAll(DB_STORES.PENDING_CALLS)).toHaveLength(1);
  });
});
