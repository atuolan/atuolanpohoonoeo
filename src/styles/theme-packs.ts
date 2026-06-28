// ===== 主題包（Theme Pack）=====
// 把「背景 + 配色 + 形態皮膚 + 圖標形狀 + 各組件預設風格」打包成可一鍵套用的整體美學。
//
// 設計原則：
// 1. 主題包只描述「資料」，套用邏輯分別交給 theme store（視覺：配色/皮膚/桌布）
//    與 canvas store（批次更新現有組件的 layout / clockStyle / shape）。
// 2. colors 提供完整 14 欄 ThemeColors，套用時走 customColors 全覆蓋，
//    不依賴既有 themePresets，確保深色（賽博霓虹）等主題也能正確呈現。
// 3. widgets 描述三類組件的預設風格：
//    - standardLayout：天氣/日曆/待辦/語錄/心情/拍立得/專注計時器（共用 5 皮膚）
//    - clockStyle：時鐘（讀 data.clockStyle）
//    - habitLayout：習慣追蹤（list/ring/heatmap/streak）

import type { ThemeColors } from "@/stores/theme";
import type { WidgetInstance } from "@/types";

// 各組件預設風格
export interface ThemePackWidgetStyles {
  // 6 皮膚系列組件：classic / pop / flat / illustration / pixel / pearl
  standardLayout: string;
  // 時鐘樣式：minimal / digital / analog / flip / neon / progress / binary / dotmatrix / orbit
  clockStyle: string;
  // 習慣追蹤：list / ring / heatmap / streak
  habitLayout: string;
}

// 主題包桌布
export interface ThemePackWallpaper {
  type: "color" | "gradient" | "image" | "pattern" | "time-theme";
  value: string;
  blur?: number;
  opacity?: number;
  overlay?: string;
  // 圖片背景時的 Base64 內嵌資料（用於匯出可跨裝置攜帶）
  imageData?: string;
}

// 主題包圖示 ID（對應 SVG 圖示庫）
// custom 為使用者匯出/匯入的主題包預設值
export type ThemePackIconId =
  | "cream"
  | "y2k"
  | "cyber"
  | "journal"
  | "mono"
  | "pearl"
  | "custom"
  | "sunset"
  | "ocean"
  | "forest"
  | "sakura";

// 主題包
export interface ThemePack {
  id: string;
  name: string;
  // 圖示識別碼（取代 emoji，渲染時對應到 SVG）
  icon: ThemePackIconId;
  description: string;
  // 預覽用的代表色（漸層字串或純色），用於設定面板色塊
  preview: string;
  colors: ThemeColors;
  // 形態皮膚（skin-presets 的 id：soft / glass / flat / plump）
  skin: string;
  // 圖標形狀（shape-presets 的 id）
  shape: string;
  wallpaper: ThemePackWallpaper;
  widgets: ThemePackWidgetStyles;
  // 自訂主題包選用：完整桌面組件佈局快照（位置 / 大小 / 內容 / 樣式）
  // 匯出 / 匯入時用來還原使用者首頁，預設主題包不攜帶
  layoutSnapshot?: WidgetInstance[];
  // 是否為使用者自訂主題包
  isCustom?: boolean;
  // 建立時間（自訂主題包用）
  createdAt?: number;
}

