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
