/**
 * 小屋裡每個 App 的圖示和配色：下面那一排、「全部 App」、「常用 App」都用同一份。
 * 淡彩風格：很淡的底、同色系深一點的線條（HouseAppTile.vue 畫）。
 */
import {
  AlarmClock,
  BookOpen,
  CalendarDays,
  CloudSun,
  Drama,
  Dumbbell,
  Gamepad2,
  Globe,
  HardHat,
  Heart,
  Library,
  MessageCircle,
  MoonStar,
  Music,
  Phone,
  ScrollText,
  Settings,
  ShoppingCart,
  Smile,
  Sparkles,
  StickyNote,
  User,
  Utensils,
} from "lucide-vue-next";
import type { Component } from "vue";
import { HOUSE_APPS, type HouseApp } from "./houseData";

/** App id → 圖示（HOUSE_APPS 裡的每一個都要有，測試會檢查） */
export const HOUSE_APP_ICON: Record<string, Component> = {
  message: MessageCircle,
  character: Smile,
  user: User,
  book: Globe,
  "prompt-manager": ScrollText,
  settings: Settings,
  phone: Phone,
  space: Sparkles,
  theater: Drama,
  fate: MoonStar,
  reading: BookOpen,
  bookshelf: Library,
  music: Music,
  game: Gamepad2,
  fitness: Dumbbell,
  shop: ShoppingCart,
  calendar: CalendarDays,
  weather: CloudSun,
  pomodoro: AlarmClock,
  "note-board": StickyNote,
  "food-log": Utensils,
  date: Heart,
  "peek-phone": HardHat,
};

export interface HouseAppIcon extends HouseApp {
  icon: Component;
}

export const HOUSE_APP_ICONS: HouseAppIcon[] = HOUSE_APPS.flatMap((a) => (HOUSE_APP_ICON[a.app] ? [{ ...a, icon: HOUSE_APP_ICON[a.app] }] : []));

const byId = new Map(HOUSE_APP_ICONS.map((a) => [a.app, a]));

/** 照 id 的順序拿圖示，認不得的跳過 */
export function houseAppIcons(ids: string[]): HouseAppIcon[] {
  return ids.flatMap((id) => byId.get(id) ?? []);
}

function channels(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** 兩個 #rrggbb 混在一起，share 是第一個顏色佔多少（0–1） */
export function mixHex(a: string, b: string, share: number): string {
  const ca = channels(a);
  const cb = channels(b);
  return "#" + ca.map((v, i) => Math.round(v * share + cb[i] * (1 - share)).toString(16).padStart(2, "0")).join("");
}

/** 主色 → 淡彩的三個顏色：淡底、深一點的線條、底的細邊（自己算，舊一點的瀏覽器沒有 color-mix） */
export function tileColors(color: string): { bg: string; ink: string; ring: string } {
  return { bg: mixHex(color, "#fffaf2", 0.34), ink: mixHex(color, "#6b4a3a", 0.62), ring: mixHex(color, "#fff6ea", 0.3) };
}
