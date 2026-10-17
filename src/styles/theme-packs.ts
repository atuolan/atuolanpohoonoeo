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
import type { WidgetCustomStyle, WidgetInstance } from "@/types";

// 各組件預設風格
export interface ThemePackWidgetStyles {
  // 6 皮膚系列組件：classic / pop / flat / illustration / pixel / pearl
  standardLayout: string;
  // 時鐘樣式：minimal / digital / analog / flip / neon / progress / binary / dotmatrix / orbit
  clockStyle: string;
  // 習慣追蹤：list / ring / heatmap / streak
  habitLayout: string;
  // 音樂播放器黑膠子風格（vinylStyle）：pop / classic / flat / illustration / pixel / pearl / lineart
  // 未指定時不覆寫使用者既有設定
  vinylStyle?: string;
  // 世界書佈局（layout）：shelf / featured / icon / pearl / lineart
  // 未指定時不覆寫使用者既有設定
  worldBookLayout?: string;
  // 拍立得專屬版型，覆寫 standardLayout（例如手帳拼貼的 scrapbook）
  polaroidLayout?: string;
  // 音樂播放器版型：compact / classic / vinyl / ticket；指定時優先於 vinylStyle
  musicLayout?: string;
  // 最近聊天版型（寫在 data.layout）：bubble / card / sticky
  recentChatLayout?: string;
  // 依組件類型覆寫 customStyle（底色、文字色等），讓版型在主題包配色下成立
  styleOverrides?: Partial<Record<string, Partial<WidgetCustomStyle>>>;
  // App 圖標（fluid-button）配色：底色依標籤指定，沒指定的標籤依序循環 palette
  appIcons?: ThemePackAppIconStyle;
}

export interface ThemePackAppIconStyle {
  // App 圖標的主題版型（themed/registry 的 themedAppLayouts）；未指定時用內建圓角圖標
  layout?: string;
  palette: string[];
  colorsByLabel?: Record<string, string>;
  foregroundColor: string;
  textColor?: string;
  borderColor?: string;
  borderWidth?: number;
}

// 主頁擺位：套用主題包時可選擇把中間主頁的組件排成主題包設計的位置
// 以 type（+ fluid-button 的 label）對應使用者現有的組件，找不到的就略過
export interface ThemePackArrangementItem {
  type: string;
  label?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  // 這個主題用不到的組件（例如 Y2K 把音樂併進 MP3 時鐘）：暫時隱藏，不刪除；換主題包時自動恢復
  hidden?: boolean;
  // 一併寫進組件 data 的設定（例如目錄式 App 的編號 indexNo）
  dataPatch?: Record<string, unknown>;
}

export interface ThemePackHomeArrangement {
  // 這個擺法需要的最少可見格數（矮螢幕放不下就不排）
  minVisibleRows: number;
  items: ThemePackArrangementItem[];
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
  | "sakura"
  | "lineart"
  | "scrapbook"
  | "frost";

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
  // 選用：使用者氣泡漸層；沒給就用 primary → primaryLight
  bubbleGradient?: string;
  // 形態皮膚（skin-presets 的 id：soft / glass / flat / plump）
  skin: string;
  // 圖標形狀（shape-presets 的 id）
  shape: string;
  wallpaper: ThemePackWallpaper;
  widgets: ThemePackWidgetStyles;
  // 自訂主題包選用：完整桌面組件佈局快照（位置 / 大小 / 內容 / 樣式）
  // 匯出 / 匯入時用來還原使用者首頁，預設主題包不攜帶
  layoutSnapshot?: WidgetInstance[];
  // 選用：中間主頁的建議擺位（套用時會先詢問）
  homeArrangement?: ThemePackHomeArrangement;
  // 自訂主題包選用：全域自訂 CSS（對應 theme store 的 customCSS）
  // 讓 AI／使用者寫在「全局美化」框的 CSS 也能隨主題包分享出去，預設主題包不攜帶
  customCSS?: string;
  // 是否為使用者自訂主題包
  isCustom?: boolean;
  // 建立時間（自訂主題包用）
  createdAt?: number;
}

// 舊版極簡黑白／線描把 primaryLight 設成深灰，選取底會變深灰底黑字。
// 已套用過的人存的是舊色碼，載入時換成新的淺灰（只換主色也還是原值的，避免動到使用者自己調的色）。
export const LEGACY_PRIMARY_LIGHT_FIXES: { primary: string; from: string; to: string }[] = [
  { primary: "#1C1C1A", from: "#3A3A37", to: "#E6E4DE" },
  { primary: "#1A1A1A", from: "#3D3D3D", to: "#EDEDED" },
];

