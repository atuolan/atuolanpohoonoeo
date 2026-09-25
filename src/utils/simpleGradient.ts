import { lightenColor, normalizeHex } from "@/utils/wallpaperLuminance";

/**
 * 聊天外觀設定用的「雙色線性漸層」小工具：
 * 格式固定為 linear-gradient(<角度>deg, <起始色>, <結束色>)
 */

const DEFAULT_ANGLE = 135;

/** <input type="color"> 只接受 #rrggbb，其他格式（rgba、#fff）轉換或改用備援色 */
export function toPickerHex(value: string | undefined, fallback: string): string {
  return (value && normalizeHex(value)) || normalizeHex(fallback) || "#000000";
}

export function getGradientStop(gradient: string, index: 0 | 1): string {
  const matches = gradient.match(/#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b/g);
  const hex = matches?.[index] && normalizeHex(matches[index]);
  if (hex) return hex;
  return index === 0 ? "#ffffff" : "#cccccc";
}

export function getGradientAngle(gradient: string): number {
  const match = gradient.match(/(-?\d+(?:\.\d+)?)deg/);
  return match ? Math.round(parseFloat(match[1])) : DEFAULT_ANGLE;
}

export function buildLinearGradient(angle: number, start: string, end: string): string {
  return `linear-gradient(${angle}deg, ${start}, ${end})`;
}

/** 由單一顏色產生預設漸層：結束色比起始色略淡 */
export function createGradientFrom(base: string): string {
  const start = toPickerHex(base, "#ffffff");
  return buildLinearGradient(DEFAULT_ANGLE, start, lightenColor(start, 0.3));
}

export function setGradientStop(gradient: string, index: 0 | 1, color: string): string {
  const stops = [getGradientStop(gradient, 0), getGradientStop(gradient, 1)];
  stops[index] = color;
  return buildLinearGradient(getGradientAngle(gradient), stops[0], stops[1]);
}

export function setGradientAngle(gradient: string, angle: number): string {
  return buildLinearGradient(angle, getGradientStop(gradient, 0), getGradientStop(gradient, 1));
}
