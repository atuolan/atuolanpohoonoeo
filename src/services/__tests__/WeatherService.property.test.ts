/**
 * WeatherService 屬性測試
 * Feature: location-context-enhancement
 */

import {
  getNearbyPlaces,
  parseNominatimDisplayName,
  type NearbyPlace,
  type NominatimResult,
} from "@/services/WeatherService";
import * as fc from "fast-check";
import { beforeEach, describe, expect, it, vi } from "vitest";

// mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

beforeEach(() => {
  mockFetch.mockReset();
});

// ===== 輔助：格式化附近地點為管道分隔字串 =====
function formatNearbyPlaces(places: NearbyPlace[]): string {
  return `[附近地點]${places.map((p) => `${p.type},${p.distance}m,${p.name}`).join("|")}`;
}

// ===== Nominatim 結果轉換（模擬 searchCities 內部邏輯） =====
function convertNominatimResult(r: NominatimResult, idx: number) {
  return {
    id: r.place_id ?? idx,
    name: parseNominatimDisplayName(r.address, r.display_name),
    region: r.address?.state ?? r.address?.county ?? "",
    country: r.address?.country ?? "",
    lat: parseFloat(r.lat),
    lon: parseFloat(r.lon),
  };
}

// ===== Arbitraries =====

const nominatimAddressArb = fc.record({
  city: fc.option(fc.string({ minLength: 1, maxLength: 20 }), {
    nil: undefined,
  }),
  town: fc.option(fc.string({ minLength: 1, maxLength: 20 }), {
    nil: undefined,
  }),
  village: fc.option(fc.string({ minLength: 1, maxLength: 20 }), {
    nil: undefined,
  }),
  county: fc.option(fc.string({ minLength: 1, maxLength: 20 }), {
    nil: undefined,
  }),
  state: fc.option(fc.string({ minLength: 1, maxLength: 20 }), {
    nil: undefined,
  }),
  country: fc.option(fc.string({ minLength: 1, maxLength: 20 }), {
    nil: undefined,
  }),
  country_code: fc.option(fc.string({ minLength: 2, maxLength: 2 }), {
    nil: undefined,
  }),
});

const nominatimResultArb = fc.record({
  place_id: fc.integer({ min: 1, max: 999999 }),
  display_name: fc.string({ minLength: 3, maxLength: 100 }),
  lat: fc.float({ min: -90, max: 90, noNaN: true }).map((n) => n.toFixed(6)),
  lon: fc.float({ min: -180, max: 180, noNaN: true }).map((n) => n.toFixed(6)),
  address: fc.option(nominatimAddressArb, { nil: undefined }),
});

const nearbyPlaceArb = fc.record({
  // 排除 | 字元，避免管道分隔格式計算錯誤
  name: fc
    .string({ minLength: 1, maxLength: 30 })
    .filter((s) => !s.includes("|")),
  type: fc.constantFrom("餐廳", "咖啡廳", "景點", "公園", "便利商店"),
  distance: fc.integer({ min: 0, max: 10000 }),
});

// ===== Property 1: Nominatim 回應轉換結構完整性 =====
// Feature: location-context-enhancement, Property 1: Nominatim 回應轉換結構完整性
describe("Property 1: Nominatim 回應轉換結構完整性", () => {
  it("轉換後應包含 name/region/country/lat/lon 五個欄位，lat/lon 為數值", () => {
    fc.assert(
      fc.property(nominatimResultArb, (r) => {
        const result = convertNominatimResult(r, 0);
        expect(typeof result.id).toBe("number");
        expect(typeof result.name).toBe("string");
        expect(typeof result.region).toBe("string");
        expect(typeof result.country).toBe("string");
        expect(typeof result.lat).toBe("number");
        expect(typeof result.lon).toBe("number");
        expect(isNaN(result.lat)).toBe(false);
        expect(isNaN(result.lon)).toBe(false);
      }),
      { numRuns: 100 },
    );
  });
});

