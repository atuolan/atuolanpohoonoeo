import type { WallpaperStyle } from "@/stores/theme";
import { DEFAULT_THEME_PACK } from "@/styles/theme-packs";

/** 首頁桌布的預設選項 */
export interface HomeWallpaperPreset {
  id: string;
  name: string;
  type: WallpaperStyle["type"];
  value: string;
}

/** 全域主題設定裡的桌布選項；角色工具「換桌布」也用這份，兩邊永遠一致 */
export const HOME_WALLPAPER_PRESETS: HomeWallpaperPreset[] = [
  { id: "time-theme", name: "跟隨時間", type: "time-theme", value: "" },
  { id: "none", name: "無", type: "color", value: "var(--color-background)" },
  {
    id: "gradient1",
    name: "夢幻粉",
    type: "gradient",
    value: "linear-gradient(135deg, #FFE6F0 0%, #E6F0FF 100%)",
  },
  {
    id: "gradient2",
    name: "薰衣草",
    type: "gradient",
    value: "linear-gradient(135deg, #E6E6FA 0%, #FFF0F5 100%)",
  },
  {
    id: "gradient3",
    name: "清新綠",
    type: "gradient",
    value: "linear-gradient(135deg, #E8F5E9 0%, #E3F2FD 100%)",
  },
  {
    id: "gradient4",
    name: "暖陽橙",
    type: "gradient",
    value: "linear-gradient(135deg, #FFF3E0 0%, #FFECB3 100%)",
  },
];

/** 角色工具多一個「預設」：換回預設主題包的桌布 */
export const TOOL_WALLPAPER_PRESETS: HomeWallpaperPreset[] = [
  {
    id: "default",
    name: "預設方格紙",
    type: DEFAULT_THEME_PACK.wallpaper.type,
    value: DEFAULT_THEME_PACK.wallpaper.value,
  },
  ...HOME_WALLPAPER_PRESETS,
];
