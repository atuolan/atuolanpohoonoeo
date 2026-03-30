import { defineStore } from "pinia";
import { computed, ref, watch } from "vue";

/**
 * 從 CSS 顏色字串解析 RGB 值
 * 支援 #hex, #rrggbb, rgb(), rgba()
 */
function parseColorToRgb(
  color: string,
): { r: number; g: number; b: number } | null {
  if (!color) return null;
  const s = color.trim().toLowerCase();

  // #rgb or #rrggbb
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

  // rgb(r, g, b) or rgba(r, g, b, a)
  const rgbMatch = s.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (rgbMatch) {
    return { r: +rgbMatch[1], g: +rgbMatch[2], b: +rgbMatch[3] };
  }

  return null;
}

/**
 * 計算相對亮度 (0=黑, 1=白)
 * 使用 W3C 相對亮度公式
 */
function getLuminance(r: number, g: number, b: number): number {
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

/**
 * 從漸層字串中提取第一個顏色
 */
function extractFirstColorFromGradient(gradient: string): string | null {
  // 匹配 #hex
  const hexMatch = gradient.match(/#[0-9a-fA-F]{3,8}/);
  if (hexMatch) return hexMatch[0];
  // 匹配 rgb/rgba
  const rgbMatch = gradient.match(/rgba?\([^)]+\)/);
  if (rgbMatch) return rgbMatch[0];
  return null;
}

/**
 * 從圖片 URL 採樣平均亮度（異步）
 * 取四角 + 中心的平均值
 */
function sampleImageBrightness(url: string): Promise<number> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        const size = 32; // 縮小採樣，節省性能
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(0.5);
          return;
        }
        ctx.drawImage(img, 0, 0, size, size);
        const data = ctx.getImageData(0, 0, size, size).data;
        let totalLum = 0;
        const pixelCount = size * size;
        for (let i = 0; i < data.length; i += 4) {
          totalLum += getLuminance(data[i], data[i + 1], data[i + 2]);
        }
        resolve(totalLum / pixelCount);
      } catch {
        // CORS 或其他錯誤，回退到中性值
        resolve(0.5);
      }
    };
    img.onerror = () => resolve(0.5);
    img.src = url;
  });
}

// ===== 主題類型定義 =====
export type ThemeStyle = "soft" | "neon" | "glass" | "minimal";

export interface ThemeColors {
  primary: string; // 主色
  primaryLight: string; // 主色淺
  secondary: string; // 次色
  background: string; // 背景色
  surface: string; // 表面色（卡片等）
  surfaceHover: string; // 懸停色
  text: string; // 主文字
  textSecondary: string; // 次要文字
  textMuted: string; // 弱化文字
  border: string; // 邊框色
  shadow: string; // 陰影色
  success: string; // 成功色
  error: string; // 錯誤色
  warning: string; // 警告色
}

export interface AvatarStyle {
  shape: "circle" | "square" | "rounded"; // 形狀
  size: "small" | "medium" | "large"; // 大小
  borderWidth: number; // 邊框寬度
  borderColor: string; // 邊框顏色
  shadowEnabled: boolean; // 是否啟用陰影
}

export interface BubbleStyle {
  userBgColor: string; // 用戶氣泡背景
  userBgGradient: string; // 用戶氣泡漸層
  userTextColor: string; // 用戶氣泡文字
  aiBgColor: string; // AI 氣泡背景
  aiTextColor: string; // AI 氣泡文字
  borderRadius: number; // 圓角大小 (px)
  maxWidth: number; // 最大寬度 (%)
  showAvatar: boolean; // 是否顯示頭像
}

export interface WallpaperStyle {
  type: "color" | "gradient" | "image" | "pattern" | "time-theme";
  value: string; // 顏色值/漸層/圖片URL（time-theme 時忽略）
  blur: number; // 模糊度 (0-20)
  opacity: number; // 透明度 (0-100)
  overlay: string; // 疊加層顏色
  fit?: "cover" | "contain" | "fill" | "repeat"; // 圖片顯示模式
}

// ===== 預設主題配色 =====
// 粉紅馬卡龍配色
const softPinkTheme: ThemeColors = {
  primary: "#FF85A2", // 柔和粉紅
  primaryLight: "#FFB6C8", // 淡粉紅
  secondary: "#FFD1DC", // 淺粉紅
  background: "#FFF8F5", // 暖白背景
  surface: "#FFFFFF",
  surfaceHover: "#FFF0F3", // 淡粉色懸停
  text: "#4A4A6A", // 深灰偏暖
  textSecondary: "#7A7A9A",
  textMuted: "#ABABC5",
  border: "#FFE4E9", // 淡粉邊框
  shadow: "rgba(255, 133, 162, 0.15)", // 粉紅陰影
  success: "#7DD3A8",
  error: "#FF7B7B",
  warning: "#FFB74D",
};

