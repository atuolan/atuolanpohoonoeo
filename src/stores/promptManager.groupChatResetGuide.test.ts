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
  DEFAULT_GROUP_CHAT_PROMPT_ORDER,
  GROUP_CHAT_PROMPT_DEFINITIONS,
} from "@/types/promptManager";
import { GROUP_CHAT_PROMPT_RESET_VERSION, usePromptManagerStore } from "./promptManager";

/** 舊版群聊設定：還留著防護序列、示範劇本與預填 <think> */
function oldUserConfig() {
  const config = createDefaultPromptManagerConfig();
  delete config.groupChatPromptResetVersion;
  const base = GROUP_CHAT_PROMPT_DEFINITIONS[0];
  config.groupChatPrompts = [
    ...config.groupChatPrompts!,
    { ...base, identifier: "gcProtectionSequence", name: "防護序列" },
    { ...base, identifier: "gcExampleScript", name: "示範劇本" },
    { ...base, identifier: "gc_custom_1776261090428", name: "<think>", role: "assistant", content: "<think>", locked: true },
  ];
  config.groupChatPromptOrder = [
    { identifier: "gcProtectionSequence", enabled: true },
    ...config.groupChatPromptOrder!,
    { identifier: "gcExampleScript", enabled: true },
    { identifier: "gc_custom_1776261090428", enabled: true },
  ];
  config.prompts[0] = { ...config.prompts[0], content: "一般聊天自訂" };
  return config;
}

describe("群聊提示詞強制重置引導", () => {
  beforeEach(() => {
    storage.clear();
    setActivePinia(createPinia());
  });

  it("新用戶不需要重置", async () => {
    const store = usePromptManagerStore();
    await store.loadConfig();
    expect(store.needsGroupChatPromptReset).toBe(false);
  });

  it("已完成上一版重置的用戶，在新版本仍需要重置", async () => {
    const config = createDefaultPromptManagerConfig();
    config.groupChatPromptResetVersion = GROUP_CHAT_PROMPT_RESET_VERSION - 1;
    storage.set("promptManagerConfig", config);
    const store = usePromptManagerStore();
    await store.loadConfig();
    expect(store.needsGroupChatPromptReset).toBe(true);
  });

  it("舊用戶需要重置；重置後換成新版群聊提示詞，其他模式不受影響，重新載入也不再要求", async () => {
    storage.set("promptManagerConfig", oldUserConfig());
    const store = usePromptManagerStore();
    await store.loadConfig();
    expect(store.needsGroupChatPromptReset).toBe(true);

    await store.resetGroupChatToDefault();

    expect(store.needsGroupChatPromptReset).toBe(false);
    expect(store.config.groupChatPrompts).toEqual(GROUP_CHAT_PROMPT_DEFINITIONS);
    expect(store.config.groupChatPromptOrder).toEqual(DEFAULT_GROUP_CHAT_PROMPT_ORDER);
    const ids = store.config.groupChatPrompts!.map((p) => p.identifier);
    for (const retired of ["gcProtectionSequence", "gcExampleScript", "gc_custom_1776261090428"]) {
      expect(ids).not.toContain(retired);
    }
    expect(store.config.prompts[0].content).toBe("一般聊天自訂");

    const saved = storage.get("promptManagerConfig") as { groupChatPromptResetVersion?: number };
    expect(saved.groupChatPromptResetVersion).toBe(GROUP_CHAT_PROMPT_RESET_VERSION);

    setActivePinia(createPinia());
    const reloaded = usePromptManagerStore();
    await reloaded.loadConfig();
    expect(reloaded.needsGroupChatPromptReset).toBe(false);
  });
});

describe("已停用的群聊必要條目", () => {
  beforeEach(() => {
    storage.clear();
    setActivePinia(createPinia());
  });

  it("載入舊設定時移除「角色設定」，其他條目保留", async () => {
    const config = createDefaultPromptManagerConfig();
    config.groupChatPrompts = [
      ...config.groupChatPrompts!,
      { ...GROUP_CHAT_PROMPT_DEFINITIONS[0], identifier: "gcCharacterSettings", name: "角色設定", locked: true, isDeletable: false },
    ];
    config.groupChatPromptOrder = [
      ...config.groupChatPromptOrder!,
      { identifier: "gcCharacterSettings", enabled: true },
    ];
    storage.set("promptManagerConfig", config);

    const store = usePromptManagerStore();
    await store.loadConfig();

    expect(store.config.groupChatPrompts!.map((p) => p.identifier)).not.toContain("gcCharacterSettings");
    expect(store.config.groupChatPromptOrder!.map((e) => e.identifier)).not.toContain("gcCharacterSettings");
    expect(store.config.groupChatPrompts).toHaveLength(GROUP_CHAT_PROMPT_DEFINITIONS.length);
    expect(store.config.groupChatPromptOrder).toHaveLength(DEFAULT_GROUP_CHAT_PROMPT_ORDER.length);
  });
});
