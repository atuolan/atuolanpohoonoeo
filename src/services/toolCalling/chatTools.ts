import { TOOL_WALLPAPER_PRESETS } from "@/data/wallpaperPresets";
import { getIncomingCallScheduler } from "@/services/IncomingCallScheduler";
import { getWeatherByCity } from "@/services/WeatherService";
import {
  describeDanbooruTags,
  describeRelatedArtists,
  findRelatedArtists,
  searchDanbooruTags,
} from "@/services/danbooruTags";
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
import { toolService, type ChatImageSender, type ChatToolServices } from "./toolServices";
import type { ChatToolContext, ChatToolDefinition } from "./types";
import { ToolRegistry } from "./toolRegistry";
import {
  CHOOSE_IMAGE_TOOL_NAME,
  DANBOORU_ARTISTS_TOOL_NAME,
  DANBOORU_TAGS_TOOL_NAME,
  GENERATE_IMAGE_TOOL_NAME,
  VIEW_CHAT_IMAGE_TOOL_NAME,
} from "./imageToolNames";

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

export {
  CHOOSE_IMAGE_TOOL_NAME,
  DANBOORU_ARTISTS_TOOL_NAME,
  DANBOORU_TAGS_TOOL_NAME,
  GENERATE_IMAGE_TOOL_NAME,
  VIEW_CHAT_IMAGE_TOOL_NAME,
};