// ===== 奶油風 =====
// 設計意圖：法式焦糖布丁的層次感。
// 用 plump 圓潤皮搭配 squircle 超橢圓圖示，呼應「奶油裝在圓罐子裡」的觸感；
// standardLayout 改用 illustration（90 年代復古視窗），更接近食譜手帳的塗鴉風格；
// clockStyle 用 analog 傳統錶盤搭配奶油色針面，比 minimal 純數字更有手作溫度；
// habitLayout 用 streak 火焰大字，每天累積的奶油泡芙象徵滿足感。
const creamPack: ThemePack = {
  id: "cream",
  name: "奶油風",
  icon: "cream",
  description: "法式焦糖布丁、暖陽奶霜、舒芙蕾般的鬆軟質感。",
  preview: "linear-gradient(135deg, #FFF8EC 0%, #F5D9A8 45%, #C99060 100%)",
  colors: {
    primary: "#D4A574",         // 焦糖布丁
    primaryLight: "#F2D9B0",    // 打發鮮奶油
    secondary: "#B5835A",        // 烤布蕾糖殼
    background: "#FFF8EC",       // 牛奶白
    surface: "#FFFDF7",          // 奶油底
    surfaceHover: "#FAF0DC",
    text: "#4A3528",             // 深焙咖啡豆
    textSecondary: "#8A6B52",    // 拿鐵奶泡邊緣
    textMuted: "#C2A98E",
    border: "#F0E0C8",
    shadow: "rgba(180, 130, 80, 0.20)",
    success: "#A8B585",          // 抹茶醬
    error: "#D67760",            // 焦糖醬燒過頭
    warning: "#E8A857",          // 焦糖
  },
  skin: "plump",
  shape: "squircle",
  wallpaper: {
    type: "gradient",
    // 三段漸層：上方淡牛奶白 → 中段奶油黃 → 底部焦糖 — 像一杯倒映陽光的拿鐵
    value:
      "linear-gradient(165deg, #FFF8EC 0%, #FBEDD1 40%, #F2D9B0 75%, #E8C496 100%)",
    blur: 0,
    opacity: 100,
    overlay: "transparent",
  },
  widgets: {
    standardLayout: "illustration",
    clockStyle: "analog",
    habitLayout: "streak",
  },
};

// ===== Y2K 復古 =====
// 設計意圖：千禧年的塑膠透明感與全像光譜。
// glass 玻璃皮搭配 blob 流體形狀，重現 iMac G3 / iPod 半透明殼的果凍感；
// standardLayout 用 pop（新粗野派立體互動），對應 Y2K 鮮豔粗體 UI；
// clockStyle 改用 dotmatrix（LED 點陣），比 flip 更貼近 Tamagotchi / MP3 顯示螢幕；
// habitLayout 用 ring 圓環，呼應千禧年圓潤撞色光碟封面。
const y2kPack: ThemePack = {
  id: "y2k",
  name: "Y2K 復古",
  icon: "y2k",
  description: "全像光譜、果凍透明殼、千禧年泡泡電子夢。",
  preview: "linear-gradient(135deg, #C2A8FF 0%, #5BE9F2 50%, #FFA8D8 100%)",
  colors: {
    primary: "#9D7BFF",          // 薰衣草紫（更飽和、更 Y2K）
    primaryLight: "#C8B3FF",
    secondary: "#3DD9E8",        // 電子青
    background: "#F5EDFF",       // 淡紫白
    surface: "rgba(255, 255, 255, 0.78)", // 半透明配玻璃皮
    surfaceHover: "rgba(245, 235, 255, 0.85)",
    text: "#2D1B4E",             // 葡萄夜深紫
    textSecondary: "#6A4DA8",
    textMuted: "#A88FCC",
    border: "rgba(180, 150, 240, 0.4)",
    shadow: "rgba(157, 123, 255, 0.32)",
    success: "#3DE8A8",
    error: "#FF5BA8",
    warning: "#FFCB3D",
  },
  skin: "glass",
  shape: "blob",
  wallpaper: {
    type: "gradient",
    // 對角放射狀 + 三色霓虹，模擬 CD 光碟反光的全像彩虹
    value:
      "linear-gradient(135deg, #C2A8FF 0%, #9D7BFF 25%, #5BE9F2 55%, #FFA8D8 85%, #FFCB3D 100%)",
    blur: 0,
    opacity: 100,
    overlay: "transparent",
  },
  widgets: {
    standardLayout: "pop",
    clockStyle: "dotmatrix",
    habitLayout: "ring",
  },
};

