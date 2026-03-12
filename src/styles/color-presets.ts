// ===== 預設色彩庫 =====

// 背景色預設
export const backgroundColors = [
  "transparent", // 透明
  "#ffffff", // 純白
  "#f8fafc", // 淺灰白
  "#fef3c7", // 淺黃
  "#fce7f3", // 淺粉
  "#e0e7ff", // 淺藍紫
  "#ddd6fe", // 淺紫
  "#a7f3d0", // 淺綠
  "#fed7aa", // 淺橙
  "#fecaca", // 淺紅
  "#bae6fd", // 淺天藍
  "#c4b5fd", // 淺薰衣草
  "#fbcfe8", // 淺玫瑰
];

// 漸變色預設
export const gradientPresets = [
  {
    id: "purple-violet",
    value: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
    name: "紫羅蘭",
  },
  {
    id: "sunset",
    value: "linear-gradient(135deg, #f6d365 0%, #fda085 100%)",
    name: "日落",
  },
  {
    id: "mint-sky",
    value: "linear-gradient(135deg, #84fab0 0%, #8fd3f4 100%)",
    name: "薄荷天空",
  },
  {
    id: "peach",
    value: "linear-gradient(135deg, #ffecd2 0%, #fcb69f 100%)",
    name: "蜜桃",
  },
  {
    id: "lavender",
    value: "linear-gradient(135deg, #a18cd1 0%, #fbc2eb 100%)",
    name: "薰衣草",
  },
  {
    id: "ocean",
    value: "linear-gradient(135deg, #667eea 0%, #00d4ff 100%)",
    name: "海洋",
  },
  {
    id: "rose-gold",
    value: "linear-gradient(135deg, #f093fb 0%, #f5576c 100%)",
    name: "玫瑰金",
  },
  {
    id: "emerald",
    value: "linear-gradient(135deg, #11998e 0%, #38ef7d 100%)",
    name: "翡翠",
  },
  {
    id: "coral",
    value: "linear-gradient(135deg, #ff9a9e 0%, #fecfef 100%)",
    name: "珊瑚",
  },
  {
    id: "midnight",
    value: "linear-gradient(135deg, #2c3e50 0%, #4ca1af 100%)",
    name: "午夜",
  },
  {
    id: "candy",
    value: "linear-gradient(135deg, #ffecd2 0%, #fcb69f 50%, #ffecd2 100%)",
    name: "糖果",
  },
  {
    id: "aurora",
    value: "linear-gradient(135deg, #a8edea 0%, #fed6e3 100%)",
    name: "極光",
  },
];

// 前景色（文字/圖標）預設
export const foregroundColors = [
  "#1f2937", // 深灰
  "#374151", // 中深灰
  "#6b7280", // 中灰
  "#ffffff", // 純白
  "#ef4444", // 紅
  "#f97316", // 橙
  "#eab308", // 黃
  "#22c55e", // 綠
  "#3b82f6", // 藍
  "#8b5cf6", // 紫
  "#ec4899", // 粉
  "#06b6d4", // 青
];

// 邊框色預設
export const borderColors = [
  "transparent",
  "rgba(0, 0, 0, 0.1)",
  "rgba(0, 0, 0, 0.25)",
  "rgba(255, 255, 255, 0.3)",
  "#e5e7eb",
  "#d1d5db",
  "#fecaca",
  "#fed7aa",
  "#fef08a",
  "#bbf7d0",
  "#bfdbfe",
  "#ddd6fe",
];

// 色彩主題預設（快速應用）
export const colorThemes = [
  {
    id: "minimal",
    name: "極簡",
    backgroundColor: "#ffffff",
    foregroundColor: "#374151",
    borderColor: "rgba(0, 0, 0, 0.1)",
  },
  {
    id: "warm",
    name: "溫暖",
    backgroundGradient: "linear-gradient(135deg, #ffecd2 0%, #fcb69f 100%)",
    foregroundColor: "#7c2d12",
    borderColor: "transparent",
  },
  {
    id: "cool",
    name: "清涼",
    backgroundGradient: "linear-gradient(135deg, #a8edea 0%, #fed6e3 100%)",
    foregroundColor: "#1e3a5f",
    borderColor: "transparent",
  },
  {
    id: "dreamy",
    name: "夢幻",
    backgroundGradient: "linear-gradient(135deg, #a18cd1 0%, #fbc2eb 100%)",
    foregroundColor: "#ffffff",
    borderColor: "transparent",
  },
  {
    id: "nature",
    name: "自然",
    backgroundGradient: "linear-gradient(135deg, #84fab0 0%, #8fd3f4 100%)",
    foregroundColor: "#065f46",
    borderColor: "transparent",
  },
  {
    id: "sunset",
    name: "夕陽",
    backgroundGradient: "linear-gradient(135deg, #f6d365 0%, #fda085 100%)",
    foregroundColor: "#7c2d12",
    borderColor: "transparent",
  },
];

// 導出所有預設
export const colorPresets = {
  backgrounds: backgroundColors,
  gradients: gradientPresets,
  foregrounds: foregroundColors,
  borders: borderColors,
  themes: colorThemes,
};
