import { describe, expect, it } from "vitest";
import type { ChatAppearance } from "@/types/chat";
import {
  ALL_CHAT_APPEARANCE_PROPS,
  buildChatAppearanceVars,
  isFollowingGlobalWallpaper,
  resolveChatFontSizePx,
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

describe("buildChatAppearanceVars", () => {
  it("只輸出清除清單裡有的變數（清除與套用對稱）", () => {
    const allowed = new Set<string>(ALL_CHAT_APPEARANCE_PROPS);
    for (const options of [day, night]) {
      for (const key of Object.keys(buildChatAppearanceVars(fullAppearance, options))) {
        expect(allowed.has(key), key).toBe(true);
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
