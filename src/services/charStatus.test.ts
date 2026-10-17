/// <reference types="vitest/globals" />

import type { Chat } from "@/types/chat";

const { records } = vi.hoisted(() => ({ records: new Map<string, Chat>() }));

vi.mock("@/storage/chatStorage", () => ({
  loadChatById: vi.fn(async (id: string) => records.get(id)),
  saveChatMetadata: vi.fn(async (chat: Chat) => {
    records.set(chat.id, structuredClone(chat));
  }),
}));

import { CHAR_STATUS_CHANGED_EVENT, saveCharStatus } from "@/services/charStatus";

function createChat(charStatus?: Chat["charStatus"]): Chat {
  return {
    id: "chat-1",
    name: "狀態測試",
    characterId: "character-1",
    messages: [],
    metadata: {},
    createdAt: 1,
    updatedAt: 2,
    charStatus,
  };
}

describe("saveCharStatus", () => {
  beforeEach(() => {
    records.clear();
    // 測試環境是 node，用 EventTarget 當 window 收事件
    vi.stubGlobal("window", new EventTarget());
  });
  afterEach(() => vi.unstubAllGlobals());

  it("寫進聊天記錄並發出事件", async () => {
    records.set("chat-1", createChat());
    const events: unknown[] = [];
    const listener = (ev: Event) => events.push((ev as CustomEvent).detail);
    window.addEventListener(CHAR_STATUS_CHANGED_EVENT, listener);

    const status = { text: "睡覺中", updatedAt: 100 };
    await expect(saveCharStatus("chat-1", status)).resolves.toEqual(status);

    window.removeEventListener(CHAR_STATUS_CHANGED_EVENT, listener);
    expect(records.get("chat-1")?.charStatus).toEqual(status);
    expect(events).toEqual([{ chatId: "chat-1", status }]);
  });

  it("比資料庫裡的舊就不寫", async () => {
    records.set("chat-1", createChat({ text: "上班中", updatedAt: 300 }));

    await expect(saveCharStatus("chat-1", { text: "睡覺中", updatedAt: 100 })).resolves.toBeNull();
    expect(records.get("chat-1")?.charStatus?.text).toBe("上班中");
  });

  it("聊天不存在時不寫", async () => {
    await expect(saveCharStatus("missing", { text: "睡覺中", updatedAt: 100 })).resolves.toBeNull();
    expect(records.size).toBe(0);
  });
});
