import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import type { Chat, ChatLocalPrompt } from "@/types/chat";

const { chats } = vi.hoisted(() => ({ chats: new Map<string, unknown>() }));

vi.mock("@/db/database", () => ({
  DB_STORES: { CHATS: "chats" },
  db: {
    get: vi.fn(async (_store: string, key: string) => {
      const value = chats.get(key);
      return value ? JSON.parse(JSON.stringify(value)) : undefined;
    }),
    put: vi.fn(async (_store: string, value: { id: string }) => {
      chats.set(value.id, JSON.parse(JSON.stringify(value)));
      return value.id;
    }),
  },
}));

import { useChatVariablesStore } from "@/stores/chatVariables";

function createChat(id: string, chatVariables?: Chat["chatVariables"]): Chat {
  return {
    id,
    name: id,
    characterId: "character-1",
    messages: [],
    metadata: {},
    createdAt: 1,
    updatedAt: 1,
    chatVariables,
  };
}

function storedChat(id: string): Chat {
  return chats.get(id) as Chat;
}

const ENTRY: Omit<ChatLocalPrompt, "id" | "createdAt" | "updatedAt"> = {
  name: "旅行中",
  role: "system",
  content: "兩人正在旅行",
  placement: "end",
  depth: 0,
  modes: ["online", "f2f"],
  enabled: true,
};

describe("chatVariables store：專屬預設", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    const storage = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => void storage.set(key, value),
      removeItem: (key: string) => void storage.delete(key),
    });
    chats.clear();
    setActivePinia(createPinia());
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("同一個角色的兩個聊天各自獨立", async () => {
    chats.set("chat-a", createChat("chat-a"));
    chats.set("chat-b", createChat("chat-b"));
    const store = useChatVariablesStore();

    store.initForChatFromRecord(storedChat("chat-a"));
    store.setPromptOverride("main", false);
    store.addChatPrompt(ENTRY);
    await vi.runAllTimersAsync();

    store.initForChatFromRecord(storedChat("chat-b"));
    expect(store.promptToggles).toEqual({});
    expect(store.chatPrompts).toEqual([]);

    store.initForChatFromRecord(storedChat("chat-a"));
    expect(store.promptToggles).toEqual({ main: false });
    expect(store.chatPrompts.map((p) => p.name)).toEqual(["旅行中"]);
    expect(storedChat("chat-b").chatVariables?.promptToggles).toBeUndefined();
  });

  it("面對面與線上的調整互不影響，兩邊都留得住", async () => {
    chats.set("chat-a", createChat("chat-a"));
    const store = useChatVariablesStore();
    store.initForChatFromRecord(storedChat("chat-a"));

    store.setPromptOverride("f2fStyle", false);
    store.setPromptOverride("onlineModeIntro", true);
    await vi.runAllTimersAsync();

    expect(storedChat("chat-a").chatVariables?.promptToggles).toEqual({
      f2fStyle: false,
      onlineModeIntro: true,
    });
  });

  it("強制值可以和預設相同；設為 null 才是跟隨預設", () => {
    const store = useChatVariablesStore();
    store.initForChatFromRecord(createChat("chat-a"));

    store.setPromptOverride("main", true);
    expect(store.getPromptOverride("main")).toBe(true);
    expect(store.presetCount).toBe(1);

    store.setPromptOverride("main", null);
    expect(store.getPromptOverride("main")).toBeNull();
    expect(store.presetCount).toBe(0);
  });

  it("只恢復指定的條目，其餘調整保留", () => {
    const store = useChatVariablesStore();
    store.initForChatFromRecord(createChat("chat-a"));
    store.setPromptOverride("a", true);
    store.setPromptOverride("b", false);
    store.setPromptOverride("c", false);

    store.resetPromptOverrides(["a", "b"]);
    expect(store.promptToggles).toEqual({ c: false });

    store.resetPromptOverrides();
    expect(store.promptToggles).toEqual({});
  });

  it("切換聊天時，還沒寫入的修改先落地而不是丟掉", async () => {
    chats.set("chat-a", createChat("chat-a"));
    chats.set("chat-b", createChat("chat-b"));
    const store = useChatVariablesStore();
    store.initForChatFromRecord(storedChat("chat-a"));

    store.setPromptOverride("main", false);
    // 保存還在 debounce 中就切到另一個聊天
    store.initForChatFromRecord(storedChat("chat-b"));
    await vi.runAllTimersAsync();

    expect(storedChat("chat-a").chatVariables?.promptToggles).toEqual({ main: false });
    expect(storedChat("chat-b").chatVariables?.promptToggles).toBeUndefined();
  });

  it("同一個聊天重新載入時，不用舊記錄蓋掉還沒寫入的修改", () => {
    const record = createChat("chat-a");
    const store = useChatVariablesStore();
    store.initForChatFromRecord(record);

    store.setPromptOverride("main", false);
    store.initForChatFromRecord(record);

    expect(store.promptToggles).toEqual({ main: false });
  });

  it("還沒有記錄的新聊天：調整先留在記憶體，取得 ID 後歸給該聊天", () => {
    const store = useChatVariablesStore();
    store.initForChatFromRecord(createChat("chat-old", {
      version: 1,
      localVars: {},
      promptToggles: { leftover: true },
      updatedAt: 1,
    }));

    store.resetForNewChat();
    expect(store.promptToggles).toEqual({});
    expect(store.isBoundTo("")).toBe(true);

    store.setPromptOverride("main", false);
    store.addChatPrompt(ENTRY);
    store.adoptNewChat("chat-new");

    expect(store.isBoundTo("chat-new")).toBe(true);
    const snapshot = store.snapshotChatVariables(5);
    expect(snapshot.promptToggles).toEqual({ main: false });
    expect(snapshot.chatPrompts?.map((p) => p.name)).toEqual(["旅行中"]);
    expect(snapshot.updatedAt).toBe(5);
  });

  it("presetForChat：開著的聊天用記憶體裡的，其他聊天讀記錄", () => {
    const store = useChatVariablesStore();
    store.initForChatFromRecord(createChat("chat-a"));
    store.setPromptOverride("main", false);

    expect(store.presetForChat("chat-a", createChat("chat-a")).chatPromptToggles).toEqual({
      main: false,
    });

    const other = createChat("chat-b", {
      version: 1,
      localVars: {},
      promptToggles: { style: true },
      updatedAt: 1,
    });
    expect(store.presetForChat("chat-b", other).chatPromptToggles).toEqual({ style: true });
    expect(store.presetForChat("chat-c", null)).toEqual({
      chatPromptToggles: {},
      chatLocalPrompts: [],
    });
  });

  it("沒有調整時不在聊天記錄上留下空的專屬預設欄位", async () => {
    chats.set("chat-a", createChat("chat-a"));
    const store = useChatVariablesStore();
    store.initForChatFromRecord(storedChat("chat-a"));

    store.setPromptOverride("main", false);
    store.setPromptOverride("main", null);
    await vi.runAllTimersAsync();

    const saved = storedChat("chat-a").chatVariables;
    expect(saved?.promptToggles).toBeUndefined();
    expect(saved?.chatPrompts).toBeUndefined();
  });
});
