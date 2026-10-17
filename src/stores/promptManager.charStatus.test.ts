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

import { createDefaultPromptManagerConfig, DEFAULT_PROMPT_DEFINITIONS } from "@/types/promptManager";
import type { PromptDefinition } from "@/types/promptManager";
import { FACE_TO_FACE_PROMPT_RESET_VERSION, usePromptManagerStore } from "./promptManager";

function contentOf(defs: PromptDefinition[] | undefined, id: string) {
  return defs!.find((p) => p.identifier === id)!.content;
}

const DEFAULT_CONTENT = contentOf(DEFAULT_PROMPT_DEFINITIONS, "onlineModeFeatures");
const STATUS_LINE = DEFAULT_CONTENT.match(/[^\n]*<char-status[^\n]*/)![0];

/** 存一份線上模式功能被換成指定內容的設定，模擬舊用戶 */
async function loadWithOnlineContent(content: string) {
  const config = createDefaultPromptManagerConfig();
  config.faceToFacePromptResetVersion = FACE_TO_FACE_PROMPT_RESET_VERSION;
  config.prompts = structuredClone(config.prompts).map((p) =>
    p.identifier === "onlineModeFeatures" ? { ...p, content } : p,
  );
  storage.set("promptManagerConfig", config);
  const store = usePromptManagerStore();
  await store.loadConfig();
  return store;
}

describe("線上模式功能的角色狀態", () => {
  beforeEach(() => {
    storage.clear();
    setActivePinia(createPinia());
  });

  it("預設內容有狀態標籤和目前狀態的宏，放在角色位置更新後面", () => {
    expect(STATUS_LINE).toContain('<char-status text="狀態文字"/>');
    expect(STATUS_LINE).toContain("{{charStatus}}");
    expect(DEFAULT_CONTENT).toMatch(/<char-location[^\n]*\n[^\n]*<char-status/);
  });

  it("舊內容載入時插在角色位置更新後面，結果跟預設一樣", async () => {
    const store = await loadWithOnlineContent(DEFAULT_CONTENT.replace(`${STATUS_LINE}\n`, ""));
    expect(contentOf(store.config.prompts, "onlineModeFeatures")).toBe(DEFAULT_CONTENT);
  });

  it("沒有角色位置更新那行時接在最後", async () => {
    const store = await loadWithOnlineContent("<online_mode_features>\n- 轉帳：<pay>金額</pay>");
    // 其他缺少的功能也會被補在後面，這裡只看狀態那行
    expect(contentOf(store.config.prompts, "onlineModeFeatures").endsWith(`\n${STATUS_LINE}`)).toBe(true);
  });

  it("重複載入不會一直疊加", async () => {
    const store = await loadWithOnlineContent(DEFAULT_CONTENT.replace(`${STATUS_LINE}\n`, ""));
    await store.loadConfig();
    await store.loadConfig();
    expect(contentOf(store.config.prompts, "onlineModeFeatures").split("<char-status").length - 1).toBe(1);
  });
});
