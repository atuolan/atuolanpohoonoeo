/**
 * WeatherService 單元測試
 * 測試 Nominatim 回退行為與 Overpass 失敗處理
 */

import { getNearbyPlaces, searchCities } from "@/services/WeatherService";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

beforeEach(() => {
  mockFetch.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("searchCities", () => {
  it("Requirements 1.3: Nominatim 失敗時回退至 Open-Meteo", async () => {
    // 第一次呼叫（Nominatim）失敗
    mockFetch.mockRejectedValueOnce(new Error("網路錯誤"));

    // 第二次呼叫（Open-Meteo）成功
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        results: [
          {
            id: 1,
            name: "斗六市",
            admin1: "雲林縣",
            country: "台灣",
            latitude: 23.7,
            longitude: 120.5,
          },
        ],
      }),
    } as Response);

    const results = await searchCities("斗六市");
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe("斗六市");
    expect(results[0].region).toBe("雲林縣");
  });

  it("Requirements 1.3: Nominatim 回傳空陣列時回退至 Open-Meteo", async () => {
    // Nominatim 回傳空陣列
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [],
    } as Response);

    // Open-Meteo 成功
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        results: [
          {
            id: 2,
            name: "板橋區",
            admin1: "新北市",
            country: "台灣",
            latitude: 25.01,
            longitude: 121.46,
          },
        ],
      }),
    } as Response);

    const results = await searchCities("板橋區");
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe("板橋區");
  });

  it("Nominatim 成功時直接回傳結果，不呼叫 Open-Meteo", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [
        {
          place_id: 123,
          display_name: "斗六市, 雲林縣, 台灣",
          lat: "23.7",
          lon: "120.5",
          address: { city: "斗六市", state: "雲林縣", country: "台灣" },
        },
      ],
    } as Response);

    const results = await searchCities("斗六市");
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe("斗六市");
    // 只呼叫一次（Nominatim），不呼叫 Open-Meteo
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});

describe("getNearbyPlaces", () => {
  it("Requirements 2.4: Overpass API 失敗時回傳空陣列，不拋出例外", async () => {
    mockFetch.mockRejectedValueOnce(new Error("Overpass 連線失敗"));

    const result = await getNearbyPlaces(25.04, 121.51, 500, 5);
    expect(result).toEqual([]);
  });

  it("Requirements 2.4: Overpass API 回傳非 ok 狀態時回傳空陣列", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 429,
    } as Response);

    const result = await getNearbyPlaces(25.04, 121.51, 500, 5);
    expect(result).toEqual([]);
  });

  it("正常回傳時依距離排序並截斷至 limit", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        elements: [
          {
            type: "node",
            id: 1,
            lat: 25.041,
            lon: 121.511,
            tags: { amenity: "restaurant", name: "遠餐廳" },
          },
          {
            type: "node",
            id: 2,
            lat: 25.0401,
            lon: 121.5101,
            tags: { amenity: "cafe", name: "近咖啡廳" },
          },
          {
            type: "node",
            id: 3,
            lat: 25.042,
            lon: 121.512,
            tags: { shop: "convenience", name: "便利商店" },
          },
        ],
      }),
    } as Response);

    const result = await getNearbyPlaces(25.04, 121.51, 500, 2);
    expect(result).toHaveLength(2);
    // 第一筆應為距離最近的
    expect(result[0].name).toBe("近咖啡廳");
    expect(result[0].type).toBe("咖啡廳");
    expect(result[0].distance).toBeGreaterThanOrEqual(0);
  });
});
