import type { ChatAppearance } from "@/types/chat";
import { hexToRgba } from "@/utils/chatScreenHelpers";

type ChatWallpaper = NonNullable<ChatAppearance["wallpaper"]>;
type FontFamilyId = NonNullable<ChatAppearance["font"]>["family"];

/** 聊天字體樣式 → 實際 font-family（設定彈窗預覽與聊天頁共用，避免兩邊不一致） */
export const CHAT_FONT_STACKS: Record<FontFamilyId, string> = {
  system: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Noto Sans TC", sans-serif',
  // Huninn（jf 粉圓）由 index.html 從 Google Fonts 載入，含繁中字形
  rounded: '"Huninn", "Nunito", "Noto Sans TC", -apple-system, sans-serif',
  serif: '"Noto Serif TC", Georgia, serif',
  mono: 'ui-monospace, "SF Mono", Menlo, Consolas, "Noto Sans Mono", monospace',
};

export const CHAT_FONT_SIZE_MIN = 12;
export const CHAT_FONT_SIZE_MAX = 20;
export const CHAT_FONT_SIZE_DEFAULT = 15;

const FONT_SIZE_BY_NAME: Record<string, number> = { small: 14, medium: 15, large: 17 };

/** 字體大小：新格式存 "16px"，舊格式存 small / medium / large */
export function resolveChatFontSizePx(size: unknown): number {
  if (typeof size === "string" && size.endsWith("px")) {
    const px = parseInt(size, 10);
    if (Number.isFinite(px)) return px;
  }
  if (typeof size === "string" && size in FONT_SIZE_BY_NAME) return FONT_SIZE_BY_NAME[size];
  return CHAT_FONT_SIZE_DEFAULT;
}

export function resolveAvatarRadius(shape: string): string {
  return shape === "circle" ? "50%" : shape === "square" ? "8px" : "16px";
}

export function resolveAvatarSize(size: string): string {
  return size === "small" ? "36px" : size === "medium" ? "48px" : "64px";
}

/**
 * 聊天桌布是否「跟隨全域桌布」。
 * 舊版會把全域桌布的 blob: 網址直接複製進聊天，重開 App 後網址失效，
 * 這類資料一律視為跟隨全域。
 */
export function isFollowingGlobalWallpaper(wallpaper?: Pick<ChatWallpaper, "type" | "value">): boolean {
  if (!wallpaper) return false;
  if (wallpaper.type === "global-image") return true;
  return wallpaper.type === "image" && (!wallpaper.value || wallpaper.value.startsWith("blob:"));
}

const NIGHT_BUBBLE_VARS: Record<string, string> = {
  "--bubble-user-bg": "#2a4a3a",
  "--bubble-user-text": "#e0f0e8",
  "--bubble-user-text-gradient": "none",
  "--bubble-user-text-fill": "#e0f0e8",
  "--bubble-ai-bg": "#1e2a40",
  "--bubble-ai-text": "#d8d8e8",
  "--bubble-ai-text-gradient": "none",
  "--bubble-ai-text-fill": "#d8d8e8",
  "--bubble-ai-content": "#d8d8e8",
  "--bubble-ai-content-gradient": "none",
  "--bubble-ai-content-fill": "#d8d8e8",
  // 淺色背景用的引用色（如 #8b5a2b）在深色氣泡上對比過低
  "--chat-md-quote": "#e8b88a",
};

