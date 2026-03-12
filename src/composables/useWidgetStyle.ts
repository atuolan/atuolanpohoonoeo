import type { WidgetCustomStyle } from "@/types";
import { computed, type ComputedRef } from "vue";

interface WidgetStyleResult {
  containerStyle: ComputedRef<Record<string, string | undefined>>;
  contentStyle: ComputedRef<Record<string, string | undefined>>;
  iconStyle: ComputedRef<Record<string, string | undefined>>;
  hasCustomBackground: ComputedRef<boolean>;
  hasCustomIcon: ComputedRef<boolean>;
}

/**
 * 組件自定義樣式處理 Composable
 * 用於計算組件的容器、內容和圖標樣式
 */
export function useWidgetStyle(
  customStyle?: WidgetCustomStyle,
): WidgetStyleResult {
  // 容器樣式（背景、邊框）
  const containerStyle = computed(() => {
    if (!customStyle) return {};

    const style: Record<string, string | undefined> = {};

    // 漸變背景優先於純色背景
    if (customStyle.backgroundGradient) {
      style.background = customStyle.backgroundGradient;
    } else if (customStyle.backgroundColor) {
      style.backgroundColor = customStyle.backgroundColor;
    }

    // 邊框
    if (customStyle.borderColor) {
      style.borderColor = customStyle.borderColor;
      style.borderStyle = "solid";
    }

    if (customStyle.borderWidth !== undefined) {
      style.borderWidth = `${customStyle.borderWidth}px`;
    }

    return style;
  });

  // 內容樣式（文字顏色）- 優先使用 textColor，回退到 foregroundColor
  const contentStyle = computed(() => {
    if (!customStyle) return {};

    const style: Record<string, string | undefined> = {};

    if (customStyle.textColor) {
      style.color = customStyle.textColor;
    } else if (customStyle.foregroundColor) {
      style.color = customStyle.foregroundColor;
    }

    return style;
  });

  // 圖標樣式
  const iconStyle = computed(() => {
    if (!customStyle) return {};

    const style: Record<string, string | undefined> = {};

    if (customStyle.foregroundColor) {
      style.color = customStyle.foregroundColor;
    }

    return style;
  });

  // 是否有自定義背景
  const hasCustomBackground = computed(() => {
    return !!(customStyle?.backgroundColor || customStyle?.backgroundGradient);
  });

  // 是否有自定義圖標
  const hasCustomIcon = computed(() => {
    return !!(customStyle?.iconName || customStyle?.customIconUrl);
  });

  return {
    containerStyle,
    contentStyle,
    iconStyle,
    hasCustomBackground,
    hasCustomIcon,
  };
}

/**
 * 合併自定義樣式與預設樣式
 */
export function mergeStyles(
  defaultStyle: Record<string, string>,
  customStyle?: Record<string, string | undefined>,
): Record<string, string> {
  if (!customStyle) return defaultStyle;

  const result = { ...defaultStyle };

  for (const [key, value] of Object.entries(customStyle)) {
    if (value !== undefined) {
      result[key] = value;
    }
  }

  return result;
}

/**
 * 獲取圖標源
 * 返回圖標名稱或自定義圖片 URL
 */
export function getIconSource(customStyle?: WidgetCustomStyle): {
  type: "preset" | "custom" | "none";
  value: string | null;
} {
  if (!customStyle) {
    return { type: "none", value: null };
  }

  if (customStyle.iconType === "custom" && customStyle.customIconUrl) {
    return { type: "custom", value: customStyle.customIconUrl };
  }

  if (customStyle.iconName) {
    return { type: "preset", value: customStyle.iconName };
  }

  return { type: "none", value: null };
}
