/**
 * 公告（明信片）三個畫面共用的小工具：圖示、日期、手寫字體
 */
import type { AnnouncementLevel } from "@/services/AnnouncementService";
import {
  Bug,
  Camera,
  Clock,
  Gift,
  House,
  Luggage,
  Map as MapIcon,
  MapPin,
  MessageCircle,
  Paintbrush,
  Palette,
  Plane,
  Sparkles,
  Star,
  Ticket,
  Wrench,
  type LucideIcon,
} from "lucide-vue-next";

/** <highlight icon="..."> 可用的名稱 */
export const ANNOUNCEMENT_ICONS: Record<string, LucideIcon> = {
  pin: MapPin,
  map: MapIcon,
  brush: Paintbrush,
  palette: Palette,
  suitcase: Luggage,
  plane: Plane,
  ticket: Ticket,
  camera: Camera,
  home: House,
  chat: MessageCircle,
  clock: Clock,
  wrench: Wrench,
  bug: Bug,
  gift: Gift,
  star: Star,
  sparkle: Sparkles,
};

export function announcementIcon(name?: string): LucideIcon {
  return (name && ANNOUNCEMENT_ICONS[name]) || MapPin;
}

export const ANNOUNCEMENT_KIND_LABELS: Record<AnnouncementLevel, string> = {
  info: "POSTCARD",
  important: "REGISTERED",
  critical: "TELEGRAM",
};

/** "2026-10-11" → { year: "2026", monthDay: "10.11", full: "2026.10.11" }；其他格式原樣顯示 */
export function splitAnnouncementDate(date?: string): {
  year: string;
  monthDay: string;
  full: string;
} {
  const m = date?.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (!m) return { year: "", monthDay: date ?? "", full: date ?? "" };
  const monthDay = `${m[2].padStart(2, "0")}.${m[3].padStart(2, "0")}`;
  return { year: m[1], monthDay, full: `${m[1]}.${monthDay}` };
}

const FONT_LINK_ID = "announcement-hand-font";

/** 手寫標題用霞鶩文楷；載不到（例如大陸）就退回 Noto Serif TC */
export function ensureAnnouncementFont(): void {
  if (typeof document === "undefined" || document.getElementById(FONT_LINK_ID)) return;
  const link = document.createElement("link");
  link.id = FONT_LINK_ID;
  link.rel = "stylesheet";
  link.href = "https://fonts.googleapis.com/css2?family=LXGW+WenKai+TC:wght@400;700&display=swap";
  document.head.appendChild(link);
}
