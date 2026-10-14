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
  GROUP_CHAT_PROMPT_DEFINITIONS,
} from "@/types/promptManager";
import type { PromptDefinition } from "@/types/promptManager";
import { FACE_TO_FACE_PROMPT_RESET_VERSION, usePromptManagerStore } from "./promptManager";

const OLD_GROUP_LINE = "<reply-to>被引用的原文</reply-to>回覆內容</msg>";
const NEW_GROUP_LINE =
  "<reply-to>原訊息開頭幾個字</reply-to>回覆內容</msg>　// reply-to 只照抄原訊息開頭 5～15 個字，不用抄整句";
const OLD_ONLINE_LINE = "<reply-to>引用內容</reply-to>回覆內容";
const NEW_ONLINE_LINE =
  "<reply-to>原訊息開頭幾個字</reply-to>回覆內容（只照抄原訊息開頭 5～15 個字，不用抄整句）";

function contentOf(defs: PromptDefinition[] | undefined, id: string) {
  return defs!.find((p) => p.identifier === id)!.content;
}

/** 把新句子換回舊句子，模擬舊用戶存下的內容 */
function withOld(defs: PromptDefinition[], id: string, newLine: string, oldLine: string) {
  return structuredClone(defs).map((p) => {
    if (p.identifier !== id) return p;
    expect(p.content).toContain(newLine);
    return { ...p, content: p.content.replace(newLine, oldLine) };
  });
}

describe("引用回覆改成只抄開頭幾個字", () => {
  beforeEach(() => {
    storage.clear();
    setActivePinia(createPinia());
  });

  it("預設條目已經是新寫法", () => {
    expect(contentOf(GROUP_CHAT_PROMPT_DEFINITIONS, "gcGroupXmlFormat")).toContain(NEW_GROUP_LINE);
    expect(contentOf(DEFAULT_PROMPT_DEFINITIONS, "onlineModeFeatures")).toContain(NEW_ONLINE_LINE);
  });

  it("已存的舊寫法在載入時換成新寫法，其他內容不動", async () => {
    const config = createDefaultPromptManagerConfig();
    config.faceToFacePromptResetVersion = FACE_TO_FACE_PROMPT_RESET_VERSION;
    config.groupChatPrompts = withOld(config.groupChatPrompts!, "gcGroupXmlFormat", NEW_GROUP_LINE, OLD_GROUP_LINE);
    config.prompts = withOld(config.prompts, "onlineModeFeatures", NEW_ONLINE_LINE, OLD_ONLINE_LINE);
    storage.set("promptManagerConfig", config);

    const store = usePromptManagerStore();
    await store.loadConfig();

    expect(contentOf(store.config.groupChatPrompts, "gcGroupXmlFormat")).toBe(
      contentOf(GROUP_CHAT_PROMPT_DEFINITIONS, "gcGroupXmlFormat"),
    );
    expect(contentOf(store.config.prompts, "onlineModeFeatures")).toBe(
      contentOf(DEFAULT_PROMPT_DEFINITIONS, "onlineModeFeatures"),
    );
  });

  it("重複載入不會一直疊加", async () => {
    const config = createDefaultPromptManagerConfig();
    config.faceToFacePromptResetVersion = FACE_TO_FACE_PROMPT_RESET_VERSION;
    storage.set("promptManagerConfig", config);

    const store = usePromptManagerStore();
    await store.loadConfig();
    await store.loadConfig();

    const content = contentOf(store.config.groupChatPrompts, "gcGroupXmlFormat");
    expect(content.split("只照抄原訊息開頭").length - 1).toBe(1);
  });
});