// ===== 賽博霓虹 =====
// 設計意圖：雨夜霓虹招牌反射在濕地面的賽博朋克 — 黑色金屬機殼上的青紫電弧。
//
// 組件選擇邏輯（避開所有動畫，符合「不要呼吸燈」的要求）：
// - skin: glass — 暗玻璃帶霓虹折射，比 flat 更有「夜店玻璃幕牆」層次。
// - shape: squircle — iOS 風超橢圓，讓圖示像發光螢幕的圓角。
// - standardLayout: pop — 唯一暗底 layout（黑底 + 厚黑邊框 + 撞色按鈕），
//   新粗野派的「邊框 + 投影偏移」剛好呼應賽博朋克的硬派工業感；
//   其他四個 layout（classic 純白、flat 粉紅、illustration 米黃、pixel 粉格紋）
//   都是亮底，套在暗黑霓虹背景上會嚴重撞調（vaporwave 少女味）。
// - clockStyle: binary — 二進制矩陣點陣，完全靜態（無任何 keyframes 動畫），
//   呼應賽博朋克 The Matrix / 駭客終端機的核心 DNA；
//   排除：neon（3 處 pulse 呼吸燈）、digital（separator dot pulse）、
//        orbit（行星旋轉）、minimal（分隔符 blink）、dotmatrix（已給 Y2K，避免重複）。
// - habitLayout: heatmap — GitHub 貢獻圖方格，呼應駭客終端機的資料視覺化；
//   不選 streak（火焰 emoji 大字在暗黑背景太萌、不賽博）。
const cyberPack: ThemePack = {
  id: "cyber",
  name: "賽博霓虹",
  icon: "cyber",
  description: "雨夜全息招牌、黑色機殼、量子青與離子紫的電弧共振。",
  preview: "linear-gradient(135deg, #08081A 0%, #00F5D4 45%, #FF2E9A 100%)",
  colors: {
    primary: "#00F5D4",          // 量子青（比純青更帶綠調，更賽博）
    primaryLight: "#5CFFE8",
    secondary: "#FF2E9A",        // 離子洋紅
    background: "#08081A",       // 深空藍黑
    surface: "rgba(22, 22, 48, 0.72)", // 半透夜玻璃
    surfaceHover: "rgba(30, 30, 64, 0.82)",
    text: "#F0F5FF",
    textSecondary: "#A0B0D8",
    textMuted: "#6B7AA0",
    border: "rgba(0, 245, 212, 0.28)",
    shadow: "rgba(0, 245, 212, 0.45)",
    success: "#39FF88",          // 駭客終端機綠
    error: "#FF3D7F",
    warning: "#FFD93D",
  },
  skin: "glass",
  shape: "squircle",
  wallpaper: {
    type: "gradient",
    // 徑向漸層仿廣告招牌：左上量子青光暈 + 右下離子粉光暈，底層暗夜藍
    value:
      "radial-gradient(ellipse at 25% 20%, rgba(0,245,212,0.35) 0%, transparent 45%), radial-gradient(ellipse at 80% 85%, rgba(255,46,154,0.32) 0%, transparent 50%), linear-gradient(160deg, #08081A 0%, #14143A 50%, #1A0D2E 100%)",
    blur: 0,
    opacity: 100,
    overlay: "transparent",
  },
  widgets: {
    standardLayout: "pop",
    clockStyle: "binary",
    habitLayout: "heatmap",
  },
};

