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
  DEFAULT_PROMPT_DEFINITIONS,
  DEFAULT_PROMPT_ORDER,
  FACE_TO_FACE_PROMPT_DEFINITIONS,
} from "@/types/promptManager";
import { ONLINE_PROMPT_RESET_VERSION, usePromptManagerStore } from "./promptManager";

const HUMAN_LIKE = "humanLike";

/** 舊版線上設定：自訂內容、已刪除的星核與權力關係條目、一個角色獨立順序 */
function oldUserConfig() {
  const config = createDefaultPromptManagerConfig();
  delete config.onlinePromptResetVersion;
  config.prompts = [
    ...config.prompts.map((p) => (p.identifier === HUMAN_LIKE ? { ...p, content: "我改過的" } : p)),
    { ...config.prompts[0], identifier: "protectionSequence", name: "🌟星核" },
    { ...config.prompts[0], identifier: "custom_mine", name: "我的條目" },
  ];
  config.globalPromptOrder = [
    { identifier: "custom_mine", enabled: true },
    ...config.globalPromptOrder,
  ];
  config.characterConfigs["char-1"] = {
    characterId: "char-1",
    promptOrder: [
      { identifier: HUMAN_LIKE, enabled: false },
      { identifier: "characterCorePersonality", enabled: true },
      { identifier: "custom_mine", enabled: true },
    ],
    promptOverrides: {},
    updatedAt: 1,
  } as any;
  config.faceToFacePrompts = [{ ...FACE_TO_FACE_PROMPT_DEFINITIONS[0], content: "面對面自訂" }];
  return config;
}

describe("線上提示詞強制重置引導", () => {
  beforeEach(() => {
    storage.clear();
    setActivePinia(createPinia());
  });

  it("新用戶不需要重置", async () => {
    const store = usePromptManagerStore();
    await store.loadConfig();
    expect(store.needsOnlinePromptReset).toBe(false);
  });

  it("舊用戶需要重置；重置後恢復默認、角色順序換新排列但保留開關、其他模式不受影響", async () => {
    storage.set("promptManagerConfig", oldUserConfig());
    const store = usePromptManagerStore();
    await store.loadConfig();
    expect(store.needsOnlinePromptReset).toBe(true);

    await store.resetOnlineForUpdate();

    expect(store.needsOnlinePromptReset).toBe(false);
    expect(store.config.prompts).toEqual(DEFAULT_PROMPT_DEFINITIONS);
    expect(store.config.globalPromptOrder).toEqual(DEFAULT_PROMPT_ORDER);

    const charOrder = store.config.characterConfigs["char-1"].promptOrder;
    expect(charOrder.map((e) => e.identifier)).toEqual(DEFAULT_PROMPT_ORDER.map((e) => e.identifier));
    expect(charOrder.find((e) => e.identifier === HUMAN_LIKE)?.enabled).toBe(false);

    expect(store.config.faceToFacePrompts?.[0].content).toBe("面對面自訂");

    const saved = storage.get("promptManagerConfig") as { onlinePromptResetVersion?: number };
    expect(saved.onlinePromptResetVersion).toBe(ONLINE_PROMPT_RESET_VERSION);

    setActivePinia(createPinia());
    const reloaded = usePromptManagerStore();
    await reloaded.loadConfig();
    expect(reloaded.needsOnlinePromptReset).toBe(false);
  });

  it("在提示詞管理手動重置線上模式也算完成", async () => {
    storage.set("promptManagerConfig", oldUserConfig());
    const store = usePromptManagerStore();
    await store.loadConfig();
    await store.resetToDefault();
    expect(store.needsOnlinePromptReset).toBe(false);
  });
});

