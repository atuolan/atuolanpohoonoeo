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
const STICKY_LINE = DEFAULT_CONTENT.match(/[^\n]*<sticky-note[^\n]*/)![0];
const AWAY_LINE = "{{charAwayGuide}}";
const SLEEP_LINE = "{{charSleepGuide}}";
const BUSY_LINE = "{{charBusyGuide}}";

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

describe("線上模式功能的角色暫時離開說明", () => {
  beforeEach(() => {
    storage.clear();
    setActivePinia(createPinia());
  });

  it("預設內容有獨立的 {{charAwayGuide}} 一行，緊接在便利貼那行後面", () => {
    expect(DEFAULT_CONTENT).toMatch(/<sticky-note[^\n]*\n\{\{charAwayGuide\}\}/);
    expect(DEFAULT_CONTENT.match(/^\{\{charAwayGuide\}\}$/m)?.[0]).toBe(AWAY_LINE);
  });

  it("舊內容載入時插在便利貼後面，結果跟預設一樣", async () => {
    const store = await loadWithOnlineContent(DEFAULT_CONTENT.replace(`${AWAY_LINE}\n`, ""));
    expect(contentOf(store.config.prompts, "onlineModeFeatures")).toBe(DEFAULT_CONTENT);
  });

  it("沒有便利貼那行但有角色狀態那行時插在狀態後面", async () => {
    const legacy = DEFAULT_CONTENT.replace(`${STICKY_LINE}\n`, "").replace(`${AWAY_LINE}\n`, "");
    const store = await loadWithOnlineContent(legacy);
    const content = contentOf(store.config.prompts, "onlineModeFeatures");
    expect(content).toContain(`${STATUS_LINE}\n${STICKY_LINE}\n${AWAY_LINE}`);
    expect(content.split(AWAY_LINE).length - 1).toBe(1);
  });

  it("已經有 {{charAwayGuide}} 的不會再插第二次", async () => {
    const store = await loadWithOnlineContent(DEFAULT_CONTENT);
    await store.loadConfig();
    await store.loadConfig();
    expect(
      contentOf(store.config.prompts, "onlineModeFeatures").split(AWAY_LINE).length - 1,
    ).toBe(1);
  });

  it("預設內容依序有 away、sleep、busy 三行，最後接封鎖那行", () => {
    expect(DEFAULT_CONTENT).toContain(`${AWAY_LINE}\n${SLEEP_LINE}\n${BUSY_LINE}\n`);
    expect(DEFAULT_CONTENT.match(/^\{\{charSleepGuide\}\}$/m)?.[0]).toBe(SLEEP_LINE);
    expect(DEFAULT_CONTENT.match(/^\{\{charBusyGuide\}\}$/m)?.[0]).toBe(BUSY_LINE);
  });

  it("只有 {{charAwayGuide}} 的舊內容遷移後依序是 away、sleep、busy", async () => {
    const store = await loadWithOnlineContent(
      DEFAULT_CONTENT.replace(`${SLEEP_LINE}\n${BUSY_LINE}\n`, ""),
    );
    const content = contentOf(store.config.prompts, "onlineModeFeatures");
    expect(content).toBe(DEFAULT_CONTENT);
    expect(content.indexOf(AWAY_LINE)).toBeLessThan(content.indexOf(SLEEP_LINE));
    expect(content.indexOf(SLEEP_LINE)).toBeLessThan(content.indexOf(BUSY_LINE));
  });

  it("已經有 sleep 和 busy 的不會再插第二次", async () => {
    const store = await loadWithOnlineContent(DEFAULT_CONTENT);
    await store.loadConfig();
    await store.loadConfig();
    const content = contentOf(store.config.prompts, "onlineModeFeatures");
    expect(content.split(SLEEP_LINE).length - 1).toBe(1);
    expect(content.split(BUSY_LINE).length - 1).toBe(1);
    expect(content).toBe(DEFAULT_CONTENT);
  });
});
