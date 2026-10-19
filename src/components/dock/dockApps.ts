import {
  Book,
  BookOpen,
  Calendar,
  Cloud,
  Drama,
  Dumbbell,
  Gamepad2,
  HardHat,
  Library,
  MessageCircle,
  Moon,
  Music,
  Phone,
  Settings,
  ShoppingBag,
  ShoppingCart,
  Sparkles,
  StickyNote,
  Timer,
  User,
  UserCircle,
  Utensils,
} from "lucide-vue-next";
import type { Component } from "vue";

export interface DockApp {
  // 送給 App.vue handleNavigate 的 id
  id: string;
  label: string;
  icon: Component;
}

// 轉盤可以放的所有 App（handleNavigate 對得到頁面的才放進來）
export const DOCK_APP_CATALOG: DockApp[] = [
  { id: "character", icon: UserCircle, label: "角色" },
  { id: "message", icon: MessageCircle, label: "訊息" },
  { id: "settings", icon: Settings, label: "設置" },
  { id: "space", icon: Sparkles, label: "空間" },
  { id: "music", icon: Music, label: "音樂" },
  { id: "fitness", icon: Dumbbell, label: "健身" },
  { id: "game", icon: Gamepad2, label: "遊戲" },
  { id: "shop", icon: ShoppingCart, label: "購物" },
  { id: "book", icon: Book, label: "世界書" },
  { id: "calendar", icon: Calendar, label: "日曆" },
  { id: "weather", icon: Cloud, label: "天氣" },
  { id: "phone", icon: Phone, label: "電話" },
  { id: "reading", icon: BookOpen, label: "閱讀" },
  { id: "bookshelf", icon: Library, label: "書架" },
  { id: "user", icon: User, label: "使用者" },
  { id: "delivery", icon: ShoppingBag, label: "外賣" },
  { id: "theater", icon: Drama, label: "小劇場" },
  { id: "peek-phone", icon: HardHat, label: "頭盔TA" },
  { id: "fate", icon: Moon, label: "占卜" },
  { id: "note-board", icon: StickyNote, label: "留言板" },
  { id: "pomodoro", icon: Timer, label: "番茄鐘" },
  { id: "food-log", icon: Utensils, label: "食記" },
];

// 沒自訂過時的轉盤內容（跟原本寫死的一樣，去掉點了沒反應的錢包）
export const DEFAULT_DOCK_APP_IDS = [
  "character",
  "message",
  "settings",
  "space",
  "music",
  "fitness",
  "game",
  "shop",
  "book",
  "calendar",
  "weather",
  "phone",
  "reading",
  "bookshelf",
];

const STORAGE_KEY = "dock_app_ids";

const catalogById = new Map(DOCK_APP_CATALOG.map((app) => [app.id, app]));

export function resolveDockApps(ids: string[]): DockApp[] {
  return ids
    .map((id) => catalogById.get(id))
    .filter((app): app is DockApp => !!app);
}

export function loadDockAppIds(): string[] {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const ids = JSON.parse(saved);
      if (Array.isArray(ids)) {
        const valid = ids.filter(
          (id): id is string => typeof id === "string" && catalogById.has(id),
        );
        if (valid.length > 0) return valid;
      }
    }
  } catch {
    // 讀不到就用預設
  }
  return [...DEFAULT_DOCK_APP_IDS];
}

export function saveDockAppIds(ids: string[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
  } catch {
    // 存不了就只在這次開啟有效
  }
}
