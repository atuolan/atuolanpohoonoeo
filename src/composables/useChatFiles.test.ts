import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { computed, ref } from "vue";
import type { Chat } from "@/types/chat";

const { createChatRecord } = vi.hoisted(() => ({
  createChatRecord: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/storage/chatStorage", () => ({
  createChatRecord,
  deleteChatCascade: vi.fn(),
  loadChatsByCharacter: vi.fn().mockResolvedValue([]),
  renameChat: vi.fn(),
  setLastActiveChatId: vi.fn(),
  toggleChatPinned: vi.fn(),
}));
vi.mock("@/db/database", () => ({
  DB_STORES: { CHATS: "chats" },
  db: { get: vi.fn().mockResolvedValue(undefined), put: vi.fn() },
}));
vi.mock("@/stores/affinity", () => ({ useAffinityStore: vi.fn() }));
vi.mock("@/services/AffinityGreetingInit", () => ({ applyGreetingInitToAffinity: vi.fn() }));

import { useChatFiles } from "@/composables/useChatFiles";
import { useChatVariablesStore } from "@/stores/chatVariables";

const CURRENT_CHAT: Chat = {
  id: "chat-current",
  name: "目前的聊天",
  characterId: "character-1",
  messages: [],
  metadata: {},
  createdAt: 1,
  updatedAt: 1,
  chatVariables: {
    version: 1,
    localVars: { mood: "開心" },
    promptToggles: { f2fStyle: false },
    chatPrompts: [
      {
        id: "chat__1",
        name: "旅行中",
        role: "system",
        content: "兩人正在旅行",
        placement: "end",
        depth: 0,
        modes: ["online", "f2f"],
        enabled: true,
        createdAt: 1,
        updatedAt: 1,
      },
    ],
    updatedAt: 1,
  },
};

function setup() {
  return useChatFiles({
    messages: ref([]),
    currentChatId: ref<string | null>(CURRENT_CHAT.id),
    currentChatData: ref<Chat | null>(CURRENT_CHAT),
    currentCharacter: computed(() => ({ id: "character-1", data: { name: "角色" } })),
    isGroupChat: computed(() => false),
    characterId: "character-1",
    characterName: "角色",
    showMoreFeatures: ref(false),
    saveChatImmediate: vi.fn().mockResolvedValue(undefined),
    loadOrCreateChat: vi.fn().mockResolvedValue(undefined),
    scrollToBottom: vi.fn(),
    emit: vi.fn(),
  });
}

function createdChat(): Chat {
  return createChatRecord.mock.calls[0][0] as Chat;
}

describe("useChatFiles：新建聊天沿用專屬預設", () => {
  beforeEach(() => {
    createChatRecord.mockClear();
    setActivePinia(createPinia());
    useChatVariablesStore().initForChatFromRecord(CURRENT_CHAT);
  });

  it("預設沿用強制開關與專屬條目，但變量從空白開始", async () => {
    const files = setup();
    await files.createNewChatFile(false);

    const chat = createdChat();
    expect(chat.id).not.toBe(CURRENT_CHAT.id);
    expect(chat.chatVariables?.promptToggles).toEqual({ f2fStyle: false });
    expect(chat.chatVariables?.chatPrompts?.map((p) => p.name)).toEqual(["旅行中"]);
    expect(chat.chatVariables?.localVars).toEqual({});
  });

  it("沿用的是開啟新對話當下的最新狀態，包含還沒寫入的修改", async () => {
    useChatVariablesStore().setPromptOverride("main", true);
    const files = setup();
    await files.createNewChatFile(false);

    expect(createdChat().chatVariables?.promptToggles).toEqual({ f2fStyle: false, main: true });
  });

  it("複製的是副本：之後改新聊天不會動到原本的專屬條目", async () => {
    const files = setup();
    await files.createNewChatFile(false);

    const copied = createdChat().chatVariables!.chatPrompts![0];
    copied.modes.push("call");
    copied.content = "改過了";

    const original = useChatVariablesStore().chatPrompts[0];
    expect(original.modes).toEqual(["online", "f2f"]);
    expect(original.content).toBe("兩人正在旅行");
  });

  it("取消勾選時新聊天從空白開始，且下次恢復成預設沿用", async () => {
    const files = setup();
    files.newChatInheritPreset.value = false;
    await files.createNewChatFile(false);

    expect(createdChat().chatVariables).toBeUndefined();
    expect(files.newChatInheritPreset.value).toBe(true);
  });

  it("目前聊天沒有任何調整時，不在新聊天上留空欄位", async () => {
    useChatVariablesStore().initForChatFromRecord({ ...CURRENT_CHAT, chatVariables: undefined });
    const files = setup();
    await files.createNewChatFile(false);

    expect(createdChat().chatVariables).toBeUndefined();
  });
});
