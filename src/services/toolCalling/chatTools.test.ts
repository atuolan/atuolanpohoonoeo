import { describe, expect, it, vi } from "vitest";
import { CHAT_TOOLS, createChatToolRegistry } from "./chatTools";
import { validateJsonSchema } from "./jsonSchema";
import type { WeatherData } from "@/services/WeatherService";

const WEATHER_FIXTURE: WeatherData = {
  location: { name: "臺北市", region: "臺灣", country: "臺灣", lat: 25.05, lon: 121.53, localtime: "2026-10-17 14:00" },
  current: {
    temp_c: 22.4,
    temp_f: 72.3,
    feelslike_c: 23.6,
    condition: { text: "多雲", icon: "", code: 2 },
    humidity: 80,
    wind_kph: 9.7,
    wind_dir: "NE",
    pressure_mb: 1012,
    uv: 3,
  },
  forecast: {
    forecastday: [
      { date: "2026-10-17", day: { maxtemp_c: 25, mintemp_c: 20, condition: { text: "多雲", icon: "" } } },
      { date: "2026-10-18", day: { maxtemp_c: 24.4, mintemp_c: 18.6, condition: { text: "小雨", icon: "" } } },
    ],
  },
};

describe("chat tools", () => {
  it("registers the one-to-one phone tools with risk labels", () => {
    const registry = createChatToolRegistry({});
    expect(registry.list().map((tool) => tool.name)).toEqual(expect.arrayContaining([
      "get_current_time", "get_weather", "list_calendar_events", "search_music",
      "play_music", "set_wallpaper", "search_memory", "create_calendar_event", "schedule_call",
    ]));
    expect(CHAT_TOOLS.find((tool) => tool.name === "create_calendar_event")?.risk).toBe("high");
    expect(CHAT_TOOLS.find((tool) => tool.name === "schedule_call")?.risk).toBe("high");
    // 會蓋掉使用者上傳的圖片桌布
    expect(CHAT_TOOLS.find((tool) => tool.name === "set_wallpaper")?.risk).toBe("high");
    // 會把使用者的位置交給 AI
    expect(CHAT_TOOLS.find((tool) => tool.name === "get_location")?.risk).toBe("high");
  });

  it("rejects unsafe URL and unknown wallpaper arguments", () => {
    const tool = CHAT_TOOLS.find((entry) => entry.name === "set_wallpaper")!;
    expect(validateJsonSchema(tool.parameters, { url: "https://example.invalid/a.jpg" }).ok).toBe(false);
    expect(validateJsonSchema(tool.parameters, { preset: "https://example.invalid" }).ok).toBe(false);
    expect(validateJsonSchema(tool.parameters, { color: "red" }).ok).toBe(true);
  });

  it("查天氣：有指定城市就查那裡，沒有才查角色所在地，結果是精簡文字", async () => {
    const getWeatherByCity = vi.fn().mockResolvedValue(WEATHER_FIXTURE);
    const tool = CHAT_TOOLS.find((entry) => entry.name === "get_weather")!;
    const text = await tool.execute({}, { locationCity: "Taipei", weather: { getWeatherByCity } });
    expect(getWeatherByCity).toHaveBeenLastCalledWith("Taipei");
    expect(text).toContain("多雲，22°C");
    expect(text).toContain("2026-10-18：小雨，19～24°C");

    await tool.execute({ city: "Tokyo" }, { locationCity: "Taipei", weather: { getWeatherByCity } });
    expect(getWeatherByCity).toHaveBeenLastCalledWith("Tokyo");

    await expect(tool.execute({}, { weather: { getWeatherByCity } })).rejects.toThrow("沒有指定城市");
    expect(validateJsonSchema(tool.parameters, { url: "https://weather.invalid" }).ok).toBe(false);
  });

  it("bounds music search and rejects missing query", () => {
    const tool = CHAT_TOOLS.find((entry) => entry.name === "search_music")!;
    expect(validateJsonSchema(tool.parameters, {}).ok).toBe(false);
    expect(validateJsonSchema(tool.parameters, { query: "x", limit: 100 }).ok).toBe(false);
  });

  it("預約來電沒排成時丟錯，排成時回傳簡短摘要", async () => {
    const tool = CHAT_TOOLS.find((entry) => entry.name === "schedule_call")!;
    const args = { delay: "30m", reason: "想聽你的聲音" };
    const failing = { schedulePendingCall: vi.fn().mockResolvedValue(null) };
    await expect(tool.execute(args, { incomingCallScheduler: failing })).rejects.toThrow("沒有排成");

    const triggerTime = Date.now() + 30 * 60 * 1000;
    const working = { schedulePendingCall: vi.fn().mockResolvedValue({ id: "c1", triggerTime, characterAvatar: "data:image/png;base64,AAAA" }) };
    const text = await tool.execute(args, { incomingCallScheduler: working, characterId: "char1", chatId: "chat1" });
    expect(text).toContain("已預約來電");
    expect(String(text)).not.toContain("base64");
  });

  it("新增行程沒有行事曆服務時丟錯，不假裝成功", async () => {
    const tool = CHAT_TOOLS.find((entry) => entry.name === "create_calendar_event")!;
    await expect(tool.execute({ title: "看醫生", start: "2026-10-20 15:00" }, {})).rejects.toThrow("行事曆服務");
  });

  it("gives every built-in tool a Chinese display name", () => {
    expect(CHAT_TOOLS.map((tool) => [tool.name, tool.displayName])).toEqual([
      ["get_current_time", "查時間"],
      ["get_weather", "查天氣"],
      ["get_location", "查我的位置"],
      ["list_calendar_events", "看行程"],
      ["search_music", "搜尋音樂"],
      ["play_music", "播放音樂"],
      ["set_wallpaper", "換桌布"],
      ["search_memory", "查記憶"],
      ["create_calendar_event", "新增行程"],
      ["schedule_call", "預約來電"],
      ["generate_image", "畫圖"],
      ["view_chat_image", "看聊天裡的圖"],
      ["search_danbooru_tags", "查 Danbooru 標籤"],
      ["find_danbooru_artists", "找相似繪師"],
    ]);
  });

  it("generate_image draws through the image service and hands the picture back to the model", async () => {
    const tool = CHAT_TOOLS.find((entry) => entry.name === "generate_image")!;
    const draw = vi.fn().mockResolvedValue({
      image: { mimeType: "image/jpeg", data: "SMALL" },
      messageId: "m1",
      providerLabel: "NovelAI",
      autoTags: "1boy, black hair",
      remaining: 3,
    });
    const result = (await tool.execute(
      { prompt: "1boy, hanfu", negative: "lowres", caption: "白衣" },
      { image: { draw, view: vi.fn() } },
    )) as { summary: string; images: unknown[] };
    expect(draw).toHaveBeenCalledWith({ prompt: "1boy, hanfu", negativePrompt: "lowres", caption: "白衣" }, undefined);
    expect(result.images).toEqual([{ mimeType: "image/jpeg", data: "SMALL" }]);
    expect(result.summary).toContain("已經傳到聊天裡");
    expect(result.summary).toContain("負面提示詞：lowres");
    expect(result.summary).toContain("自動加上的外觀標籤：1boy, black hair");
    expect(result.summary).toContain("還能畫 3 張");
  });

  it("generate_image tells the model to stop when no draws are left", async () => {
    const tool = CHAT_TOOLS.find((entry) => entry.name === "generate_image")!;
    const draw = vi.fn().mockResolvedValue({ image: { mimeType: "image/png", data: "X" }, messageId: "m", providerLabel: "GPT Image", remaining: 0 });
    const result = (await tool.execute({ prompt: "a cat" }, { image: { draw, view: vi.fn() } })) as { summary: string };
    expect(result.summary).toContain("畫圖次數用完了");
    expect(result.summary).toContain("負面提示詞：（沒有）");
  });

  it("view_chat_image returns the picture with the prompts that made it", async () => {
    const tool = CHAT_TOOLS.find((entry) => entry.name === "view_chat_image")!;
    const view = vi.fn().mockResolvedValue({
      image: { mimeType: "image/jpeg", data: "IMG" },
      messageId: "m2",
      sender: "character",
      nth: 2,
      total: 5,
      caption: "白衣",
      prompt: "1boy, artist:foo",
      negativePrompt: "lowres",
    });
    const result = (await tool.execute({ nth: 2, sender: "character" }, { image: { draw: vi.fn(), view } })) as {
      summary: string;
      images: unknown[];
    };
    expect(view).toHaveBeenCalledWith({ nth: 2, sender: "character", styleRef: false });
    expect(result.images).toEqual([{ mimeType: "image/jpeg", data: "IMG" }]);
    expect(result.summary).toContain("第 2 張（共 5 張），你畫的");
    expect(result.summary).toContain("正面提示詞：1boy, artist:foo");
  });

  it("view_chat_image says so when there is no such picture", async () => {
    const tool = CHAT_TOOLS.find((entry) => entry.name === "view_chat_image")!;
    const view = vi.fn().mockResolvedValue(null);
    expect(await tool.execute({ nth: 9 }, { image: { draw: vi.fn(), view } })).toContain("找不到第 9 張圖");
    expect(await tool.execute({ style_ref: true }, { image: { draw: vi.fn(), view } })).toContain("沒有設定畫風參考圖");
  });
});
