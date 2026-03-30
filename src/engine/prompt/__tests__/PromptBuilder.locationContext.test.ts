/**
 * PromptBuilder 位置情境增強單元測試
 * Feature: location-context-enhancement
 *
 * 測試角色世界設定區塊標題（Requirements 4.6）
 * 測試附近地點注入格式（Requirements 2.6, 2.11）
 */

import type { NearbyPlace } from "@/services/WeatherService";
import type { StoredCharacter } from "@/types/character";
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
      description: "測試用角色",
      personality: "",
      scenario: "",
      first_mes: "你好！",
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

function createMinimalOptions(
  overrides: Partial<PromptBuilderOptions> = {},
): PromptBuilderOptions {
  return {
    character: createMockCharacter(),
    lorebooks: [],
    messages: [],
    settings: {
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
    },
    userName: "用戶",
    ...overrides,
  };
}

function getAllContent(messages: Array<{ content: string }>): string {
  return messages.map((m) => m.content).join("\n");
}

// ===== 角色世界設定區塊標題測試 =====

describe("Requirements 4.6: 角色世界設定區塊標題為「角色所在地情境」", () => {
  it("注入角色世界設定時，區塊標題應為 [角色所在地情境]", async () => {
    const builder = new PromptBuilder(
      createMinimalOptions({
        characterWorldSettings: {
          location: "東京，日本",
          timezone: "Asia/Tokyo",
          weatherOverride: "晴天，28°C",
        },
        promptOrder: [{ identifier: "characterWorldContext", enabled: true }],
      }),
    );

    const result = await builder.build();
    const content = getAllContent(result.messages);
    expect(content).toContain("[角色所在地情境]");
  });

  it("角色世界設定區塊應包含所在地資訊", async () => {
    const builder = new PromptBuilder(
      createMinimalOptions({
        characterWorldSettings: {
          location: "東京，日本",
        },
        promptOrder: [{ identifier: "characterWorldContext", enabled: true }],
      }),
    );

    const result = await builder.build();
    const content = getAllContent(result.messages);
    expect(content).toContain("東京，日本");
  });

  it("角色世界設定為空時不注入任何內容", async () => {
    const builder = new PromptBuilder(
      createMinimalOptions({
        characterWorldSettings: {},
        promptOrder: [{ identifier: "characterWorldContext", enabled: true }],
      }),
    );

    const result = await builder.build();
    const content = getAllContent(result.messages);
    expect(content).not.toContain("[角色所在地情境]");
  });

  it("未設定 characterWorldSettings 時不注入", async () => {
    const builder = new PromptBuilder(
      createMinimalOptions({
        promptOrder: [{ identifier: "characterWorldContext", enabled: true }],
      }),
    );

    const result = await builder.build();
    const content = getAllContent(result.messages);
    expect(content).not.toContain("[角色所在地情境]");
  });
});

// ===== 附近地點注入測試 =====

describe("Requirements 2.6, 2.11: 附近地點注入格式與 limit/radius 參數", () => {
  const sampleNearbyPlaces: NearbyPlace[] = [
    { name: "微熱山丘", type: "餐廳", distance: 120 },
    { name: "全家", type: "便利商店", distance: 60 },
    { name: "星巴克", type: "咖啡廳", distance: 200 },
  ];

  it("有附近地點時應注入管道分隔格式", async () => {
    const builder = new PromptBuilder(
      createMinimalOptions({
        weatherInfo: {
          location: "台北",
          condition: "晴天",
          temperature: 28,
          feelsLike: 30,
          humidity: 70,
        },
        nearbyPlaces: sampleNearbyPlaces,
        promptOrder: [{ identifier: "weatherInfo", enabled: true }],
      }),
    );

    const result = await builder.build();
    const content = getAllContent(result.messages);
    expect(content).toContain("[附近地點]");
    expect(content).toContain("餐廳,120m,微熱山丘");
    expect(content).toContain("便利商店,60m,全家");
    expect(content).toContain("咖啡廳,200m,星巴克");
  });

  it("無附近地點時不注入 [附近地點] 行", async () => {
    const builder = new PromptBuilder(
      createMinimalOptions({
        weatherInfo: {
          location: "台北",
          condition: "晴天",
          temperature: 28,
          feelsLike: 30,
          humidity: 70,
        },
        nearbyPlaces: [],
        promptOrder: [{ identifier: "weatherInfo", enabled: true }],
      }),
    );

    const result = await builder.build();
    const content = getAllContent(result.messages);
    expect(content).not.toContain("[附近地點]");
  });

  it("未傳入 nearbyPlaces 時不注入 [附近地點] 行", async () => {
    const builder = new PromptBuilder(
      createMinimalOptions({
        weatherInfo: {
          location: "台北",
          condition: "晴天",
          temperature: 28,
          feelsLike: 30,
          humidity: 70,
        },
        promptOrder: [{ identifier: "weatherInfo", enabled: true }],
      }),
    );

    const result = await builder.build();
    const content = getAllContent(result.messages);
    expect(content).not.toContain("[附近地點]");
  });

  it("附近地點行應在天氣資訊區塊內（同一 message）", async () => {
    const builder = new PromptBuilder(
      createMinimalOptions({
        weatherInfo: {
          location: "台北",
          condition: "晴天",
          temperature: 28,
          feelsLike: 30,
          humidity: 70,
        },
        nearbyPlaces: [{ name: "全家", type: "便利商店", distance: 50 }],
        promptOrder: [{ identifier: "weatherInfo", enabled: true }],
      }),
    );

    const result = await builder.build();
    // 找到包含天氣資訊的 message
    const weatherMsg = result.messages.find((m) =>
      m.content.includes("[當前天氣]"),
    );
    expect(weatherMsg).toBeDefined();
    expect(weatherMsg!.content).toContain("[附近地點]");
  });
});
