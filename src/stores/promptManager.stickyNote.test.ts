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

/** 存一份指定提示詞被換成指定內容的設定，模擬舊用戶 */
async function loadWithPrompt(identifier: string, content: string) {
  const config = createDefaultPromptManagerConfig();
  config.faceToFacePromptResetVersion = FACE_TO_FACE_PROMPT_RESET_VERSION;
  config.prompts = structuredClone(config.prompts).map((p) =>
    p.identifier === identifier ? { ...p, content } : p,
  );
  storage.set("promptManagerConfig", config);
  const store = usePromptManagerStore();
  await store.loadConfig();
  return store;
}

function loadWithOnlineContent(content: string) {
  return loadWithPrompt("onlineModeFeatures", content);
}

describe("線上模式功能的便利貼", () => {
  beforeEach(() => {
    storage.clear();
    setActivePinia(createPinia());
  });

  it("預設內容有便利貼標籤和上一張的宏，放在狀態更新後面", () => {
    expect(STICKY_LINE).toContain('<sticky-note text="內容"/>');
    expect(STICKY_LINE).toContain("{{charStickyNote}}");
    expect(DEFAULT_CONTENT).toMatch(/<char-status[^\n]*\n[^\n]*<sticky-note/);
  });

  it("舊內容載入時插在狀態更新後面，結果跟預設一樣", async () => {
    const store = await loadWithOnlineContent(DEFAULT_CONTENT.replace(`${STICKY_LINE}\n`, ""));
    expect(contentOf(store.config.prompts, "onlineModeFeatures")).toBe(DEFAULT_CONTENT);
  });

  it("連狀態那行都沒有的舊內容，兩行都補回預設位置", async () => {
    const store = await loadWithOnlineContent(
      DEFAULT_CONTENT.replace(`${STATUS_LINE}\n`, "").replace(`${STICKY_LINE}\n`, ""),
    );
    expect(contentOf(store.config.prompts, "onlineModeFeatures")).toBe(DEFAULT_CONTENT);
  });

  it("重複載入不會一直疊加", async () => {
    const store = await loadWithOnlineContent(DEFAULT_CONTENT.replace(`${STICKY_LINE}\n`, ""));
    await store.loadConfig();
    await store.loadConfig();
    expect(contentOf(store.config.prompts, "onlineModeFeatures").split("<sticky-note").length - 1).toBe(1);
  });

  it("上一版寫「貼在心情便籤上」的那行，換成釘在留言板的新寫法", async () => {
    const legacyLine =
      '- 便利貼：<sticky-note text="內容"/>（貼在 {{user}} 手機主畫面的心情便籤上，{{user}} 回到桌面才會看到。用來關心或提醒，例如明天的約別忘了、變天記得加外套、考試加油、看到 {{user}} 心情不好想留句話；偶爾才寫，有想讓 {{user}} 回桌面時看到的話再寫，不必每輪都寫，一天一兩張就夠；50 字內。你上一張寫的：{{charStickyNote}}）';
    const store = await loadWithOnlineContent(DEFAULT_CONTENT.replace(STICKY_LINE, legacyLine));
    expect(contentOf(store.config.prompts, "onlineModeFeatures")).toBe(DEFAULT_CONTENT);
  });

  it("上一版的心情便籤條目換成有 <mood-reply> 的新內容，改過的不動", async () => {
    const legacyEntry =
      "<mood_note>\n📝 {{user}} 的心情便籤（{{user}} 寫在手機主畫面上給自己看的）\n\n{{userMoodNote}}\n\n{{char}} 可以留意 {{user}} 的心情，但不要每次都提，也不要逐字引用；想回應時，可以在聊天裡自然帶到，或照線上模式功能【其他動作】寫一張 <sticky-note>。\n</mood_note>";
    const defaultEntry = contentOf(DEFAULT_PROMPT_DEFINITIONS, "userMoodNote");
    expect(defaultEntry).toContain("<mood-reply");

    const legacy = await loadWithPrompt("userMoodNote", legacyEntry);
    expect(contentOf(legacy.config.prompts, "userMoodNote")).toBe(defaultEntry);

    setActivePinia(createPinia());
    const custom = "<mood_note>\n我自己改的 {{userMoodNote}}，回覆用 <mood-reply/>\n</mood_note>";
    const kept = await loadWithPrompt("userMoodNote", custom);
    expect(contentOf(kept.config.prompts, "userMoodNote")).toBe(custom);
  });

  it("新條目會補進舊用戶的提示詞與順序", async () => {
    // 舊用戶的設定裡還沒有「心情便籤」條目
    const config = createDefaultPromptManagerConfig();
    config.faceToFacePromptResetVersion = FACE_TO_FACE_PROMPT_RESET_VERSION;
    config.prompts = config.prompts.filter((p) => p.identifier !== "userMoodNote");
    config.globalPromptOrder = config.globalPromptOrder.filter((e) => e.identifier !== "userMoodNote");
    storage.set("promptManagerConfig", config);
    const store = usePromptManagerStore();
    await store.loadConfig();

    expect(store.config.prompts.some((p) => p.identifier === "userMoodNote")).toBe(true);
    const order = store.config.globalPromptOrder.map((e) => e.identifier);
    expect(order.indexOf("userMoodNote")).toBe(order.indexOf("gameScores") + 1);
  });
});