// ===== 主題版型共用 =====
// 交給 themed/ 版型元件的組件，要清掉前一個主題留下的底色 / 文字色，
// 否則版型會收到舊主題的 color 而蓋掉自己的配色
const THEMED_STYLE_RESET: Partial<WidgetCustomStyle> = {
  backgroundColor: undefined,
  backgroundGradient: undefined,
  foregroundColor: undefined,
  textColor: undefined,
  borderColor: undefined,
  borderWidth: undefined,
};

const themedStyleResets = {
  clock: THEMED_STYLE_RESET,
  polaroid: THEMED_STYLE_RESET,
  music: THEMED_STYLE_RESET,
  "recent-chat": THEMED_STYLE_RESET,
};

// 兩側的角色組件（紀念日、TA 的手帳）沒有主題版型，只吃 customStyle 的底色、字色與框線。
// 每個主題包都要給一組完整的值：沒給就會沿用前一個主題（或預設手帳拼貼）的米白卡，
// 在白色桌布上整塊看不見。欄位全部寫出來，換主題時才會把前一個主題的框線清掉。
const sideCard = (
  backgroundColor: string,
  textColor: string,
  border?: { color: string; width: number },
): Partial<WidgetCustomStyle> => ({
  backgroundColor,
  backgroundGradient: undefined,
  foregroundColor: textColor,
  textColor,
  borderColor: border?.color,
  borderWidth: border?.width,
});

const sideCardStyles = (card: Partial<WidgetCustomStyle>) => ({
  "relationship-counter": card,
  "char-journal": card,
});

// 中間主頁常用的擺位片段：拍立得 / 音樂右邊的 2×2 App
const appGrid2x2 = (top: number): ThemePackArrangementItem[] => [
  { type: "fluid-button", label: "訊息", x: 46, y: top, width: 5, height: 5 },
  { type: "fluid-button", label: "角色", x: 51, y: top, width: 5, height: 5 },
  { type: "fluid-button", label: "設置", x: 46, y: top + 5, width: 5, height: 5 },
  { type: "fluid-button", label: "使用者", x: 51, y: top + 5, width: 5, height: 5 },
];

// 一排 4 個 5 格寬的 App，用半格位移和 21 格寬的組件置中對齊
const appRow = (labels: string[], y: number): ThemePackArrangementItem[] =>
  labels.map((label, i) => ({ type: "fluid-button", label, x: 35.5 + i * 5, y, width: 5, height: 5 }));

// ===== 奶油風・甜點櫃 =====
// 設計意圖：把桌面做成甜點店的玻璃櫃——所有東西都是圓的。
// 圓形錶盤時鐘卡、圓形照片、膠囊播放條、馬卡龍色圓 App；焦糖色只當重點色。
const creamPack: ThemePack = {
  id: "cream",
  name: "奶油風",
  icon: "cream",
  description: "甜點櫃裡的圓形錶盤、膠囊播放條與馬卡龍色 App。",
  preview: "linear-gradient(135deg, #FBF3E4 0%, #F6DDB4 50%, #C98A55 100%)",
  colors: {
    primary: "#C98A55",          // 焦糖
    primaryLight: "#E3B07F",
    secondary: "#9DB48A",        // 開心果
    background: "#FBF3E4",       // 牛奶白
    surface: "#FFFCF6",
    surfaceHover: "#F7EBD6",
    text: "#4A3528",             // 深焙咖啡
    textSecondary: "#7E6250",
    textMuted: "#B49C86",
    border: "#EEDCC3",
    shadow: "rgba(150, 100, 60, 0.22)",
    success: "#9DB48A",
    error: "#D67760",
    warning: "#E8A857",
  },
  skin: "plump",
  shape: "circle",
  wallpaper: {
    type: "gradient",
    value:
      "radial-gradient(70% 40% at 100% 0%, #F6DDB4 0%, #F6DDB400 70%), " +
      "radial-gradient(70% 35% at 0% 100%, #F3D3C2 0%, #F3D3C200 70%), #FBF3E4",
    blur: 0,
    opacity: 100,
    overlay: "transparent",
  },
  widgets: {
    standardLayout: "illustration",
    clockStyle: "pastry",
    habitLayout: "streak",
    worldBookLayout: "featured",
    polaroidLayout: "round",
    musicLayout: "capsule",
    recentChatLayout: "speech",
    styleOverrides: {
      ...themedStyleResets,
      // 奶油卡紙；牛奶白桌布和卡片顏色太接近，加一圈焦糖淺色框
      ...sideCardStyles(sideCard("#FFFCF6", "#4A3528", { color: "#E3C9A6", width: 1.5 })),
    },
    appIcons: {
      layout: "macaron",
      palette: ["#F6D9C9", "#DCE5CF", "#F3E3B5", "#E7D9EF"],
      colorsByLabel: {
        訊息: "#F6D9C9", 角色: "#DCE5CF", 設置: "#F3E3B5", 使用者: "#E7D9EF",
        占卜: "#E7D9EF", 遊戲: "#F6D9C9", 音樂: "#F3E3B5", 空間: "#DCE5CF",
      },
      foregroundColor: "#4A3528",
      textColor: "#4A3528",
    },
  },
  homeArrangement: {
    minVisibleRows: 41,
    items: [
      { type: "clock", x: 35, y: 2, width: 21, height: 7 },
      { type: "polaroid", x: 35, y: 10, width: 10, height: 10 },
      ...appGrid2x2(10),
      { type: "music", x: 35, y: 21, width: 21, height: 4 },
      { type: "recent-chat", x: 35, y: 26, width: 21, height: 8 },
      ...appRow(["占卜", "遊戲", "音樂", "空間"], 35),
    ],
  },
};

