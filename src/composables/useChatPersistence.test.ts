/// <reference types="vitest/globals" />

import { ref } from "vue";
import type { Chat, ChatMessage } from "@/types/chat";
import type { ChatScreenMessage } from "@/types/chatScreen";

const {
  extractAudioFromMessages,
  extractImagesFromMessages,
  loadChatById,
  loadMessages,
  saveChatMetadata,
  refreshChatDerivedMetadata,
  saveMessages,
  upsertMessages,
  deleteMessage,
} = vi.hoisted(() => ({
  extractAudioFromMessages: vi.fn(async (messages: ChatMessage[]) => messages),
  extractImagesFromMessages: vi.fn(async (messages: ChatMessage[]) => messages),
  loadChatById: vi.fn().mockResolvedValue(undefined),
  loadMessages: vi.fn().mockResolvedValue([]),
  saveChatMetadata: vi.fn().mockResolvedValue(undefined),
  refreshChatDerivedMetadata: vi.fn().mockResolvedValue(undefined),
  saveMessages: vi.fn().mockResolvedValue(undefined),
  upsertMessages: vi.fn().mockResolvedValue(undefined),
  deleteMessage: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/db/operations", () => ({
  extractAudioFromMessages,
  extractImagesFromMessages,
}));

vi.mock("@/storage/chatStorage", () => ({
  loadChatById,
  refreshChatDerivedMetadata,
  resolvePreferredDirectChat: vi.fn().mockResolvedValue(undefined),
  saveChatMetadata,
}));

vi.mock("@/storage/chatMessageStorage", () => ({
  deleteMessage,
  getMessageCount: vi.fn().mockResolvedValue(0),
  loadMessages,
  saveMessages,
  upsertMessages,
}));

vi.mock("@/utils/chatPerformanceDebug", () => ({
  chatPerfMark: vi.fn(),
}));

import { useChatPersistence } from "@/composables/useChatPersistence";

function createMessage(id: string): ChatScreenMessage {
  return {
    id,
    role: "user",
    content: "hello",
    timestamp: 1,
  } as ChatScreenMessage;
}

function createStoredMessage(id: string): ChatMessage {
  return {
    id,
    sender: "user",
    name: "User",
    is_user: true,
    status: "sent",
    content: "hello",
    createdAt: 1,
    updatedAt: 1,
  };
}

function createPersistence({
  message,
  storedMessage,
}: {
  message: ChatScreenMessage;
  storedMessage: ChatMessage;
}) {
  return useChatPersistence({
    messages: ref([message]),
    currentChatId: ref("chat-1"),
    currentChatData: ref<Chat | null>(null),
    getCharName: () => "Assistant",
    getDirectCharacterId: () => "",
    convertToStorableMessage: () => storedMessage,
    buildChatMetadata: (messages) =>
      ({
        id: "chat-1",
        name: "Chat",
        characterId: "character-1",
        messages,
        metadata: {},
        createdAt: 1,
        updatedAt: 1,
      }) as Chat,
    initChatVariables: vi.fn(),
    refreshBlockStateFromStorage: vi.fn().mockResolvedValue(undefined),
    isMessagesComplete: () => true,
  });
}

