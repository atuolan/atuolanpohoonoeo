// ===== 組件預設外觀 =====
// 預設佈局、新增組件、組件設定面板的「重置」共用同一份預設，
// 避免重置後又變回各組件元件內建的舊配色（黃色便條、藍紫色等）。
// 外觀取自預設主題包（手帳拼貼）：紙白卡片 + 墨色字，App 是粉彩貼紙 + 墨色細框。
import { DEFAULT_THEME_PACK } from "@/styles/theme-packs";
import type { WidgetCustomStyle } from "@/types";

const packWidgets = DEFAULT_THEME_PACK.widgets;
const CARD_BACKGROUND = DEFAULT_THEME_PACK.colors.surface;
const CARD_FOREGROUND = DEFAULT_THEME_PACK.colors.text;

// 套用紙白卡片樣式的組件類型
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
  "relationship-counter",
  "char-journal",
]);

// 預設圖標與其他 App 重複或沒有對應圖標的標籤，改用專屬圖標
const APP_ICON_OVERRIDES: Record<string, string> = {
  占卜: "Moon", // 預設和「空間」同為 Sparkles
  世界書: "Globe", // 預設和「書架」同為 Book
  小劇場: "Film", // 沒有對應圖標，會回退成訊息泡泡
};

// 沒有指定顏色的 App 用標籤算出固定的 palette 位置，同一個 App 每次都是同一色
function appBackground(label?: string): string {
  const icons = packWidgets.appIcons;
  if (!icons) return CARD_BACKGROUND;
  if (label && icons.colorsByLabel?.[label]) return icons.colorsByLabel[label];
  let hash = 0;
  for (const ch of label ?? "") hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return icons.palette[hash % icons.palette.length];
}

/**
 * 取得組件類型的預設 customStyle；沒有預設外觀的類型回傳 undefined（沿用組件內建樣式）。
 * fluid-button 需要傳入 label 以決定專屬圖標與底色。
 */
export function getDefaultWidgetStyle(
  type: string,
  label?: string,
): WidgetCustomStyle | undefined {
  if (type === "fluid-button") {
    const icons = packWidgets.appIcons;
    const iconName = label ? APP_ICON_OVERRIDES[label] : undefined;
    return {
      backgroundColor: appBackground(label),
      foregroundColor: icons?.foregroundColor ?? CARD_FOREGROUND,
      ...(icons?.textColor ? { textColor: icons.textColor } : {}),
      ...(icons?.borderColor
        ? { borderColor: icons.borderColor, borderWidth: icons.borderWidth }
        : {}),
      shape: DEFAULT_THEME_PACK.shape,
      ...(iconName ? { iconName } : {}),
    };
  }

  if (!CARD_WIDGET_TYPES.has(type)) return undefined;

  const style: WidgetCustomStyle = {
    backgroundColor: CARD_BACKGROUND,
    foregroundColor: CARD_FOREGROUND,
    borderColor: "transparent",
    // 主題包為各組件指定的配色（時鐘透明、便條紙黃等）
    ...packWidgets.styleOverrides?.[type],
  };

  // 主題包指定的版型（寫在 customStyle.layout 的部分；時鐘與角色組件的版型在 data）
  if (type === "music" && packWidgets.musicLayout) style.layout = packWidgets.musicLayout;
  if (type === "polaroid" && packWidgets.polaroidLayout) style.layout = packWidgets.polaroidLayout;

  // 值為 undefined 的覆寫（例如拿掉邊框）不要留在物件上
  for (const key of Object.keys(style) as (keyof WidgetCustomStyle)[]) {
    if (style[key] === undefined) delete style[key];
  }
  return style;
}

/** 預設主題包為組件指定、寫在 data 上的設定（時鐘樣式、角色組件版型） */
export function getDefaultWidgetData(type: string): Record<string, string> {
  if (type === "clock") return { clockStyle: packWidgets.clockStyle };
  if (type === "recent-chat" && packWidgets.recentChatLayout) {
    return { layout: packWidgets.recentChatLayout };
  }
  return {};
}