/** 所有可能由聊天外觀寫到聊天容器上的 CSS 變數（清除時以此為準） */
export const ALL_CHAT_APPEARANCE_PROPS = [
  "--color-primary",
  "--color-primary-light",
  "--color-background",
  "--color-surface",
  "--color-surface-hover",
  "--color-text",
  "--color-text-secondary",
  "--color-text-muted",
  "--color-secondary",
  "--color-border",
  "--color-shadow",
  "--color-success",
  "--color-error",
  "--color-warning",
  "--chat-header-surface",
  "--chat-header-text",
  "--chat-header-text-secondary",
  "--bubble-user-bg",
  "--bubble-user-text",
  "--bubble-user-text-gradient",
  "--bubble-user-text-fill",
  "--bubble-ai-bg",
  "--bubble-ai-text",
  "--bubble-ai-text-gradient",
  "--bubble-ai-text-fill",
  "--bubble-ai-content",
  "--bubble-ai-content-gradient",
  "--bubble-ai-content-fill",
  "--bubble-radius",
  "--bubble-max-width",
  "--thought-bg",
  "--thought-text",
  "--thought-text-gradient",
  "--thought-text-fill",
  "--thought-glow-1",
  "--thought-glow-2",
  "--thought-glow-3",
  "--avatar-border-radius",
  "--avatar-size",
  "--avatar-border-width",
  "--avatar-border-color",
  "--avatar-shadow",
  "--chat-wallpaper",
  "--chat-wallpaper-blur",
  "--chat-wallpaper-opacity",
  "--chat-wallpaper-fit",
  "--chat-wallpaper-repeat",
  "--chat-font-size",
  "--chat-font-family",
  "--chat-line-height",
  "--chat-letter-spacing",
  "--chat-md-italic",
  "--chat-md-bold",
  "--chat-md-underline",
  "--chat-md-strikethrough",
  "--chat-md-highlight",
  "--chat-md-quote",
  "--chat-md-code",
  "--chat-md-heading",
] as const;

export interface GlobalWallpaperInfo {
  type?: string;
  value?: string;
}

function toImageWallpaper(imageUrl: string | undefined): string {
  if (imageUrl && (imageUrl.startsWith("data:") || imageUrl.startsWith("blob:") || imageUrl.startsWith("http"))) {
    return `url("${imageUrl}")`;
  }
  return "var(--wallpaper-value, var(--color-background))";
}

function resolveWallpaperValue(wallpaper: ChatWallpaper, globalWallpaper: GlobalWallpaperInfo): string {
  if (isFollowingGlobalWallpaper(wallpaper)) {
    return globalWallpaper.type === "image"
      ? toImageWallpaper(globalWallpaper.value)
      : "var(--wallpaper-value, var(--color-background))";
  }
  if (wallpaper.type === "image") return toImageWallpaper(wallpaper.value);
  if (wallpaper.type === "time-theme") {
    return "var(--time-theme-bg, var(--wallpaper-value, var(--color-background)))";
  }
  return wallpaper.value || "var(--wallpaper-value, var(--color-background))";
}

/**
 * 把聊天外觀轉成要寫到聊天容器上的 CSS 變數。
 * 夜間模式只保留版面類設定（字體、圓角、寬度、頭像），顏色與桌布交給夜間配色。
 */