// ===== Y2K 復古・千禧桌面 =====
// 設計意圖：千禧年的電腦桌面。時鐘與音樂合成一台 MP3（液晶螢幕 + 觸控轉盤），
// 訊息是 MSN 對話視窗、照片是「我的相片」視窗、App 是果凍泡泡按鈕。
// 音樂 widget 併進 MP3 時鐘，所以擺位時把它暫時隱藏（換主題包會自動恢復）。
const y2kPack: ThemePack = {
  id: "y2k",
  name: "Y2K 復古",
  icon: "y2k",
  description: "MP3 液晶時鐘、MSN 對話視窗、果凍泡泡按鈕的千禧桌面。",
  preview: "linear-gradient(135deg, #CDB8FF 0%, #A8E6F5 50%, #FFC4E4 100%)",
  colors: {
    primary: "#8B67F0",          // 葡萄果凍
    primaryLight: "#C2A8FF",
    secondary: "#3FB4E0",        // 水藍果凍
    background: "#EFE6FF",
    surface: "rgba(255, 255, 255, 0.68)",
    surfaceHover: "rgba(255, 255, 255, 0.82)",
    text: "#2D1B4E",
    textSecondary: "#5E4D86",
    textMuted: "#8A7FA8",
    border: "#FFFFFF",
    shadow: "rgba(60, 40, 120, 0.25)",
    success: "#6FC03A",
    error: "#F06AAE",
    warning: "#F2AE22",
  },
  skin: "glass",
  shape: "circle",
  wallpaper: {
    type: "gradient",
    value:
      "radial-gradient(60% 30% at 15% 8%, #FFFFFFA0 0%, #FFFFFF00 70%), " +
      "radial-gradient(50% 25% at 90% 60%, #FFFFFF66 0%, #FFFFFF00 70%), " +
      "linear-gradient(160deg, #CDB8FF 0%, #A8E6F5 48%, #FFC4E4 100%)",
    blur: 0,
    opacity: 100,
    overlay: "transparent",
  },
  widgets: {
    standardLayout: "pop",
    clockStyle: "mp3",
    habitLayout: "ring",
    // 沒有接受擺位、音樂 widget 仍顯示時，用普普風黑膠
    vinylStyle: "pop",
    polaroidLayout: "window",
    recentChatLayout: "msn",
    styleOverrides: {
      ...themedStyleResets,
      // 半透明白玻璃 + 白框，和桌面其他視窗一致
      ...sideCardStyles(sideCard("rgba(255, 255, 255, 0.68)", "#2D1B4E", { color: "#FFFFFF", width: 1.5 })),
    },
    appIcons: {
      layout: "jelly",
      palette: ["#3FB4E0", "#F06AAE", "#8B67F0", "#6FC03A", "#F2AE22"],
      colorsByLabel: {
        訊息: "#3FB4E0", 角色: "#F06AAE", 設置: "#8B67F0", 使用者: "#6FC03A",
        占卜: "#8B67F0", 遊戲: "#F2AE22", 音樂: "#F06AAE", 空間: "#3FB4E0",
      },
      foregroundColor: "#FFFFFF",
      textColor: "#2D1B4E",
    },
  },
  homeArrangement: {
    minVisibleRows: 41,
    items: [
      { type: "clock", x: 35, y: 2, width: 21, height: 9 },
      { type: "polaroid", x: 35, y: 12, width: 10, height: 10 },
      ...appGrid2x2(12),
      { type: "recent-chat", x: 35, y: 23, width: 21, height: 12 },
      ...appRow(["占卜", "遊戲", "音樂", "空間"], 35),
      { type: "music", hidden: true },
    ],
  },
};

