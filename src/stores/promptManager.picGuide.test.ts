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

import { createDefaultPromptManagerConfig } from "@/types/promptManager";
import type { PromptDefinition } from "@/types/promptManager";
import { usePromptManagerStore } from "./promptManager";

const MACRO = "{{picGuide}}";
const contentOf = (defs: PromptDefinition[] | undefined, id: string) =>
  defs!.find((p) => p.identifier === id)!.content;
const count = (text: string) => text.split(MACRO).length - 1;
const strip = (defs: PromptDefinition[] | undefined, id: string) =>
  defs!.map((p) => (p.identifier === id ? { ...p, content: p.content.replace(MACRO, "") } : p));

describe("圖片標籤說明後面接文生圖提示詞寫法", () => {
  beforeEach(() => {
    storage.clear();
    setActivePinia(createPinia());
  });

  it("線上、群聊、面對面的預設內容都有宏，緊接在圖片那行", () => {
    const config = createDefaultPromptManagerConfig();
    expect(contentOf(config.prompts, "onlineModeFeatures")).toContain(`（prompt 必填英文，用於繪圖）${MACRO}\n`);
    expect(contentOf(config.groupChatPrompts, "gcGroupXmlFormat")).toContain(`prompt="english%20keywords"/>${MACRO}\n`);
    expect(contentOf(config.faceToFacePrompts, "f2fFormatRules")).toContain(`</show-pic></msg>${MACRO}\n`);
  });

  it("舊存檔載入時補上，而且只補一次", async () => {
    const config = createDefaultPromptManagerConfig();
    config.prompts = strip(config.prompts, "onlineModeFeatures");
    config.groupChatPrompts = strip(config.groupChatPrompts, "gcGroupXmlFormat");
    config.faceToFacePrompts = strip(config.faceToFacePrompts, "f2fFormatRules");
    storage.set("promptManagerConfig", config);
    const store = usePromptManagerStore();
    await store.loadConfig();
    await store.loadConfig();
    expect(count(contentOf(store.config.prompts, "onlineModeFeatures"))).toBe(1);
    expect(count(contentOf(store.config.groupChatPrompts, "gcGroupXmlFormat"))).toBe(1);
    expect(count(contentOf(store.config.faceToFacePrompts, "f2fFormatRules"))).toBe(1);
  });
});
