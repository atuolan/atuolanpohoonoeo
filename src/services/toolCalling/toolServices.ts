/**
 * 內建角色工具要用的服務介面。
 * 聊天畫面用 createAppToolServices（appToolServices.ts）建好放進 toolContext，
 * chatTools 用 toolService() 取出；兩邊都靠這裡的型別對齊，方法名稱對不上就編譯不過。
 */
import type { WeatherData } from "@/services/WeatherService";
import type { CalendarEventData } from "@/types/calendar";
import type { ScheduleCallData } from "@/types/incomingCall";
import type { ChatToolContext } from "./types";

/** 「看行程」列出的一筆 */
export interface CalendarToolEvent {
  /** YYYY-MM-DD */
  date: string;
  title: string;
  description?: string;
  type: "user" | "period" | "holiday";
}

export interface CalendarToolService {
  /** 列出日期範圍內（含頭尾）的事件，依日期排序 */
  listEvents(range: { from: string; to?: string; limit: number }): Promise<CalendarToolEvent[]>;
  /** 寫進行事曆；沒寫成要丟錯 */
  createEvent(data: CalendarEventData): Promise<void>;
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

/** toolContext 裡給內建工具用的欄位 */
export interface ChatToolServices {
  calendar?: CalendarToolService;
  memory?: MemoryToolService;
  music?: MusicToolService;
  wallpaper?: WallpaperToolService;
  weather?: WeatherToolService;
  location?: LocationToolService;
  incomingCallScheduler?: CallSchedulerToolService;
}

export function toolService<K extends keyof ChatToolServices>(
  context: ChatToolContext,
  key: K,
): ChatToolServices[K] {
  return context[key] as ChatToolServices[K];
}
