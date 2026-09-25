import { describe, expect, it } from "vitest";
import type { ChatAppearance } from "@/types/chat";
import {
  ALL_CHAT_APPEARANCE_PROPS,
  buildBarBackground,
  buildChatAppearanceVars,
  isFollowingGlobalWallpaper,
  resolveBarStyle,
  resolveChatFontSizePx,
  withOpacity,
} from "@/utils/chatAppearanceVars";

const fullAppearance: ChatAppearance = {
  useCustom: true,
  colors: {
    primary: "#ff85a2",
    primaryLight: "#ffb6c8",
    background: "#fff0f5",
    surface: "#ffffff",
    surfaceHover: "#fafafa",
    text: "#333333",
    textSecondary: "#666666",
    textMuted: "#999999",
    secondary: "#b388ff",
    border: "#eeeeee",
    shadow: "#00000022",
    success: "#22c55e",
    error: "#ef4444",
    warning: "#f59e0b",
  },
  avatar: { shape: "rounded", size: "small", borderWidth: 2, borderColor: "#ffffff", shadowEnabled: true },
  bubble: {
    userBgColor: "#ff85a2",
    userBgGradient: "linear-gradient(135deg, #ff85a2, #ffb6c8)",
    userTextColor: "#ffffff",
    userTextGradient: "linear-gradient(90deg, #ffffff, #eeeeee)",
    aiBgColor: "#ffffff",
    aiTextColor: "#4a4a6a",
    aiContentColor: "#4a4a6a",
    aiContentGradient: "linear-gradient(90deg, #111111, #222222)",
    thoughtBgColor: "#add8e6",
    thoughtTextColor: "#4a6572",
    thoughtGlowColor: "#add8e6",
    thoughtGlowOpacity: 0.6,
    borderRadius: 18,
    maxWidth: 80,
    showAvatar: true,
  },
  wallpaper: { type: "gradient", value: "linear-gradient(#fff, #000)", blur: 4, opacity: 80, overlay: "", fit: "repeat" },
  font: {
    size: "18px",
    family: "serif",
    lineHeight: 1.8,
    letterSpacing: 1,
    markdownColors: {
      text: "#4a4a6a",
      italic: "#111111",
      bold: "#222222",
      underline: "#333333",
      strikethrough: "#444444",
      highlight: "#555555",
      quote: "#666666",
      code: "#777777",
      heading: "#888888",
    },
  },
};

const day = { nightMode: false, globalWallpaper: { type: "color", value: "#ffffff" } };
const night = { ...day, nightMode: true };

const withEffects: ChatAppearance = {
  ...fullAppearance,
  bars: {
    header: { opacity: 60, blur: 12, docked: true },
    input: { opacity: 100, blur: 0, docked: false },
  },
  bubbleEffects: { opacity: 50, blur: 8, shadow: "strong", borderWidth: 2, borderColor: "#123456" },
  messageSpacing: "compact",
};

