/**
 * 桌布亮度判斷工具
 * 用於決定文字/圖標應該使用淺色還是深色，以保持與背景的對比
 */

export function parseColorToRgb(
  color: string,
): { r: number; g: number; b: number } | null {
  if (!color) return null;
  const s = color.trim().toLowerCase();

  const hexMatch = s.match(/^#([0-9a-f]{3,8})$/);
  if (hexMatch) {
    const hex = hexMatch[1];
    if (hex.length === 3) {
      return {
        r: parseInt(hex[0] + hex[0], 16),
        g: parseInt(hex[1] + hex[1], 16),
        b: parseInt(hex[2] + hex[2], 16),
      };
    }
    if (hex.length >= 6) {
      return {
        r: parseInt(hex.slice(0, 2), 16),
        g: parseInt(hex.slice(2, 4), 16),
        b: parseInt(hex.slice(4, 6), 16),
      };
    }
  }

  const rgbMatch = s.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (rgbMatch) {
    return { r: +rgbMatch[1], g: +rgbMatch[2], b: +rgbMatch[3] };
  }

  return null;
}

export function getLuminance(r: number, g: number, b: number): number {
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

export function extractFirstColorFromGradient(gradient: string): string | null {
  const hexMatch = gradient.match(/#[0-9a-fA-F]{3,8}/);
  if (hexMatch) return hexMatch[0];
  const rgbMatch = gradient.match(/rgba?\([^)]+\)/);
  if (rgbMatch) return rgbMatch[0];
  return null;
}

/**
 * 判斷一個 CSS 顏色/漸層字串是否為深色
 * 回傳 null 表示無法判斷（例如圖片、pattern 或解析失敗）
 */
/**
 * 正規化 HEX 色碼：自動補 #、展開 #RGB → #RRGGBB
 * 無效時回傳 null
 */
export function normalizeHex(raw: string): string | null {
  if (!raw) return null;
  let s = raw.trim();
  if (!s.startsWith("#")) s = "#" + s;
  const hex = s.slice(1).toLowerCase();
  if (/^[0-9a-f]{3}$/.test(hex)) {
    return "#" + hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
  }
  if (/^[0-9a-f]{6}$/.test(hex)) {
    return "#" + hex;
  }
  return null;
}

/**
 * 將顏色變亮（混合白色），factor 0=原色, 1=純白
 * 輸入必須是 #RRGGBB 格式
 */
export function lightenColor(hex: string, factor: number): string {
  const rgb = parseColorToRgb(hex);
  if (!rgb) return hex;
  const r = Math.round(rgb.r + (255 - rgb.r) * factor);
  const g = Math.round(rgb.g + (255 - rgb.g) * factor);
  const b = Math.round(rgb.b + (255 - rgb.b) * factor);
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

/**
 * 將顏色變暗（混合黑色），factor 0=原色, 1=純黑
 */
export function darkenColor(hex: string, factor: number): string {
  const rgb = parseColorToRgb(hex);
  if (!rgb) return hex;
  const r = Math.round(rgb.r * (1 - factor));
  const g = Math.round(rgb.g * (1 - factor));
  const b = Math.round(rgb.b * (1 - factor));
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

/**
 * RGB → HSL（h: 0-360, s: 0-100, l: 0-100）
 */
export function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0, s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
  }
  return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
}

/**
 * HSL → RGB（r/g/b: 0-255）
 */
export function hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
  h /= 360; s /= 100; l /= 100;
  let r: number, g: number, b: number;
  if (s === 0) {
    r = g = b = l;
  } else {
    const hue2rgb = (p: number, q: number, t: number) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }
  return { r: Math.round(r * 255), g: Math.round(g * 255), b: Math.round(b * 255) };
}

/**
 * 從主色推導完整配色方案（不含 background）
 * 統一配色模式時使用
 */
export function deriveColorsFromPrimary(primary: string): Omit<import("@/stores/theme").ThemeColors, "background"> {
  const rgb = parseColorToRgb(primary);
  if (!rgb) {
    // 無法解析時回傳 soft-pink 預設值（去掉 background）
    return {
      primary,
      primaryLight: lightenColor(primary, 0.3),
      secondary: "#FFD1DC",
      surface: "#FFFFFF",
      surfaceHover: "#FFF0F3",
      text: "#4A4A6A",
      textSecondary: "#7A7A9A",
      textMuted: "#ABABC5",
      border: "#FFE4E9",
      shadow: "rgba(255, 133, 162, 0.15)",
      success: "#7DD3A8",
      error: "#FF7B7B",
      warning: "#FFB74D",
    };
  }
  const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);

  // primaryLight: 原色 +30% 亮度
  const primaryLight = lightenColor(primary, 0.3);

  // secondary: 原色再淡一些 + 色相偏移 10°
  const secH = (hsl.h + 10) % 360;
  const secRgb = hslToRgb(secH, Math.min(hsl.s, 60), Math.min(hsl.l + 20, 92));
  const secondary = `#${secRgb.r.toString(16).padStart(2, "0")}${secRgb.g.toString(16).padStart(2, "0")}${secRgb.b.toString(16).padStart(2, "0")}`;

  // surface: 純白
  const surface = "#FFFFFF";

  // surfaceHover: 主色極淡版
  const surfaceHover = lightenColor(primary, 0.92);

  // text: 深灰（主色色相 + 低飽和 + 低亮度）
  const textRgb = hslToRgb(hsl.h, Math.min(hsl.s * 0.15, 12), 28);
  const text = `#${textRgb.r.toString(16).padStart(2, "0")}${textRgb.g.toString(16).padStart(2, "0")}${textRgb.b.toString(16).padStart(2, "0")}`;

  // textSecondary: 中灰
  const tsRgb = hslToRgb(hsl.h, Math.min(hsl.s * 0.1, 8), 48);
  const textSecondary = `#${tsRgb.r.toString(16).padStart(2, "0")}${tsRgb.g.toString(16).padStart(2, "0")}${tsRgb.b.toString(16).padStart(2, "0")}`;

  // textMuted: 淡灰
  const tmRgb = hslToRgb(hsl.h, Math.min(hsl.s * 0.08, 6), 68);
  const textMuted = `#${tmRgb.r.toString(16).padStart(2, "0")}${tmRgb.g.toString(16).padStart(2, "0")}${tmRgb.b.toString(16).padStart(2, "0")}`;

  // border: 主色極淡
  const border = lightenColor(primary, 0.85);

  // shadow: 主色低透明度
  const shadow = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.15)`;

  // success / error / warning: 通用語義色（不隨主色變）
  const success = "#7DD3A8";
  const error = "#FF7B7B";
  const warning = "#FFB74D";

  return {
    primary,
    primaryLight,
    secondary,
    surface,
    surfaceHover,
    text,
    textSecondary,
    textMuted,
    border,
    shadow,
    success,
    error,
    warning,
  };
}

export function isCssColorDark(value: string): boolean | null {
  if (!value) return null;
  const trimmed = value.trim();
  // 漸層
  if (/gradient\(/i.test(trimmed)) {
    const first = extractFirstColorFromGradient(trimmed);
    if (first) {
      const rgb = parseColorToRgb(first);
      if (rgb) return getLuminance(rgb.r, rgb.g, rgb.b) < 0.5;
    }
    return null;
  }
  // 純色
  const rgb = parseColorToRgb(trimmed);
  if (rgb) return getLuminance(rgb.r, rgb.g, rgb.b) < 0.5;
  return null;
}
