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
const SHARE_LINE = "{{plurkShareGuide}}";
const PLURK_HINT_LINE = DEFAULT_CONTENT.match(/[^\n]*適合發噗的時候[^\n]*/)![0];

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

describe("線上模式功能的噗文分享說明", () => {
  beforeEach(() => {
    storage.clear();
    setActivePinia(createPinia());
  });

  it("預設內容的宏緊接在「適合發噗的時候」那行後面", () => {
    expect(DEFAULT_CONTENT).toContain(`${PLURK_HINT_LINE}\n${SHARE_LINE}`);
  });

  it("舊內容載入時補在那行正後方，結果跟預設一樣", async () => {
    const legacy = DEFAULT_CONTENT.replace(`${PLURK_HINT_LINE}\n${SHARE_LINE}`, PLURK_HINT_LINE);
    const store = await loadWithOnlineContent(legacy);
    expect(contentOf(store.config.prompts, "onlineModeFeatures")).toBe(DEFAULT_CONTENT);
  });

  it("沒有那行但有 <plurk> 行時補在最後一個 <plurk 行後面", async () => {
    const legacy = DEFAULT_CONTENT.replace(`${PLURK_HINT_LINE}\n${SHARE_LINE}`, "").replace(
      `${PLURK_HINT_LINE}\n`,
      "",
    );
    const lastPlurkLine = [...legacy.matchAll(/[^\n]*<plurk[\s>][^\n]*/g)].pop()![0];
    const store = await loadWithOnlineContent(legacy);
    const content = contentOf(store.config.prompts, "onlineModeFeatures");
    expect(content).toContain(`${lastPlurkLine}\n${SHARE_LINE}`);
    expect(content.split(SHARE_LINE).length - 1).toBe(1);
  });

  it("已經有宏的不會再插第二次", async () => {
    const store = await loadWithOnlineContent(DEFAULT_CONTENT);
    await store.loadConfig();
    await store.loadConfig();
    expect(contentOf(store.config.prompts, "onlineModeFeatures").split(SHARE_LINE).length - 1).toBe(
      1,
    );
  });
});