// ===== 極簡黑白・雜誌目錄 =====
// 設計意圖：一頁雜誌。沒有卡片、沒有圖示框，只有細線分隔與大號襯線數字；
// 訊息是引言、照片與音樂並排，App 是編號目錄（01 訊息、02 角色…）。
const monoIndex = (label: string, no: string, x: number, y: number): ThemePackArrangementItem => ({
  type: "fluid-button",
  label,
  x,
  y,
  width: 10,
  height: 3,
  dataPatch: { indexNo: no },
});

const monoPack: ThemePack = {
  id: "mono",
  name: "極簡黑白",
  icon: "mono",
  description: "雜誌排版：大號襯線時間、引言式訊息、編號目錄 App。",
  preview: "linear-gradient(135deg, #F6F5F1 0%, #D8D6D0 55%, #1C1C1A 100%)",
  colors: {
    primary: "#1C1C1A",          // 油墨黑
    // 全站把 primary-light 當淡色選取底、上面疊主色字，所以要是淺灰，不能是深灰
    primaryLight: "#E6E4DE",
    secondary: "#6B6A65",
    background: "#F6F5F1",       // 雜誌內頁紙
    surface: "#FFFFFF",
    surfaceHover: "#EEEDE8",
    text: "#1C1C1A",
    textSecondary: "#5E5D58",
    textMuted: "#9A9893",
    border: "#DAD8D2",
    shadow: "rgba(0, 0, 0, 0.06)",
    success: "#4A5D45",
    error: "#A23B2A",
    warning: "#8A6D2B",
  },
  // 使用者氣泡維持油墨黑，不跟著淺灰 primaryLight 漸層
  bubbleGradient: "linear-gradient(135deg, #1C1C1A, #3A3A37)",
  skin: "flat",
  shape: "square",
  wallpaper: {
    type: "color",
    value: "#F6F5F1",
    blur: 0,
    opacity: 100,
    overlay: "transparent",
  },
  widgets: {
    standardLayout: "classic",
    clockStyle: "masthead",
    habitLayout: "heatmap",
    polaroidLayout: "plain",
    musicLayout: "editorial",
    recentChatLayout: "quote",
    styleOverrides: {
      ...themedStyleResets,
      // 兩側組件由 pack-mono.scss 拿掉底色、只留上緣細線，這裡只要給油墨黑字
      ...sideCardStyles(sideCard("transparent", "#1C1C1A")),
    },
    appIcons: {
      layout: "index",
      palette: ["#F6F5F1"],
      foregroundColor: "#1C1C1A",
      textColor: "#1C1C1A",
    },
  },
  homeArrangement: {
    minVisibleRows: 41,
    items: [
      { type: "clock", x: 35, y: 2, width: 21, height: 8 },
      { type: "recent-chat", x: 35, y: 10, width: 21, height: 9 },
      { type: "polaroid", x: 35, y: 19, width: 8, height: 8 },
      { type: "music", x: 44, y: 19, width: 12, height: 8 },
      monoIndex("訊息", "01", 35, 28),
      monoIndex("角色", "02", 46, 28),
      monoIndex("設置", "03", 35, 31),
      monoIndex("使用者", "04", 46, 31),
      monoIndex("占卜", "05", 35, 34),
      monoIndex("遊戲", "06", 46, 34),
      monoIndex("音樂", "07", 35, 37),
      monoIndex("空間", "08", 46, 37),
      // 右屏：日曆維持原尺寸（拉寬會讓格子變高、最後一週被切掉），
      // 目錄延續編號排在日曆右側與天氣右側，手帳維持在最下方整排
      { type: "calendar", x: 57, y: 2, width: 14, height: 16 },
      { type: "weather", x: 57, y: 19, width: 10, height: 10 },
      { type: "char-journal", x: 57, y: 32, width: 21, height: 8 },
      { ...monoIndex("購物", "09", 71, 2), width: 7 },
      { ...monoIndex("外賣", "10", 71, 5), width: 7 },
      { ...monoIndex("錢包", "11", 71, 8), width: 7 },
      monoIndex("頭盔TA", "12", 68, 19),
      monoIndex("健身", "13", 68, 22),
      monoIndex("世界書", "14", 68, 25),
      monoIndex("小劇場", "15", 68, 28),
      // 左屏：心情日記下方原本兩個圖標的位置改成兩列目錄
      monoIndex("書架", "16", 24, 15),
      monoIndex("閱讀", "17", 24, 18),
    ],
  },
};