describe("buildChatAppearanceVars", () => {
  it("只輸出清除清單裡有的變數（清除與套用對稱）", () => {
    const allowed = new Set<string>(ALL_CHAT_APPEARANCE_PROPS);
    for (const options of [day, night]) {
      for (const appearance of [fullAppearance, withEffects]) {
        for (const key of Object.keys(buildChatAppearanceVars(appearance, options))) {
          expect(allowed.has(key), key).toBe(true);
        }
      }
    }
  });

  it("未啟用專屬外觀時白天不輸出任何變數", () => {
    expect(buildChatAppearanceVars({ ...fullAppearance, useCustom: false }, day)).toEqual({});
    expect(buildChatAppearanceVars(undefined, day)).toEqual({});
  });

  it("夜間模式會覆寫所有氣泡文字的 fill，避免白天的深色字留在深色氣泡上", () => {
    const vars = buildChatAppearanceVars(fullAppearance, night);
    expect(vars["--bubble-ai-content-fill"]).toBe("#d8d8e8");
    expect(vars["--bubble-ai-text-fill"]).toBe("#d8d8e8");
    expect(vars["--bubble-user-text-fill"]).toBe("#e0f0e8");
    expect(vars["--bubble-user-text-gradient"]).toBe("none");
  });

  it("夜間模式保留版面設定，但不套用自訂顏色與桌布", () => {
    const vars = buildChatAppearanceVars(fullAppearance, night);
    expect(vars["--chat-font-size"]).toBe("18px");
    expect(vars["--bubble-radius"]).toBe("18px");
    expect(vars["--avatar-size"]).toBe("36px");
    expect(vars["--color-surface"]).toBeUndefined();
    expect(vars["--chat-wallpaper"]).toBeUndefined();
    expect(vars["--thought-bg"]).toBeUndefined();
  });

  it("文字漸層時 fill 為 transparent，純色時 fill 為該顏色", () => {
    const vars = buildChatAppearanceVars(fullAppearance, day);
    expect(vars["--bubble-user-text-fill"]).toBe("transparent");
    expect(vars["--bubble-ai-text-fill"]).toBe("#4a4a6a");
    expect(vars["--bubble-ai-content-fill"]).toBe("transparent");
  });

  it("表面色與文字色同步寫到頂欄變數", () => {
    const vars = buildChatAppearanceVars(fullAppearance, day);
    expect(vars["--chat-header-surface"]).toBe("#ffffff");
    expect(vars["--chat-header-text"]).toBe("#333333");
    expect(vars["--chat-header-text-secondary"]).toBe("#666666");
  });

  it("桌布顯示方式轉成 background-size / repeat", () => {
    const vars = buildChatAppearanceVars(fullAppearance, day);
    expect(vars["--chat-wallpaper-fit"]).toBe("auto");
    expect(vars["--chat-wallpaper-repeat"]).toBe("repeat");
    expect(vars["--chat-wallpaper-opacity"]).toBe("0.8");
  });

  it("舊資料裡的 blob: 桌布改為跟隨目前的全域桌布", () => {
    const appearance: ChatAppearance = {
      ...fullAppearance,
      wallpaper: { type: "image", value: "blob:http://localhost/dead", blur: 0, opacity: 100, overlay: "" },
    };
    const vars = buildChatAppearanceVars(appearance, {
      nightMode: false,
      globalWallpaper: { type: "image", value: "blob:http://localhost/current" },
    });
    expect(vars["--chat-wallpaper"]).toBe('url("blob:http://localhost/current")');
  });

  it("跟隨全域但全域不是圖片時，使用全域桌布變數", () => {
    const appearance: ChatAppearance = {
      ...fullAppearance,
      wallpaper: { type: "global-image", value: "", blur: 0, opacity: 100, overlay: "" },
    };
    expect(buildChatAppearanceVars(appearance, day)["--chat-wallpaper"]).toBe(
      "var(--wallpaper-value, var(--color-background))",
    );
  });
});

