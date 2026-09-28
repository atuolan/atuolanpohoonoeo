import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";

const storage = new Map<string, unknown>();

vi.mock("@/db/database", () => ({
  DB_STORES: { SETTINGS: "settings" },
  db: {
    init: vi.fn(async () => {}),
    get: vi.fn(async (_store: string, key: string) => storage.get(key)),
    put: vi.fn(async (_store: string, value: unknown, key: string) => {
      storage.set(key, value);
    }),
  },
}));

import {
  createDefaultPromptManagerConfig,
  DEFAULT_FACE_TO_FACE_PROMPT_ORDER,
  FACE_TO_FACE_PROMPT_DEFINITIONS,
} from "@/types/promptManager";
import { FACE_TO_FACE_PROMPT_RESET_VERSION, usePromptManagerStore } from "./promptManager";

function oldUserConfig() {
  const config = createDefaultPromptManagerConfig();
  config.faceToFacePrompts = [
    { ...FACE_TO_FACE_PROMPT_DEFINITIONS[0], content: "舊內容" },
    { ...FACE_TO_FACE_PROMPT_DEFINITIONS[0], identifier: "f2f_custom_old", name: "舊自訂" },
  ];
  config.faceToFacePromptOrder = [{ identifier: "f2f_custom_old", enabled: true }];
  config.deletedFaceToFacePromptIds = ["f2fWeatherInfo"];
  config.prompts[0] = { ...config.prompts[0], content: "一般聊天自訂" };
  return config;
}

describe("面對面提示詞強制重置引導", () => {
  beforeEach(() => {
    storage.clear();
    setActivePinia(createPinia());
  });

  it("已完成上一版重置的用戶，在新版本仍需要重置", async () => {
    const config = createDefaultPromptManagerConfig();
    config.faceToFacePromptResetVersion = FACE_TO_FACE_PROMPT_RESET_VERSION - 1;
    storage.set("promptManagerConfig", config);
    const store = usePromptManagerStore();
    await store.loadConfig();
    expect(store.needsFaceToFacePromptReset).toBe(true);
  });

  it("新用戶不需要重置", async () => {
    const store = usePromptManagerStore();
    await store.loadConfig();
    expect(store.needsFaceToFacePromptReset).toBe(false);
  });

  it("舊用戶需要重置；確定重置後恢復默認、寫回資料庫、重新載入也不再要求", async () => {
    storage.set("promptManagerConfig", oldUserConfig());
    const store = usePromptManagerStore();
    await store.loadConfig();
    expect(store.needsFaceToFacePromptReset).toBe(true);

    await store.resetFaceToFaceToDefault();

    expect(store.needsFaceToFacePromptReset).toBe(false);
    expect(store.config.faceToFacePrompts).toEqual(FACE_TO_FACE_PROMPT_DEFINITIONS);
    expect(store.config.faceToFacePromptOrder).toEqual(DEFAULT_FACE_TO_FACE_PROMPT_ORDER);
    expect(store.config.deletedFaceToFacePromptIds).toEqual([]);
    // 其他模式不受影響
    expect(store.config.prompts[0].content).toBe("一般聊天自訂");

    const saved = storage.get("promptManagerConfig") as { faceToFacePromptResetVersion?: number };
    expect(saved.faceToFacePromptResetVersion).toBe(FACE_TO_FACE_PROMPT_RESET_VERSION);

    setActivePinia(createPinia());
    const reloaded = usePromptManagerStore();
    await reloaded.loadConfig();
    expect(reloaded.needsFaceToFacePromptReset).toBe(false);
    expect(reloaded.config.faceToFacePrompts).toEqual(FACE_TO_FACE_PROMPT_DEFINITIONS);
  });
});

describe("已停用的面對面必要條目", () => {
  beforeEach(() => {
    storage.clear();
    setActivePinia(createPinia());
  });

  it("載入舊設定時移除「奇蹟實現的步驟」、「開始」與「角色設定」，其他條目保留", async () => {
    const retiredIds = ["f2fExampleScript", "f2f_custom_1772288204573", "f2fCharacterSettings"];
    const config = createDefaultPromptManagerConfig();
    config.faceToFacePrompts = [
      ...structuredClone(FACE_TO_FACE_PROMPT_DEFINITIONS),
      ...retiredIds.map((identifier) => ({
        ...FACE_TO_FACE_PROMPT_DEFINITIONS[0],
        identifier,
        locked: true,
        isDeletable: false,
      })),
    ];
    config.faceToFacePromptOrder = [
      ...structuredClone(DEFAULT_FACE_TO_FACE_PROMPT_ORDER),
      ...retiredIds.map((identifier) => ({ identifier, enabled: true })),
    ];
    storage.set("promptManagerConfig", config);

    const store = usePromptManagerStore();
    await store.loadConfig();

    const promptIds = store.config.faceToFacePrompts!.map((p) => p.identifier);
    const orderIds = store.config.faceToFacePromptOrder!.map((e) => e.identifier);
    for (const id of retiredIds) {
      expect(promptIds).not.toContain(id);
      expect(orderIds).not.toContain(id);
    }
    expect(promptIds).toHaveLength(FACE_TO_FACE_PROMPT_DEFINITIONS.length);
    expect(orderIds).toHaveLength(DEFAULT_FACE_TO_FACE_PROMPT_ORDER.length);
  });
});

describe("面對面提示詞不再出現基拉祈/雪拉比", () => {
  beforeEach(() => {
    storage.clear();
    setActivePinia(createPinia());
  });

  it("預設條目不含舊說書人", () => {
    for (const prompt of FACE_TO_FACE_PROMPT_DEFINITIONS) {
      expect(prompt.content).not.toMatch(/基拉[祈奇]|雪拉比/);
    }
  });

  it("已存的舊內容載入時改為涅芙，並修正結尾標籤", async () => {
    const config = createDefaultPromptManagerConfig();
    config.faceToFacePromptResetVersion = FACE_TO_FACE_PROMPT_RESET_VERSION;
    config.faceToFacePrompts = structuredClone(FACE_TO_FACE_PROMPT_DEFINITIONS).map((p) => {
      if (p.identifier === "f2fPowerDynamic") {
        return {
          ...p,
          content: p.content
            .replace("\n涅芙：不會的", "\n基拉祈：不會的")
            .replace("\n涅芙：他不會", "\n雪拉比：他不會")
            .replace("</power_dynamic>", "</character_settings>"),
        };
      }
      if (p.identifier === "f2fSocialMedia") {
        return { ...p, content: p.content.replace("\n涅芙：这是", "\n基拉祈：这是") };
      }
      return p;
    });
    storage.set("promptManagerConfig", config);

    const store = usePromptManagerStore();
    await store.loadConfig();

    for (const id of ["f2fPowerDynamic", "f2fSocialMedia"]) {
      const stored = store.config.faceToFacePrompts!.find((p) => p.identifier === id)!;
      const expected = FACE_TO_FACE_PROMPT_DEFINITIONS.find((p) => p.identifier === id)!;
      expect(stored.content).toBe(expected.content);
    }
  });
});
