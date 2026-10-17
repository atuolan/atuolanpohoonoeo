import { beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";

const { store, appendMessages } = vi.hoisted(() => ({
  store: new Map<string, any>(),
  appendMessages: vi.fn(async (..._args: any[]) => {}),
}));

vi.mock("@/db/database", () => ({
  DB_STORES: { APP_SETTINGS: "appSettings" },
  db: {
    get: vi.fn(async (_s: string, key: string) => store.get(key)),
    put: vi.fn(async (_s: string, value: any) => {
      store.set(value.id, JSON.parse(JSON.stringify(value)));
    }),
    delete: vi.fn(async (_s: string, key: string) => {
      store.delete(key);
    }),
  },
}));
vi.mock("@/storage/chatStorage", () => ({
  resolvePreferredDirectChat: vi.fn(async () => ({ id: "chat-1" })),
  createChatRecord: vi.fn(async () => {}),
  refreshChatDerivedMetadata: vi.fn(async () => {}),
}));
vi.mock("@/storage/chatMessageStorage", () => ({ appendMessages }));
vi.mock("@/stores/characters", () => ({ useCharactersStore: vi.fn(() => ({ characters: [] })) }));

import {
  deserializeCompanionState,
  useCompanionChat,
} from "@/composables/useCompanionChat";
import type { CompanionChatState, CompanionMessage, StoredBook } from "@/types/book";

const BOOK_ID = "book-1";
const KEY = `companion-chat-${BOOK_ID}`;

function msg(i: number, role: "user" | "assistant"): CompanionMessage {
  return { id: `m${i}`, role, content: `內容${i}`, timestamp: i, senderName: role === "user" ? "我" : "角色" };
}

function savedState(messageCount: number, syncedCount?: number): CompanionChatState {
  const messages = Array.from({ length: messageCount }, (_, i) => msg(i, i % 2 ? "assistant" : "user"));
  return {
    bookId: BOOK_ID,
    characterId: "char-1",
    triggerFrequency: 3,
    pageTurnCounter: 0,
    bubblePosition: { x: 20, y: 200 },
    messages,
    ...(syncedCount === undefined ? {} : { syncedCount }),
  };
}

function setup() {
  const book = ref({ id: BOOK_ID, title: "逍遙遊", chapters: [] } as unknown as StoredBook);
  return useCompanionChat({ book, currentChapterIndex: ref(0) });
}

function syncedCards() {
  return appendMessages.mock.calls.map((call: any[]) => call[1][0].groupChatHistoryData.messages.length);
}

beforeEach(() => {
  store.clear();
  appendMessages.mockClear();
});

describe("伴讀同步到主聊天", () => {
  it("舊存檔沒有 syncedCount 時視為全部已同步", () => {
    const state = deserializeCompanionState(savedState(4));
    expect(state.syncedCount).toBe(4);
  });

  it("恢復舊存檔不會再貼一次共讀卡", async () => {
    store.set(KEY, { ...savedState(4), id: KEY });
    const companion = setup();
    await companion.restoreState();
    await companion.endSession();
    expect(appendMessages).not.toHaveBeenCalled();
  });

  it("上次沒同步完的訊息在恢復時補貼一張，只含新訊息", async () => {
    store.set(KEY, { ...savedState(6, 4), id: KEY });
    const companion = setup();
    await companion.restoreState();
    expect(syncedCards()).toEqual([2]);
    expect(store.get(KEY).syncedCount).toBe(6);
  });

  it("連續結束兩次只貼一張卡", async () => {
    store.set(KEY, { ...savedState(6, 4), id: KEY });
    const companion = setup();
    await companion.restoreState();
    await companion.endSession();
    await companion.endSession();
    expect(syncedCards()).toEqual([2]);
  });

  it("停止伴讀後重開這本書不會自動恢復", async () => {
    store.set(KEY, { ...savedState(4), id: KEY });
    const first = setup();
    await first.restoreState();
    expect(first.isActive.value).toBe(true);
    await first.stopCompanion();
    await first.endSession();

    const second = setup();
    await second.restoreState();
    expect(second.isActive.value).toBe(false);
    expect(store.has(KEY)).toBe(false);
  });
});

describe("伴讀對話轉聊天訊息", () => {
  it("名字、身分正確；自動觸發時補一句提示", async () => {
    const { toCompanionChatMessages } = await import("@/composables/useCompanionChat");
    const history = [msg(0, "user"), msg(1, "assistant")];
    const plain = toCompanionChatMessages(history, "小林", "小鯤", false);
    expect(plain.map((m) => [m.name, m.is_user, m.sender])).toEqual([
      ["小林", true, "user"],
      ["小鯤", false, "assistant"],
    ]);
    const auto = toCompanionChatMessages(history, "小林", "小鯤", true);
    expect(auto).toHaveLength(3);
    expect(auto[2].is_user).toBe(true);
    expect(auto[2].content).toContain("翻了幾頁");
  });

  it("只帶最近幾則", async () => {
    const { toCompanionChatMessages } = await import("@/composables/useCompanionChat");
    const history = Array.from({ length: 30 }, (_, i) => msg(i, i % 2 ? "assistant" : "user"));
    expect(toCompanionChatMessages(history, "a", "b", false, 20)).toHaveLength(20);
  });
});