// ===== Property 2: Nominatim 地址欄位優先順序 =====
// Feature: location-context-enhancement, Property 2: Nominatim 地址欄位優先順序
describe("Property 2: Nominatim 地址欄位優先順序", () => {
  it("city > town > village > county，全空時回退至 display_name 第一段", () => {
    fc.assert(
      fc.property(
        nominatimAddressArb,
        fc.string({ minLength: 3, maxLength: 50 }),
        (address, displayName) => {
          const result = parseNominatimDisplayName(address, displayName);
          if (address.city) {
            expect(result).toBe(address.city);
          } else if (address.town) {
            expect(result).toBe(address.town);
          } else if (address.village) {
            expect(result).toBe(address.village);
          } else if (address.county) {
            expect(result).toBe(address.county);
          } else {
            // 回退至 display_name 第一個逗號前
            expect(result).toBe(displayName.split(",")[0].trim());
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ===== Property 3: Nominatim 請求包含語言標頭 =====
// Feature: location-context-enhancement, Property 3: Nominatim 請求包含語言標頭
describe("Property 3: Nominatim 請求包含語言標頭", () => {
  it("searchCities 發出的代理 URL 應包含 accept-language=zh-TW 參數", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc
          .string({ minLength: 1, maxLength: 20 })
          .filter((s) => s.trim().length > 0),
        async (query) => {
          mockFetch.mockResolvedValueOnce({
            ok: true,
            json: async () => [
              {
                place_id: 1,
                display_name: "測試地點",
                lat: "25.0",
                lon: "121.5",
                address: { city: "測試市" },
              },
            ],
          } as Response);

          const { searchCities } = await import("@/services/WeatherService");
          await searchCities(query);

          const calledUrl: string = mockFetch.mock.calls[0][0];
          // 代理 URL 中應包含 accept-language=zh-TW（URL 編碼後）
          expect(calledUrl).toContain("accept-language");
          expect(calledUrl.toLowerCase()).toContain("zh-tw");

          mockFetch.mockReset();
        },
      ),
      { numRuns: 10 },
    );
  });
});

// ===== Property 4: 附近地點依距離排序且不超過 limit =====
// Feature: location-context-enhancement, Property 4: 附近地點依距離排序且不超過 limit
describe("Property 4: 附近地點依距離排序且不超過 limit", () => {
  it("回傳結果按 distance 升序排列，數量不超過 limit，distance 為非負整數", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 10 }),
        fc.array(
          fc.record({
            lat: fc.double({ min: 25.0, max: 25.1, noNaN: true }),
            lon: fc.double({ min: 121.5, max: 121.6, noNaN: true }),
            name: fc.string({ minLength: 1, maxLength: 10 }),
            amenity: fc.constantFrom("restaurant", "cafe"),
          }),
          { minLength: 0, maxLength: 20 },
        ),
        async (limit, nodes) => {
          mockFetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({
              elements: nodes.map((n, i) => ({
                type: "node",
                id: i,
                lat: n.lat,
                lon: n.lon,
                tags: { amenity: n.amenity, name: n.name },
              })),
            }),
          } as Response);

          const result = await getNearbyPlaces(25.05, 121.55, 500, limit);

          // 數量不超過 limit
          expect(result.length).toBeLessThanOrEqual(limit);

          // 依距離升序排列
          for (let i = 1; i < result.length; i++) {
            expect(result[i].distance).toBeGreaterThanOrEqual(
              result[i - 1].distance,
            );
          }

          // distance 為非負整數
          for (const place of result) {
            expect(place.distance).toBeGreaterThanOrEqual(0);
            expect(Number.isInteger(place.distance)).toBe(true);
          }

          mockFetch.mockReset();
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ===== Property 5: 附近地點格式化為管道分隔字串 =====
// Feature: location-context-enhancement, Property 5: 附近地點格式化為管道分隔字串
describe("Property 5: 附近地點格式化為管道分隔字串", () => {
  it("非空陣列應產生 [附近地點]類型,距離m,名稱|... 格式，管道數量等於地點數減一", () => {
    fc.assert(
      fc.property(
        fc.array(nearbyPlaceArb, { minLength: 1, maxLength: 10 }),
        (places) => {
          const formatted = formatNearbyPlaces(places);

          // 以 [附近地點] 開頭
          expect(formatted).toMatch(/^\[附近地點\]/);

          // 管道符號數量等於地點數減一
          const pipeCount = (formatted.match(/\|/g) ?? []).length;
          expect(pipeCount).toBe(places.length - 1);

          // 每個地點的格式為 類型,距離m,名稱
          const body = formatted.replace("[附近地點]", "");
          const parts = body.split("|");
          expect(parts).toHaveLength(places.length);
          for (const part of parts) {
            expect(part).toMatch(/^.+,\d+m,.+$/);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