// ===== 可愛手帳 =====
// 設計意圖：少女房間裡的拼貼手帳本，貼滿馬卡龍貼紙與奶霜便利貼。
// shape 從 heart 改成 petal（花瓣 50% 0% 不對稱圓角），既保留可愛又避免愛心過載；
// standardLayout 用 illustration（復古視窗），呼應 90 年代手帳貼紙風；
// clockStyle 用 analog 傳統錶盤（女孩房裡的粉紅小鬧鐘）；
// habitLayout: ring 圓環，像每日完成一片馬卡龍。
const journalPack: ThemePack = {
  id: "journal",
  name: "可愛手帳",
  icon: "journal",
  description: "馬卡龍貼紙、奶霜便利貼、少女房手作拼貼本。",
  preview: "linear-gradient(135deg, #FFF0F5 0%, #FFB3C8 50%, #B8E0D2 100%)",
  colors: {
    primary: "#FF85A8",          // 草莓奶霜（比 #FF9EB5 更飽和、更顯色）
    primaryLight: "#FFB8CE",
    secondary: "#7DD3B8",        // 開心果抹茶
    background: "#FFF6FA",
    surface: "#FFFFFF",
    surfaceHover: "#FFECF3",
    text: "#5C3B48",             // 深玫瑰木
    textSecondary: "#9A6B7A",
    textMuted: "#CFA3B2",
    border: "#FFD6E3",
    shadow: "rgba(255, 133, 168, 0.22)",
    success: "#7DD3B8",
    error: "#FF7A85",
    warning: "#FFC857",          // 蜂蜜檸檬糖
  },
  skin: "plump",
  shape: "petal",
  wallpaper: {
    type: "gradient",
    // 仿水彩拼貼：左上奶霜粉 → 中段薰衣草 → 右下抹茶，三色斜向暈染
    value:
      "linear-gradient(135deg, #FFF0F5 0%, #FFD6E3 30%, #EBDAFB 60%, #D4ECDF 100%)",
    blur: 0,
    opacity: 100,
    overlay: "transparent",
  },
  widgets: {
    standardLayout: "illustration",
    clockStyle: "analog",
    habitLayout: "ring",
  },
};

// ===== 極簡黑白 =====
// 設計意圖：MUJI / Kinfolk 雜誌封面般克制的留白。
// skin: flat 保持極簡，但 shape 改 rounded-square（22% 圓角），比純 square 多一點呼吸；
// standardLayout 改 classic（傳統簡約留白），比 flat 更符合「雜誌排版」的調性；
// clockStyle: minimal 是唯一正解；
// habitLayout: heatmap 方格熱力圖，呼應雜誌資訊圖表美學；
// 背景從死白 #FAFAFA 改成微暖灰白漸層，避免在大螢幕上像未上色的稿紙。
const monoPack: ThemePack = {
  id: "mono",
  name: "極簡黑白",
  icon: "mono",
  description: "MUJI 文具櫃、Kinfolk 雜誌封面、克制留白的灰階詩。",
  preview: "linear-gradient(135deg, #FAFAF7 0%, #C4C4C0 50%, #1F1F1D 100%)",
  colors: {
    primary: "#1F1F1D",          // 鉛筆芯黑（帶微綠調，比純黑更柔）
    primaryLight: "#4A4A47",
    secondary: "#8A8A85",        // 牛皮紙灰
    background: "#F8F7F3",       // 米白棉紙
    surface: "#FFFFFF",
    surfaceHover: "#F0EFEA",
    text: "#1F1F1D",
    textSecondary: "#5C5C57",
    textMuted: "#A8A8A2",
    border: "#E4E2DC",           // 淡牛皮邊
    shadow: "rgba(31, 31, 29, 0.10)",
    success: "#3A3A36",
    error: "#5C5C57",
    warning: "#7A7A74",
  },
  skin: "flat",
  shape: "rounded-square",
  wallpaper: {
    type: "gradient",
    // 從米白棉紙到淡灰，斜向極淡漸層，避免大面積純色的視覺空洞
    value: "linear-gradient(160deg, #FAFAF7 0%, #F2F1EC 60%, #E8E7E2 100%)",
    blur: 0,
    opacity: 100,
    overlay: "transparent",
  },
  widgets: {
    standardLayout: "classic",
    clockStyle: "minimal",
    habitLayout: "heatmap",
  },
};