// ===== 珍珠畫廊・夜間美術館 =====
// 設計意圖：每個組件都是掛在美術館牆上的展品——
// 黃銅名牌時鐘、金框照片、訊息是展品說明牌、音樂是語音導覽、App 是一顆顆珍珠。
const pearlPack: ThemePack = {
  id: "pearl",
  name: "珍珠畫廊",
  icon: "pearl",
  description: "夜間美術館：黃銅名牌時鐘、金框照片、說明牌與語音導覽。",
  preview: "linear-gradient(135deg, #2B2840 0%, #3E6FB8 45%, #C9A45C 75%, #E9C46A 100%)",
  colors: {
    primary: "#3E6FB8",          // 維梅爾藍
    primaryLight: "#6E95D0",
    secondary: "#C9A45C",        // 畫框金
    background: "#2B2840",       // 展廳夜牆
    surface: "rgba(243, 238, 226, 0.08)",
    surfaceHover: "rgba(243, 238, 226, 0.14)",
    text: "#F3EEE2",             // 畫布白
    textSecondary: "#B9B2CC",
    textMuted: "#8A84A0",
    border: "rgba(201, 164, 92, 0.35)",
    shadow: "rgba(0, 0, 0, 0.5)",
    success: "#8FB98B",
    error: "#E07A6A",
    warning: "#E9C46A",
  },
  skin: "glass",
  shape: "circle",
  wallpaper: {
    type: "gradient",
    // 第一個色碼要是深色，桌布明暗判斷才會認成深色
    value:
      "radial-gradient(80% 30% at 50% 0%, #3A3655 0%, #3A365500 70%), " +
      "repeating-linear-gradient(90deg, #2B2840 0px, #2B2840 26px, #2E2B44 26px, #2E2B44 52px)",
    blur: 0,
    opacity: 100,
    overlay: "transparent",
  },
  widgets: {
    standardLayout: "pearl",
    clockStyle: "plaque",
    habitLayout: "ring",
    worldBookLayout: "pearl",
    polaroidLayout: "gilded",
    musicLayout: "audioguide",
    recentChatLayout: "placard",
    styleOverrides: {
      ...themedStyleResets,
      // 和最近聊天的展品說明牌同一種米白卡紙，掛在深色展牆上
      ...sideCardStyles(sideCard("#F3EEE2", "#2B2840")),
    },
    appIcons: {
      layout: "pearl-orb",
      palette: ["#F4F0E6"],
      foregroundColor: "#2B2840",
      textColor: "#F3EEE2",
    },
  },
  homeArrangement: {
    minVisibleRows: 41,
    items: [
      { type: "clock", x: 39, y: 2, width: 14, height: 6 },
      { type: "polaroid", x: 35, y: 9, width: 12, height: 15 },
      { type: "recent-chat", x: 48, y: 11, width: 8, height: 13 },
      { type: "music", x: 35, y: 25, width: 21, height: 4 },
      ...appRow(["訊息", "角色", "設置", "使用者"], 30),
      ...appRow(["占卜", "遊戲", "音樂", "空間"], 35),
    ],
  },
};