describe("已停用的線上必要條目", () => {
  beforeEach(() => {
    storage.clear();
    setActivePinia(createPinia());
  });

  it("載入舊設定時移除「角色設定」，全局與角色獨立順序都清掉，其他條目保留", async () => {
    const config = createDefaultPromptManagerConfig();
    config.prompts = [
      ...config.prompts,
      { ...config.prompts[0], identifier: "characterSettings", name: "角色設定", locked: true, isDeletable: false },
    ];
    config.globalPromptOrder = [...config.globalPromptOrder, { identifier: "characterSettings", enabled: true }];
    config.characterConfigs["char-1"] = {
      characterId: "char-1",
      promptOrder: [...structuredClone(DEFAULT_PROMPT_ORDER), { identifier: "characterSettings", enabled: true }],
      promptOverrides: {},
      updatedAt: 1,
    } as any;
    storage.set("promptManagerConfig", config);

    const store = usePromptManagerStore();
    await store.loadConfig();

    expect(store.config.prompts.map((p) => p.identifier)).not.toContain("characterSettings");
    expect(store.config.globalPromptOrder.map((e) => e.identifier)).not.toContain("characterSettings");
    const charOrder = store.config.characterConfigs["char-1"].promptOrder;
    expect(charOrder.map((e) => e.identifier)).not.toContain("characterSettings");
    expect(store.config.prompts).toHaveLength(DEFAULT_PROMPT_DEFINITIONS.length);
    expect(store.config.globalPromptOrder).toHaveLength(DEFAULT_PROMPT_ORDER.length);
    expect(charOrder).toHaveLength(DEFAULT_PROMPT_ORDER.length);
  });
});

describe("翻譯格式統一成「外語<br>中文翻譯」", () => {
  beforeEach(() => {
    storage.clear();
    setActivePinia(createPinia());
  });

  it("已存的舊預設翻譯提示載入時換成新格式", async () => {
    const oldHint =
      "💡 翻譯提示：如果你在回覆噗浪評論時使用非中文，請在後面用括號附上中文翻譯。\n例如：「Good morning! (早安！)」、「I love you (我愛你)」";
    const config = createDefaultPromptManagerConfig();
    const withOld = <T extends { identifier: string; content: string }>(list: T[], id: string, from: string, to: string) =>
      list.map((p) => (p.identifier === id ? { ...p, content: p.content.replace(from, to) } : p));
    const newHint = (content: string) => content.slice(content.indexOf("💡"), content.indexOf("\n\n{{socialPosts}}"));

    const onlineHint = newHint(config.prompts.find((p) => p.identifier === "socialMedia")!.content);
    config.prompts = withOld(config.prompts, "socialMedia", onlineHint, oldHint);
    config.faceToFacePrompts = withOld(config.faceToFacePrompts!, "f2fSocialMedia", onlineHint, oldHint);
    config.plurkCommentPrompts = withOld(
      config.plurkCommentPrompts!,
      "plurkCommentSystemPrompt",
      "6. 如果使用非中文，在後面附上中文翻譯，格式是「外語<br>中文翻譯」",
      "6. 如果使用非中文，請在後面用括號附上中文翻譯",
    );
    config.batchCommentsPrompts = withOld(
      config.batchCommentsPrompts!,
      "batchCommentsSystemPrompt",
      "5. 如果角色使用外語，只在外語部分後面附上中文翻譯，格式是「外語<br>中文翻譯」",
      "5. 如果角色使用外語，只在外語部分後加括號翻譯",
    );
    storage.set("promptManagerConfig", config);

    const store = usePromptManagerStore();
    await store.loadConfig();

    const all = [
      ...store.config.prompts,
      ...store.config.faceToFacePrompts!,
      ...store.config.plurkCommentPrompts!,
      ...store.config.batchCommentsPrompts!,
    ];
    for (const prompt of all) {
      expect(prompt.content, prompt.identifier).not.toMatch(/括號附上中文翻譯|加括號翻譯/);
    }
    expect(all.filter((p) => p.content.includes("外語<br>中文翻譯")).length).toBeGreaterThanOrEqual(4);
  });
});
