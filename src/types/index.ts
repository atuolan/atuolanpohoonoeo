// ===== 核心類型導出 =====
// 世界書類型
export * from "./worldinfo";
// 角色卡類型
export * from "./character";
// 提示詞類型
export * from "./prompt";
// 提示詞管理器類型
export * from "./promptManager";
// 聊天類型
export * from "./chat";
// 設定類型
export * from "./settings";
// 表情包類型
export * from "./sticker";
// 重要事件類型
export * from "./importantEvents";
// 日記類型
export * from "./diary";
// 噗浪空間類型
export * from "./qzone";
// 圖片緩存類型
export * from "./imageCache";
// 來電功能類型
export * from "./incomingCall";
// 通知類型
export * from "./notification";
// 健身類型
export * from "./fitness";
// 遊戲類型
export * from "./game";
// 外賣物流類型
export * from "./waimaiDelivery";
// 塔羅占卜類型
export * from "./fate";
// ===== 小組件類型 =====
export type WidgetType =
  | "clock"
  | "weather"
  | "calendar"
  | "app-folder"
  | "music"
  | "mood-diary"
  | "polaroid"
  | "todo"
  | "quote"
  | "sticker"
  | "countdown"
  | "bookmark"
  | "fluid-button" // 霓虹流體按鈕
  | "habit-tracker" // 習慣追蹤器
  | "focus-timer" // 專注計時器
  | "world-book" // 世界書組件
  | "char-phone"; // 角色手機組件

// ===== 時鐘樣式類型 =====
export type ClockStyle =
  | "minimal" // 極簡時鐘
  | "digital" // 數字時鐘
  | "analog" // 模擬時鐘（指針）
  | "flip" // 翻頁時鐘
  | "neon" // 霓虹時鐘
  | "progress" // 進度環時鐘
  | "binary" // 二進制時鐘
  | "dotmatrix" // 點陣時鐘
  | "orbit"; // 軌道時鐘

// ===== 組件自定義樣式 =====
export interface WidgetCustomStyle {
  backgroundColor?: string; // 背景色
  backgroundGradient?: string; // 漸變背景
  foregroundColor?: string; // 圖標顏色
  textColor?: string; // 文字顏色（獨立於圖標）
  borderColor?: string; // 邊框色
  borderWidth?: number; // 邊框寬度
  iconType?: "preset" | "custom"; // 圖標類型
  iconName?: string; // 預設圖標名稱
  customIconUrl?: string; // 自定義圖標 URL（Base64）
  iconSize?: number; // 圖標大小百分比 (30-80)
  layout?: string; // 組件佈局風格
  vinylStyle?: string; // 黑膠唱片子風格 (dark/pop)
  shape?: string; // 圖標形狀 ID（blob/circle/square/rounded-square/ellipse/star/diamond/petal/hexagon/shield/heart/cloud）
}

// 小組件實例
export interface WidgetInstance {
  id: string;
  type: WidgetType;
  x: number; // 網格 X 座標
  y: number; // 網格 Y 座標
  width: number; // 網格寬度
  height: number; // 網格高度
  zIndex: number; // 層級
  data: WidgetData; // 組件特定數據
}

// 組件數據（包含自定義樣式）
export interface WidgetData {
  customStyle?: WidgetCustomStyle;
  [key: string]: any;
}

// ===== 畫布狀態 =====
export interface CanvasState {
  widgets: WidgetInstance[];
  gridSize: number; // 16px
  canvasWidth: number; // 畫布寬度（像素）
  scrollX: number; // 當前滾動位置
  isEditMode: boolean; // 是否在編輯模式
}

// ===== 主題類型 =====
export type ThemePreset =
  | "minimal-light"
  | "minimal-dark"
  | "neon"
  | "cute"
  | "glass";

export interface ThemeColors {
  background: string;
  surface: string;
  text: string;
  textSecondary: string;
  primary: string;
  accent: string;
  // 霓虹主題專用
  neonCyan?: string;
  neonMagenta?: string;
  neonViolet?: string;
}

// ===== 時間段 =====
export type TimePhase =
  | "dawn"
  | "morning"
  | "afternoon"
  | "evening"
  | "night"
  | "midnight";

// ===== Dock 項目 =====
export interface DockItem {
  id: string;
  icon: string;
  label: string;
  action: () => void;
}

// ===== 主題配置類型（DB 使用） =====
export interface ColorConfig {
  primary: string;
  secondary: string;
  background: string;
  surface: string;
  textPrimary: string;
  textSecondary: string;
  bubbleUserBg: string;
  bubbleCharBg: string;
  bubbleUserBlur: string;
  bubbleCharBlur: string;
  [key: string]: string;
}

export interface FontConfig {
  family: string;
  sizeBase: number;
  weightNormal: number;
  weightBold: number;
}

export interface WallpaperConfig {
  type: "color" | "gradient" | "image";
  value: string;
  blur: number;
  opacity: number;
}

export interface IconConfig {
  pack: string;
  size: number;
  radius: number;
}

export interface AnimationConfig {
  transitionFast: string;
  transitionNormal: string;
  transitionSlow: string;
  enableAnimations: boolean;
}

export interface ThemeConfig {
  id: string;
  name: string;
  preset: ThemePreset;
  isActive: boolean;
  colors: ColorConfig;
  fonts: FontConfig;
  wallpaper: WallpaperConfig;
  icons: IconConfig;
  animations: AnimationConfig;
  createdAt: number;
  updatedAt: number;
}

// ===== 佈局配置 =====
export interface LayoutConfig {
  id: string;
  name: string;
  isActive: boolean;
  widgets: WidgetInstance[];
  gridSize: number;
  canvasWidth: number;
  createdAt: number;
  updatedAt: number;
}

// ===== 角色好感度 =====
// 類型已遷移至 src/schemas/affinity.ts，使用 Zod 定義
// 此處保留 re-export 以維持向後相容
export type {
  CharacterAffinityConfig,
  ChatAffinityState,
  AffinityMetricConfig,
  AffinityStage,
  AffinityChangeRecord,
} from "@/schemas/affinity";

/**
 * @deprecated 使用 CharacterAffinityConfig 替代
 */
export interface CharacterAffection {
  characterId: string;
  level: number;
  points: number;
  enabled: boolean;
  lastInteraction: number;
  lastUpdated?: number;
  milestones: string[];
}