/** 要文生圖設定好才能用的工具 */
export const IMAGE_GEN_TOOL_NAMES = [GENERATE_IMAGE_TOOL_NAME, CHOOSE_IMAGE_TOOL_NAME];
/** 只對 NovelAI 有用的工具 */
export const NOVELAI_ONLY_TOOL_NAMES = [DANBOORU_TAGS_TOOL_NAME, DANBOORU_ARTISTS_TOOL_NAME];

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
  {
    name: GENERATE_IMAGE_TOOL_NAME,
    displayName: "試畫",
    description:
      "照提示詞試畫一張。試畫會列在聊天裡的「調畫風」工作紀錄卡片上（使用者看得到每一張和你寫的 note），但不會直接貼進聊天；你也會拿到這張圖可以看。" +
      "看完不滿意就改 prompt / negative 再試畫，滿意了用 choose_image 選一張貼進聊天。每張都有編號（#1、#2…），同一串調整會接著上一輪往下數。" +
      "用這個工具畫的圖不要再寫 <pic>。prompt 寫法跟 <pic> 一樣；角色和使用者的外觀標籤會自動加上。",
    category: "image",
    risk: "low",
    // 實際的生圖逾時由服務自己控制（MJ 可能要好幾分鐘）
    timeoutMs: 600_000,
    parameters: object(
      {
        prompt: string("完整的正面提示詞（英文）"),
        negative: string("負面提示詞（英文，逗號分隔），可省略"),
        note: string("給使用者看的一句中文：這張想試什麼、跟上一張比改了什麼、為什麼（第一張就寫打算怎麼畫）"),
      },
      ["prompt", "note"],
    ),
    async execute(args, context) {
      const image = requireService(context, "image", "畫圖");
      const prompt = textArg(args.prompt);
      if (!prompt) throw new Error("要給 prompt");
      const negativePrompt = textArg(args.negative) || undefined;
      const result = await image.draw(
        { prompt, negativePrompt, note: textArg(args.note) || undefined, toolCallId: context.toolCallId },
        context.signal,
      );
      const lines = [
        `試畫 #${result.attempt} 畫好了（${result.providerLabel}），已經列在工作紀錄卡片上，圖附在後面。`,
        `正面提示詞：${prompt}`,
        `負面提示詞：${negativePrompt || "（沒有）"}`,
      ];
      if (result.autoTags) lines.push(`自動加上的外觀標籤：${result.autoTags}`);
      lines.push(
        result.remaining > 0
          ? `看圖檢查：不滿意就改提示詞再試畫（這次回覆還能畫 ${result.remaining} 張）；滿意了用 choose_image 選定再回覆使用者。`
          : "這次回覆的試畫次數用完了：用 choose_image 選最好的一張，回覆時說明目前的結果和下次可以怎麼改。",
      );
      return { summary: lines.join("\n"), images: [result.image] };
    },
  },
  {
    name: CHOOSE_IMAGE_TOOL_NAME,
    displayName: "選定試畫",
    description:
      "從試畫裡選一張貼進聊天（使用者會在聊天裡看到這張圖）。一次回覆只會貼一張，再呼叫一次就是換成另一張。沒選的話，回覆結束時會自動貼最後一張。",
    category: "image",
    risk: "low",
    timeoutMs: 30_000,
    parameters: object(
      {
        attempt: { type: "integer", description: "試畫編號（#幾）" },
        caption: string("顯示在圖片下面的一句中文說明，可省略"),
      },
      ["attempt"],
    ),
    async execute(args, context) {
      const image = requireService(context, "image", "選圖");
      const attempt = typeof args.attempt === "number" ? Math.floor(args.attempt) : NaN;
      if (!Number.isFinite(attempt) || attempt < 1) throw new Error("要給試畫編號 attempt");
      const result = await image.choose({ attempt, caption: textArg(args.caption) || undefined });
      return result.replaced
        ? `已經把聊天裡的圖換成試畫 #${result.attempt}。`
        : `已經把試畫 #${result.attempt} 貼進聊天。接著直接回覆使用者，不要再寫 <pic>。`;
    },
  },
  {
    name: VIEW_CHAT_IMAGE_TOOL_NAME,
    displayName: "看聊天裡的圖",
    description:
      "看聊天裡的圖（使用者傳的、你畫的都可以），連同畫那張圖用的提示詞一起給你。nth 從最新往回數（1 是最新一張）；sender 可以只看使用者傳的（user）或你畫的（character）；style_ref 為 true 時看這個聊天設定的畫風參考圖；draft 給試畫編號時看那張試畫（這一輪或上一輪的工作紀錄）。要比對、討論之前的圖，或照參考圖調整前，先用這個看清楚。",
    category: "image",
    risk: "low",
    timeoutMs: 30_000,
    parameters: object({
      nth: { type: "integer", description: "從最新往回數第幾張，1 是最新，預設 1" },
      sender: { type: "string", description: "誰的圖：any 全部（預設）、user 使用者傳的、character 你畫的", enum: ["any", "user", "character"] },
      style_ref: { type: "boolean", description: "看畫風參考圖（忽略 nth、sender）" },
      draft: { type: "integer", description: "看第幾號試畫（忽略 nth、sender）" },
    }),
    async execute(args, context) {
      const image = requireService(context, "image", "看圖");
      const nth = typeof args.nth === "number" && args.nth >= 1 ? Math.floor(args.nth) : 1;
      const sender = (["any", "user", "character"].includes(String(args.sender)) ? args.sender : "any") as ChatImageSender;
      const draft = typeof args.draft === "number" && args.draft >= 1 ? Math.floor(args.draft) : undefined;
      const styleRef = args.style_ref === true;
      const entry = await image.view({ nth, sender, styleRef, draft });
      if (!entry) {
        if (draft) return `找不到試畫 #${draft}（只找得到這一輪和上一輪的試畫）。`;
        return styleRef ? "這個聊天沒有設定畫風參考圖。" : `找不到第 ${nth} 張圖（聊天裡目前載入的圖沒有那麼多）。`;
      }
      const lines = [
        entry.draft
          ? `這是試畫 #${entry.draft}，圖附在後面。`
          : entry.isStyleRef
            ? "這是畫風參考圖，圖附在後面。"
            : `從最新往回數第 ${entry.nth} 張（共 ${entry.total} 張），${entry.sender === "user" ? "使用者傳的" : "你畫的"}，圖附在後面。`,
      ];
      if (entry.caption) lines.push(`說明：${entry.caption}`);
      if (entry.prompt) lines.push(`正面提示詞：${entry.prompt}`);
      if (entry.negativePrompt) lines.push(`負面提示詞：${entry.negativePrompt}`);
      if (entry.note) lines.push(entry.draft ? `你當時的說明：${entry.note}` : `之前的圖片備註：${entry.note}`);
      return { summary: lines.join("\n"), images: [entry.image] };
    },
  },
  {
    name: DANBOORU_TAGS_TOOL_NAME,
    displayName: "查 Danbooru 標籤",
    description:
      "查 Danbooru 標籤的正式寫法和熱門程度。要傳圖（<pic>）、不確定 NovelAI 提示詞的標籤怎麼寫時，先用英文關鍵字查，例如 twin tails、sitting window、school uniform。張數越多，NovelAI 越認得。一次最多查 5 個關鍵字。",
    category: "image",
    risk: "low",
    timeoutMs: 25_000,
    parameters: object(
      {
        queries: {
          type: "array",
          description: "英文關鍵字，1～5 個",
          items: { type: "string", description: "英文關鍵字，例如 long hair" },
        },
        limit: { type: "integer", description: "每個關鍵字最多幾個標籤", enum: [5, 8, 15] },
      },
      ["queries"],
    ),
    async execute(args, context) {
      const queries = (Array.isArray(args.queries) ? args.queries : [args.queries])
        .map((q) => textArg(q))
        .filter(Boolean)
        .slice(0, 5);
      if (!queries.length) throw new Error("要給至少一個英文關鍵字");
      const limit = typeof args.limit === "number" ? args.limit : 8;
      const results: string[] = [];
      for (const query of queries) {
        const tags = await searchDanbooruTags(query, limit, { signal: context.signal });
        results.push(describeDanbooruTags(query, tags));
      }
      results.push("（名稱已把底線換成空格，直接照抄進 prompt）");
      return cap(results.join("\n\n"));
    },
  },
  {
    name: DANBOORU_ARTISTS_TOOL_NAME,
    displayName: "找相似繪師",
    description:
      "找常畫某類內容的 Danbooru 繪師，用來湊 NovelAI 的繪師串，讓畫風接近使用者要的樣子（例如使用者給了參考圖）。queries 每組寫 1～2 個最能代表那種圖的標籤，例如 \"hanfu, male focus\"、\"monochrome, sketch\"；最多 3 組，多組都出現的繪師比較相關。找到的是內容相近，畫風要自己判斷。",
    category: "image",
    risk: "low",
    timeoutMs: 30_000,
    parameters: object(
      {
        queries: {
          type: "array",
          description: "1～3 組，每組 1～2 個英文標籤，用逗號分開",
          items: { type: "string", description: "例如 hanfu, male focus" },
        },
        limit: { type: "integer", description: "最多列幾位繪師", enum: [5, 10, 15] },
      },
      ["queries"],
    ),
    async execute(args, context) {
      const queries = (Array.isArray(args.queries) ? args.queries : [args.queries])
        .map((q) => textArg(q))
        .filter(Boolean)
        .slice(0, 3);
      if (!queries.length) throw new Error("要給至少一組標籤");
      const limit = typeof args.limit === "number" ? args.limit : 10;
      const artists = await findRelatedArtists(queries, limit, { signal: context.signal });
      return cap(describeRelatedArtists(queries, artists));
    },
  },
];

export function createChatToolRegistry(_context: ChatToolContext): ToolRegistry {
  return new ToolRegistry(CHAT_TOOLS);
}
