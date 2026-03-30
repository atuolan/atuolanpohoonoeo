// Pixabay API 客戶端單元測試
import { searchPixabay, toImageProxyUrl } from "@/api/PixabayApi";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// 硬編碼的 API 金鑰
const EXPECTED_API_KEY = "55224924-5e1b99de2bfb4b44b0cdecaf8";

describe("PixabayApi", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  // ── API 金鑰驗證 ──────────────────────────────────────────────────────────

  describe("API 金鑰", () => {
    it("應在 fetch URL 中使用硬編碼的 API 金鑰", async () => {
      // 模擬成功回應
      const mockResponse = {
        ok: true,
        json: async () => ({ total: 0, totalHits: 0, hits: [] }),
      };
      const fetchMock = vi.fn().mockResolvedValue(mockResponse);
      vi.stubGlobal("fetch", fetchMock);

      await searchPixabay({ q: "cat" });

      expect(fetchMock).toHaveBeenCalledOnce();
      const calledUrl: string = fetchMock.mock.calls[0][0];
      expect(calledUrl).toContain(`key=${EXPECTED_API_KEY}`);
    });
  });

  // ── 逾時行為 ──────────────────────────────────────────────────────────────

  describe("逾時行為", () => {
    it("當 fetch 超過 10 秒時應拋出含逾時訊息的錯誤", async () => {
      // 模擬永不 resolve 的 fetch（直到 abort）
      const fetchMock = vi
        .fn()
        .mockImplementation((_url: string, options: RequestInit) => {
          return new Promise((_resolve, reject) => {
            // 監聽 abort 信號
            options.signal?.addEventListener("abort", () => {
              reject(
                new DOMException("The operation was aborted.", "AbortError"),
              );
            });
          });
        });
      vi.stubGlobal("fetch", fetchMock);

      // 立即附加 catch 避免 unhandled rejection，再推進計時器
      let caughtError: unknown = null;
      const searchPromise = searchPixabay({ q: "timeout-test" }).catch(
        (err) => {
          caughtError = err;
        },
      );

      // 推進 10 秒觸發 AbortController
      await vi.advanceTimersByTimeAsync(10_000);
      await searchPromise;

      expect(caughtError).toMatchObject({
        message: expect.stringContaining("逾時"),
      });
    });

    it("在 10 秒內完成的請求不應拋出逾時錯誤", async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({ total: 1, totalHits: 1, hits: [] }),
      };
      const fetchMock = vi.fn().mockResolvedValue(mockResponse);
      vi.stubGlobal("fetch", fetchMock);

      const searchPromise = searchPixabay({ q: "fast" });
      // 推進 5 秒（未超時）
      await vi.advanceTimersByTimeAsync(5_000);

      await expect(searchPromise).resolves.toBeDefined();
    });
  });

  // ── 預設參數 ──────────────────────────────────────────────────────────────

  describe("預設參數", () => {
    it("未指定 lang 時應使用 lang=zh", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ total: 0, totalHits: 0, hits: [] }),
      });
      vi.stubGlobal("fetch", fetchMock);

      await searchPixabay({ q: "flower" });

      const calledUrl: string = fetchMock.mock.calls[0][0];
      expect(calledUrl).toContain("lang=zh");
    });

    it("未指定 page 時應使用 page=1", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ total: 0, totalHits: 0, hits: [] }),
      });
      vi.stubGlobal("fetch", fetchMock);

      await searchPixabay({ q: "flower" });

      const calledUrl: string = fetchMock.mock.calls[0][0];
      expect(calledUrl).toContain("page=1");
    });

    it("未指定 perPage 時應使用 per_page=20", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ total: 0, totalHits: 0, hits: [] }),
      });
      vi.stubGlobal("fetch", fetchMock);

      await searchPixabay({ q: "flower" });

      const calledUrl: string = fetchMock.mock.calls[0][0];
      expect(calledUrl).toContain("per_page=20");
    });

    it("未指定 imageType 時應使用 image_type=photo", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ total: 0, totalHits: 0, hits: [] }),
      });
      vi.stubGlobal("fetch", fetchMock);

      await searchPixabay({ q: "flower" });

      const calledUrl: string = fetchMock.mock.calls[0][0];
      expect(calledUrl).toContain("image_type=photo");
    });

    it("指定自訂參數時應覆蓋預設值", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ total: 0, totalHits: 0, hits: [] }),
      });
      vi.stubGlobal("fetch", fetchMock);

      await searchPixabay({ q: "sunset", lang: "en", page: 3, perPage: 10 });

      const calledUrl: string = fetchMock.mock.calls[0][0];
      expect(calledUrl).toContain("lang=en");
      expect(calledUrl).toContain("page=3");
      expect(calledUrl).toContain("per_page=10");
    });
  });

  // ── toImageProxyUrl ───────────────────────────────────────────────────────

  describe("toImageProxyUrl", () => {
    it("應回傳以 /image-proxy?url= 開頭的字串", () => {
      const result = toImageProxyUrl("https://cdn.pixabay.com/photo/test.jpg");
      expect(result).toMatch(/^\/image-proxy\?url=/);
    });

    it("應對 URL 進行 encodeURIComponent 編碼", () => {
      const original = "https://cdn.pixabay.com/photo/test image.jpg";
      const result = toImageProxyUrl(original);
      expect(result).toBe(`/image-proxy?url=${encodeURIComponent(original)}`);
    });
  });
});
