/**
 * PromptBuilder 位置情境增強屬性測試
 * Feature: location-context-enhancement
 */

import { formatLocalTime } from "@/engine/prompt/PromptBuilder";
import type { NearbyPlace } from "@/services/WeatherService";
import type {
  CharacterWorldSettings,
  StoredCharacter,
} from "@/types/character";
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { PromptBuilderOptions } from "../PromptBuilder";
import { PromptBuilder } from "../PromptBuilder";

// ===== 測試輔助 =====

function createMockCharacter(): StoredCharacter {
  return {
    id: "test-char",
    nickname: "測試角色",
    avatar: "",
    data: {
      name: "測試角色",
      description: "",
      personality: "",
      scenario: "",
      first_mes: "",
      mes_example: "",
      creator_notes: "",
      system_prompt: "",
      post_history_instructions: "",
      alternate_greetings: [],
      tags: [],
      creator: "",
      character_version: "1.0",
      extensions: {
        talkativeness: 0.5,
        fav: false,
        world: "",
        depth_prompt: { prompt: "", depth: 0, role: "system" },
        regex_scripts: [],
      },
    },
    lorebookIds: [],
    source: "manual",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

const baseSettings: PromptBuilderOptions["settings"] = {
  maxContextLength: 4096,
  maxResponseLength: 1024,
  temperature: 0.7,
  topP: 1,
  topK: 0,
  frequencyPenalty: 0,
  presencePenalty: 0,
  repetitionPenalty: 1,
  stopSequences: [],
  streaming: false,
  useStreamingWindow: false,
};

function createOptions(
  overrides: Partial<PromptBuilderOptions> = {},
): PromptBuilderOptions {
  return {
    character: createMockCharacter(),
    lorebooks: [],
    messages: [],
    settings: baseSettings,
    userName: "用戶",
    ...overrides,
  };
}

function getAllContent(messages: Array<{ content: string }>): string {
  return messages.map((m) => m.content).join("\n");
}

const weatherInfoArb = fc.record({
  location: fc.string({ minLength: 1, maxLength: 20 }),
  condition: fc.constantFrom("晴天", "多雲", "雨天"),
  temperature: fc.integer({ min: -10, max: 45 }),
  feelsLike: fc.integer({ min: -10, max: 50 }),
  humidity: fc.integer({ min: 0, max: 100 }),
});

const nearbyPlaceArb = fc.record({
  name: fc.string({ minLength: 1, maxLength: 20 }),
  type: fc.constantFrom("餐廳", "咖啡廳", "景點", "公園", "便利商店"),
  distance: fc.integer({ min: 0, max: 5000 }),
});

// ===== Property 6: 無 GPS 座標時完全省略附近地點 =====
// Feature: location-context-enhancement, Property 6: 無 GPS 座標時完全省略附近地點
describe("Property 6: 無 GPS 座標時完全省略附近地點", () => {
  it("nearbyPlaces 為空陣列或未傳入時，提示詞不含 [附近地點]", async () => {
    await fc.assert(
      fc.asyncProperty(
        weatherInfoArb,
        fc.boolean(), // true = 傳空陣列, false = 不傳
        async (weatherInfo, passEmpty) => {
          const builder = new PromptBuilder(
            createOptions({
              weatherInfo,
              nearbyPlaces: passEmpty ? [] : undefined,
              promptOrder: [{ identifier: "weatherInfo", enabled: true }],
            }),
          );
          const result = await builder.build();
          const content = getAllContent(result.messages);
          expect(content).not.toContain("[附近地點]");
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ===== Property 9: 聊天位置覆蓋優先於全域設定 =====
// Feature: location-context-enhancement, Property 9: 聊天位置覆蓋優先於全域設定
// Note: PromptBuilder 本身接收已解析好的 weatherInfo，位置覆蓋邏輯在呼叫端。
// 此屬性測試驗證：傳入不同 weatherInfo 時，提示詞中的地點名稱與傳入值一致。
describe("Property 9: 傳入的 weatherInfo 地點名稱正確反映在提示詞中", () => {
  it("weatherInfo.location 應出現在提示詞中", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc
          .string({ minLength: 2, maxLength: 15 })
          .filter((s) => !s.includes("\n")),
        async (locationName) => {
          const builder = new PromptBuilder(
            createOptions({
              weatherInfo: {
                location: locationName,
                condition: "晴天",
                temperature: 25,
                feelsLike: 27,
                humidity: 60,
              },
              promptOrder: [{ identifier: "weatherInfo", enabled: true }],
            }),
          );
          const result = await builder.build();
          const content = getAllContent(result.messages);
          expect(content).toContain(locationName);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ===== Property 11: 角色世界設定僅注入有值欄位 =====
// Feature: location-context-enhancement, Property 11: 角色世界設定僅注入有值欄位
describe("Property 11: 角色世界設定僅注入有值欄位", () => {
  it("空欄位不出現在提示詞中，整個區塊不超過 3 行（不含標題）", async () => {
    const worldSettingsArb = fc.record({
      location: fc.option(
        fc
          .string({ minLength: 1, maxLength: 20 })
          .filter((s) => s.trim().length > 0),
        { nil: undefined },
      ),
      timezone: fc.option(
        fc.constantFrom("Asia/Tokyo", "America/New_York", "Europe/London"),
        { nil: undefined },
      ),
      weatherOverride: fc.option(
        fc
          .string({ minLength: 1, maxLength: 30 })
          .filter((s) => s.trim().length > 0),
        { nil: undefined },
      ),
    });

    await fc.assert(
      fc.asyncProperty(worldSettingsArb, async (ws) => {
        const builder = new PromptBuilder(
          createOptions({
            characterWorldSettings: ws,
            promptOrder: [
              { identifier: "characterWorldContext", enabled: true },
            ],
          }),
        );
        const result = await builder.build();
        const content = getAllContent(result.messages);

        const hasAnyValue =
          ws.location?.trim() ||
          ws.timezone?.trim() ||
          ws.weatherOverride?.trim();

        if (!hasAnyValue) {
          // 無有效欄位時不注入
          expect(content).not.toContain("[角色所在地情境]");
        } else {
          expect(content).toContain("[角色所在地情境]");

          // 找到角色世界設定區塊
          const blockStart = content.indexOf("[角色所在地情境]");
          const blockContent = content.slice(blockStart);
          const blockLines = blockContent.split("\n").filter((l) => l.trim());

          // 標題行 + 最多 3 個欄位行
          expect(blockLines.length).toBeLessThanOrEqual(4);

          // 未設定的欄位不應出現
          if (!ws.location?.trim()) {
            expect(blockContent).not.toContain("所在地：");
          }
          if (!ws.timezone?.trim()) {
            expect(blockContent).not.toContain("本地時間：");
          }
          if (!ws.weatherOverride?.trim()) {
            // 只檢查 weatherOverride 的值不出現（避免誤判）
            if (ws.weatherOverride !== undefined) {
              expect(blockContent).not.toContain(`天氣：${ws.weatherOverride}`);
            }
          }
        }
      }),
      { numRuns: 100 },
    );
  });
});

// ===== Property 12: 時區計算正確性 =====
// Feature: location-context-enhancement, Property 12: 角色世界設定時區計算正確性
describe("Property 12: formatLocalTime 時區計算正確性", () => {
  it("有效 IANA 時區應產生 YYYY/MM/DD HH:MM 格式字串", () => {
    const validTimezones = [
      "Asia/Tokyo",
      "Asia/Taipei",
      "America/New_York",
      "Europe/London",
      "UTC",
      "Pacific/Auckland",
    ];

    fc.assert(
      fc.property(
        fc.constantFrom(...validTimezones),
        fc.integer({ min: 0, max: 2000000000000 }),
        (tz, timestamp) => {
          const date = new Date(timestamp);
          const result = formatLocalTime(date, tz);
          // 格式：YYYY/MM/DD HH:MM
          expect(result).toMatch(/^\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}$/);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("無效時區應回退至 UTC 並仍產生正確格式", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 20 }).filter((s) => {
          try {
            new Intl.DateTimeFormat("zh-TW", { timeZone: s });
            return false;
          } catch {
            return true;
          }
        }),
        fc.integer({ min: 0, max: 2000000000000 }),
        (invalidTz, timestamp) => {
          const date = new Date(timestamp);
          const result = formatLocalTime(date, invalidTz);
          expect(result).toMatch(/^\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}$/);
        },
      ),
      { numRuns: 50 },
    );
  });

  it("與 Intl.DateTimeFormat 使用相同時區的結果一致", () => {
    const validTimezones = ["Asia/Tokyo", "America/New_York", "UTC"];
    fc.assert(
      fc.property(
        fc.constantFrom(...validTimezones),
        fc.integer({ min: 946684800000, max: 2000000000000 }), // 2000年後
        (tz, timestamp) => {
          const date = new Date(timestamp);
          const result = formatLocalTime(date, tz);

          // 用 Intl.DateTimeFormat 獨立計算驗證
          const fmt = new Intl.DateTimeFormat("zh-TW", {
            timeZone: tz,
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
          });
          const parts = fmt.formatToParts(date);
          const get = (type: string) =>
            parts.find((p) => p.type === type)?.value ?? "00";
          const expected = `${get("year")}/${get("month")}/${get("day")} ${get("hour")}:${get("minute")}`;

          expect(result).toBe(expected);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ===== Property 14: 無天氣資訊時不注入天氣區塊 =====
// Feature: location-context-enhancement, Property 14: 無天氣資訊時不注入天氣區塊
describe("Property 14: 無天氣資訊時不注入天氣區塊", () => {
  it("weatherInfo 為 undefined 時，提示詞不含 [當前天氣]", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(nearbyPlaceArb, { maxLength: 5 }),
        async (nearbyPlaces) => {
          const builder = new PromptBuilder(
            createOptions({
              // 不傳 weatherInfo
              nearbyPlaces,
              promptOrder: [{ identifier: "weatherInfo", enabled: true }],
            }),
          );
          const result = await builder.build();
          const content = getAllContent(result.messages);
          expect(content).not.toContain("[當前天氣]");
          // 無天氣時附近地點也不應注入
          expect(content).not.toContain("[附近地點]");
        },
      ),
      { numRuns: 100 },
    );
  });
});
