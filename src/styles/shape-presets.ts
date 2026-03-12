// 圖標形狀預設
export interface ShapePreset {
  id: string;
  name: string;
  // CSS border-radius（用於圓角類形狀）
  borderRadius?: string;
  // CSS clip-path（用於多邊形/特殊形狀）
  clipPath?: string;
  // 預覽用的 SVG path（用於設定面板中的形狀預覽）
  previewPath: string;
}

export const shapePresets: ShapePreset[] = [
  {
    id: "blob",
    name: "流體",
    borderRadius: "62% 38% 45% 55% / 52% 58% 42% 48%",
    previewPath:
      "M22,10 C26,4 34,4 38,10 C42,16 42,24 38,30 C34,36 26,36 22,30 C18,24 18,16 22,10Z",
  },
  {
    id: "circle",
    name: "圓形",
    borderRadius: "50%",
    previewPath: "M30,6 A24,24 0 1,1 30,54 A24,24 0 1,1 30,6Z",
  },
  {
    id: "square",
    name: "正方形",
    borderRadius: "4px",
    previewPath: "M8,8 H52 V52 H8Z",
  },
  {
    id: "rounded-square",
    name: "圓角方形",
    borderRadius: "22%",
    previewPath:
      "M18,8 H42 A10,10 0 0,1 52,18 V42 A10,10 0 0,1 42,52 H18 A10,10 0 0,1 8,42 V18 A10,10 0 0,1 18,8Z",
  },
  {
    id: "ellipse",
    name: "橢圓形",
    borderRadius: "50% / 40%",
    previewPath: "M30,12 A22,16 0 1,1 30,48 A22,16 0 1,1 30,12Z",
  },
  {
    id: "star",
    name: "星形",
    clipPath:
      "polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%)",
    previewPath:
      "M30,4 L36,22 L54,22 L40,33 L45,51 L30,40 L15,51 L20,33 L6,22 L24,22Z",
  },
  {
    id: "diamond",
    name: "菱形",
    clipPath: "polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)",
    previewPath: "M30,6 L54,30 L30,54 L6,30Z",
  },
  {
    id: "petal",
    name: "花瓣",
    borderRadius: "50% 0% 50% 0%",
    previewPath:
      "M30,6 A24,24 0 0,1 54,30 A24,24 0 0,0 30,54 A24,24 0 0,1 6,30 A24,24 0 0,0 30,6Z",
  },
  {
    id: "hexagon",
    name: "六角形",
    clipPath: "polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%)",
    previewPath: "M15,6 L45,6 L54,30 L45,54 L15,54 L6,30Z",
  },
  {
    id: "shield",
    name: "盾牌",
    clipPath: "polygon(50% 0%, 100% 10%, 100% 60%, 50% 100%, 0% 60%, 0% 10%)",
    previewPath: "M30,4 L54,10 L54,36 L30,56 L6,36 L6,10Z",
  },
  {
    id: "heart",
    name: "愛心",
    clipPath:
      "polygon(50% 15%, 60% 0%, 75% 0%, 95% 15%, 100% 35%, 50% 95%, 0% 35%, 5% 15%, 25% 0%, 40% 0%)",
    previewPath:
      "M30,16 C30,8 42,4 48,14 C54,24 30,48 30,48 C30,48 6,24 12,14 C18,4 30,8 30,16Z",
  },
  {
    id: "cloud",
    name: "雲朵",
    borderRadius: "50% 50% 50% 50% / 60% 60% 40% 40%",
    previewPath:
      "M15,36 A12,12 0 0,1 21,18 A12,12 0 0,1 39,15 A12,12 0 0,1 51,27 A9,9 0 0,1 48,42Z",
  },
];

/**
 * 根據形狀 ID 獲取 CSS 樣式
 */
export function getShapeStyle(shapeId?: string): Record<string, string> {
  if (!shapeId) return {};

  const preset = shapePresets.find((s) => s.id === shapeId);
  if (!preset) return {};

  const style: Record<string, string> = {};

  if (preset.clipPath) {
    style.clipPath = preset.clipPath;
    style.borderRadius = "0";
  } else if (preset.borderRadius) {
    style.borderRadius = preset.borderRadius;
  }

  return style;
}
