// ===== 組件預設外觀 =====
// 預設佈局、新增組件、組件設定面板的「重置」共用同一份預設，
// 避免重置後又變回各組件元件內建的舊配色（黃色便條、藍紫色等）。
// 統一奶油底 + 咖啡字，與 App 圖標同一套白卡質感。
import type { WidgetCustomStyle } from "@/types";

const CARD_BACKGROUND = "#FFFDF9";
const CARD_FOREGROUND = "#5B4636";

// 套用奶油卡片樣式的組件類型
const CARD_WIDGET_TYPES = new Set([
  "clock",
  "focus-timer",
  "todo",
  "mood-diary",
  "quote",
  "polaroid",
  "calendar",
  "weather",
  "music",
  "countdown",
  "recent-chat",
  "companion-pet",
]);

// 預設圖標與其他 App 重複或沒有對應圖標的標籤，改用專屬圖標
const APP_ICON_OVERRIDES: Record<string, string> = {
  占卜: "Moon", // 預設和「空間」同為 Sparkles
  世界書: "Globe", // 預設和「書架」同為 Book
  小劇場: "Film", // 沒有對應圖標，會回退成訊息泡泡
};

/**
 * 取得組件類型的預設 customStyle；沒有預設外觀的類型回傳 undefined（沿用組件內建樣式）。
 * fluid-button 需要傳入 label 以決定專屬圖標。
 */
export function getDefaultWidgetStyle(
  type: string,
  label?: string,
): WidgetCustomStyle | undefined {
  if (type === "fluid-button") {
    const iconName = label ? APP_ICON_OVERRIDES[label] : undefined;
    return {
      backgroundColor: CARD_BACKGROUND,
      foregroundColor: CARD_FOREGROUND,
      ...(iconName ? { iconName } : {}),
    };
  }

  if (!CARD_WIDGET_TYPES.has(type)) return undefined;

  return {
    backgroundColor: CARD_BACKGROUND,
    foregroundColor: CARD_FOREGROUND,
    borderColor: "transparent",
    // 音樂播放器預設用橫條簡約版，黑膠在奶油卡片上太突兀
    ...(type === "music" ? { layout: "compact" } : {}),
  };
}