// ===== 線描插畫・速寫本 =====
// 設計意圖：純黑細線畫在白紙上。邊框故意畫得有點歪，像手繪的；
// 手繪錶盤時鐘、山與太陽塗鴉的相框、波形線播放器、有尾巴的對話泡泡。
const lineartPack: ThemePack = {
  id: "lineart",
  name: "線描插畫",
  icon: "lineart",
  description: "速寫本：純黑細線、手繪感歪框、山與太陽的塗鴉。",
  preview: "linear-gradient(135deg, #FFFFFF 0%, #FFFFFF 55%, #1A1A1A 100%)",
  colors: {
    primary: "#1A1A1A",          // 純黑墨線
    // 淡色選取底用淺灰（見極簡黑白）
    primaryLight: "#EDEDED",
    secondary: "#1A1A1A",
    background: "#FFFFFF",       // 純白紙
    surface: "#FFFFFF",
    surfaceHover: "#F5F5F5",
    text: "#1A1A1A",
    textSecondary: "#4A4A4A",
    textMuted: "#9A9A9A",
    border: "#1A1A1A",
    shadow: "rgba(0, 0, 0, 0.08)",
    success: "#1A1A1A",
    error: "#1A1A1A",
    warning: "#1A1A1A",
  },
  bubbleGradient: "linear-gradient(135deg, #1A1A1A, #3D3D3D)",
  skin: "flat",
  shape: "circle",
  wallpaper: {
    type: "color",
    value: "#FFFFFF",
    blur: 0,
    opacity: 100,
    overlay: "transparent",
  },
  widgets: {
    standardLayout: "lineart",
    clockStyle: "sketch",
    habitLayout: "heatmap",
    worldBookLayout: "lineart",
    polaroidLayout: "sketch",
    musicLayout: "sketch",
    recentChatLayout: "sketch",
    styleOverrides: {
      ...themedStyleResets,
      // 白紙黑框，和語錄、待辦等組件的線描外框一致
      ...sideCardStyles(sideCard("#FFFFFF", "#1A1A1A", { color: "#1A1A1A", width: 1.5 })),
    },
    appIcons: {
      layout: "sketch",
      palette: ["#FFFFFF"],
      foregroundColor: "#1A1A1A",
      textColor: "#1A1A1A",
    },
  },
  homeArrangement: {
    minVisibleRows: 41,
    items: [
      { type: "clock", x: 35, y: 2, width: 21, height: 7 },
      { type: "polaroid", x: 35, y: 10, width: 10, height: 10 },
      ...appGrid2x2(10),
      { type: "music", x: 35, y: 21, width: 21, height: 4 },
      { type: "recent-chat", x: 35, y: 26, width: 21, height: 8 },
      ...appRow(["占卜", "遊戲", "音樂", "空間"], 35),
    ],
  },
};

// ===== 手帳拼貼 =====
// 設計意圖：把桌面當成一頁手帳，東西是「貼」上去的，不是排進格子裡。
// - 桌布：米色方格紙；組件不用卡片底，直接拼貼在紙上
// - 時鐘：手寫大字時間 + 撕頁日曆（clockStyle: scrapbook）
// - 拍立得：傾斜擺放 + 紙膠帶 + 下緣手寫標題（polaroidLayout: scrapbook）
// - 最近聊天：黃色便條紙，貼圖變成印章（recentChatLayout: sticky）
// - 音樂：撕線票根（musicLayout: ticket）
// - App：粉彩貼紙底 + 墨色細框，每個 App 一個顏色
// 墨色 #3A302A 與紙色 #F3ECDF 對比約 11:1，字色選擇都過 4.5:1。
const SCRAPBOOK_INK = "#3A302A";
const SCRAPBOOK_PAPER = "#F3ECDF";
const SCRAPBOOK_GRID = "#6E5A4626";