describe("useChatPersistence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("clones metadata without deep-cloning history while persisting messages", async () => {
    const message = createMessage("msg-1");
    const storedMessage = createStoredMessage("msg-1");
    loadMessages.mockResolvedValue([storedMessage]);
    const structuredCloneSpy = vi.spyOn(globalThis, "structuredClone");

    const persistence = useChatPersistence({
      messages: ref([message]),
      currentChatId: ref("chat-1"),
      currentChatData: ref<Chat | null>(null),
      getCharName: () => "Assistant",
      getDirectCharacterId: () => "",
      convertToStorableMessage: () => storedMessage,
      buildChatMetadata: (messages) =>
        ({
          id: "chat-1",
          name: "Chat",
          characterId: "character-1",
          messages,
          metadata: {},
          createdAt: 1,
          updatedAt: 1,
        }) as Chat,
      initChatVariables: vi.fn(),
      refreshBlockStateFromStorage: vi.fn().mockResolvedValue(undefined),
      isMessagesComplete: () => true,
    });

    await persistence.runSaveNow();

    expect(saveMessages).toHaveBeenCalledWith("chat-1", [storedMessage], undefined);
    expect(saveChatMetadata).toHaveBeenCalledTimes(1);
    const clonedChat = structuredCloneSpy.mock.calls[0][0] as Chat;
    expect(clonedChat.messages).toEqual([]);

  });

  it("flushPendingSave persists a debounced save before it fires", async () => {
    vi.useFakeTimers();
    const message = createMessage("msg-1");
    const storedMessage = createStoredMessage("msg-1");
    loadMessages.mockResolvedValue([storedMessage]);

    const persistence = createPersistence({ message, storedMessage });

    // saveChat only arms a 400ms timer; nothing has reached storage yet.
    persistence.saveChat();
    expect(saveMessages).not.toHaveBeenCalled();
    expect(persistence.hasPendingSave()).toBe(true);

    await persistence.flushPendingSave();

    expect(saveMessages).toHaveBeenCalledWith("chat-1", [storedMessage], undefined);
    expect(persistence.hasPendingSave()).toBe(false);

    // The cancelled timer must not trigger a second write.
    await vi.advanceTimersByTimeAsync(1000);
    expect(saveMessages).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it("flushPendingSave is a no-op when nothing is pending", async () => {
    const persistence = createPersistence({
      message: createMessage("msg-1"),
      storedMessage: createStoredMessage("msg-1"),
    });

    await persistence.flushPendingSave();

    expect(saveMessages).not.toHaveBeenCalled();
  });
});

describe("生成中的佔位氣泡", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    loadMessages.mockResolvedValue([]);
  });

  function setup(isComplete: boolean) {
    const messages = ref<ChatScreenMessage[]>([
      { id: "old", role: "user", content: "舊訊息", timestamp: 100 } as ChatScreenMessage,
    ]);
    const persistence = useChatPersistence({
      messages,
      currentChatId: ref("chat-1"),
      currentChatData: ref<Chat | null>(null),
      getCharName: () => "Assistant",
      getDirectCharacterId: () => "",
      convertToStorableMessage: (m) => ({ ...createStoredMessage(m.id), content: m.content, createdAt: m.timestamp }),
      buildChatMetadata: (stored) =>
        ({ id: "chat-1", name: "Chat", characterId: "c", messages: stored, metadata: {}, createdAt: 1, updatedAt: 1 }) as Chat,
      initChatVariables: vi.fn(),
      refreshBlockStateFromStorage: vi.fn().mockResolvedValue(undefined),
      isMessagesComplete: () => isComplete,
    });
    persistence.markMessagesLoaded(1000);
    return { messages, persistence };
  }

  it.each([true, false])("存過又從畫面拿掉的新訊息會從資料庫刪掉（完整載入=%s）", async (isComplete) => {
    const { messages, persistence } = setup(isComplete);
    messages.value.push({ id: "placeholder", role: "ai", content: "", timestamp: 2000, isStreaming: true });
    await persistence.saveChatImmediate();
    expect(deleteMessage).not.toHaveBeenCalled();

    messages.value.splice(1, 1, { id: "reply_0", role: "ai", content: "回覆", timestamp: 2001 } as ChatScreenMessage);
    await persistence.saveChatImmediate();
    expect(deleteMessage).toHaveBeenCalledTimes(1);
    expect(deleteMessage).toHaveBeenCalledWith("placeholder", { chatId: "chat-1" });
  });

  it("載入前就有的訊息不在這裡刪（交給全量保存或手動刪除）", async () => {
    const { messages, persistence } = setup(false);
    await persistence.saveChatImmediate();
    messages.value.splice(0, 1);
    await persistence.saveChatImmediate();
    expect(deleteMessage).not.toHaveBeenCalled();
  });
});
