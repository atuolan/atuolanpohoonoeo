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
  { id: "scrapbook", name: "手帳", desc: "手寫時間 + 撕頁日曆", icon: "📔" },
  { id: "headline", name: "大字", desc: "日期在上、細體大字", icon: "🔠" },
  { id: "pastry", name: "甜點櫃", desc: "圓形錶盤卡（奶油風）", icon: "🧁" },
  { id: "mp3", name: "MP3", desc: "液晶螢幕 + 觸控轉盤（Y2K）", icon: "💿" },
  { id: "masthead", name: "刊頭", desc: "雜誌刊頭大字（極簡黑白）", icon: "📰" },
  { id: "plaque", name: "名牌", desc: "黃銅名牌（珍珠畫廊）", icon: "🏛️" },
  { id: "sketch", name: "速寫", desc: "手繪錶盤（線描）", icon: "✏️" },
] as any; // 繞過 TypeScript 檢查，新增 pearl / lineart

// 音樂播放器佈局選項
export const musicLayouts: LayoutOption[] = [
  { id: "compact", name: "橫條簡約", desc: "節省空間的橫向佈局" },
  { id: "classic", name: "經典卡片", desc: "展示大封面藝術" },
  { id: "vinyl", name: "黑膠唱片", desc: "復古旋轉唱片風格" },
  { id: "ticket", name: "手帳票根", desc: "撕線票根拼貼風" },
  { id: "stack", name: "方塊", desc: "正方形格子用的三段式" },
  { id: "capsule", name: "膠囊", desc: "圓潤播放條（奶油風）" },
  { id: "editorial", name: "雜誌", desc: "細線與襯線字（極簡黑白）" },
  { id: "audioguide", name: "語音導覽", desc: "美術館導覽機（珍珠畫廊）" },
  { id: "sketch", name: "速寫", desc: "手繪波形線（線描）" },
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

// 拍立得額外多一個手帳拼貼樣式（其他共用皮膚的組件沒有這個版型）
export const polaroidLayouts: LayoutOption[] = [
  ...styleLayouts,
  { id: "scrapbook", name: "拼貼", desc: "紙膠帶 + 手寫標題" },
  { id: "frame", name: "滿版", desc: "照片填滿圓角卡片" },
  { id: "round", name: "圓形", desc: "圓形照片（奶油風）" },
  { id: "window", name: "視窗", desc: "我的相片視窗（Y2K）" },
  { id: "plain", name: "素面", desc: "灰底方形（極簡黑白）" },
  { id: "gilded", name: "金框", desc: "金框油畫（珍珠畫廊）" },
  { id: "sketch", name: "速寫", desc: "手繪相框（線描）" },
];

// App 圖標（fluid-button）的主題版型；default 代表內建圓角圖標（清掉 customStyle.layout）
export const appLayouts: LayoutOption[] = [
  { id: "default", name: "預設", desc: "內建圓角圖標" },
  { id: "macaron", name: "馬卡龍", desc: "圓形粉彩馬卡龍（奶油風）" },
  { id: "jelly", name: "果凍", desc: "亮面果凍泡泡（Y2K）" },
  { id: "index", name: "目錄", desc: "編號文字目錄列（極簡黑白，適合 10×3 長條格）" },
  { id: "pearl-orb", name: "珍珠", desc: "金線環珍珠（珍珠畫廊）" },
  { id: "sketch", name: "速寫", desc: "手繪歪圓框（線描）" },
];

// App 圖標可切換的目標 App（label 決定點擊後開啟的頁面與預設圖標；與 AddWidgetPanel 的 APP 清單一致）
export const appTargets: string[] = [
  "訊息", "設置", "空間", "音樂", "健身", "錢包", "相冊", "收藏", "遊戲",
  "外賣", "購物", "世界書", "角色", "使用者", "頭盔TA", "閱讀", "書架", "占卜",
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
  "char-journal",
];

// 各角色組件的佈局選項
export const characterLayoutMap: Record<string, LayoutOption[]> = {
  "relationship-counter": [
    { id: "days", name: "天數", desc: "大字認識天數" },
    { id: "card", name: "卡片", desc: "頭像 + 紀念日卡" },
    { id: "milestone", name: "紀念日", desc: "天數 + 里程碑 + 約定" },
  ],
  "affinity-meter": [
    { id: "ring", name: "圓環", desc: "環形好感度" },
    { id: "heart", name: "愛心", desc: "愛心填充" },
    { id: "bar", name: "進度條", desc: "橫向長條" },
  ],
  "recent-chat": [
    { id: "bubble", name: "氣泡", desc: "對話氣泡預覽" },
    { id: "card", name: "卡片", desc: "頭像 + 訊息卡" },
    { id: "sticky", name: "便條紙", desc: "手帳拼貼便利貼" },
    { id: "speech", name: "對話泡泡", desc: "圓潤泡泡（奶油風）" },
    { id: "msn", name: "MSN", desc: "千禧對話視窗（Y2K）" },
    { id: "quote", name: "引言", desc: "雜誌引言（極簡黑白）" },
    { id: "placard", name: "說明牌", desc: "展品說明牌（珍珠畫廊）" },
    { id: "sketch", name: "速寫", desc: "手繪對話泡泡（線描）" },
  ],
  "char-status": [
    { id: "card", name: "卡片", desc: "完整狀態卡" },
    { id: "compact", name: "精簡", desc: "頭像 + 狀態點" },
  ],
  "companion-pet": [
    { id: "pet", name: "寵物", desc: "養成寵物動畫" },
    { id: "aquarium", name: "水族箱", desc: "水族箱氣泡" },
  ],
  "char-journal": [
    { id: "journal", name: "手帳", desc: "日記心情 + 行程" },
  ],
};