const scrapbookPack: ThemePack = {
  id: "scrapbook",
  name: "手帳拼貼",
  icon: "scrapbook",
  description: "方格紙、紙膠帶、便條紙與票根，把桌面貼成一頁手帳。",
  preview: "linear-gradient(135deg, #F3ECDF 0%, #F4E2A0 55%, #E2A89E 100%)",
  colors: {
    primary: "#B5604A",          // 印章紅
    primaryLight: "#E2A89E",     // 粉紅紙膠帶
    secondary: "#8BA27A",        // 鼠尾草綠紙膠帶
    background: SCRAPBOOK_PAPER, // 方格紙
    surface: "#FFFDF8",          // 拍立得白
    surfaceHover: "#F7EFDF",
    text: SCRAPBOOK_INK,         // 鋼筆墨水
    textSecondary: "#6E6055",
    textMuted: "#A89A8C",
    border: "#E2D6C3",
    shadow: "rgba(70, 50, 30, 0.18)",
    success: "#8BA27A",
    error: "#C0634F",
    warning: "#D9A752",
  },
  skin: "flat",
  shape: "rounded-square",
  wallpaper: {
    type: "gradient",
    // 方格紙：兩組重複細線疊在紙色上。第一個色碼必須是紙色，桌布明暗判斷才會認成淺色
    value:
      `repeating-linear-gradient(0deg, ${SCRAPBOOK_PAPER}00 0 21px, ${SCRAPBOOK_GRID} 21px 22px), ` +
      `repeating-linear-gradient(90deg, ${SCRAPBOOK_PAPER}00 0 21px, ${SCRAPBOOK_GRID} 21px 22px), ` +
      SCRAPBOOK_PAPER,
    blur: 0,
    opacity: 100,
    overlay: "transparent",
  },
  widgets: {
    standardLayout: "classic",
    clockStyle: "scrapbook",
    habitLayout: "list",
    polaroidLayout: "scrapbook",
    musicLayout: "ticket",
    recentChatLayout: "sticky",
    styleOverrides: {
      clock: { backgroundColor: "transparent", foregroundColor: SCRAPBOOK_INK, textColor: SCRAPBOOK_INK, borderColor: undefined },
      polaroid: { backgroundColor: "#FFFDF8", foregroundColor: SCRAPBOOK_INK, borderColor: undefined },
      music: { backgroundColor: "#FFFDF8", foregroundColor: SCRAPBOOK_INK, borderColor: undefined },
      "recent-chat": { backgroundColor: "#F4E2A0", foregroundColor: SCRAPBOOK_INK, borderColor: undefined },
      // 和組件預設外觀一樣的紙白卡；寫出來是為了從其他主題換回來時清掉框線與字色
      ...sideCardStyles(sideCard("#FFFDF8", SCRAPBOOK_INK)),
    },
    appIcons: {
      palette: ["#F2CFC6", "#D7E1C8", "#EADFCC", "#F2E1AE", "#D9D4EA"],
      colorsByLabel: {
        訊息: "#F2CFC6",
        角色: "#D7E1C8",
        設置: "#EADFCC",
        使用者: "#F2E1AE",
        占卜: "#D9D4EA",
        遊戲: "#F2CFC6",
        音樂: "#F2E1AE",
        空間: "#D7E1C8",
        書架: "#D9D4EA",
        閱讀: "#F2E1AE",
        購物: "#F2CFC6",
        外賣: "#EADFCC",
        錢包: "#D7E1C8",
        頭盔TA: "#D9D4EA",
        健身: "#D7E1C8",
        世界書: "#F2E1AE",
        小劇場: "#F2CFC6",
      },
      foregroundColor: SCRAPBOOK_INK,
      textColor: SCRAPBOOK_INK,
      borderColor: SCRAPBOOK_INK,
      borderWidth: 1.5,
    },
  },
  // 中間主頁（x 35–56）：時鐘 → 拍立得 + 便條紙 → 票根 → 兩排 App
  // App 用半格位移，讓 4 個 5 格寬的圖標和上方 21 格寬的組件置中對齊
  homeArrangement: {
    minVisibleRows: 41,
    items: [
      { type: "clock", x: 35, y: 2, width: 21, height: 7 },
      { type: "polaroid", x: 35, y: 10, width: 10, height: 13 },
      { type: "recent-chat", x: 46, y: 10, width: 10, height: 13 },
      { type: "music", x: 35, y: 24, width: 21, height: 5 },
      { type: "fluid-button", label: "訊息", x: 35.5, y: 30, width: 5, height: 5 },
      { type: "fluid-button", label: "角色", x: 40.5, y: 30, width: 5, height: 5 },
      { type: "fluid-button", label: "設置", x: 45.5, y: 30, width: 5, height: 5 },
      { type: "fluid-button", label: "使用者", x: 50.5, y: 30, width: 5, height: 5 },
      { type: "fluid-button", label: "占卜", x: 35.5, y: 35, width: 5, height: 5 },
      { type: "fluid-button", label: "遊戲", x: 40.5, y: 35, width: 5, height: 5 },
      { type: "fluid-button", label: "音樂", x: 45.5, y: 35, width: 5, height: 5 },
      { type: "fluid-button", label: "空間", x: 50.5, y: 35, width: 5, height: 5 },
    ],
  },
};

// ===== 毛玻璃 =====
// 設計意圖：保留原本主頁的結構，只把質感整理乾淨——
// 實心奶油卡換成半透明暖白玻璃，時鐘拿掉外框直接疊在深色桌布上，
// 所有東西用同一種玻璃底與同一種奶白字，整頁只有一個層次。
// - 時鐘：日期在上、細體大字（clockStyle: headline）
// - 拍立得：照片填滿圓角卡片（polaroidLayout: frame）
// - 音樂：正方形三段式（musicLayout: stack），不再中間空一大塊
// - 最近聊天：氣泡版型，貼圖顯示成小標籤
// 玻璃底只靠半透明色、不做背景模糊，換成照片桌布也一樣成立。
// 奶白字 #F4EEE4 疊在玻璃與 #1A1816 桌布上對比約 13:1。
const FROST_TEXT = "#F4EEE4";
const FROST_GLASS = "rgba(255, 248, 236, 0.10)";
const FROST_GLASS_STRONG = "rgba(255, 248, 236, 0.15)";
const FROST_EDGE = "rgba(255, 255, 255, 0.14)";