// ===== 珍珠畫廊 =====
// 設計意圖：《戴珍珠耳環的少女》幾何插畫版 — 美術館拼貼式藝術氛圍。
// 色彩來源：深紫夜空 #332D4B、芥末黃頭巾 #FFCE05、藍色衣領 #4783DE、
//          橘色衣服 #CE8221、暖膚色 #FFC6AE、發光星星點綴。
// 美學方向：不直接放入畫作本身（避免喧賓奪主），而是提取配色做成
//          「深紫 + 多色幾何色塊 + 發光星星」的抽象幾何桌布，
//          搭配適合藝術拼貼氛圍的組件風格。
const pearlPack: ThemePack = {
  id: "pearl",
  name: "珍珠畫廊",
  icon: "pearl",
  description: "維梅爾筆下的夜空拼貼、幾何色塊、珍珠低吟的美術館靜謐。",
  preview: "linear-gradient(135deg, #332D4B 0%, #4783DE 40%, #FFCE05 70%, #CE8221 100%)",
  colors: {
    primary: "#4783DE",          // 藍色衣領（主色）
    primaryLight: "#7BADEE",
    secondary: "#FFCE05",        // 芥末黃頭巾
    background: "#332D4B",       // 深紫夜空背景
    surface: "rgba(71, 131, 222, 0.12)",  // 半透藍紫色表面
    surfaceHover: "rgba(71, 131, 222, 0.20)",
    text: "#F8F6F0",             // 畫布白
    textSecondary: "#D4C8B0",    // 溫暖中性
    textMuted: "#9B8E7A",
    border: "rgba(255, 206, 5, 0.25)",  // 芥末黃邊框
    shadow: "rgba(206, 130, 33, 0.35)",
    success: "#7BADEE",
    error: "#FF8E6E",
    warning: "#FFCE05",
  },
  skin: "glass",
  shape: "diamond",
  wallpaper: {
    type: "gradient",
    // 徑向漸層 + 幾何色塊：左上芥末黃星光 + 右上藍色色塊 + 右下橘色暈染，
    // 底層深紫夜空，仿拼貼畫的多層次幾何構成
    value:
      "radial-gradient(circle at 15% 18%, rgba(255,206,5,0.28) 0%, transparent 25%), radial-gradient(circle at 75% 25%, rgba(71,131,222,0.32) 0%, transparent 35%), radial-gradient(circle at 85% 75%, rgba(206,130,33,0.25) 0%, transparent 30%), radial-gradient(circle at 25% 70%, rgba(255,198,174,0.18) 0%, transparent 20%), linear-gradient(150deg, #332D4B 0%, #3E3A58 45%, #4A425F 100%)",
    blur: 0,
    opacity: 100,
    overlay: "transparent",
  },
  widgets: {
    // pearl：珍珠畫廊風格，深紫+芥末黃+靜態星光的美術館氛圍
    standardLayout: "pearl",
    // pearl：讓時鐘也有一致的風格
    clockStyle: "pearl",
    // ring：圓環進度，像珍珠項鍊的圓潤迴圈
    habitLayout: "ring",
  },
};

// ===== 主題包列表 =====
export const themePacks: ThemePack[] = [
  creamPack,
  y2kPack,
  cyberPack,
  journalPack,
  monoPack,
  pearlPack,
];

/**
 * 套用 standardLayout 的組件類型（共用 classic/pop/flat/illustration/pixel 5 皮膚）。
 */
export const STANDARD_LAYOUT_WIDGET_TYPES: readonly string[] = [
  "polaroid",
  "mood-diary",
  "quote",
  "todo",
  "focus-timer",
  "weather",
  "calendar",
];

/**
 * 取得指定主題包（找不到時回傳 undefined）。
 */
export function getThemePack(id?: string): ThemePack | undefined {
  if (!id) return undefined;
  return themePacks.find((p) => p.id === id);
}
