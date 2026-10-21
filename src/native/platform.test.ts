/// <reference types="vitest/globals" />

import { afterEach, describe, expect, it, vi } from "vitest";

let native = false;
let platform = "web";
vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: () => native, getPlatform: () => platform },
}));

const { NATIVE_PROXY_HOST, PROXY_WORKERS_DEV, aiProxyHost, isIosApp, nativeBackupLocation, resolveProxyPath } =
  await import("./platform");

describe("aiProxyHost", () => {
  it("網頁版照舊走 workers.dev，App 走不會被大陸 DNS 擋的自訂網域", () => {
    expect(aiProxyHost()).toBe(PROXY_WORKERS_DEV);
    native = true;
    expect(aiProxyHost()).toBe("https://nai-proxy.aguacloud.uk");
    native = false;
  });
});

afterEach(() => {
  native = false;
  platform = "web";
});

describe("resolveProxyPath", () => {
  it("網頁版原樣回傳相對路徑", () => {
    expect(resolveProxyPath("/ai-proxy/example.com/a.png")).toBe("/ai-proxy/example.com/a.png");
  });

  it("App 裡改連代理 Worker", () => {
    native = true;
    expect(resolveProxyPath("/ai-proxy/example.com/a.png")).toBe(
      `${NATIVE_PROXY_HOST}/ai-proxy/example.com/a.png`,
    );
    expect(resolveProxyPath("/image-proxy?url=x")).toBe(`${NATIVE_PROXY_HOST}/image-proxy?url=x`);
  });

  it("完整網址不動", () => {
    native = true;
    expect(resolveProxyPath("https://example.com/a.png")).toBe("https://example.com/a.png");
  });
});

describe("isIosApp／nativeBackupLocation", () => {
  it("Android App 是公用的「文件」資料夾", () => {
    native = true;
    platform = "android";
    expect(isIosApp()).toBe(false);
    expect(nativeBackupLocation()).toBe("文件／203Phone");
  });

  it("iOS App 在「檔案」App 的 App 資料夾裡", () => {
    native = true;
    platform = "ios";
    expect(isIosApp()).toBe(true);
    expect(nativeBackupLocation()).toBe("檔案／我的 iPhone／203 Phone／203Phone");
  });

  it("Safari 裡的網頁版不算 iOS App", () => {
    platform = "ios";
    expect(isIosApp()).toBe(false);
  });
});
