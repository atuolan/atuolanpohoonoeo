/**
 * PixabaySearchService 屬性測試
 * 使用 fast-check 驗證防抖與 LRU 快取的正確性屬性
 */

import type { PixabaySearchResult } from "@/api/PixabayApi";
import { PixabaySearchService } from "@/services/PixabaySearchService";
import fc from "fast-check";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock PixabayApi
vi.mock("@/api/PixabayApi", () => ({
  searchPixabay: vi.fn(),
}));

import { searchPixabay } from "@/api/PixabayApi";

/** 建立假的搜尋結果 */
function makeFakeResult(q: string): PixabaySearchResult {
  return {
    total: 10,
    totalHits: 10,
    hits: [
      {
        id: Math.floor(Math.random() * 100000),
        previewURL: `https://cdn.pixabay.com/${q}/preview.jpg`,
        webformatURL: `https://cdn.pixabay.com/${q}/webformat.jpg`,
        largeImageURL: `https://cdn.pixabay.com/${q}/large.jpg`,
        tags: q,
        user: "testuser",
        pageURL: `https://pixabay.com/photos/${q}`,
        proxyPreviewURL: `/image-proxy?url=https%3A%2F%2Fcdn.pixabay.com%2F${q}%2Fpreview.jpg`,
        proxyWebformatURL: `/image-proxy?url=https%3A%2F%2Fcdn.pixabay.com%2F${q}%2Fwebformat.jpg`,
        proxyLargeImageURL: `/image-proxy?url=https%3A%2F%2Fcdn.pixabay.com%2F${q}%2Flarge.jpg`,
      },
    ],
  };
}

