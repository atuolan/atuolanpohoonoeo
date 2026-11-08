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

const MACRO = "{{charWallet}}";
const contentOf = (defs: PromptDefinition[] | undefined, id: string) =>
  defs!.find((p) => p.identifier === id)!.content;
const count = (text: string) => text.split(MACRO).length - 1;

describe("轉帳說明後面接角色帳戶餘額", () => {
  beforeEach(() => {
    storage.clear();
    setActivePinia(createPinia());
  });

  it("線上、群聊的預設內容都有宏，緊接在轉帳那行", () => {
    const config = createDefaultPromptManagerConfig();
    expect(contentOf(config.prompts, "onlineModeFeatures")).toContain(`<pay>金額:備註</pay>${MACRO}\n`);
    expect(contentOf(config.groupChatPrompts, "gcGroupXmlFormat")).toContain(`<pay>520</pay>）${MACRO}\n`);
  });

  it("舊存檔載入時補上，而且只補一次", async () => {
    const config = createDefaultPromptManagerConfig();
    config.prompts = config.prompts.map((p) =>
      p.identifier === "onlineModeFeatures" ? { ...p, content: p.content.replace(MACRO, "") } : p,
    );
    config.groupChatPrompts = config.groupChatPrompts!.map((p) =>
      p.identifier === "gcGroupXmlFormat" ? { ...p, content: p.content.replace(MACRO, "") } : p,
    );
    storage.set("promptManagerConfig", config);
    const store = usePromptManagerStore();
    await store.loadConfig();
    await store.loadConfig();
    expect(count(contentOf(store.config.prompts, "onlineModeFeatures"))).toBe(1);
    expect(count(contentOf(store.config.groupChatPrompts, "gcGroupXmlFormat"))).toBe(1);
  });
});

describe("角色主動約出門的標籤說明", () => {
  beforeEach(() => {
    storage.clear();
    setActivePinia(createPinia());
  });

  it("預設內容接在忙碌說明後面；舊存檔載入時補上一次", async () => {
    const DATE = "{{dateGuide}}";
    const config = createDefaultPromptManagerConfig();
    expect(contentOf(config.prompts, "onlineModeFeatures")).toContain(`{{charBusyGuide}}\n${DATE}\n`);
    config.prompts = config.prompts.map((p) =>
      p.identifier === "onlineModeFeatures" ? { ...p, content: p.content.replace(`${DATE}\n`, "") } : p,
    );
    storage.set("promptManagerConfig", config);
    const store = usePromptManagerStore();
    await store.loadConfig();
    await store.loadConfig();
    expect(contentOf(store.config.prompts, "onlineModeFeatures").split(DATE).length - 1).toBe(1);
  });
});