// 薄荷綠馬卡龍配色
const softMintGreenTheme: ThemeColors = {
  primary: "#7DD3A8", // 柔和薄荷綠
  primaryLight: "#C7FCBB", // 淡薄荷綠
  secondary: "#A8E6CF", // 淡薄荷綠
  background: "#F5FFF8", // 淡綠背景
  surface: "#FFFFFF",
  surfaceHover: "#E8F8E5", // 淡綠色懸停
  text: "#4A5568", // 深灰偏冷
  textSecondary: "#718096",
  textMuted: "#A0AEC0",
  border: "#D4F5E9", // 淡薄荷邊框
  shadow: "rgba(125, 211, 168, 0.2)", // 薄荷綠陰影
  success: "#68D391",
  error: "#FC8181",
  warning: "#F6AD55",
};

const softPurpleTheme: ThemeColors = {
  primary: "#B388FF",
  primaryLight: "#D4BBFF",
  secondary: "#FF85A2",
  background: "#F8F5FF",
  surface: "#FFFFFF",
  surfaceHover: "#F3EEFF",
  text: "#4A4A6A",
  textSecondary: "#7A7A9A",
  textMuted: "#ABABC5",
  border: "#E8DEFF",
  shadow: "rgba(179, 136, 255, 0.15)",
  success: "#7DD3A8",
  error: "#FF7B7B",
  warning: "#FFB74D",
};

const softMintTheme: ThemeColors = {
  primary: "#5DD3B3",
  primaryLight: "#8FE8D0",
  secondary: "#FFB74D",
  background: "#F5FFFC",
  surface: "#FFFFFF",
  surfaceHover: "#EDFFF9",
  text: "#4A5A5A",
  textSecondary: "#7A8A8A",
  textMuted: "#ABB5B5",
  border: "#D5F5EC",
  shadow: "rgba(93, 211, 179, 0.15)",
  success: "#5DD3B3",
  error: "#FF7B7B",
  warning: "#FFB74D",
};

const softPeachTheme: ThemeColors = {
  primary: "#FFAB91",
  primaryLight: "#FFCCBC",
  secondary: "#90CAF9",
  background: "#FFFAF5",
  surface: "#FFFFFF",
  surfaceHover: "#FFF5EE",
  text: "#5A4A4A",
  textSecondary: "#8A7A7A",
  textMuted: "#B5ABAB",
  border: "#FFE0D0",
  shadow: "rgba(255, 171, 145, 0.15)",
  success: "#7DD3A8",
  error: "#FF7B7B",
  warning: "#FFAB91",
};

const softBlueTheme: ThemeColors = {
  primary: "#64B5F6",
  primaryLight: "#90CAF9",
  secondary: "#FF8A80",
  background: "#F5FAFF",
  surface: "#FFFFFF",
  surfaceHover: "#EEF6FF",
  text: "#4A4A5A",
  textSecondary: "#7A7A8A",
  textMuted: "#ABABB5",
  border: "#D0E8FF",
  shadow: "rgba(100, 181, 246, 0.15)",
  success: "#7DD3A8",
  error: "#FF7B7B",
  warning: "#FFB74D",
};

// ===== 預設主題列表 =====
export const themePresets: Record<string, ThemeColors> = {
  "soft-pink": softPinkTheme,
  "soft-purple": softPurpleTheme,
  "soft-mint": softMintTheme,
  "soft-mint-green": softMintGreenTheme,
  "soft-peach": softPeachTheme,
  "soft-blue": softBlueTheme,
};

// ===== 預設頭像樣式 =====
const defaultAvatarStyle: AvatarStyle = {
  shape: "rounded",
  size: "medium",
  borderWidth: 2,
  borderColor: "#FFFFFF",
  shadowEnabled: true,
};

// ===== 預設氣泡樣式 =====
const defaultBubbleStyle: BubbleStyle = {
  userBgColor: "#FF85A2",
  userBgGradient: "linear-gradient(135deg, #FF85A2, #FFB6C8)",
  userTextColor: "#FFFFFF",
  aiBgColor: "#FFFFFF",
  aiTextColor: "#4A4A6A",
  borderRadius: 20,
  maxWidth: 75,
  showAvatar: true,
};

