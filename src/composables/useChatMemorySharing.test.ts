import { beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import type { Chat, GroupMember } from "@/types/chat";

const loader = vi.hoisted(() => ({
  loadMemberLinkOptions: vi.fn(),
  loadLinkedGroupNames: vi.fn(),
}));

vi.mock("@/services/linkedMemoryLoader", () => loader);

import { useChatMemorySharing } from "@/composables/useChatMemorySharing";

function member(characterId: string): GroupMember {
  return { characterId, isAdmin: false, isMuted: false, joinedAt: 0 };
}

function group(): Chat {
  return {
    id: "g",
    name: "兄弟群",
    characterId: "c1",
    messages: [],
    metadata: {},
    createdAt: 0,
    updatedAt: 0,
    isGroupChat: true,
    groupMetadata: { groupName: "兄弟群", members: [member("c1"), member("c2")] },
  };
}

function setup(chat: Chat | null) {
  const currentChat = ref<Chat | null>(chat);
  const saveChatImmediate = vi.fn(async () => {});
  const api = useChatMemorySharing({
    currentChat,
    getCharacterName: () => undefined,
    saveChatImmediate,
  });
  return { currentChat, saveChatImmediate, ...api };
}

beforeEach(() => {
  vi.clearAllMocks();
  loader.loadMemberLinkOptions.mockResolvedValue([]);
  loader.loadLinkedGroupNames.mockResolvedValue([]);
});

describe("useChatMemorySharing", () => {
  it("沒有設定時是關閉、輪數 15", () => {
    const { memorySharing } = setup(group());
    expect(memorySharing.value).toEqual({ enabled: false, maxRawTurns: 15 });
  });

  it("打開開關會寫入設定並存檔，輪數限制在 0–30", async () => {
    const { currentChat, saveChatImmediate, updateMemorySharing } = setup(group());
    await updateMemorySharing({ enabled: true });
    expect(currentChat.value!.groupMetadata!.memorySharing).toEqual({
      enabled: true,
      maxRawTurns: 15,
    });
    await updateMemorySharing({ maxRawTurns: 99 });
    expect(currentChat.value!.groupMetadata!.memorySharing!.maxRawTurns).toBe(30);
    expect(saveChatImmediate).toHaveBeenCalledTimes(2);
  });

  it("修改成員連結會存檔並重新讀取選項", async () => {
    const { currentChat, saveChatImmediate, updateMemberMemoryLink } = setup(group());
    await updateMemberMemoryLink("c2", { mode: "none" });
    expect(currentChat.value!.groupMetadata!.members[1].memoryLink).toEqual({ mode: "none" });
    expect(saveChatImmediate).toHaveBeenCalledTimes(1);
    expect(loader.loadMemberLinkOptions).toHaveBeenCalledTimes(1);
  });

  it("群聊讀成員選項，私聊讀連到它的群名", async () => {
    loader.loadMemberLinkOptions.mockResolvedValue([
      { characterId: "c1", name: "二哥", status: "no-chat", chats: [], link: { mode: "none" } },
    ]);
    loader.loadLinkedGroupNames.mockResolvedValue(["兄弟群"]);

    const g = setup(group());
    await g.refreshMemorySharing();
    expect(g.memberLinkOptions.value).toHaveLength(1);
    expect(loader.loadLinkedGroupNames).not.toHaveBeenCalled();

    const p = setup({ ...group(), isGroupChat: false, groupMetadata: undefined });
    await p.refreshMemorySharing();
    expect(p.linkedGroupNames.value).toEqual(["兄弟群"]);
  });

  it("多人卡不讀成員選項", async () => {
    const multi = group();
    multi.groupMetadata!.isMultiCharCard = true;
    const { refreshMemorySharing, memberLinkOptions } = setup(multi);
    await refreshMemorySharing();
    expect(loader.loadMemberLinkOptions).not.toHaveBeenCalled();
    expect(memberLinkOptions.value).toEqual([]);
  });
});