export function buildChatAppearanceVars(
  appearance: ChatAppearance | undefined,
  options: { nightMode: boolean; globalWallpaper: GlobalWallpaperInfo },
): Record<string, string> {
  const vars: Record<string, string> = options.nightMode ? { ...NIGHT_BUBBLE_VARS } : {};
  if (!appearance?.useCustom) return vars;

  const { avatar, bubble, font, colors, wallpaper } = appearance;

  if (avatar) {
    vars["--avatar-border-radius"] = resolveAvatarRadius(avatar.shape);
    vars["--avatar-size"] = resolveAvatarSize(avatar.size);
    vars["--avatar-border-width"] = `${avatar.borderWidth}px`;
    if (avatar.borderColor) vars["--avatar-border-color"] = avatar.borderColor;
    vars["--avatar-shadow"] = avatar.shadowEnabled ? "0 4px 12px var(--color-shadow)" : "none";
  }

  if (bubble) {
    vars["--bubble-radius"] = `${bubble.borderRadius}px`;
    vars["--bubble-max-width"] = `${bubble.maxWidth}%`;
  }

  if (font) {
    vars["--chat-font-size"] = `${resolveChatFontSizePx(font.size)}px`;
    vars["--chat-font-family"] = CHAT_FONT_STACKS[font.family] ?? CHAT_FONT_STACKS.system;
    vars["--chat-line-height"] = `${font.lineHeight ?? 1.6}`;
    vars["--chat-letter-spacing"] = `${font.letterSpacing ?? 0}px`;
  }

  if (options.nightMode) return vars;

  if (colors) {
    vars["--color-primary"] = colors.primary;
    vars["--color-primary-light"] = colors.primaryLight;
    const optionalColors = [
      ["background", ["--color-background"]],
      ["surface", ["--color-surface", "--chat-header-surface"]],
      ["surfaceHover", ["--color-surface-hover"]],
      ["text", ["--color-text", "--chat-header-text"]],
      ["textSecondary", ["--color-text-secondary", "--chat-header-text-secondary"]],
      ["textMuted", ["--color-text-muted"]],
      ["secondary", ["--color-secondary"]],
      ["border", ["--color-border"]],
      ["shadow", ["--color-shadow"]],
      ["success", ["--color-success"]],
      ["error", ["--color-error"]],
      ["warning", ["--color-warning"]],
    ] as const;
    for (const [key, cssVars] of optionalColors) {
      const value = colors[key];
      if (!value) continue;
      for (const cssVar of cssVars) vars[cssVar] = value;
    }
  }

  if (bubble) {
    const aiContent = bubble.aiContentColor ?? bubble.aiTextColor;
    const textVars = (prefix: string, color: string, gradient?: string) => {
      vars[prefix] = color;
      vars[`${prefix}-gradient`] = gradient || "none";
      vars[`${prefix}-fill`] = gradient ? "transparent" : color;
    };
    vars["--bubble-user-bg"] = bubble.userBgGradient || bubble.userBgColor;
    textVars("--bubble-user-text", bubble.userTextColor, bubble.userTextGradient);
    vars["--bubble-ai-bg"] = bubble.aiBgGradient || bubble.aiBgColor;
    textVars("--bubble-ai-text", bubble.aiTextColor, bubble.aiTextGradient);
    textVars("--bubble-ai-content", aiContent, bubble.aiContentGradient);

    const thoughtBg = bubble.thoughtBgColor ?? "#ADD8E6";
    const glow = bubble.thoughtGlowColor ?? "#ADD8E6";
    const glowOpacity = bubble.thoughtGlowOpacity ?? 0.6;
    vars["--thought-bg"] = bubble.thoughtBgGradient || hexToRgba(thoughtBg, 0.9);
    textVars("--thought-text", bubble.thoughtTextColor ?? "#4a6572", bubble.thoughtTextGradient);
    vars["--thought-glow-1"] = hexToRgba(glow, glowOpacity);
    vars["--thought-glow-2"] = hexToRgba(glow, glowOpacity * 0.6);
    vars["--thought-glow-3"] = hexToRgba(glow, glowOpacity * 0.3);
  }

  if (wallpaper) {
    const fit = wallpaper.fit || "cover";
    vars["--chat-wallpaper"] = resolveWallpaperValue(wallpaper, options.globalWallpaper);
    vars["--chat-wallpaper-blur"] = `${wallpaper.blur ?? 0}px`;
    vars["--chat-wallpaper-opacity"] = `${(wallpaper.opacity ?? 100) / 100}`;
    vars["--chat-wallpaper-fit"] = fit === "repeat" ? "auto" : fit === "fill" ? "100% 100%" : fit;
    vars["--chat-wallpaper-repeat"] = fit === "repeat" ? "repeat" : "no-repeat";
  }

  const mc = font?.markdownColors;
  if (mc) {
    vars["--chat-md-italic"] = mc.italic || "#8b7355";
    vars["--chat-md-bold"] = mc.bold || "#4a4a6a";
    vars["--chat-md-underline"] = mc.underline || "#8b2942";
    vars["--chat-md-strikethrough"] = mc.strikethrough || "#999999";
    vars["--chat-md-highlight"] = mc.highlight || "#fff3cd";
    vars["--chat-md-quote"] = mc.quote || "#8b5a2b";
    vars["--chat-md-code"] = mc.code || "#e83e8c";
    vars["--chat-md-heading"] = mc.heading || "#4a4a6a";
  }

  return vars;
}