// ===== 全局字體覆蓋 =====
export interface GlobalFontOverride {
  enabled: boolean; // 是否啟用
  importUrl: string; // @import CSS URL（如 https://fontsapi.zeoseven.com/793/main/result.css）
  fontFamily: string; // font-family 名稱（如 "BoutiqueBitmap9x9 Square Dot"）
  fontWeight: string; // font-weight（如 "normal"、"bold"）
  source: "zeoseven" | "google" | "custom"; // 字體來源
  fontSize: number; // 全局字體大小比例 (50-200, 預設 100 = 不變)
  letterSpacing: number; // 字距 (-2 ~ 10, 預設 0)
  lineHeight: number; // 行高 (1.0 ~ 3.0, 預設 0 = 不覆蓋)
}

const defaultGlobalFont: GlobalFontOverride = {
  enabled: false,
  importUrl: "",
  fontFamily: "",
  fontWeight: "normal",
  source: "custom",
  fontSize: 100,
  letterSpacing: 0,
  lineHeight: 0,
};

// ===== 預設桌布樣式 =====
const defaultWallpaperStyle: WallpaperStyle = {
  type: "time-theme",
  value: "",
  blur: 0,
  opacity: 100,
  overlay: "transparent",
};

// 夜晚模式配色
const nightModeColors: ThemeColors = {
  primary: "#7DD3A8",
  primaryLight: "#A8E6CF",
  secondary: "#FF85A2",
  background: "#1a1a2e",
  surface: "#16213e",
  surfaceHover: "#1f2a4a",
  text: "#eaeaea",
  textSecondary: "#a0a0a0",
  textMuted: "#808080",
  border: "#2a2a4a",
  shadow: "rgba(0, 0, 0, 0.3)",
  success: "#7DD3A8",
  error: "#FF7B7B",
  warning: "#FFB74D",
};

