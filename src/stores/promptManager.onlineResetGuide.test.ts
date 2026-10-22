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
import { PLURK_COMMENT_LANGUAGE_MODE, PLURK_POST_LANGUAGE_MODE } from "@/data/defaultPrompts/plurk";
import {
  FACE_TO_FACE_PROMPT_RESET_VERSION,
  GROUP_CHAT_PROMPT_RESET_VERSION,
  ONLINE_PROMPT_RESET_VERSION,
  usePromptManagerStore,
} from "./promptManager";

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

  it("已完成上一版重置的用戶，在新版本仍需要重置", async () => {
    const config = createDefaultPromptManagerConfig();
    config.onlinePromptResetVersion = ONLINE_PROMPT_RESET_VERSION - 1;
    storage.set("promptManagerConfig", config);
    const store = usePromptManagerStore();
    await store.loadConfig();
    expect(store.needsOnlinePromptReset).toBe(true);
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

describe("三種模式合在同一個彈窗重置", () => {
  beforeEach(() => {
    storage.clear();
    setActivePinia(createPinia());
  });

  it("三種都停在上一版時都要重置；依序重置完全部完成，重新載入也不再要求", async () => {
    const config = createDefaultPromptManagerConfig();
    config.onlinePromptResetVersion = ONLINE_PROMPT_RESET_VERSION - 1;
    config.groupChatPromptResetVersion = GROUP_CHAT_PROMPT_RESET_VERSION - 1;
    config.faceToFacePromptResetVersion = FACE_TO_FACE_PROMPT_RESET_VERSION - 1;
    storage.set("promptManagerConfig", config);

    const store = usePromptManagerStore();
    await store.loadConfig();
    expect(store.needsOnlinePromptReset).toBe(true);
    expect(store.needsGroupChatPromptReset).toBe(true);
    expect(store.needsFaceToFacePromptReset).toBe(true);

    await store.resetOnlineForUpdate();
    await store.resetGroupChatToDefault();
    await store.resetFaceToFaceToDefault();
    expect(store.needsOnlinePromptReset).toBe(false);
    expect(store.needsGroupChatPromptReset).toBe(false);
    expect(store.needsFaceToFacePromptReset).toBe(false);

    setActivePinia(createPinia());
    const reloaded = usePromptManagerStore();
    await reloaded.loadConfig();
    expect(reloaded.needsOnlinePromptReset).toBe(false);
    expect(reloaded.needsGroupChatPromptReset).toBe(false);
    expect(reloaded.needsFaceToFacePromptReset).toBe(false);
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

describe("噗浪照母語發言（跟線上聊天一樣）", () => {
  beforeEach(() => {
    storage.clear();
    setActivePinia(createPinia());
  });

  const BRACKET_HINT =
    "💡 翻譯提示：如果你在回覆噗浪評論時使用非中文，請在後面用括號附上中文翻譯。\n例如：「Good morning! (早安！)」、「I love you (我愛你)」";
  const BR_HINT =
    "💡 翻譯提示：噗浪內容用到非中文時，跟聊天訊息一樣在後面附上中文翻譯，格式是「外語<br>中文翻譯」。\n例如：Good morning!<br>早安！、I love you<br>我愛你";
  const NEW_BATCH_RULE =
    "4. 口語化表達\n5. 每個角色依自己的國籍與背景判斷母語：母語是中文就直接寫繁體中文；母語不是中文，每則評論都完整用母語寫，content 寫成「母語原文<br>對應的中文翻譯」，禁止只有中文的評論。路人用繁體中文";

  // 兩代舊預設：最早的括號翻譯，以及上一版的「外語<br>中文翻譯」
  const OLD_VERSIONS = {
    括號翻譯: {
      hint: BRACKET_HINT,
      comment6: "6. 如果使用非中文，請在後面用括號附上中文翻譯",
      batch5: "5. 如果角色使用外語，只在外語部分後加括號翻譯",
    },
    "外語<br>中文翻譯": {
      hint: BR_HINT,
      comment6: "6. 如果使用非中文，在後面附上中文翻譯，格式是「外語<br>中文翻譯」",
      batch5: "5. 如果角色使用外語，只在外語部分後面附上中文翻譯，格式是「外語<br>中文翻譯」",
    },
  };

  for (const [label, old] of Object.entries(OLD_VERSIONS)) {
    it(`已存的舊預設（${label}）載入時換成依母語的新規則`, async () => {
      const config = createDefaultPromptManagerConfig();
      const defaults = structuredClone(config);
      const withOld = <T extends { identifier: string; content: string }>(list: T[], id: string, from: string, to: string) =>
        list.map((p) => {
          if (p.identifier !== id) return p;
          expect(p.content, id).toContain(from);
          return { ...p, content: p.content.replace(from, to) };
        });
      const contentOf = (list: Array<{ identifier: string; content: string }> | undefined, id: string) =>
        list!.find((p) => p.identifier === id)!.content;
      const social = contentOf(config.prompts, "socialMedia");
      const newHint = social.slice(social.indexOf("💡"), social.indexOf("\n\n{{socialPosts}}"));

      config.prompts = withOld(config.prompts, "socialMedia", newHint, old.hint);
      config.faceToFacePrompts = withOld(config.faceToFacePrompts!, "f2fSocialMedia", newHint, old.hint);
      config.plurkPostPrompts = withOld(
        config.plurkPostPrompts!,
        "plurkPostSystemPrompt",
        `\n\n${PLURK_POST_LANGUAGE_MODE}\n`,
        "\n6. 使用繁體中文\n",
      );
      config.plurkCommentPrompts = withOld(
        config.plurkCommentPrompts!,
        "plurkCommentSystemPrompt",
        `\n\n${PLURK_COMMENT_LANGUAGE_MODE}`,
        `\n5. 使用繁體中文\n${old.comment6}`,
      );
      config.batchCommentsPrompts = withOld(
        config.batchCommentsPrompts!,
        "batchCommentsSystemPrompt",
        NEW_BATCH_RULE,
        `4. 使用繁體中文，口語化表達\n${old.batch5}`,
      );
      storage.set("promptManagerConfig", config);

      const store = usePromptManagerStore();
      await store.loadConfig();

      expect(contentOf(store.config.prompts, "socialMedia")).toBe(contentOf(defaults.prompts, "socialMedia"));
      expect(contentOf(store.config.faceToFacePrompts, "f2fSocialMedia")).toBe(
        contentOf(defaults.faceToFacePrompts, "f2fSocialMedia"),
      );
      expect(contentOf(store.config.plurkPostPrompts, "plurkPostSystemPrompt")).toBe(
        contentOf(defaults.plurkPostPrompts, "plurkPostSystemPrompt"),
      );
      expect(contentOf(store.config.plurkCommentPrompts, "plurkCommentSystemPrompt")).toBe(
        contentOf(defaults.plurkCommentPrompts, "plurkCommentSystemPrompt"),
      );
      expect(contentOf(store.config.batchCommentsPrompts, "batchCommentsSystemPrompt")).toBe(
        contentOf(defaults.batchCommentsPrompts, "batchCommentsSystemPrompt"),
      );
    });
  }

  it("預設的噗浪發文與留言都有母語規則，不再只寫「使用繁體中文」", () => {
    const config = createDefaultPromptManagerConfig();
    const post = config.plurkPostPrompts!.find((p) => p.identifier === "plurkPostSystemPrompt")!.content;
    const comment = config.plurkCommentPrompts!.find((p) => p.identifier === "plurkCommentSystemPrompt")!.content;
    expect(post).toContain("<plurk>（母語原文）<br>（對應的中文翻譯）</plurk>");
    expect(post).not.toContain("6. 使用繁體中文");
    expect(comment).toContain("禁止出現只有中文的留言");
    expect(comment).not.toContain("5. 使用繁體中文");
  });
});
