import { beforeEach, describe, expect, it, vi } from "vitest";

// 記錄每次實際發出請求時用的 API 設定
const usedSettings: { endpoint: string; model: string }[] = [];

vi.mock("@/api/OpenAICompatible", () => {
  class OpenAICompatibleClient {
    constructor(private apiSettings: { endpoint: string; model: string }) {}
    async *generateStream() {
      usedSettings.push({ ...this.apiSettings });
      yield { type: "done", content: "好的" };
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
      generation: { maxContextLength: 8000, temperature: 1, topP: 1, frequencyPenalty: 0, presencePenalty: 0 },
    }),
  }),
}));
vi.mock("@/stores/theme", () => ({ useThemeStore: () => ({}) }));
vi.mock("@/stores/canvas", () => ({ useCanvasStore: () => ({}) }));
vi.mock("../themeTools", () => ({
  executeToolCall: vi.fn(),
  getTool: () => undefined,
}));
vi.mock("../buildToolPrompt", () => ({
  buildToolPrompt: () => "system",
  snapshotFromContext: () => ({}),
}));

import { runThemeAssistant } from "../ThemeAssistantService";

describe("runThemeAssistant 的 API 設定", () => {
  beforeEach(() => {
    usedSettings.length = 0;
  });

  it("使用者換了 API 之後，下一次請求就用新的設定", async () => {
    currentApi = { endpoint: "https://old.example/v1", model: "old-model", apiKey: "k" };
    await runThemeAssistant("第一次");

    currentApi = { endpoint: "https://new.example/v1", model: "new-model", apiKey: "k2" };
    await runThemeAssistant("第二次");

    expect(usedSettings.map((s) => s.model)).toEqual(["old-model", "new-model"]);
    expect(usedSettings[1].endpoint).toBe("https://new.example/v1");
  });
});