// ===== Theme Store =====
export const useThemeStore = defineStore("theme", () => {
  // 當前主題風格
  const currentStyle = ref<ThemeStyle>("soft");

  // 當前顏色預設
  const currentPreset = ref<string>("soft-pink");

  // 自定義顏色（覆蓋預設）
  const customColors = ref<Partial<ThemeColors>>({});

  // 夜晚模式狀態（從 settings store 同步）
  const nightMode = ref<boolean>(false);

  // 頭像樣式
  const avatarStyle = ref<AvatarStyle>({ ...defaultAvatarStyle });

  // 氣泡樣式
  const bubbleStyle = ref<BubbleStyle>({ ...defaultBubbleStyle });

  // 桌布樣式
  const wallpaperStyle = ref<WallpaperStyle>({ ...defaultWallpaperStyle });

  // 自訂 CSS
  const customCSS = ref<string>("");

  // 響應式當前小時，每整點更新一次，讓 time-theme 的 computed 能自動重算
  const currentHour = ref(new Date().getHours());
  function _scheduleHourUpdate() {
    const now = new Date();
    const msUntilNextHour =
      (60 - now.getMinutes()) * 60 * 1000 -
      now.getSeconds() * 1000 -
      now.getMilliseconds();
    setTimeout(() => {
      currentHour.value = new Date().getHours();
      _scheduleHourUpdate();
    }, msUntilNextHour);
  }
  _scheduleHourUpdate();

  // 全局字體覆蓋
  const globalFont = ref<GlobalFontOverride>({ ...defaultGlobalFont });

  // 夜晚模式氣泡配色
  const nightBubbleOverride: BubbleStyle = {
    userBgColor: "#2a4a3a",
    userBgGradient: "",
    userTextColor: "#e0f0e8",
    aiBgColor: "#1e2a40",
    aiTextColor: "#d8d8e8",
    borderRadius: 20,
    maxWidth: 75,
    showAvatar: true,
  };

  // ===== 桌布亮度檢測 =====
  // 圖片桌布的亮度值（異步採樣後更新）
  const imageBrightness = ref<number | null>(null);

  // 監聽桌布變化，對圖片類型進行亮度採樣
  watch(
    () => ({
      type: wallpaperStyle.value.type,
      value: wallpaperStyle.value.value,
    }),
    async (w) => {
      if (w.type === "image" && w.value) {
        imageBrightness.value = await sampleImageBrightness(w.value);
      } else {
        imageBrightness.value = null;
      }
    },
    { immediate: true },
  );

  /**
   * 桌布是否為深色
   * 根據實際桌布顏色/圖片亮度判斷，而非僅依賴時間
   * 用於決定桌面圖標和文字應該用淺色還是深色
   */
  const isWallpaperDark = computed<boolean>(() => {
    const w = wallpaperStyle.value;

    // time-theme：跟隨時間判斷
    if (w.type === "time-theme") {
      // 夜間模式開啟時一定是深色
      if (nightMode.value) return true;
      // 否則根據當前小時判斷（currentHour 每分鐘更新，確保響應式）
      return currentHour.value >= 20 || currentHour.value < 5;
    }

    // 純色桌布
    if (w.type === "color") {
      const rgb = parseColorToRgb(w.value);
      if (rgb) return getLuminance(rgb.r, rgb.g, rgb.b) < 0.5;
    }

    // 漸層桌布：取第一個顏色判斷
    if (w.type === "gradient") {
      const firstColor = extractFirstColorFromGradient(w.value);
      if (firstColor) {
        const rgb = parseColorToRgb(firstColor);
        if (rgb) return getLuminance(rgb.r, rgb.g, rgb.b) < 0.5;
      }
    }

    // 圖片桌布：使用異步採樣結果
    if (w.type === "image") {
      if (imageBrightness.value !== null) {
        return imageBrightness.value < 0.5;
      }
      // 還沒採樣完成，回退到夜間模式判斷
      return nightMode.value;
    }

    // pattern 或其他：回退到夜間模式
    return nightMode.value;
  });

  // 計算當前主題顏色（預設 + 自定義 + 夜晚模式）
  const colors = computed<ThemeColors>(() => {
    // 如果啟用夜晚模式，完全使用夜晚配色，無視自定義
    if (nightMode.value) {
      return { ...nightModeColors };
    }

    // 否則使用正常主題配色
    const preset = themePresets[currentPreset.value] || softPinkTheme;
    return { ...preset, ...customColors.value };
  });

  // 計算 CSS 變數對象
  const cssVariables = computed(() => {
    const c = colors.value;
    const a = avatarStyle.value;
    const b = nightMode.value ? nightBubbleOverride : bubbleStyle.value;
    const w = wallpaperStyle.value;

    return {
      // 顏色變數
      "--color-primary": c.primary,
      "--color-primary-light": c.primaryLight,
      "--color-secondary": c.secondary,
      "--color-background": c.background,
      "--color-surface": c.surface,
      "--color-surface-hover": c.surfaceHover,
      "--color-text": c.text,
      "--color-text-secondary": c.textSecondary,
      "--color-text-muted": c.textMuted,
      "--color-border": c.border,
      "--color-shadow": c.shadow,
      "--color-success": c.success,
      "--color-error": c.error,
      "--color-warning": c.warning,

      // 頭像變數
      "--avatar-border-radius":
        a.shape === "circle" ? "50%" : a.shape === "square" ? "8px" : "16px",
      "--avatar-size":
        a.size === "small" ? "36px" : a.size === "medium" ? "48px" : "64px",
      "--avatar-border-width": `${a.borderWidth}px`,
      "--avatar-border-color": a.borderColor,
      "--avatar-shadow": a.shadowEnabled ? `0 4px 12px ${c.shadow}` : "none",

      // 氣泡變數
      "--bubble-user-bg": b.userBgGradient || b.userBgColor,
      "--bubble-user-text": b.userTextColor,
      "--bubble-ai-bg": b.aiBgColor,
      "--bubble-ai-text": b.aiTextColor,
      "--bubble-radius": `${b.borderRadius}px`,
      "--bubble-max-width": `${b.maxWidth}%`,

      // 想法發光效果（夜晚模式用較暗的藍紫光）
      "--thought-glow-1": nightMode.value
        ? "rgba(100, 140, 200, 0.4)"
        : "rgba(173, 216, 230, 0.6)",
      "--thought-glow-2": nightMode.value
        ? "rgba(100, 140, 200, 0.25)"
        : "rgba(173, 216, 230, 0.4)",
      "--thought-glow-3": nightMode.value
        ? "rgba(100, 140, 200, 0.12)"
        : "rgba(173, 216, 230, 0.2)",

      // 桌布變數
      // time-theme 類型會在 WhiteboardCanvas 中動態覆蓋
      // 夜晚模式強制使用深色背景
      "--wallpaper-value": nightMode.value
        ? c.background
        : w.type === "time-theme"
          ? "var(--time-theme-bg, #FAFAFA)"
          : w.type === "color"
            ? w.value
            : w.type === "gradient"
              ? w.value
              : w.type === "image"
                ? `url("${w.value}")`
                : w.value,
      "--wallpaper-is-time-theme": nightMode.value
        ? "0"
        : w.type === "time-theme"
          ? "1"
          : "0",
      "--wallpaper-blur": `${w.blur}px`,
      "--wallpaper-opacity": `${w.opacity / 100}`,
      "--wallpaper-overlay": w.overlay,
      "--wallpaper-fit":
        w.fit === "repeat"
          ? "auto"
          : w.fit === "fill"
            ? "100% 100%"
            : w.fit || "cover",
      "--wallpaper-repeat": w.fit === "repeat" ? "repeat" : "no-repeat",

      // 安全區域
      "--safe-top": "env(safe-area-inset-top, 0px)",
      "--safe-bottom": "0px",
      "--safe-left": "env(safe-area-inset-left, 0px)",
      "--safe-right": "env(safe-area-inset-right, 0px)",

      // 通用變數
      "--radius-sm": "8px",
      "--radius-md": "12px",
      "--radius-lg": "16px",
      "--radius-xl": "24px",
      "--radius-full": "9999px",
      "--transition-fast": "0.15s cubic-bezier(0.34, 1.56, 0.64, 1)",
      "--transition-normal": "0.25s cubic-bezier(0.34, 1.56, 0.64, 1)",
      "--transition-slow": "0.4s cubic-bezier(0.34, 1.56, 0.64, 1)",
      "--shadow-sm": `0 2px 8px ${c.shadow}`,
      "--shadow-md": `0 4px 16px ${c.shadow}`,
      "--shadow-lg": `0 8px 32px ${c.shadow}`,
    };
  });

  // 應用 CSS 變數到 :root
  function applyTheme() {
    const root = document.documentElement;
    const vars = cssVariables.value;

    // Debug: 輸出桌布變數
    console.log("[Theme] Applying wallpaper:", {
      type: wallpaperStyle.value.type,
      value: wallpaperStyle.value.value,
      cssVar: vars["--wallpaper-value"],
    });

    Object.entries(vars).forEach(([key, value]) => {
      root.style.setProperty(key, value);
    });

    // 應用自訂 CSS
    applyCustomCSS();

    // 應用全局字體
    applyGlobalFont();
  }

  // 應用自訂 CSS
  // 為了穿透 Vue scoped 樣式，自動提升選擇器特異性
  function applyCustomCSS() {
    const styleId = "aguaphone-custom-css";
    let styleEl = document.getElementById(styleId) as HTMLStyleElement | null;

    if (!customCSS.value.trim()) {
      if (styleEl) {
        styleEl.remove();
      }
      return;
    }

    // 放在 body 末尾確保載入順序最後
    if (!styleEl) {
      styleEl = document.createElement("style");
      styleEl.id = styleId;
      document.body.appendChild(styleEl);
    }

    // 自動提升特異性以穿透 Vue scoped
    const boosted = boostCSSSpecificity(customCSS.value);
    styleEl.textContent = boosted;
  }

  /**
   * 提升 CSS 特異性：在非全局選擇器前加 #app
   * 處理：註解跳過、@media 巢狀、:root/html/body 保留、逗號分隔選擇器
   */
  function boostCSSSpecificity(css: string): string {
    // 先移除註解，記錄位置以便還原
    // 用佔位符替換註解，避免註解內的 {} 干擾分塊
    const comments: string[] = [];
    const stripped = css.replace(/\/\*[\s\S]*?\*\//g, (match) => {
      const idx = comments.length;
      comments.push(match);
      return `/*__COMMENT_${idx}__*/`;
    });

    const boosted = boostBlocks(stripped);

    // 還原註解
    return boosted.replace(/\/\*__COMMENT_(\d+)__\*\//g, (_, idx) => {
      return comments[parseInt(idx)];
    });
  }

  /** 對頂層 CSS 區塊進行特異性提升 */
  function boostBlocks(css: string): string {
    const blocks = splitTopLevelBlocks(css);
    const result: string[] = [];

    for (const block of blocks) {
      const trimmed = block.trimStart();
      if (!trimmed) continue;

      // 純註解佔位符，直接保留
      if (/^\/\*__COMMENT_\d+__\*\/\s*$/.test(trimmed)) {
        result.push(block);
        continue;
      }

      // @media / @supports：保留 at-rule 本身，但提升內部規則
      if (/^@media\b|^@supports\b/.test(trimmed)) {
        const firstBrace = trimmed.indexOf("{");
        if (firstBrace === -1) {
          result.push(block);
          continue;
        }
        const atSelector = trimmed.substring(0, firstBrace + 1);
        const inner = extractInnerContent(trimmed, firstBrace);
        const boostedInner = boostBlocks(inner);
        result.push(`${atSelector}\n${boostedInner}\n}`);
        continue;
      }

      // @keyframes / @font-face / @import / @layer：完全保留
      if (/^@/.test(trimmed)) {
        result.push(block);
        continue;
      }

      // :root / html / body 開頭的選擇器：保留不動
      if (/^(:root|html|body)\b/.test(trimmed)) {
        result.push(block);
        continue;
      }

      // 一般規則：提升選擇器特異性
      const firstBrace = trimmed.indexOf("{");
      if (firstBrace === -1) {
        result.push(block);
        continue;
      }

      const selector = trimmed.substring(0, firstBrace).trim();
      const body = trimmed.substring(firstBrace);

      // 逗號分隔的多選擇器
      const boostedSelectors = selector.split(",").map((s) => {
        const sel = s.trim();
        if (!sel) return sel;
        // 已有 #app 前綴就不重複加
        if (sel.startsWith("#app")) return sel;
        // :root / html / body 開頭的子選擇器也保留
        if (/^(:root|html|body)\b/.test(sel)) return sel;
        return `#app ${sel}`;
      });

      result.push(`${boostedSelectors.join(",\n")} ${body}`);
    }

    return result.join("\n\n");
  }

  /** 按頂層大括號分割 CSS 區塊（已去除註解） */
  function splitTopLevelBlocks(css: string): string[] {
    const blocks: string[] = [];
    let braceCount = 0;
    let blockStart = 0;

    for (let i = 0; i < css.length; i++) {
      const ch = css[i];
      if (ch === "{") {
        braceCount++;
      } else if (ch === "}") {
        braceCount--;
        if (braceCount === 0) {
          blocks.push(css.substring(blockStart, i + 1).trim());
          blockStart = i + 1;
        }
      }
    }
    // 尾部剩餘（可能是註解或空白）
    const tail = css.substring(blockStart).trim();
    if (tail) blocks.push(tail);
    return blocks;
  }

  /** 提取 @media { ... } 內部內容（不含最外層大括號） */
  function extractInnerContent(block: string, openBraceIdx: number): string {
    // 找到對應的最後一個 }
    let depth = 0;
    let endIdx = block.length - 1;
    for (let i = openBraceIdx; i < block.length; i++) {
      if (block[i] === "{") depth++;
      else if (block[i] === "}") {
        depth--;
        if (depth === 0) {
          endIdx = i;
          break;
        }
      }
    }
    return block.substring(openBraceIdx + 1, endIdx).trim();
  }

  // 應用全局字體覆蓋
  function applyGlobalFont() {
    const fontStyleId = "aguaphone-global-font";
    let styleEl = document.getElementById(
      fontStyleId,
    ) as HTMLStyleElement | null;

    const f = globalFont.value;

    // 判斷是否有任何字體相關設定需要套用
    const hasFontFamily = f.enabled && f.fontFamily.trim();
    const hasFontSize = f.fontSize !== 100;
    const hasLetterSpacing = f.letterSpacing !== 0;
    const hasLineHeight = f.lineHeight > 0;
    const hasAnyOverride =
      hasFontFamily || hasFontSize || hasLetterSpacing || hasLineHeight;

    if (!hasAnyOverride) {
      if (styleEl) styleEl.remove();
      return;
    }

    if (!styleEl) {
      styleEl = document.createElement("style");
      styleEl.id = fontStyleId;
      document.head.appendChild(styleEl);
    }

    let css = "";
    if (hasFontFamily && f.importUrl.trim()) {
      const url = f.importUrl.trim();
      // 判斷是否為字體檔案直連（.ttf, .otf, .woff, .woff2）
      // 支援 URL 末尾有查詢參數的情況
      const fontFileMatch = url.match(/\.(ttf|otf|woff2?)(?:\?.*)?$/i);
      if (fontFileMatch) {
        const formatMap: Record<string, string> = {
          ttf: "truetype",
          otf: "opentype",
          woff: "woff",
          woff2: "woff2",
        };
        const fmt = formatMap[fontFileMatch[1].toLowerCase()] || "truetype";
        const fontName = f.fontFamily.trim();

        // 使用 FontFace API 載入字體（更可靠）
        try {
          const existingFonts = document.fonts;
          // 移除之前載入的同名字體
          existingFonts.forEach((font) => {
            if (font.family === fontName || font.family === `"${fontName}"`) {
              existingFonts.delete(font);
            }
          });
          const fontFace = new FontFace(fontName, `url("${url}")`, {
            weight: f.fontWeight || "normal",
            style: "normal",
            display: "swap",
          });
          fontFace
            .load()
            .then((loaded) => {
              document.fonts.add(loaded);
              console.log(`[Theme] Font "${fontName}" loaded via FontFace API`);
            })
            .catch((err) => {
              console.warn(`[Theme] FontFace API load failed:`, err);
            });
        } catch (err) {
          console.warn(
            `[Theme] FontFace API not supported, using @font-face CSS:`,
            err,
          );
        }

        // 同時也寫入 @font-face CSS 作為備用
        css += `@font-face {\n  font-family: "${fontName}";\n  src: url("${url}") format("${fmt}");\n  font-weight: ${f.fontWeight || "normal"};\n  font-style: normal;\n  font-display: swap;\n}\n`;
      } else {
        // CSS 樣式表 URL（Google Fonts / ZeoSeven 等）
        css += `@import url("${url}");\n`;
      }
    }

    // font-size 套用：設置 CSS 變量並應用到非桌面區域
    if (hasFontSize && f.fontSize !== 100) {
      const scale = f.fontSize / 100;
      // 設置 CSS 變量
      css += `:root { --global-font-scale: ${scale}; }\n`;

      // 只針對非桌面的內容區域應用縮放
      // 使用 :not() 排除桌面相關的類
      css += `
        /* 排除桌面（WhiteboardCanvas）和 Dock，只縮放其他內容 */
        body > #app > *:not(.whiteboard-canvas):not(.neon-wheel-dock):not(.minimized-indicator) {
          font-size: ${scale * 100}% !important;
        }
      `;
    }

    const bodyRules: string[] = [];
    if (hasFontFamily) {
      bodyRules.push(
        `font-family: "${f.fontFamily.trim()}", sans-serif !important`,
      );
      bodyRules.push(`font-weight: ${f.fontWeight || "normal"}`);
    }
    if (hasLetterSpacing) {
      bodyRules.push(`letter-spacing: ${f.letterSpacing}px !important`);
    }
    if (hasLineHeight) {
      bodyRules.push(`line-height: ${f.lineHeight} !important`);
    }

    if (bodyRules.length > 0) {
      css += `body, body * { ${bodyRules.join("; ")}; }\n`;
    }

    styleEl.textContent = css;
  }

  // 更新自訂 CSS
  function updateCustomCSS(css: string) {
    customCSS.value = css;
    applyCustomCSS();
    saveToStorage();
  }

  // 更新全局字體覆蓋
  function updateGlobalFont(updates: Partial<GlobalFontOverride>) {
    globalFont.value = { ...globalFont.value, ...updates };
    applyGlobalFont();
    saveToStorage();
  }

  // 切換預設主題
  function setPreset(preset: string) {
    if (themePresets[preset]) {
      currentPreset.value = preset;
      // 更新氣泡顏色以匹配主題
      const theme = themePresets[preset];
      bubbleStyle.value.userBgColor = theme.primary;
      bubbleStyle.value.userBgGradient = `linear-gradient(135deg, ${theme.primary}, ${theme.primaryLight})`;
      applyTheme();
      saveToStorage();
    }
  }

  // 設置自定義顏色
  function setCustomColor(key: keyof ThemeColors, value: string) {
    customColors.value[key] = value;
    applyTheme();
    saveToStorage();
  }

  // 更新頭像樣式
  function updateAvatarStyle(updates: Partial<AvatarStyle>) {
    avatarStyle.value = { ...avatarStyle.value, ...updates };
    applyTheme();
    saveToStorage();
  }

  // 更新氣泡樣式
  function updateBubbleStyle(updates: Partial<BubbleStyle>) {
    bubbleStyle.value = { ...bubbleStyle.value, ...updates };
    applyTheme();
    saveToStorage();
  }

  // 更新桌布樣式
  function updateWallpaperStyle(updates: Partial<WallpaperStyle>) {
    wallpaperStyle.value = { ...wallpaperStyle.value, ...updates };
    applyTheme();
    saveToStorage();
  }

  // 重置為預設
  function resetToDefault() {
    currentPreset.value = "soft-pink";
    customColors.value = {};
    avatarStyle.value = { ...defaultAvatarStyle };
    bubbleStyle.value = { ...defaultBubbleStyle };
    wallpaperStyle.value = { ...defaultWallpaperStyle };
    customCSS.value = "";
    globalFont.value = { ...defaultGlobalFont };
    applyTheme();
    saveToStorage();
  }

  // 設置夜晚模式
  function setNightMode(enabled: boolean) {
    nightMode.value = enabled;
    applyTheme();
  }

  // 背景圖 Base64 分離儲存的 key 前綴
  const WALLPAPER_IMAGE_CACHE_KEY = "wallpaper-image-v1";
  // Base64 超過此大小時，改存入 imageCache table（避免 IndexedDB 單條記錄超限）
  const WALLPAPER_BASE64_INLINE_LIMIT = 512 * 1024; // 512 KB

  // 保存到 IndexedDB
  async function saveToStorage() {
    try {
      const { db } = await import("@/db/database");
      await db.init();

      // 處理背景圖：大 Base64 分離存入 imageCache，settings 只存引用 ID
      const wallpaperSnapshot = JSON.parse(
        JSON.stringify(wallpaperStyle.value),
      ) as WallpaperStyle;
      if (
        wallpaperSnapshot.type === "image" &&
        wallpaperSnapshot.value.startsWith("data:") &&
        wallpaperSnapshot.value.length > WALLPAPER_BASE64_INLINE_LIMIT
      ) {
        // 將 Base64 轉為 Blob 存入 imageCache
        try {
          const res = await fetch(wallpaperSnapshot.value);
          const blob = await res.blob();
          await db.put(
            "imageCache",
            {
              id: WALLPAPER_IMAGE_CACHE_KEY,
              blob,
              mimeType: blob.type || "image/webp",
              createdAt: Date.now(),
            },
            WALLPAPER_IMAGE_CACHE_KEY,
          );
          // settings 中只存引用 ID，不存完整 Base64
          wallpaperSnapshot.value = `imageCache:${WALLPAPER_IMAGE_CACHE_KEY}`;
        } catch (cacheErr) {
          console.warn("[Theme] 背景圖分離儲存失敗，改用內嵌方式:", cacheErr);
          // 回退：仍嘗試直接儲存完整 Base64
        }
      }

      // 將響應式對象轉換為純 JavaScript 對象（IndexedDB 無法克隆 Vue Proxy）
      const data = JSON.parse(
        JSON.stringify({
          currentStyle: currentStyle.value,
          currentPreset: currentPreset.value,
          customColors: customColors.value,
          avatarStyle: avatarStyle.value,
          bubbleStyle: bubbleStyle.value,
          wallpaperStyle: wallpaperSnapshot,
          customCSS: customCSS.value,
          globalFont: globalFont.value,
        }),
      );
      // settings store 沒有 keyPath，需要提供 key
      await db.put("settings", data, "user-theme");
    } catch (e) {
      console.warn("Failed to save theme to IndexedDB:", e);
    }
  }

  // 從 IndexedDB 載入
  async function loadFromStorage() {
    try {
      const { db } = await import("@/db/database");
      await db.init();
      const data = await db.get<any>("settings", "user-theme");
      if (data) {
        currentStyle.value = data.currentStyle || "soft";
        currentPreset.value = data.currentPreset || "soft-pink";
        customColors.value = data.customColors || {};
        avatarStyle.value = { ...defaultAvatarStyle, ...data.avatarStyle };
        bubbleStyle.value = { ...defaultBubbleStyle, ...data.bubbleStyle };

        // 處理背景圖引用 ID：從 imageCache 還原 Base64
        const storedWallpaper = {
          ...defaultWallpaperStyle,
          ...data.wallpaperStyle,
        } as WallpaperStyle;
        if (
          storedWallpaper.type === "image" &&
          typeof storedWallpaper.value === "string" &&
          storedWallpaper.value.startsWith("imageCache:")
        ) {
          const cacheKey = storedWallpaper.value.replace("imageCache:", "");
          try {
            const record = await db.get<{ id: string; blob: Blob }>(
              "imageCache",
              cacheKey,
            );
            if (record?.blob) {
              // 將 Blob 轉為 Object URL（比 Base64 更省記憶體）
              const objectUrl = URL.createObjectURL(record.blob);
              storedWallpaper.value = objectUrl;
            } else {
              // 快取遺失，回退到 time-theme
              console.warn("[Theme] 背景圖快取遺失，重置為時間主題");
              storedWallpaper.type = "time-theme";
              storedWallpaper.value = "";
            }
          } catch (cacheErr) {
            console.warn("[Theme] 讀取背景圖快取失敗:", cacheErr);
            storedWallpaper.type = "time-theme";
            storedWallpaper.value = "";
          }
        }
        wallpaperStyle.value = storedWallpaper;

        customCSS.value = data.customCSS || "";
        globalFont.value = { ...defaultGlobalFont, ...data.globalFont };
      }
    } catch (e) {
      console.warn("Failed to load theme from IndexedDB:", e);
    }
    applyTheme();
  }

  return {
    // 狀態
    currentStyle,
    currentPreset,
    customColors,
    nightMode,
    avatarStyle,
    bubbleStyle,
    wallpaperStyle,
    customCSS,
    globalFont,
    colors,
    cssVariables,
    isWallpaperDark,

    // 方法
    applyTheme,
    applyCustomCSS,
    setPreset,
    setCustomColor,
    setNightMode,
    updateAvatarStyle,
    updateBubbleStyle,
    updateWallpaperStyle,
    updateCustomCSS,
    updateGlobalFont,
    applyGlobalFont,
    resetToDefault,
    saveToStorage,
    loadFromStorage,
  };
});
