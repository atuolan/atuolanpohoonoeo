/**
 * PixabaySearchService 單元測試
 * 測試防抖、快取、取消等核心邏輯
 */

import type { PixabaySearchResult } from "@/api/PixabayApi";
import { PixabaySearchService } from "@/services/PixabaySearchService";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock PixabayApi
vi.mock("@/api/PixabayApi", () => ({
  searchPixabay: vi.fn(),
}));

import { searchPixabay } from "@/api/PixabayApi";

/** 建立假的搜尋結果 */
function makeFakeResult(tag = "test"): PixabaySearchResult {
  return {
    total: 1,
    totalHits: 1,
    hits: [
      {
        id: 1,
        previewURL: `https://cdn.pixabay.com/${tag}/preview.jpg`,
        webformatURL: `https://cdn.pixabay.com/${tag}/webformat.jpg`,
        largeImageURL: `https://cdn.pixabay.com/${tag}/large.jpg`,
        tags: tag,
        user: "testuser",
        pageURL: `https://pixabay.com/photos/${tag}`,
        proxyPreviewURL: `/image-proxy?url=https%3A%2F%2Fcdn.pixabay.com%2F${tag}%2Fpreview.jpg`,
        proxyWebformatURL: `/image-proxy?url=https%3A%2F%2Fcdn.pixabay.com%2F${tag}%2Fwebformat.jpg`,
        proxyLargeImageURL: `/image-proxy?url=https%3A%2F%2Fcdn.pixabay.com%2F${tag}%2Flarge.jpg`,
      },
    ],
  };
}

describe("PixabaySearchService", () => {
  let service: PixabaySearchService;
  const mockSearchPixabay = vi.mocked(searchPixabay);

  beforeEach(() => {
    vi.useFakeTimers();
    service = new PixabaySearchService();
    mockSearchPixabay.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("clearCache()", () => {
    it("清除快取後，相同參數的下一次搜尋應重新呼叫 API", async () => {
      // 第一次搜尋：填入快取
      const result1 = makeFakeResult("cat");
      mockSearchPixabay.mockResolvedValueOnce(result1);
      await service.searchImmediate({ q: "cat" });
      expect(mockSearchPixabay).toHaveBeenCalledTimes(1);

      // 清除快取
      service.clearCache();

      // 第二次搜尋：快取已清除，應再次呼叫 API
      const result2 = makeFakeResult("cat2");
      mockSearchPixabay.mockResolvedValueOnce(result2);
      const result = await service.searchImmediate({ q: "cat" });

      expect(mockSearchPixabay).toHaveBeenCalledTimes(2);
      expect(result).toEqual(result2);
    });
  });

  describe("searchImmediate()", () => {
    it("預設 perPage 為 20，fetch URL 應包含 per_page=20", async () => {
      const fakeResult = makeFakeResult("dog");
      mockSearchPixabay.mockResolvedValueOnce(fakeResult);

      await service.searchImmediate({ q: "dog" });

      // 驗證 searchPixabay 被呼叫時帶有正確的預設參數
      expect(mockSearchPixabay).toHaveBeenCalledWith(
        expect.objectContaining({ q: "dog" }),
      );
      // perPage 未傳入時，PixabayApi 內部預設為 20
      // 這裡驗證 service 沒有覆蓋 perPage（傳入 undefined 讓 API 使用預設值）
      const callArg = mockSearchPixabay.mock.calls[0][0];
      expect(callArg.perPage === undefined || callArg.perPage === 20).toBe(
        true,
      );
    });

    it("快取命中時不應再次呼叫 API", async () => {
      const fakeResult = makeFakeResult("flower");
      mockSearchPixabay.mockResolvedValueOnce(fakeResult);

      // 第一次：API 呼叫
      const r1 = await service.searchImmediate({ q: "flower" });
      // 第二次：快取命中
      const r2 = await service.searchImmediate({ q: "flower" });

      expect(mockSearchPixabay).toHaveBeenCalledTimes(1);
      expect(r1).toEqual(r2);
    });
  });

  describe("search() 防抖", () => {
    it("300ms 內連續呼叫兩次，只有最後一次觸發 API", async () => {
      const fakeResult = makeFakeResult("sky");
      mockSearchPixabay.mockResolvedValue(fakeResult);

      // 第一次呼叫（會被取消）— 立即附加 catch 防止 unhandledRejection
      const p1 = service.search({ q: "sky1" });
      p1.catch(() => {});
      // 100ms 後第二次呼叫（覆蓋第一次）
      await vi.advanceTimersByTimeAsync(100);
      const p2 = service.search({ q: "sky2" });

      // 等待防抖觸發
      await vi.advanceTimersByTimeAsync(300);

      // p1 應被拒絕（已取消）
      await expect(p1).rejects.toMatchObject({ message: "搜尋已取消" });
      // p2 應成功
      await expect(p2).resolves.toEqual(fakeResult);

      // API 只被呼叫一次
      expect(mockSearchPixabay).toHaveBeenCalledTimes(1);
    });
  });

  describe("cancelPending()", () => {
    it("取消待執行的防抖搜尋，Promise 應被拒絕", async () => {
      mockSearchPixabay.mockResolvedValue(makeFakeResult("tree"));

      const p = service.search({ q: "tree" });

      // 在防抖觸發前取消
      service.cancelPending();

      await expect(p).rejects.toMatchObject({ message: "搜尋已取消" });
      // API 不應被呼叫
      expect(mockSearchPixabay).not.toHaveBeenCalled();
    });
  });
});
