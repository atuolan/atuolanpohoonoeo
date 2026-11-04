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
import { EVENTS_IMPORTANCE_AND_PINNED, LEGACY_EVENTS_IMPORTANCE } from "@/data/defaultPrompts/events";
import { usePromptManagerStore } from "./promptManager";

const SYSTEM_ID = "eventsSystemPrompt";

function withEventsSystemContent(content: (current: string) => string) {
  const config = createDefaultPromptManagerConfig();
  config.eventsPrompts = config.eventsPrompts!.map((p) =>
    p.identifier === SYSTEM_ID ? { ...p, content: content(p.content) } : p,
  );
  return config;
}

async function loadedSystemContent(): Promise<string> {
  const store = usePromptManagerStore();
  await store.loadConfig();
  return store.config.eventsPrompts!.find((p) => p.identifier === SYSTEM_ID)!.content;
}

describe("重要事件提取提示詞：加上常駐欄位", () => {
  beforeEach(() => {
    storage.clear();
    setActivePinia(createPinia());
  });

  it("新的預設已經有常駐規則", () => {
    const config = createDefaultPromptManagerConfig();
    const system = config.eventsPrompts!.find((p) => p.identifier === SYSTEM_ID)!;
    expect(system.content).toContain(EVENTS_IMPORTANCE_AND_PINNED);
  });

  it("存著舊版預設的用戶，載入後換成新版，其他自訂內容保留", async () => {
    storage.set(
      "promptManagerConfig",
      withEventsSystemContent((c) =>
        `我自己加的開頭\n${c.replace(EVENTS_IMPORTANCE_AND_PINNED, LEGACY_EVENTS_IMPORTANCE)}`,
      ),
    );
    const content = await loadedSystemContent();
    expect(content).toContain("我自己加的開頭");
    expect(content).toContain(EVENTS_IMPORTANCE_AND_PINNED);
    expect(content).not.toContain(LEGACY_EVENTS_IMPORTANCE);
  });

  it("已經是新版的不會重複加", async () => {
    storage.set("promptManagerConfig", createDefaultPromptManagerConfig());
    const content = await loadedSystemContent();
    expect(content.split("pinned 規則").length).toBe(2);
  });
});
