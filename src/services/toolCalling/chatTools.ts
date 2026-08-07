import { getWeatherByCity } from "@/services/WeatherService";
import { getIncomingCallScheduler } from "@/services/IncomingCallScheduler";
import { searchMusic as searchMusicApi } from "@/api/MusicApi";
import type { ChatToolContext, ChatToolDefinition } from "./types";
import { ToolRegistry } from "./toolRegistry";

const MAX_RESULT = 8000;
const cap = (value: unknown): string => {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return (text ?? "").slice(0, MAX_RESULT);
};

const object = (properties: Record<string, any>, required: string[] = []) => ({
  type: "object" as const,
  properties,
  required,
  additionalProperties: false,
});
const string = (description: string, _maxLength = 200) => ({
  type: "string" as const,
  description,
});

function service<T>(context: ChatToolContext, key: string): T | undefined {
  return context[key] as T | undefined;
}

export const CHAT_TOOLS: ChatToolDefinition[] = [
  {
    name: "get_current_time",
    description: "取得目前時間；可使用聊天上下文指定的時區。",
    category: "time",
    risk: "low",
    parameters: object({}),
    async execute(_args, context) {
      const timezone = typeof context.timezone === "string" ? context.timezone : undefined;
      const now = new Date();
      return timezone
        ? { iso: now.toISOString(), local: now.toLocaleString("zh-TW", { timeZone: timezone }), timezone }
        : { iso: now.toISOString(), local: now.toLocaleString() };
    },
  },
  {
    name: "get_weather",
    description: "取得聊天角色所在城市的目前天氣。不得提供 URL。",
    category: "weather",
    risk: "low",
    parameters: object({ city: { type: "string", description: "城市名稱（可省略，優先使用聊天上下文）" } }),
    async execute(args, context) {
      const city = (typeof context.locationCity === "string" && context.locationCity.trim()) ||
        (typeof args.city === "string" && args.city.trim());
      if (!city) return { error: "未設定城市" };
      const weather = service<{ getWeatherByCity(city: string): Promise<unknown> }>(context, "weatherService");
      const result = weather ? await weather.getWeatherByCity(city) : await getWeatherByCity(city);
      return cap(result);
    },
  },
  {
    name: "list_calendar_events",
    description: "列出聊天角色的行程摘要。",
    category: "calendar",
    risk: "low",
    parameters: object({ from: string("開始日期或時間", 64), to: string("結束日期或時間", 64), limit: { type: "integer", description: "最多筆數", enum: [1, 5, 10, 20] } }),
    async execute(args, context) {
      const calendar = service<{ listEvents?: (args: Record<string, unknown>, context: ChatToolContext) => unknown }>(context, "calendar");
      if (!calendar?.listEvents) return [];
      return cap(await calendar.listEvents(args, context));
    },
  },
  {
    name: "search_music",
    description: "搜尋音樂並回傳有限筆數的曲目摘要。",
    category: "music",
    risk: "low",
    parameters: object({ query: { ...string("搜尋關鍵字", 200) }, limit: { type: "integer", description: "最多筆數", enum: [1, 5, 10, 20] } }, ["query"]),
    async execute(args, context) {
      const query = args.query as string;
      const limit = typeof args.limit === "number" ? args.limit : 5;
      const music = service<{ search?: (query: string) => Promise<unknown> }>(context, "music");
      const results = music?.search ? await music.search(query) : await searchMusicApi(query);
      return cap(Array.isArray(results) ? results.slice(0, limit) : results);
    },
  },
  {
    name: "play_music",
    description: "播放已搜尋到的曲目；只接受曲目識別碼或搜尋結果索引，不接受 URL。",
    category: "music",
    risk: "low",
    parameters: object({ trackId: string("已存在的曲目識別碼", 128), index: { type: "integer", description: "播放列表索引", enum: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] } }),
    async execute(args, context) {
      if ("url" in args || "src" in args) return { error: "不接受 URL" };
      const music = service<{ playTrack?: (id: string, context: ChatToolContext) => unknown; play?: (track: unknown) => unknown }>(context, "music");
      if (music?.playTrack && typeof args.trackId === "string") return await music.playTrack(args.trackId, context);
      if (music?.play) return await music.play(args);
      return { error: "音樂服務未提供播放功能" };
    },
  },
  {
    name: "set_wallpaper",
    description: "設定既有桌布預設或純色值；不接受外部圖片、URL、JavaScript 或檔案路徑。",
    category: "media",
    risk: "low",
    parameters: object({ preset: { type: "string", enum: ["default", "time-theme", "pattern"] }, color: { type: "string", description: "#RRGGBB 純色", maxLength: 7 } }),
    async execute(args, context) {
      if ("url" in args || "image" in args || "path" in args) return { error: "不接受外部 URL 或檔案" };
      const theme = service<{ setWallpaper?: (value: Record<string, unknown>) => unknown; updateWallpaperStyle?: (value: Record<string, unknown>) => unknown }>(context, "theme");
      const update = theme?.setWallpaper ?? theme?.updateWallpaperStyle;
      if (!update) return { error: "主題服務未提供桌布功能" };
      if (args.color && !/^#[0-9a-f]{6}$/i.test(String(args.color))) return { error: "color 必須是 #RRGGBB" };
      return await update(args.color ? { type: "color", value: args.color } : { type: "preset", value: args.preset });
    },
  },
  {
    name: "search_memory",
    description: "搜尋目前聊天的記憶摘要。",
    category: "memory",
    risk: "low",
    parameters: object({ query: { ...string("記憶搜尋文字", 220) }, limit: { type: "integer", description: "最多筆數", enum: [1, 3, 5, 10] } }, ["query"]),
    async execute(args, context) {
      const memory = service<{ retrieve?: (...args: unknown[]) => Promise<unknown> }>(context, "memory");
      if (!memory?.retrieve) return [];
      const limit = typeof args.limit === "number" ? args.limit : 5;
      return cap(await memory.retrieve(args.query, context.chatId, limit, context.memoryThreshold ?? 0.5));
    },
  },
  {
    name: "create_calendar_event",
    description: "建立行程，需要使用者確認。",
    category: "calendar",
    risk: "high",
    parameters: object({ title: string("行程標題", 120), start: string("開始時間", 64), end: string("結束時間", 64), notes: string("備註", 500) }, ["title", "start"]),
    async execute(args, context) {
      const calendar = service<{ createEvent?: (args: Record<string, unknown>, context: ChatToolContext) => unknown }>(context, "calendar");
      return calendar?.createEvent ? await calendar.createEvent(args, context) : { error: "行事曆服務未提供建立功能" };
    },
  },
  {
    name: "schedule_call",
    description: "排程來電，需要使用者確認。",
    category: "phone",
    risk: "high",
    parameters: object({ delay: { type: "string", description: "延遲，例如 5m、1h", enum: ["5m", "10m", "30m", "1h", "2h", "1d"] }, reason: string("來電原因", 240), opening: string("開場白", 500) }, ["delay", "reason"]),
    async execute(args, context) {
      const scheduler = service<{ schedulePendingCall?: (data: Record<string, unknown>, character: Record<string, unknown>, chatId: string) => Promise<unknown> }>(context, "incomingCallScheduler") ?? getIncomingCallScheduler();
      if (!scheduler?.schedulePendingCall) return { error: "來電排程服務未提供排程功能" };
      return scheduler.schedulePendingCall({ delay: args.delay as string, reason: args.reason as string, opening: args.opening as string | undefined }, { id: context.characterId ?? "", name: String(context.characterName ?? ""), avatar: typeof context.characterAvatar === "string" ? context.characterAvatar : undefined }, context.chatId ?? "");
    },
  },
];

export function createChatToolRegistry(_context: ChatToolContext): ToolRegistry {
  return new ToolRegistry(CHAT_TOOLS);
}

