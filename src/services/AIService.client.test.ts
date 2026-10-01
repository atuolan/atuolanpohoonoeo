import { beforeEach, describe, expect, it, vi } from "vitest";

// 記錄每次實際發出請求時用的 API 設定
const usedSettings: { endpoint: string; model: string }[] = [];

vi.mock("@/api/OpenAICompatible", () => {
  class OpenAICompatibleClient {
    constructor(private apiSettings: { endpoint: string; model: string }) {}
    async generate() {
      usedSettings.push({ ...this.apiSettings });
      return { content: "" };
    }
  }
  // 與正式程式相同：第一次建立後就固定，之後傳入的設定會被忽略
  let singleton: OpenAICompatibleClient | null = null;
  return {
    OpenAICompatibleClient,
    getAPIClient: (s: { endpoint: string; model: string }) =>
      (singleton ??= new OpenAICompatibleClient(s)),
  };
});

let currentApi = { endpoint: "https://old.example/v1", model: "old-model", apiKey: "k" };

vi.mock("@/stores/settings", () => ({
  useSettingsStore: () => ({
    getAPIForTask: () => ({
      api: { ...currentApi },
      generation: { maxContextLength: 8000, maxTokens: 1000, temperature: 1, topP: 1, frequencyPenalty: 0, presencePenalty: 0, streamingEnabled: false },
    }),
  }),
}));
vi.mock("@/stores/promptManager", () => ({
  usePromptManagerStore: () => ({ plurkCommentPromptOrder: [], plurkCommentPrompts: [] }),
}));

import { generateBatchComments } from "./AIService";

const post = {
  id: "p1",
  authorId: "user",
  username: "作者",
  content: "今天天氣很好",
  images: [],
} as unknown as Parameters<typeof generateBatchComments>[0]["post"];

describe("generateBatchComments 的 API 設定", () => {
  beforeEach(() => {
    usedSettings.length = 0;
  });

  it("使用者換了 API 之後，下一次請求就用新的設定", async () => {
    currentApi = { endpoint: "https://old.example/v1", model: "old-model", apiKey: "k" };
    await generateBatchComments({ characters: [], post });

    currentApi = { endpoint: "https://new.example/v1", model: "new-model", apiKey: "k2" };
    await generateBatchComments({ characters: [], post });

    expect(usedSettings.map((s) => s.model)).toEqual(["old-model", "new-model"]);
    expect(usedSettings[1].endpoint).toBe("https://new.example/v1");
  });
});
