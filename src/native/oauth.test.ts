/// <reference types="vitest/globals" />

/**
 * Discord 授權導回 App：認得出專屬連結、登入結果寫成網頁版 discord-callback.html 的格式。
 */
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: () => true },
}));
const browserClose = vi.fn(async () => {});
vi.mock("@capacitor/browser", () => ({
  Browser: { close: browserClose },
}));
const handleDiscordOAuthCallback = vi.fn(async () => true);
vi.mock("@/stores/cloudPush", () => ({
  useCloudPushStore: () => ({ handleDiscordOAuthCallback }),
}));

const { handleOAuthReturnUrl, parseOAuthReturnUrl } = await import("./oauth");
const { nativeOAuthReturnBase } = await import("./platform");

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("parseOAuthReturnUrl", () => {
  it("Worker 導回的登入結果", () => {
    const url = `${nativeOAuthReturnBase("auth")}/discord-callback.html?discord_user_id=1&auth_result=%7B%7D`;
    expect(parseOAuthReturnUrl(url)).toEqual({
      purpose: "auth",
      search: "?discord_user_id=1&auth_result=%7B%7D",
    });
  });

  it("換 token 失敗時 Worker 不加 discord-callback.html", () => {
    expect(parseOAuthReturnUrl(`${nativeOAuthReturnBase("push")}?discord_error=x`)).toEqual({
      purpose: "push",
      search: "?discord_error=x",
    });
  });

  it("其他網址不處理", () => {
    expect(parseOAuthReturnUrl("https://localhost/discord-callback.html?a=1")).toBeNull();
    expect(parseOAuthReturnUrl("uk.aguacloud.aguaphone://other/auth?a=1")).toBeNull();
    expect(parseOAuthReturnUrl("uk.aguacloud.aguaphone://oauth/unknown?a=1")).toBeNull();
    expect(parseOAuthReturnUrl("不是網址")).toBeNull();
  });
});

describe("handleOAuthReturnUrl", () => {
  function stubBrowserGlobals() {
    const store = new Map<string, string>();
    const events: Array<{ type: string; key?: string; newValue?: string }> = [];
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => store.set(k, v),
      removeItem: (k: string) => store.delete(k),
    });
    vi.stubGlobal(
      "StorageEvent",
      class {
        constructor(
          public type: string,
          init: { key?: string; newValue?: string },
        ) {
          Object.assign(this, init);
        }
      },
    );
    vi.stubGlobal("window", { dispatchEvent: (e: (typeof events)[number]) => events.push(e) });
    return { store, events };
  }

  it("登入結果寫進 localStorage 並通知驗證頁", async () => {
    const { store, events } = stubBrowserGlobals();
    const url = `${nativeOAuthReturnBase("auth")}/discord-callback.html?discord_user_id=42`;
    expect(await handleOAuthReturnUrl(url)).toBe(true);

    const saved = JSON.parse(store.get("discord_oauth_result")!);
    expect(saved.search).toBe("?discord_user_id=42");
    expect(typeof saved.timestamp).toBe("number");
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: "storage", key: "discord_oauth_result" });
    expect(handleDiscordOAuthCallback).not.toHaveBeenCalled();
  });

  it("通知設定的連結 Discord 交給 cloudPush", async () => {
    const { store } = stubBrowserGlobals();
    const url = `${nativeOAuthReturnBase("push")}/discord-callback.html?discord_user_id=7`;
    expect(await handleOAuthReturnUrl(url)).toBe(true);
    expect(handleDiscordOAuthCallback).toHaveBeenCalledWith("?discord_user_id=7");
    expect(store.size).toBe(0);
  });

  it("不是授權回傳就不動", async () => {
    const { store } = stubBrowserGlobals();
    expect(await handleOAuthReturnUrl("https://example.com/")).toBe(false);
    expect(store.size).toBe(0);
    expect(browserClose).not.toHaveBeenCalled();
  });
});
