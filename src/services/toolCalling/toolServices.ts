/**
 * 內建角色工具要用的服務介面。
 * 聊天畫面用 createAppToolServices（appToolServices.ts）建好放進 toolContext，
 * chatTools 用 toolService() 取出；兩邊都靠這裡的型別對齊，方法名稱對不上就編譯不過。
 */
import type { WeatherData } from "@/services/WeatherService";
import type { CalendarEventData } from "@/types/calendar";
import type { ScheduleCallData } from "@/types/incomingCall";
import type { ChatToolContext, ToolImage } from "./types";

/** 「看行程」列出的一筆 */
export interface CalendarToolEvent {
  /** YYYY-MM-DD */
  date: string;
  title: string;
  description?: string;
  type: "user" | "period" | "holiday";
  /** HH:MM；整天的行程沒有 */
  startTime?: string;
  endTime?: string;
  /** 跨天行程的結束日期 YYYY-MM-DD */
  endDate?: string;
}

export interface CalendarToolService {
  /** 列出日期範圍內（含頭尾）的事件，依日期排序 */
  listEvents(range: { from: string; to?: string; limit: number }): Promise<CalendarToolEvent[]>;
  /** 寫進行事曆；沒寫成要丟錯。回傳 false 表示行事曆裡本來就有，沒有重複新增 */
  createEvent(data: CalendarEventData): Promise<boolean>;
}

export interface MemoryToolEntry {
  kind: "summary" | "diary" | "event";
  /** YYYY-MM-DD */
  date?: string;
  content: string;
}

export interface MemoryToolService {
  search(query: string, limit: number): Promise<MemoryToolEntry[]>;
}

export interface MusicToolTrack {
  id: string;
  name: string;
  artist: string;
  album?: string;
}

export interface MusicToolService {
  search(query: string, limit: number): Promise<MusicToolTrack[]>;
  /** 播放搜尋結果裡的曲目；沒播成要丟錯 */
  play(target: { trackId?: string; index?: number }): Promise<MusicToolTrack>;
}

export interface WallpaperToolService {
  /** 換桌布，回傳換成了什麼；做不到要丟錯 */
  apply(choice: { preset?: string; color?: string }): string;
}

export interface WeatherToolService {
  getWeatherByCity(city: string): Promise<WeatherData>;
}

export interface LocationToolResult {
  /** 大概的地名（區、市、國家），不含路名門牌 */
  place: string;
  /** 誤差（公尺） */
  accuracy: number;
  /** 附近地點，例如「大安森林公園（公園，約 120 公尺）」 */
  nearby: string[];
}

export interface LocationToolService {
  /** 取得使用者現在的大略位置；拿不到要丟錯 */
  locate(): Promise<LocationToolResult>;
}

export interface CallSchedulerToolService {
  /** 排不成回傳 null */
  schedulePendingCall(
    data: ScheduleCallData,
    character: { id: string; name: string; avatar?: string },
    chatId: string,
  ): Promise<{ triggerTime: number } | null>;
}

/** 「畫圖」畫好的一張 */
export interface DrawToolResult {
  /** 縮小過、要交給模型看的圖 */
  image: ToolImage;
  messageId: string;
  /** 生圖服務名稱，例如 NovelAI */
  providerLabel: string;
  /** 程式自動加上的外觀標籤（角色、使用者） */
  autoTags?: string;
  /** 這次回覆還能再畫幾張 */
  remaining: number;
}

/** 「看聊天裡的圖」找到的一張 */
export interface ChatImageToolEntry {
  /** 縮小過、要交給模型看的圖 */
  image: ToolImage;
  messageId: string;
  sender: "user" | "character";
  /** 從最新往回數第幾張（1 是最新） */
  nth: number;
  /** 聊天裡（目前載入的訊息）一共有幾張符合條件的圖 */
  total: number;
  caption?: string;
  prompt?: string;
  negativePrompt?: string;
  note?: string;
  isStyleRef?: boolean;
}

export type ChatImageSender = "any" | "user" | "character";

export interface ImageToolService {
  /** 照提示詞畫一張，傳進聊天；畫不成要丟錯 */
  draw(request: { prompt: string; negativePrompt?: string; caption?: string }, signal?: AbortSignal): Promise<DrawToolResult>;
  /** 找聊天裡的圖：styleRef 時拿畫風參考圖，否則從最新往回數第 nth 張；找不到回傳 null */
  view(request: { nth: number; sender: ChatImageSender; styleRef?: boolean }): Promise<ChatImageToolEntry | null>;
}

/** toolContext 裡給內建工具用的欄位 */
export interface ChatToolServices {
  calendar?: CalendarToolService;
  memory?: MemoryToolService;
  music?: MusicToolService;
  wallpaper?: WallpaperToolService;
  weather?: WeatherToolService;
  location?: LocationToolService;
  incomingCallScheduler?: CallSchedulerToolService;
  /** 畫圖、看聊天裡的圖（聊天畫面另外接，不在 createAppToolServices 裡） */
  image?: ImageToolService;
}

export function toolService<K extends keyof ChatToolServices>(
  context: ChatToolContext,
  key: K,
): ChatToolServices[K] {
  return context[key] as ChatToolServices[K];
}
