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

import { createDefaultPromptManagerConfig, type PromptDefinition } from "@/types/promptManager";
import {
  LEGACY_CHAR_LANGUAGE_CONTENT,
  LEGACY_GROUP_CHAR_LANGUAGE_CONTENT,
  usePromptManagerStore,
} from "./promptManager";

const ONLINE_ID = "custom_1780660237892";
const GROUP_ID = "gc_custom_1792300000851";

const find = (prompts: PromptDefinition[] | undefined, id: string) =>
  prompts!.find((p) => p.identifier === id)!;

describe("char語言條目更新", () => {
  beforeEach(() => {
    storage.clear();
    setActivePinia(createPinia());
  });

  it("新版要求整則用母語、逐句翻譯、要求換語言後一直照用", () => {
    const config = createDefaultPromptManagerConfig();
    for (const content of [find(config.prompts, ONLINE_ID).content, find(config.groupChatPrompts, GROUP_ID).content]) {
      expect(content).toContain("不是用中文夾幾個外語詞");
      expect(content).toContain("直到 {{user}} 再要求換");
      expect(content).toContain("翻譯一定獨立一行");
    }
  });

  it("還是舊預設的換成新版，改過的不動", async () => {
    const defaults = createDefaultPromptManagerConfig();
    const config = createDefaultPromptManagerConfig();
    find(config.prompts, ONLINE_ID).content = LEGACY_CHAR_LANGUAGE_CONTENT;
    find(config.groupChatPrompts, GROUP_ID).content = "我自己寫的語言規則";
    storage.set("promptManagerConfig", config);

    const store = usePromptManagerStore();
    await store.loadConfig();

    expect(find(store.config.prompts, ONLINE_ID).content).toBe(find(defaults.prompts, ONLINE_ID).content);
    expect(find(store.config.groupChatPrompts, GROUP_ID).content).toBe("我自己寫的語言規則");
  });

  it("群聊的舊預設也換成新版", async () => {
    const defaults = createDefaultPromptManagerConfig();
    const config = createDefaultPromptManagerConfig();
    find(config.groupChatPrompts, GROUP_ID).content = LEGACY_GROUP_CHAR_LANGUAGE_CONTENT;
    storage.set("promptManagerConfig", config);

    const store = usePromptManagerStore();
    await store.loadConfig();

    expect(find(store.config.groupChatPrompts, GROUP_ID).content).toBe(find(defaults.groupChatPrompts, GROUP_ID).content);
  });
});