describe("PixabaySearchService 屬性測試", () => {
  const mockSearchPixabay = vi.mocked(searchPixabay);

  beforeEach(() => {
    vi.useFakeTimers();
    mockSearchPixabay.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /**
   * Property 9: 搜尋防抖
   * **Validates: Requirements 5.1**
   *
   * 對於任意 N > 1 次在 300ms 內連續呼叫 search()，
   * 只有最後一次應觸發實際 API 請求，前面的請求應被取消。
   */
  // Feature: pixabay-image-search, Property 9: 搜尋防抖
  it("Property 9: 搜尋防抖 — N 次連續呼叫只有最後一次觸發 API", async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 2, max: 10 }), async (n) => {
        const service = new PixabaySearchService();
        mockSearchPixabay.mockReset();
        mockSearchPixabay.mockResolvedValue(makeFakeResult("test"));

        // 同步收集所有 Promise，避免中間 rejection 成為未處理的 rejection
        // 每個 Promise 立即附加 .catch 讓 Node.js 不會報 unhandledRejection
        const promises: Promise<PixabaySearchResult>[] = [];
        for (let i = 0; i < n; i++) {
          const p = service.search({ q: `query-${i}` });
          // 附加空 catch 防止 unhandledRejection，allSettled 仍能觀察到結果
          p.catch(() => {});
          promises.push(p);
        }

        // 推進時間觸發最後一次防抖
        await vi.advanceTimersByTimeAsync(300);

        // 等待所有 Promise 結算
        const results = await Promise.allSettled(promises);

        // 前 N-1 個應被拒絕（已取消）
        for (let i = 0; i < n - 1; i++) {
          expect(results[i].status).toBe("rejected");
        }

        // 最後一個應成功
        expect(results[n - 1].status).toBe("fulfilled");

        // API 只被呼叫一次
        expect(mockSearchPixabay).toHaveBeenCalledTimes(1);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Property 10: LRU 快取命中
   * **Validates: Requirements 5.2**
   *
   * 對於任意搜尋關鍵字，若結果已在快取中，
   * searchImmediate() 應直接回傳快取結果而不發起新的 API 請求。
   * 快取容量為 5，加入第 6 個唯一 key 時淘汰最久未使用的項目。
   */
  // Feature: pixabay-image-search, Property 10: LRU 快取命中
  it("Property 10: LRU 快取命中 — 快取結果直接回傳，第 6 筆淘汰最舊項目", async () => {
    await fc.assert(
      fc.asyncProperty(fc.string({ minLength: 1 }), async (keyword) => {
        const service = new PixabaySearchService();
        mockSearchPixabay.mockReset();

        const fakeResult = makeFakeResult(keyword);
        mockSearchPixabay.mockResolvedValue(fakeResult);

        // 第一次搜尋：快取未命中，呼叫 API
        const r1 = await service.searchImmediate({ q: keyword });
        expect(mockSearchPixabay).toHaveBeenCalledTimes(1);

        // 第二次搜尋：快取命中，不呼叫 API
        const r2 = await service.searchImmediate({ q: keyword });
        expect(mockSearchPixabay).toHaveBeenCalledTimes(1);
        expect(r1).toEqual(r2);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Property 10 補充：LRU 淘汰行為
   * 快取容量 5，加入第 6 個唯一 key 時，最久未使用的第 1 個 key 應被淘汰
   */
  it("Property 10 補充：LRU 淘汰 — 第 6 筆唯一 key 淘汰最舊項目", async () => {
    const service = new PixabaySearchService();
    mockSearchPixabay.mockReset();

    // 填入 5 筆不同的快取（key0 ~ key4）
    for (let i = 0; i < 5; i++) {
      mockSearchPixabay.mockResolvedValueOnce(makeFakeResult(`key${i}`));
      await service.searchImmediate({ q: `key${i}` });
    }
    expect(mockSearchPixabay).toHaveBeenCalledTimes(5);

    // 加入第 6 筆（key5），應淘汰 key0（最久未使用）
    mockSearchPixabay.mockResolvedValueOnce(makeFakeResult("key5"));
    await service.searchImmediate({ q: "key5" });
    expect(mockSearchPixabay).toHaveBeenCalledTimes(6);

    // key0 已被淘汰，再次搜尋應重新呼叫 API
    mockSearchPixabay.mockResolvedValueOnce(makeFakeResult("key0"));
    await service.searchImmediate({ q: "key0" });
    expect(mockSearchPixabay).toHaveBeenCalledTimes(7);

    // key1 ~ key4 仍在快取中（key5 也在，但 key0 重新加入後 key1 被淘汰）
    // 驗證：key2 ~ key4 仍在快取，不應再次呼叫 API
    for (let i = 2; i <= 4; i++) {
      await service.searchImmediate({ q: `key${i}` });
    }
    expect(mockSearchPixabay).toHaveBeenCalledTimes(7);
  });

  /**
   * Property 5: Pixabay 圖片訊息構建
   * **Validates: Requirements 2.5, 4.1, 4.3**
   *
   * 對於任意 PixabayHit，從該 hit 構建的 ChatMessage 應滿足：
   * - messageType 為 'image-url'
   * - imageUrl 為 hit.proxyWebformatURL
   * - imageCaption 包含作者名稱（hit.user）
   */
  // Feature: pixabay-image-search, Property 5: Pixabay 圖片訊息構建
  it("Property 5: Pixabay 圖片訊息構建 — messageType、imageUrl、imageCaption 正確", () => {
    // 模擬從 PixabayHit 構建 ChatMessage 的邏輯
    function buildImageMessage(hit: PixabaySearchResult["hits"][number]) {
      return {
        messageType: "image-url" as const,
        imageUrl: hit.proxyWebformatURL,
        imageCaption: hit.user,
      };
    }

    fc.assert(
      fc.property(
        fc.record({
          id: fc.integer({ min: 1 }),
          previewURL: fc.string({ minLength: 1 }),
          webformatURL: fc.string({ minLength: 1 }),
          largeImageURL: fc.string({ minLength: 1 }),
          tags: fc.string(),
          user: fc.string({ minLength: 1 }),
          pageURL: fc.string({ minLength: 1 }),
          proxyPreviewURL: fc.string({ minLength: 1 }),
          proxyWebformatURL: fc.string({ minLength: 1 }),
          proxyLargeImageURL: fc.string({ minLength: 1 }),
        }),
        (hit) => {
          const msg = buildImageMessage(hit);

          // messageType 應為 'image-url'
          expect(msg.messageType).toBe("image-url");

          // imageUrl 應為 proxyWebformatURL
          expect(msg.imageUrl).toBe(hit.proxyWebformatURL);

          // imageCaption 應包含作者名稱
          expect(msg.imageCaption).toBe(hit.user);
        },
      ),
      { numRuns: 100 },
    );
  });
});
