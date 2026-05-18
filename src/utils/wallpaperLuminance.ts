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
