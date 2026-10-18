/**
 * 把 App 裡真正的功能接成內建角色工具用的服務：行事曆、記憶、音樂、桌布、天氣、來電。
 * 聊天畫面每輪生成時呼叫 createAppToolServices，結果放進 toolContext。
 *
 * 以前是直接把 store 塞給工具，方法名稱對不上也不會報錯，九個工具壞了七個。
 * 現在回傳值必須符合 toolServices.ts 的型別，對不上就編譯不過。
 */
import { searchMusic, type MusicTrack } from "@/api/MusicApi";
import { TOOL_WALLPAPER_PRESETS } from "@/data/wallpaperPresets";
import { listCalendarEvents, saveCalendarEvent } from "@/services/calendarEvents";
import { getIncomingCallScheduler } from "@/services/IncomingCallScheduler";
import { getBrowserLocation, getNearbyPlaces, getWeatherByCity, reverseGeocode } from "@/services/WeatherService";
import type { WallpaperStyle } from "@/stores/theme";
import type { CalendarEventData } from "@/types/calendar";
import { formatDate } from "./toolFormat";
import type {
  ChatToolServices,
  MemoryToolService,
  MusicToolService,
  MusicToolTrack,
  WallpaperToolService,
} from "./toolServices";

/** 音樂 store 用到的部分 */
export interface MusicStoreLike {
  readonly isPlaying: boolean;
  readonly currentTrack: MusicTrack | null;
  readonly searchResults: MusicTrack[];
  readonly playlist: MusicTrack[];
  play(track?: MusicTrack, index?: number): Promise<void>;
}

/** 主題 store 用到的部分 */
export interface ThemeStoreLike {
  readonly nightMode: boolean;
  updateWallpaperStyle(updates: Partial<WallpaperStyle>): void;
}

export interface AppToolServiceOptions {
  chatId: string;
  characterId: string;
  vectorMemoryEnabled: boolean;
  vectorThreshold: number;
  musicStore: MusicStoreLike;
  themeStore: ThemeStoreLike;
  /** 新增行程寫入之後（插聊天卡片、通知） */
  onCalendarEventCreated?: (data: CalendarEventData) => void;
  /** 角色正在跟使用者通話時，不另外排來電 */
  isInCallWithCharacter?: () => boolean;
}

export function createAppToolServices(options: AppToolServiceOptions): Required<ChatToolServices> {
  return {
    calendar: {
      async listEvents(range) {
        const events = await listCalendarEvents(range);
        return events.map(({ date, title, description, type, startTime, endTime, endDate }) => ({
          date,
          title,
          description,
          type,
          startTime,
          endTime,
          endDate,
        }));
      },
      async createEvent(data) {
        await saveCalendarEvent(data, { characterId: options.characterId, chatId: options.chatId });
        options.onCalendarEventCreated?.(data);
      },
    },
    memory: createMemoryToolService(options),
    music: musicToolServiceFor(options.musicStore),
    wallpaper: createWallpaperToolService(options.themeStore),
    weather: { getWeatherByCity },
    location: {
      async locate() {
        // 只要知道在哪一區，不用 GPS 等很久
        const coords = await getBrowserLocation({ enableHighAccuracy: false });
        const [place, nearby] = await Promise.all([
          reverseGeocode(coords.lat, coords.lon),
          getNearbyPlaces(coords.lat, coords.lon, 400, 3),
        ]);
        return {
          place: place || `緯度 ${coords.lat.toFixed(2)}、經度 ${coords.lon.toFixed(2)} 一帶`,
          accuracy: Math.round(coords.accuracy),
          nearby: nearby.map((p) => `${p.name}（${p.type}，約 ${p.distance} 公尺）`),
        };
      },
    },
    incomingCallScheduler: {
      async schedulePendingCall(data, character, chatId) {
        if (options.isInCallWithCharacter?.()) throw new Error("你們正在通話中，不用另外預約來電");
        return getIncomingCallScheduler().schedulePendingCall(data, character, chatId);
      },
    },
  };
}

function createMemoryToolService(
  options: Pick<AppToolServiceOptions, "chatId" | "vectorMemoryEnabled" | "vectorThreshold">,
): MemoryToolService {
  return {
    async search(query, limit) {
      const { MemoryRetrieverService } = await import("@/services/memoryRetriever");
      const retriever = new MemoryRetrieverService();
      // 向量記憶開著就用混合檢索；沒開或找不到時改用文字比對
      let found = options.vectorMemoryEnabled
        ? await retriever.retrieve(query, options.chatId, limit, options.vectorThreshold, undefined, undefined, 0)
        : [];
      if (found.length === 0) found = await retriever.searchByText(query, options.chatId, limit);
      return found.slice(0, limit).map((memory) => ({
        kind: memory.sourceType,
        date: memory.createdAt ? formatDate(new Date(memory.createdAt)) : undefined,
        content: memory.content,
      }));
    },
  };
}

const MAX_REMEMBERED_TRACKS = 200;
/** 搜尋結果要留著，下一輪才能用 trackId 或編號播放；每個音樂 store 一份 */
const musicToolServices = new WeakMap<MusicStoreLike, MusicToolService>();

function musicToolServiceFor(store: MusicStoreLike): MusicToolService {
  let service = musicToolServices.get(store);
  if (!service) {
    service = createMusicToolService(store);
    musicToolServices.set(store, service);
  }
  return service;
}

function toToolTrack(track: MusicTrack): MusicToolTrack {
  return { id: track.id, name: track.name, artist: track.artist, album: track.album || undefined };
}

function createMusicToolService(store: MusicStoreLike): MusicToolService {
  const remembered = new Map<string, MusicTrack>();
  let lastResults: MusicTrack[] = [];

  return {
    async search(query, limit) {
      const results = await searchMusic(query);
      // play_music 的 index 只到 9
      lastResults = results.slice(0, 10);
      for (const track of lastResults) remembered.set(track.id, track);
      for (const id of remembered.keys()) {
        if (remembered.size <= MAX_REMEMBERED_TRACKS) break;
        remembered.delete(id);
      }
      return results.slice(0, limit).map(toToolTrack);
    },
    async play({ trackId, index }) {
      const track = trackId
        ? remembered.get(trackId) ?? [...store.searchResults, ...store.playlist].find((t) => t.id === trackId)
        : index !== undefined
          ? lastResults[index]
          : undefined;
      if (!track) throw new Error("找不到這首歌，請先用 search_music 搜尋");
      await store.play(track);
      if (!store.isPlaying || store.currentTrack?.id !== track.id) {
        throw new Error(`「${track.name}」沒有播成：連結可能失效，或瀏覽器擋下了自動播放`);
      }
      return toToolTrack(track);
    },
  };
}

function createWallpaperToolService(store: ThemeStoreLike): WallpaperToolService {
  return {
    apply({ preset, color }) {
      let label: string;
      // 跟全域主題設定一樣只換種類和內容，模糊、透明度、疊色維持使用者原本的設定
      if (color) {
        store.updateWallpaperStyle({ type: "color", value: color });
        label = `純色 ${color}`;
      } else {
        const found = TOOL_WALLPAPER_PRESETS.find((p) => p.id === preset);
        if (!found) throw new Error(`沒有這個桌布樣式：${preset ?? "（沒指定）"}`);
        store.updateWallpaperStyle({ type: found.type, value: found.value });
        label = `「${found.name}」`;
      }
      return `桌布已換成${label}${store.nightMode ? "（夜間模式開著，關掉後才看得到）" : ""}`;
    },
  };
}
