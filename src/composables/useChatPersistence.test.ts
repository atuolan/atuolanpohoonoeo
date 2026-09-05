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
} = vi.hoisted(() => ({
  extractAudioFromMessages: vi.fn(async (messages: ChatMessage[]) => messages),
  extractImagesFromMessages: vi.fn(async (messages: ChatMessage[]) => messages),
  loadChatById: vi.fn().mockResolvedValue(undefined),
  loadMessages: vi.fn().mockResolvedValue([]),
  saveChatMetadata: vi.fn().mockResolvedValue(undefined),
  refreshChatDerivedMetadata: vi.fn().mockResolvedValue(undefined),
  saveMessages: vi.fn().mockResolvedValue(undefined),
  upsertMessages: vi.fn().mockResolvedValue(undefined),
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
});
