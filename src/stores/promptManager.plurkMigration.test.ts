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
  FACE_TO_FACE_PROMPT_DEFINITIONS,
  PLURK_POST_PROMPT_DEFINITIONS,
} from "@/types/promptManager";
import type { PromptDefinition } from "@/types/promptManager";
import { FACE_TO_FACE_PROMPT_RESET_VERSION, usePromptManagerStore } from "./promptManager";

const OLD_CHAT_FORMAT = `【噗浪】放在 <content> 內：
<plurk>
  <post>發文內容</post>
  <image>中文描述｜英文提示詞</image>（可選，有配圖時加）
  <reactions>❤️:12,👍:8,😊:5</reactions>（必填，1-4個表情，數量1-99正整數，👍❤️😂😮😢😠🎉👏🤔😊）
</plurk>
`;
const OLD_F2F_FORMAT = `- 噗浪格式：
  <plurk>
    <post>發文內容</post>
    <image>中文描述｜英文提示詞</image>（可選）
    <reactions>❤️:12,👍:8,😊:5</reactions>（必填，1-4個，數量1-99，👍❤️😂😮😢😠🎉👏🤔😊）
  </plurk>
`;
const OLD_POST_FORMAT = `輸出格式：
<plurk>
  <post>發文內容</post>
  <image>中文描述｜英文提示詞</image>（有配圖時加，否則省略）
  <reactions>❤️:12,👍:8</reactions>（必填，1-4個表情，數量1-99，👍❤️😂😮😢😠🎉👏🤔😊）
</plurk>`;

/** 把預設內容中的新格式段落換回舊格式，模擬舊用戶存下的內容 */
function withOldBlock(defs: PromptDefinition[], id: string, oldBlock: string, newStart: string, newEnd: string) {
  return structuredClone(defs).map((p) => {
    if (p.identifier !== id) return p;
    const a = p.content.indexOf(newStart);
    const b = p.content.indexOf(newEnd, a) + newEnd.length;
    expect(a).toBeGreaterThanOrEqual(0);
    return { ...p, content: p.content.slice(0, a) + oldBlock + p.content.slice(b) };
  });
}

function contentOf(defs: PromptDefinition[] | undefined, id: string) {
  return defs!.find((p) => p.identifier === id)!.content;
}

describe("噗浪格式改版的舊設定遷移", () => {
  beforeEach(() => {
    storage.clear();
    setActivePinia(createPinia());
  });

  it("預設條目已不含舊的必填 reactions 格式", () => {
    for (const defs of [DEFAULT_PROMPT_DEFINITIONS, FACE_TO_FACE_PROMPT_DEFINITIONS, PLURK_POST_PROMPT_DEFINITIONS]) {
      for (const p of defs) expect(p.content).not.toContain("<post>發文內容</post>");
    }
  });

  it("已存的舊格式在載入時換成新格式", async () => {
    const config = createDefaultPromptManagerConfig();
    config.faceToFacePromptResetVersion = FACE_TO_FACE_PROMPT_RESET_VERSION;
    config.prompts = withOldBlock(
      config.prompts,
      "onlineModeFeatures",
      OLD_CHAT_FORMAT,
      "【噗浪】",
      "別重複最近發過的內容。\n",
    );
    config.faceToFacePrompts = withOldBlock(
      config.faceToFacePrompts!,
      "f2fFormatRules",
      OLD_F2F_FORMAT,
      "- 噗浪（",
      "別重複最近發過的內容\n",
    );
    config.plurkPostPrompts = withOldBlock(
      config.plurkPostPrompts!,
      "plurkPostSystemPrompt",
      OLD_POST_FORMAT,
      "輸出格式：",
      "三者都可省略）",
    );
    expect(contentOf(config.prompts, "onlineModeFeatures")).toContain("<post>");
    storage.set("promptManagerConfig", config);

    const store = usePromptManagerStore();
    await store.loadConfig();

    expect(contentOf(store.config.prompts, "onlineModeFeatures")).toBe(
      contentOf(DEFAULT_PROMPT_DEFINITIONS, "onlineModeFeatures"),
    );
    expect(contentOf(store.config.faceToFacePrompts, "f2fFormatRules")).toBe(
      contentOf(FACE_TO_FACE_PROMPT_DEFINITIONS, "f2fFormatRules"),
    );
    expect(contentOf(store.config.plurkPostPrompts, "plurkPostSystemPrompt")).toBe(
      contentOf(PLURK_POST_PROMPT_DEFINITIONS, "plurkPostSystemPrompt"),
    );
  });

  it("噗浪評論：移除舊的逐則回覆條目，系統提示改為評論風格", async () => {
    const config = createDefaultPromptManagerConfig();
    const base = config.plurkCommentPrompts![0];
    config.plurkCommentPrompts = [
      {
        ...base,
        name: "噗浪評論系統提示",
        content:
          "你是 {{char}}，正在回覆噗浪上的評論。\n\n回覆要求：\n1. 完全以 {{char}} 的身份和語氣回覆\n2. 回覆要自然、有互動感\n6. 自訂的第六點",
      },
      { ...base, identifier: "plurkCommentCharacterInfo", marker: true },
      { ...base, identifier: "plurkCommentContext", marker: true },
      { ...base, identifier: "plurkCommentInstruction", role: "user" },
    ];
    config.plurkCommentPromptOrder = config.plurkCommentPrompts.map((p) => ({
      identifier: p.identifier,
      enabled: true,
    }));
    storage.set("promptManagerConfig", config);

    const store = usePromptManagerStore();
    await store.loadConfig();

    expect(store.config.plurkCommentPrompts!.map((p) => p.identifier)).toEqual(["plurkCommentSystemPrompt"]);
    expect(store.config.plurkCommentPromptOrder!.map((p) => p.identifier)).toEqual(["plurkCommentSystemPrompt"]);
    const style = store.config.plurkCommentPrompts![0];
    expect(style.name).toBe("噗浪評論風格");
    expect(style.content).toMatch(/^評論風格要求：\n1\. 每個角色都用自己的身份和語氣留言/);
    expect(style.content).not.toContain("{{char}}");
    // 用戶自己改過的部分保留
    expect(style.content).toContain("6. 自訂的第六點");
  });
});
