import { TOOL_WALLPAPER_PRESETS } from "@/data/wallpaperPresets";
import { getIncomingCallScheduler } from "@/services/IncomingCallScheduler";
import { getWeatherByCity } from "@/services/WeatherService";
import {
  describeEvents,
  describeMemories,
  describeTracks,
  describeWeather,
  formatDate,
  parseDateArgOrThrow,
  textArg,
  toCalendarEventData,
} from "./toolFormat";
import { toolService, type ChatToolServices } from "./toolServices";
import type { ChatToolContext, ChatToolDefinition } from "./types";
import { ToolRegistry } from "./toolRegistry";

const MAX_RESULT = 8000;
const cap = (text: string): string => text.slice(0, MAX_RESULT);

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

/** 服務都由聊天畫面的 createAppToolServices 提供；沒給就是接線漏了，直接報錯 */
function requireService<K extends keyof ChatToolServices>(
  context: ChatToolContext,
  key: K,
  label: string,
): NonNullable<ChatToolServices[K]> {
  const service = toolService(context, key);
  if (!service) throw new Error(`${label}服務未提供`);
  return service as NonNullable<ChatToolServices[K]>;
}

export const CHAT_TOOLS: ChatToolDefinition[] = [
  {
    name: "get_current_time",
    displayName: "查時間",
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
    displayName: "查天氣",
    description: "查天氣：目前天氣和未來三天預報。可以指定城市（例如使用者所在的城市）；不填就查角色所在的城市。不得提供 URL。",
    category: "weather",
    risk: "low",
    parameters: object({ city: { type: "string", description: "城市名稱；不填就查角色所在的城市" } }),
    async execute(args, context) {
      const city = textArg(args.city) || textArg(context.locationCity) || textArg(context.userCity);
      if (!city) throw new Error("沒有指定城市，角色也沒有設定所在地");
      const weather = toolService(context, "weather") ?? { getWeatherByCity };
      return cap(describeWeather(await weather.getWeatherByCity(city)));
    },
  },
  {
    name: "get_location",
    displayName: "查我的位置",
    description: "查使用者現在大概在哪一區、附近有什麼地點，會先問使用者同不同意。不會拿到精確地址。",
    category: "location",
    // 會把使用者的位置交給 AI，每次都要先問
    risk: "high",
    parameters: object({}),
    async execute(_args, context) {
      const location = requireService(context, "location", "定位");
      const { place, accuracy, nearby } = await location.locate();
      const lines = [`使用者現在大約在：${place}（誤差約 ${accuracy} 公尺）`];
      if (nearby.length) lines.push(`附近：${nearby.join("、")}`);
      return lines.join("\n");
    },
  },
  {
    name: "list_calendar_events",
    displayName: "看行程",
    description: "看使用者的行事曆：列出一段日期內的行程和經期紀錄。不填日期就從今天開始列。",
    category: "calendar",
    risk: "low",
    parameters: object({
      from: string("開始日期，YYYY-MM-DD 或「今天」「明天」；不填就是今天", 64),
      to: string("結束日期，YYYY-MM-DD；不填就不限", 64),
      limit: { type: "integer", description: "最多筆數", enum: [1, 5, 10, 20] },
    }),
    async execute(args, context) {
      const calendar = requireService(context, "calendar", "行事曆");
      const from = parseDateArgOrThrow(args.from, "from") ?? formatDate(new Date());
      const to = parseDateArgOrThrow(args.to, "to");
      const limit = typeof args.limit === "number" ? args.limit : 10;
      return cap(describeEvents(await calendar.listEvents({ from, to, limit }), from, to));
    },
  },
  {
    name: "search_music",
    displayName: "搜尋音樂",
    description: "搜尋音樂，回傳曲名、歌手和 trackId；要播放再用 play_music。",
    category: "music",
    risk: "low",
    parameters: object({ query: { ...string("搜尋關鍵字", 200) }, limit: { type: "integer", description: "最多筆數", enum: [1, 5, 10, 20] } }, ["query"]),
    async execute(args, context) {
      const music = requireService(context, "music", "音樂");
      const limit = typeof args.limit === "number" ? args.limit : 5;
      return cap(describeTracks(await music.search(textArg(args.query), limit)));
    },
  },
  {
    name: "play_music",
    displayName: "播放音樂",
    description: "播放 search_music 搜到的歌：傳 trackId，或結果的編號 index（從 0 開始）。不接受 URL。",
    category: "music",
    risk: "low",
    parameters: object({
      trackId: string("search_music 結果裡的 trackId", 128),
      index: { type: "integer", description: "search_music 結果的編號（從 0 開始）", enum: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] },
    }),
    async execute(args, context) {
      if ("url" in args || "src" in args) throw new Error("不接受 URL");
      const music = requireService(context, "music", "音樂");
      const trackId = textArg(args.trackId) || undefined;
      const index = typeof args.index === "number" ? args.index : undefined;
      if (trackId === undefined && index === undefined) throw new Error("要指定 trackId 或 index");
      const track = await music.play({ trackId, index });
      return `正在播放：${track.name} – ${track.artist}`;
    },
  },
  {
    name: "set_wallpaper",
    displayName: "換桌布",
    description: `換使用者的手機桌布，會先問使用者同不同意（原本上傳的圖片桌布會被換掉）。選一個預設樣式 preset，或指定純色 color。預設樣式：${TOOL_WALLPAPER_PRESETS.map((p) => `${p.id}（${p.name}）`).join("、")}。不接受外部圖片、URL 或檔案。`,
    category: "media",
    // 會蓋掉使用者上傳的圖片桌布，要先問
    risk: "high",
    parameters: object({
      preset: { type: "string", description: "預設樣式", enum: TOOL_WALLPAPER_PRESETS.map((p) => p.id) },
      color: { type: "string", description: "#RRGGBB 純色", maxLength: 7 },
    }),
    async execute(args, context) {
      if ("url" in args || "image" in args || "path" in args) throw new Error("不接受外部 URL 或檔案");
      const color = textArg(args.color);
      if (color && !/^#[0-9a-f]{6}$/i.test(color)) throw new Error("color 必須是 #RRGGBB");
      const preset = textArg(args.preset);
      if (!color && !preset) throw new Error("要指定 preset 或 color");
      const wallpaper = requireService(context, "wallpaper", "桌布");
      return wallpaper.apply(color ? { color } : { preset });
    },
  },
  {
    name: "search_memory",
    displayName: "查記憶",
    description: "在這個聊天的記憶裡搜尋以前的總結和重要事件。想確認以前發生過什麼、聊過什麼時用。",
    category: "memory",
    risk: "low",
    parameters: object({ query: { ...string("要找的內容，例如人名、地點、事件", 220) }, limit: { type: "integer", description: "最多筆數", enum: [1, 3, 5, 10] } }, ["query"]),
    async execute(args, context) {
      const memory = requireService(context, "memory", "記憶");
      const limit = typeof args.limit === "number" ? args.limit : 5;
      return cap(describeMemories(await memory.search(textArg(args.query), limit)));
    },
  },
  {
    name: "create_calendar_event",
    displayName: "新增行程",
    description: "幫使用者在行事曆新增一筆行程，會先問使用者同不同意。start 要有日期（YYYY-MM-DD，或「今天」「明天」），可以加時間，例如 2026-10-20 15:00。",
    category: "calendar",
    risk: "high",
    parameters: object(
      {
        title: string("行程標題", 120),
        start: string("日期或日期時間，例如 2026-10-20 15:00", 64),
        end: string("結束時間，例如 16:00（可不填）", 64),
        notes: string("備註（可不填）", 500),
      },
      ["title", "start"],
    ),
    async execute(args, context) {
      // 沒做成要丟錯，結果才會標成失敗；回覆裡的 <calendar-event> 標籤才會接手（見 tagOverlap）
      const calendar = requireService(context, "calendar", "行事曆");
      const data = toCalendarEventData(args);
      const created = await calendar.createEvent(data);
      const what = `${data.title}（${data.date}${data.description ? `，${data.description}` : ""}）`;
      return created ? `已加入行事曆：${what}` : `行事曆裡本來就有：${what}，沒有重複新增`;
    },
  },
  {
    name: "schedule_call",
    displayName: "預約來電",
    description: "預約角色晚點打電話給使用者，會先問使用者同不同意。",
    category: "phone",
    risk: "high",
    parameters: object({ delay: { type: "string", description: "延遲，例如 5m、1h", enum: ["5m", "10m", "30m", "1h", "2h", "1d"] }, reason: string("來電原因", 240), opening: string("開場白", 500) }, ["delay", "reason"]),
    async execute(args, context) {
      // 沒做成要丟錯，結果才會標成失敗；回覆裡的 <schedule-call> 標籤才會接手（見 tagOverlap）
      const scheduler = toolService(context, "incomingCallScheduler") ?? getIncomingCallScheduler();
      const pending = await scheduler.schedulePendingCall(
        { delay: textArg(args.delay), reason: textArg(args.reason), opening: textArg(args.opening) || undefined },
        { id: context.characterId ?? "", name: textArg(context.characterName), avatar: textArg(context.characterAvatar) || undefined },
        context.chatId ?? "",
      );
      if (!pending) throw new Error("沒有排成：這個角色的待接來電可能已達上限");
      return `已預約來電，${new Date(pending.triggerTime).toLocaleString("zh-TW")} 會打來`;
    },
  },
];

export function createChatToolRegistry(_context: ChatToolContext): ToolRegistry {
  return new ToolRegistry(CHAT_TOOLS);
}
