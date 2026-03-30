// Pixabay API 客戶端屬性測試
import { searchPixabay, toImageProxyUrl } from "@/api/PixabayApi";
import * as fc from "fast-check";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// 有效的 HTTP 錯誤狀態碼任意值生成器
const httpErrorStatus = fc.oneof(
  fc.integer({ min: 400, max: 499 }),
  fc.integer({ min: 500, max: 599 }),
);

// 有效的 PixabayHit 任意值生成器
const pixabayHitArb = fc.record({
  id: fc.integer({ min: 1 }),
  previewURL: fc.webUrl(),
  webformatURL: fc.webUrl(),
  largeImageURL: fc.webUrl(),
  tags: fc.string(),
  user: fc.string(),
  pageURL: fc.webUrl(),
});

describe("PixabayApi 屬性測試", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  // Feature: pixabay-image-search, Property 1: URL 參數構建完整性
  // Validates: Requirements 1.1, 1.4, 1.5
  it("Property 1: 任意有效搜尋參數構建的 URL 應包含所有必要查詢參數", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({ q: fc.string({ minLength: 1 }) }),
        async (params) => {
          let capturedUrl = "";
          const fetchMock = vi.fn().mockImplementation((url: string) => {
            capturedUrl = url;
            return Promise.resolve({
              ok: true,
              json: async () => ({ total: 0, totalHits: 0, hits: [] }),
            });
          });
          vi.stubGlobal("fetch", fetchMock);

          await searchPixabay(params);

          // 必要參數必須存在
          expect(capturedUrl).toContain("key=");
          expect(capturedUrl).toContain(`q=`);
          expect(capturedUrl).toContain("image_type=");
          expect(capturedUrl).toContain("per_page=");

          // 未指定 lang 時預設為 zh
          expect(capturedUrl).toContain("lang=zh");

          // 未指定 page 時預設為 1
          expect(capturedUrl).toContain("page=1");
        },
      ),
      { numRuns: 100 },
    );
  });

  // Feature: pixabay-image-search, Property 2: API 回應解析往返
  // Validates: Requirements 1.3, 1.9
  it("Property 2: 任意有效 Pixabay API 回應解析後應保留所有欄位值", async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(pixabayHitArb), async (hitsInput) => {
        const apiResponse = {
          total: hitsInput.length * 10,
          totalHits: hitsInput.length,
          hits: hitsInput,
        };

        const fetchMock = vi.fn().mockResolvedValue({
          ok: true,
          json: async () => apiResponse,
        });
        vi.stubGlobal("fetch", fetchMock);

        const result = await searchPixabay({ q: "test" });

        // hits 數量應與原始回應一致
        expect(result.hits.length).toBe(hitsInput.length);
        expect(result.total).toBe(apiResponse.total);
        expect(result.totalHits).toBe(apiResponse.totalHits);

        // 每個 hit 應保留原始欄位值
        for (let i = 0; i < hitsInput.length; i++) {
          const original = hitsInput[i];
          const parsed = result.hits[i];
          expect(parsed.id).toBe(original.id);
          expect(parsed.previewURL).toBe(original.previewURL);
          expect(parsed.webformatURL).toBe(original.webformatURL);
          expect(parsed.largeImageURL).toBe(original.largeImageURL);
          expect(parsed.tags).toBe(original.tags);
          expect(parsed.user).toBe(original.user);
          expect(parsed.pageURL).toBe(original.pageURL);
        }
      }),
      { numRuns: 100 },
    );
  });

  // Feature: pixabay-image-search, Property 3: 圖片 URL 代理轉換
  // Validates: Requirements 1.8
  it("Property 3: toImageProxyUrl 應回傳以 /image-proxy?url= 開頭並包含編碼後 URL 的字串", () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1 }), (url) => {
        const result = toImageProxyUrl(url);
        // 必須以 /image-proxy?url= 開頭
        expect(result.startsWith("/image-proxy?url=")).toBe(true);
        // 後面必須是 encodeURIComponent 編碼的原始 URL
        expect(result).toBe(`/image-proxy?url=${encodeURIComponent(url)}`);
      }),
      { numRuns: 100 },
    );
  });

  it("Property 3b: 任意 PixabaySearchResult 中每個 hit 的代理 URL 應等於 toImageProxyUrl 的結果", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(pixabayHitArb, { minLength: 1, maxLength: 5 }),
        async (hitsInput) => {
          const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({
              total: hitsInput.length,
              totalHits: hitsInput.length,
              hits: hitsInput,
            }),
          });
          vi.stubGlobal("fetch", fetchMock);

          const result = await searchPixabay({ q: "proxy-test" });

          for (let i = 0; i < result.hits.length; i++) {
            const hit = result.hits[i];
            expect(hit.proxyPreviewURL).toBe(toImageProxyUrl(hit.previewURL));
            expect(hit.proxyWebformatURL).toBe(
              toImageProxyUrl(hit.webformatURL),
            );
            expect(hit.proxyLargeImageURL).toBe(
              toImageProxyUrl(hit.largeImageURL),
            );
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  // Feature: pixabay-image-search, Property 4: HTTP 錯誤結構化回傳
  // Validates: Requirements 1.6
  it("Property 4: 任意 HTTP 錯誤狀態碼應拋出含 status 欄位與 message 字串的結構化錯誤", async () => {
    await fc.assert(
      fc.asyncProperty(httpErrorStatus, async (statusCode) => {
        const fetchMock = vi.fn().mockResolvedValue({
          ok: false,
          status: statusCode,
        });
        vi.stubGlobal("fetch", fetchMock);

        let thrownError: unknown = null;
        try {
          await searchPixabay({ q: "error-test" });
        } catch (err) {
          thrownError = err;
        }

        // 必須拋出錯誤
        expect(thrownError).not.toBeNull();
        // 錯誤必須包含 status 欄位，且等於 HTTP 狀態碼
        expect(thrownError).toMatchObject({
          status: statusCode,
          message: expect.any(String),
        });
      }),
      { numRuns: 100 },
    );
  });
});
