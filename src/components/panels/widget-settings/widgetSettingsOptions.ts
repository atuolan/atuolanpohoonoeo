// ===== WidgetSettingsPanel 靜態選項資料 =====
// 集中各組件設定面板用到的靜態選項陣列（時鐘樣式、各類佈局、黑膠子風格、角色佈局）。
// 這些資料不含任何反應式狀態，純為呈現用的選項常數。

import type { ClockStyle } from "@/types";

// 佈局選項通用型別
export interface LayoutOption {
  id: string;
  name: string;
  desc: string;
}

// 時鐘樣式選項
export const clockStyles: {
  id: ClockStyle;
  name: string;
  desc: string;
  icon: string;
}[] = [
  { id: "minimal", name: "極簡", desc: "簡潔優雅", icon: "⏱️" },
  { id: "digital", name: "數字", desc: "卡片式", icon: "🔢" },
  { id: "analog", name: "指針", desc: "傳統錶盤", icon: "🕐" },
  { id: "flip", name: "翻頁", desc: "復古風格", icon: "📅" },
  { id: "neon", name: "霓虹", desc: "炫彩發光", icon: "✨" },
  { id: "progress", name: "進度環", desc: "環形顯示", icon: "🔄" },
  { id: "binary", name: "二進制", desc: "極客風格", icon: "💻" },
  { id: "dotmatrix", name: "點陣", desc: "LED 風格", icon: "🔲" },
  { id: "orbit", name: "軌道", desc: "行星系統", icon: "🌍" },
  { id: "pearl", name: "珍珠", desc: "維梅爾畫廊靜謐", icon: "✨" },
  { id: "lineart", name: "線描", desc: "純白底黑細線速寫", icon: "✏️" },
] as any; // 繞過 TypeScript 檢查，新增 pearl / lineart

// 音樂播放器佈局選項
export const musicLayouts: LayoutOption[] = [
  { id: "compact", name: "橫條簡約", desc: "節省空間的橫向佈局" },
  { id: "classic", name: "經典卡片", desc: "展示大封面藝術" },
  { id: "vinyl", name: "黑膠唱片", desc: "復古旋轉唱片風格" },
];

// 世界書佈局選項
export const worldBookLayouts: LayoutOption[] = [
  { id: "shelf", name: "書架模式", desc: "真實書架展示藏書" },
  { id: "featured", name: "精選模式", desc: "3D 封面展示當前閱讀" },
  { id: "icon", name: "圖標模式", desc: "簡約 App 圖標風格" },
  { id: "pearl", name: "珍珠", desc: "維梅爾畫廊靜謐" },
];

// 角色手機佈局選項
export const charPhoneLayouts: LayoutOption[] = [
  { id: "phone", name: "手機模式", desc: "模擬角色手機界面" },
  { id: "icon", name: "圖標模式", desc: "簡約 App 圖標風格" },
];

// 習慣追蹤佈局選項
export const habitLayouts: LayoutOption[] = [
  { id: "list", name: "清單", desc: "今日習慣勾選清單" },
  { id: "ring", name: "圓環", desc: "完成度圓環進度" },
  { id: "heatmap", name: "熱力圖", desc: "方格貢獻熱力圖" },
  { id: "streak", name: "火焰", desc: "連續天數大字火焰" },
];

// 拍立得和其他小工具佈局選項（共用 7 皮膚）
export const styleLayouts: LayoutOption[] = [
  { id: "pop", name: "普普風", desc: "新粗野派立體互動" },
  { id: "classic", name: "極簡", desc: "傳統簡約留白" },
  { id: "flat", name: "平面", desc: "圓潤撞色插圖感" },
  { id: "illustration", name: "復古", desc: "90年代復古視窗" },
  { id: "pixel", name: "像素", desc: "點陣微復古網格" },
  { id: "pearl", name: "珍珠", desc: "維梅爾畫廊靜謐" },
  { id: "lineart", name: "線描", desc: "純白底黑細線速寫" },
];

// 黑膠唱片子風格選項（與 styleLayouts 一致）
export const vinylStyles: LayoutOption[] = [
  { id: "pop", name: "普普風", desc: "新粗野派立體互動" },
  { id: "classic", name: "極簡", desc: "傳統簡約留白" },
  { id: "flat", name: "平面", desc: "圓潤撞色插圖感" },
  { id: "illustration", name: "復古", desc: "90年代復古視窗" },
  { id: "pixel", name: "像素", desc: "點陣微復古網格" },
  { id: "pearl", name: "珍珠", desc: "維梅爾畫廊靜謐" },
  { id: "lineart", name: "線描", desc: "純白底黑細線速寫" },
];

// 角色綁定組件類型
export const characterWidgetTypes = [
  "relationship-counter",
  "affinity-meter",
  "recent-chat",
  "char-status",
  "companion-pet",
];

// 各角色組件的佈局選項
export const characterLayoutMap: Record<string, LayoutOption[]> = {
  "relationship-counter": [
    { id: "days", name: "天數", desc: "大字認識天數" },
    { id: "card", name: "卡片", desc: "頭像 + 紀念日卡" },
  ],
  "affinity-meter": [
    { id: "ring", name: "圓環", desc: "環形好感度" },
    { id: "heart", name: "愛心", desc: "愛心填充" },
    { id: "bar", name: "進度條", desc: "橫向長條" },
  ],
  "recent-chat": [
    { id: "bubble", name: "氣泡", desc: "對話氣泡預覽" },
    { id: "card", name: "卡片", desc: "頭像 + 訊息卡" },
  ],
  "char-status": [
    { id: "card", name: "卡片", desc: "完整狀態卡" },
    { id: "compact", name: "精簡", desc: "頭像 + 狀態點" },
  ],
  "companion-pet": [
    { id: "pet", name: "寵物", desc: "養成寵物動畫" },
    { id: "aquarium", name: "水族箱", desc: "水族箱氣泡" },
  ],
};