describe("頂欄、輸入欄與氣泡質感", () => {
  it("沒設定時不輸出任何質感變數，維持元件內建樣式", () => {
    const vars = buildChatAppearanceVars(fullAppearance, day);
    for (const key of ["--chat-header-bg", "--chat-input-bg", "--chat-header-backdrop", "--bubble-shadow", "--bubble-outline", "--bubble-backdrop", "--chat-message-gap"]) {
      expect(vars[key], key).toBeUndefined();
    }
    expect(vars["--bubble-user-bg"]).toBe("linear-gradient(135deg, #ff85a2, #ffb6c8)");
  });

  it("頂欄與輸入欄分開套用", () => {
    const vars = buildChatAppearanceVars(withEffects, day);
    expect(vars["--chat-header-bg"]).toContain("60%");
    expect(vars["--chat-header-bg-dark"]).toBeDefined();
    expect(vars["--chat-header-backdrop"]).toBe("blur(12px) saturate(180%)");
    // 輸入欄不透明度 100 時沿用內建背景，模糊 0 時關閉毛玻璃
    expect(vars["--chat-input-bg"]).toBeUndefined();
    expect(vars["--chat-input-backdrop"]).toBe("none");
  });

  it("不透明度 100 時背景與元件內建樣式相同", () => {
    expect(buildBarBackground("header", 100)).toBe(
      "linear-gradient(135deg, color-mix(in srgb, var(--chat-header-surface, var(--color-surface)) 94%, transparent) 0%, " +
        "color-mix(in srgb, var(--chat-header-surface, var(--color-surface)) 78%, transparent) 100%), " +
        "color-mix(in srgb, var(--color-background, #1a1a2e) 100%, transparent)",
    );
    // 不透明度 0：每個顏色層都是 0%
    expect(buildBarBackground("input", 0)).not.toMatch(/ [1-9][\d.]*%, transparent/);
  });

  it("氣泡不透明度套用到純色與漸層裡的每個顏色", () => {
    const vars = buildChatAppearanceVars(withEffects, day);
    expect(vars["--bubble-user-bg"]).toBe(
      "linear-gradient(135deg, color-mix(in srgb, #ff85a2 50%, transparent), color-mix(in srgb, #ffb6c8 50%, transparent))",
    );
    expect(vars["--bubble-ai-bg"]).toBe("color-mix(in srgb, #ffffff 50%, transparent)");
    expect(vars["--bubble-backdrop"]).toBe("blur(8px) saturate(160%)");
    expect(vars["--bubble-outline"]).toBe("2px solid #123456");
    expect(vars["--bubble-outline-offset"]).toBe("-2px");
    expect(vars["--chat-message-gap"]).toBe("6px");
  });

  it("夜間模式也套用質感設定，透明度作用在夜間氣泡色上", () => {
    const vars = buildChatAppearanceVars(withEffects, night);
    expect(vars["--bubble-ai-bg"]).toBe("color-mix(in srgb, #1e2a40 50%, transparent)");
    expect(vars["--chat-header-bg"]).toBeDefined();
    expect(vars["--chat-message-gap"]).toBe("6px");
  });

  it("邊框顏色留空時使用邊框色", () => {
    const vars = buildChatAppearanceVars(
      { ...withEffects, bubbleEffects: { ...withEffects.bubbleEffects!, borderColor: "" } },
      day,
    );
    expect(vars["--bubble-outline"]).toBe("2px solid var(--color-border)");
  });

  it("withOpacity 處理 rgb() 與 var()", () => {
    expect(withOpacity("rgba(0, 0, 0, 0.5)", 40)).toBe("color-mix(in srgb, rgba(0, 0, 0, 0.5) 40%, transparent)");
    expect(withOpacity("var(--x)", 40)).toBe("color-mix(in srgb, var(--x) 40%, transparent)");
    expect(withOpacity("#fff", 100)).toBe("#fff");
  });

  it("未啟用專屬外觀時頂欄維持預設", () => {
    expect(resolveBarStyle({ ...withEffects, useCustom: false }, "header").docked).toBe(false);
    expect(resolveBarStyle(withEffects, "header").docked).toBe(true);
    expect(resolveBarStyle(fullAppearance, "input")).toEqual({ opacity: 100, blur: 30, docked: false });
  });
});

describe("isFollowingGlobalWallpaper", () => {
  it("辨識跟隨全域的桌布", () => {
    expect(isFollowingGlobalWallpaper({ type: "global-image", value: "" })).toBe(true);
    expect(isFollowingGlobalWallpaper({ type: "image", value: "blob:x" })).toBe(true);
    expect(isFollowingGlobalWallpaper({ type: "image", value: "data:image/png;base64,xx" })).toBe(false);
    expect(isFollowingGlobalWallpaper({ type: "color", value: "#fff" })).toBe(false);
  });
});

describe("resolveChatFontSizePx", () => {
  it("相容新舊格式", () => {
    expect(resolveChatFontSizePx("18px")).toBe(18);
    expect(resolveChatFontSizePx("small")).toBe(14);
    expect(resolveChatFontSizePx("large")).toBe(17);
    expect(resolveChatFontSizePx(undefined)).toBe(15);
  });
});
