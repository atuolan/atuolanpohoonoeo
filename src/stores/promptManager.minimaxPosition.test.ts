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
  createCharacterPromptConfig,
  createDefaultPromptManagerConfig,
  type PromptManagerConfig,
  type PromptOrderEntry,
} from "@/types/promptManager";
import { usePromptManagerStore } from "./promptManager";

const ONLINE_SECTION_END = "custom_1792257530103"; // </線上功能>
const GROUP_SECTION_END = "gc_custom_1792300000629"; // </群聊功能>

/** 10/18 版預設的位置：語音條目緊接在功能分區結尾前 */
function withOldPosition(order: PromptOrderEntry[], sectionEndId: string, enabled = true) {
  const rest = order.filter((e) => e.identifier !== "minimaxTTS");
  rest.splice(rest.findIndex((e) => e.identifier === sectionEndId), 0, { identifier: "minimaxTTS", enabled });
  return rest;
}

const ids = (order: PromptOrderEntry[] | undefined) => (order ?? []).map((e) => e.identifier);
const after = (order: PromptOrderEntry[] | undefined, id: string) => ids(order)[ids(order).indexOf(id) + 1];

async function load(config: PromptManagerConfig) {
  storage.set("promptManagerConfig", config);
  const store = usePromptManagerStore();
  await store.loadConfig();
  return store;
}

describe("MiniMax 語音條目移到思考框架後面", () => {
  beforeEach(() => {
    storage.clear();
    setActivePinia(createPinia());
  });

  it("新的預設順序裡，語音條目就在思考框架後面", () => {
    const config = createDefaultPromptManagerConfig();
    expect(after(config.globalPromptOrder, "thinkingGuide")).toBe("minimaxTTS");
    expect(after(config.groupChatPromptOrder, "gcThinkingGuide")).toBe("minimaxTTS");
  });

  it("還在舊位置的線上、角色專屬、群聊順序都搬過去，開關照舊，並存回資料庫", async () => {
    const config = createDefaultPromptManagerConfig();
    config.globalPromptOrder = withOldPosition(config.globalPromptOrder, ONLINE_SECTION_END);
    config.characterConfigs["char-1"] = createCharacterPromptConfig("char-1", config.globalPromptOrder);
    config.groupChatPromptOrder = withOldPosition(config.groupChatPromptOrder!, GROUP_SECTION_END, false);

    const store = await load(config);

    expect(after(store.config.globalPromptOrder, "thinkingGuide")).toBe("minimaxTTS");
    expect(after(store.config.characterConfigs["char-1"].promptOrder, "thinkingGuide")).toBe("minimaxTTS");
    expect(after(store.config.groupChatPromptOrder, "gcThinkingGuide")).toBe("minimaxTTS");
    expect(store.config.groupChatPromptOrder!.find((e) => e.identifier === "minimaxTTS")?.enabled).toBe(false);
    expect((storage.get("promptManagerConfig") as PromptManagerConfig).minimaxTTSBelowThinking).toBe(true);
  });

  it("用戶自己挪過位置的不動，之後也不會再搬", async () => {
    const config = createDefaultPromptManagerConfig();
    const order = config.globalPromptOrder.filter((e) => e.identifier !== "minimaxTTS");
    order.splice(ids(order).indexOf("chatHistory") + 1, 0, { identifier: "minimaxTTS", enabled: true });
    config.globalPromptOrder = order;

    const store = await load(config);
    expect(after(store.config.globalPromptOrder, "chatHistory")).toBe("minimaxTTS");

    // 已經搬過一次：就算之後被挪回舊位置也不再動
    const saved = storage.get("promptManagerConfig") as PromptManagerConfig;
    saved.globalPromptOrder = withOldPosition(saved.globalPromptOrder, ONLINE_SECTION_END);
    setActivePinia(createPinia());
    const reloaded = await load(saved);
    expect(after(reloaded.config.globalPromptOrder, "minimaxTTS")).toBe(ONLINE_SECTION_END);
  });
});