const frostCard: Partial<WidgetCustomStyle> = {
  backgroundColor: FROST_GLASS,
  backgroundGradient: undefined,
  foregroundColor: FROST_TEXT,
  textColor: FROST_TEXT,
  borderColor: FROST_EDGE,
  borderWidth: 1,
};

const frostPack: ThemePack = {
  id: "frost",
  name: "毛玻璃",
  icon: "frost",
  description: "深色桌布上的半透明暖白玻璃，細體大字時鐘，乾淨整齊。",
  preview: "linear-gradient(135deg, #1A1816 0%, #5C6246 55%, #968A7C 100%)",
  colors: {
    primary: "#9C6E48",          // 焦糖（白字疊上去仍有 4.5:1）
    primaryLight: "#C89B72",
    secondary: "#9AA584",        // 苔綠，呼應桌布右下的光
    background: "#1A1816",
    surface: "rgba(255, 248, 236, 0.10)",
    surfaceHover: "rgba(255, 248, 236, 0.16)",
    text: FROST_TEXT,
    textSecondary: "#C9C0B4",
    textMuted: "#8F877E",
    border: "rgba(255, 255, 255, 0.14)",
    shadow: "rgba(0, 0, 0, 0.35)",
    success: "#9AA584",
    error: "#E08A76",
    warning: "#E2B266",
  },
  skin: "glass",
  shape: "squircle",
  wallpaper: {
    type: "gradient",
    // 深暖灰底，右下一抹苔綠、左上一抹暖灰光。第一個色碼要是深色，桌布明暗判斷才會認成深色
    value:
      "radial-gradient(90% 45% at 88% 96%, #5C62468C 0%, #5C624600 70%), " +
      "radial-gradient(120% 40% at 30% 0%, #968A7C80 0%, #968A7C00 70%), " +
      "#1A1816",
    blur: 0,
    opacity: 100,
    overlay: "transparent",
  },
  widgets: {
    standardLayout: "classic",
    clockStyle: "headline",
    habitLayout: "list",
    polaroidLayout: "frame",
    musicLayout: "stack",
    recentChatLayout: "bubble",
    styleOverrides: {
      clock: { backgroundColor: "transparent", backgroundGradient: undefined, foregroundColor: FROST_TEXT, textColor: FROST_TEXT, borderColor: undefined },
      polaroid: frostCard,
      music: frostCard,
      "recent-chat": frostCard,
      "relationship-counter": frostCard,
      "char-journal": frostCard,
    },
    appIcons: {
      palette: [FROST_GLASS_STRONG],
      foregroundColor: FROST_TEXT,
      textColor: FROST_TEXT,
      borderColor: FROST_EDGE,
      borderWidth: 1,
    },
  },
  // 原本的主頁結構：時鐘、拍立得 + 四個 App、音樂 + 四個 App、最近聊天
  homeArrangement: {
    minVisibleRows: 41,
    items: [
      { type: "clock", x: 35, y: 2, width: 21, height: 7 },
      { type: "polaroid", x: 35, y: 10, width: 10, height: 10 },
      { type: "fluid-button", label: "訊息", x: 46, y: 10, width: 5, height: 5 },
      { type: "fluid-button", label: "角色", x: 51, y: 10, width: 5, height: 5 },
      { type: "fluid-button", label: "設置", x: 46, y: 15, width: 5, height: 5 },
      { type: "fluid-button", label: "使用者", x: 51, y: 15, width: 5, height: 5 },
      { type: "music", x: 35, y: 21, width: 10, height: 10 },
      { type: "fluid-button", label: "占卜", x: 46, y: 21, width: 5, height: 5 },
      { type: "fluid-button", label: "遊戲", x: 51, y: 21, width: 5, height: 5 },
      { type: "fluid-button", label: "音樂", x: 46, y: 26, width: 5, height: 5 },
      { type: "fluid-button", label: "空間", x: 51, y: 26, width: 5, height: 5 },
      { type: "recent-chat", x: 35, y: 32, width: 21, height: 8 },
    ],
  },
};

// ===== 主題包列表 =====
export const themePacks: ThemePack[] = [
  creamPack,
  y2kPack,
  monoPack,
  pearlPack,
  lineartPack,
  scrapbookPack,
  frostPack,
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

// 預設主題包：新使用者、重置主題、預設佈局與新增組件的外觀都以它為準
export const DEFAULT_THEME_PACK: ThemePack = scrapbookPack;

/**
 * 取得指定主題包（找不到時回傳 undefined）。
 */
export function getThemePack(id?: string): ThemePack | undefined {
  if (!id) return undefined;
  return themePacks.find((p) => p.id === id);
}
