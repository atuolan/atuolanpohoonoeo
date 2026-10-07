import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchModelIds,
  getGeminiNativeModelsUrl,
  parseModelList,
} from "./modelListFetcher";

const identity = (url: string) => url;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    statusText: status === 200 ? "OK" : "Not Found",
  });
}

describe("parseModelList", () => {
  it("解析 OpenAI 格式", () => {
    expect(parseModelList({ data: [{ id: "gpt-4o" }, { id: "" }] })).toEqual([
      "gpt-4o",
    ]);
  });

  it("解析純陣列", () => {
    expect(parseModelList(["a", { id: "b" }])).toEqual(["a", "b"]);
  });

  it("解析 Gemini 原生格式並去掉 models/ 前綴", () => {
    expect(
      parseModelList({
        models: [
          { name: "models/gemini-2.5-flash" },
          { name: "models/gemini-2.5-pro" },
        ],
      }),
    ).toEqual(["gemini-2.5-flash", "gemini-2.5-pro"]);
  });

  it("無法辨識的格式回傳空陣列", () => {
    expect(parseModelList({ foo: 1 })).toEqual([]);
    expect(parseModelList(null)).toEqual([]);
  });
});

describe("getGeminiNativeModelsUrl", () => {
  it.each([
    ["https://smolproxy.org/google/v1", "https://smolproxy.org/google"],
    ["https://smolproxy.org/google/v1/", "https://smolproxy.org/google"],
    ["https://smolproxy.org/google", "https://smolproxy.org/google"],
    [
      "https://generativelanguage.googleapis.com/v1beta/openai",
      "https://generativelanguage.googleapis.com",
    ],
  ])("%s", (endpoint, base) => {
    expect(getGeminiNativeModelsUrl(endpoint)).toBe(
      `${base}/v1beta/models?pageSize=1000`,
    );
  });
});

describe("fetchModelIds", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("OpenAI 格式成功時不打 fallback", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ data: [{ id: "gpt-4o" }] }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      fetchModelIds("https://api.example.com/v1", "k", identity),
    ).resolves.toEqual(["gpt-4o"]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe("https://api.example.com/v1/models");
  });

  it("404 時改打 Gemini 原生模型列表", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ error: "Not Found" }, 404))
      .mockResolvedValueOnce(
        jsonResponse({ models: [{ name: "models/gemini-2.5-flash" }] }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      fetchModelIds("https://smolproxy.org/google/v1", "k", identity),
    ).resolves.toEqual(["gemini-2.5-flash"]);
    expect(fetchMock.mock.calls[1][0]).toBe(
      "https://smolproxy.org/google/v1beta/models?pageSize=1000",
    );
  });

  it("fallback 也失敗時拋出原本的 404 錯誤", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ error: "Not Found" }, 404));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      fetchModelIds("https://api.example.com/v1", "k", identity),
    ).rejects.toThrow("HTTP 404: Not Found");
  });

  it("非 404 錯誤不打 fallback", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}, 401));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      fetchModelIds("https://api.example.com/v1", "k", identity),
    ).rejects.toThrow("HTTP 401");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
