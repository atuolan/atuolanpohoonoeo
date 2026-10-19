/// <reference types="vitest/globals" />

import { afterEach, describe, expect, it, vi } from "vitest";

let native = false;
vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: () => native },
}));

const { NATIVE_PROXY_HOST, PROXY_WORKERS_DEV, aiProxyHost, resolveProxyPath } = await import("./platform");

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
