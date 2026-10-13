import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Chat, ChatMessage, GroupMember } from "@/types/chat";
import type { ChatScreenMessage } from "@/types/chatScreen";

const store = vi.hoisted(() => ({
  chats: [] as Chat[],
  summaries: [] as Array<Record<string, unknown>>,
  messages: {} as Record<string, ChatMessage[]>,
  lastActive: {} as Record<string, string | undefined>,
}));

vi.mock("@/storage/chatStorage", () => ({
  loadAllChats: vi.fn(async () => store.chats),
  getLastActiveChatId: vi.fn(async (characterId: string) => store.lastActive[characterId]),
}));

vi.mock("@/storage/chatMessageStorage", () => ({
  loadMessagePage: vi.fn(async (chatId: string) => ({
    messages: store.messages[chatId] ?? [],
    before: null,
    hasMore: false,
  })),
}));

vi.mock("@/db/database", () => ({
  DB_STORES: { SUMMARIES: "summaries" },
  getDatabase: vi.fn(async () => ({
    getAllFromIndex: vi.fn(async (_store: string, _index: string, chatId: string) =>
      store.summaries.filter((s) => s.chatId === chatId),
    ),
  })),
}));

import {
  loadLinkedGroupNames,
  loadLinkedMemories,
  loadMemberLinkOptions,
} from "@/services/linkedMemoryLoader";

function member(characterId: string, extra: Partial<GroupMember> = {}): GroupMember {
  return { characterId, isAdmin: false, isMuted: false, joinedAt: 0, ...extra };
}

function privateChat(
  id: string,
  characterId: string,
  updatedAt: number,
  extra: Partial<Chat> = {},
): Chat {
  return { id, name: id, characterId, messages: [], metadata: {}, createdAt: 0, updatedAt, ...extra };
}

function groupChat(id: string, members: GroupMember[], extra: Partial<Chat> = {}): Chat {
  return {
    id,
    name: id,
    characterId: members[0]?.characterId ?? "",
    messages: [],
    metadata: {},
    createdAt: 0,
    updatedAt: 0,
    isGroupChat: true,
    groupMetadata: {
      groupName: "兄弟群",
      members,
      memorySharing: { enabled: true, maxRawTurns: 15 },
    },
    ...extra,
  };
}

function stored(
  id: string,
  sender: "user" | "assistant",
  content: string,
  createdAt: number,
  extra: Partial<ChatMessage> = {},
): ChatMessage {
  return {
    id,
    sender,
    name: sender,
    content,
    is_user: sender === "user",
    status: "sent",
    createdAt,
    updatedAt: createdAt,
    ...extra,
  };
}

/** 測試用的簡化轉換：sender → role、createdAt → timestamp */
function toUiMessage(m: ChatMessage): ChatScreenMessage {
  return {
    ...m,
    role: m.sender === "user" ? "user" : m.sender === "assistant" ? "ai" : "system",
    timestamp: m.createdAt,
  } as unknown as ChatScreenMessage;
}

const names: Record<string, string> = { c1: "二哥", c2: "大哥" };

function ctx(chat: Chat, charName = "二哥") {
  return {
    chat,
    userName: "小明",
    charName,
    getCharacterName: (id: string) => names[id],
    toUiMessage,
  };
}

beforeEach(() => {
  store.chats = [];
  store.summaries = [];
  store.messages = {};
  store.lastActive = {};
});

describe("loadLinkedMemories：群聊（私 → 群）", () => {
  it("每位連結成員帶私聊總結與總結之後的原文", async () => {
    const group = groupChat("g", [member("c1"), member("c2")]);
    store.chats = [group, privateChat("p1", "c1", 5), privateChat("p2", "c2", 5)];
    store.summaries = [
      {
        id: "s1",
        chatId: "p1",
        characterId: "c1",
        content: "我和你聊到處男的事",
        createdAt: 100,
        coveredUntil: 20,
        messageCount: 2,
      },
    ];
    store.messages = {
      p1: [
        stored("m1", "user", "已總結的", 10),
        stored("m2", "assistant", "已總結的回覆", 20),
        stored("m3", "user", "你是處男嗎", 30),
        stored("m4", "assistant", "才不是", 31),
      ],
      p2: [stored("n1", "user", "大哥在嗎", 40), stored("n2", "assistant", "在", 41)],
    };

    const text = (await loadLinkedMemories(ctx(group)))!;
    expect(text).toContain('<private_memory owner="二哥">');
    expect(text).toContain("我和你聊到處男的事");
    expect(text).toContain("小明：你是處男嗎\n二哥：才不是");
    expect(text).not.toContain("已總結的");
    expect(text).toContain('<private_memory owner="大哥">');
    expect(text).toContain("小明：大哥在嗎\n大哥：在");
  });

  it("沒開互通的群不讀", async () => {
    const group = groupChat("g", [member("c1")]);
    group.groupMetadata!.memorySharing = { enabled: false, maxRawTurns: 15 };
    store.chats = [group, privateChat("p1", "c1", 5)];
    store.messages = { p1: [stored("m1", "user", "嗨", 1), stored("m2", "assistant", "嗨", 2)] };
    expect(await loadLinkedMemories(ctx(group))).toBeUndefined();
  });

  it("輪數上限為 0 時只帶總結", async () => {
    const group = groupChat("g", [member("c1")]);
    group.groupMetadata!.memorySharing = { enabled: true, maxRawTurns: 0 };
    store.chats = [group, privateChat("p1", "c1", 5)];
    store.summaries = [
      { id: "s1", chatId: "p1", characterId: "c1", content: "總結內容", createdAt: 1, messageCount: 0 },
    ];
    store.messages = {
      p1: [stored("m1", "user", "沒總結的", 30), stored("m2", "assistant", "回覆", 31)],
    };
    const text = (await loadLinkedMemories(ctx(group)))!;
    expect(text).toContain("總結內容");
    expect(text).not.toContain("【最近的私聊】");
  });
});

describe("loadLinkedMemories：私聊（群 → 私）", () => {
  it("帶入連到這個私聊的群：成員名單、群總結、濾掉私信的原文", async () => {
    const p1 = privateChat("p1", "c1", 5);
    const group = groupChat("g", [member("c1", { nickname: "老二" }), member("c2")]);
    store.chats = [p1, group];
    store.summaries = [
      {
        id: "gs",
        chatId: "g",
        characterId: "c1",
        content: "大哥：今天群裡很熱鬧",
        createdAt: 100,
        coveredUntil: 50,
        messageCount: 0,
      },
    ];
    store.messages = {
      g: [
        stored("g1", "user", "大哥！", 60),
        stored("g2", "assistant", "怎麼了", 61, { senderCharacterName: "大哥" }),
        stored("g3", "assistant", "偷偷跟你說", 62, {
          senderCharacterName: "大哥",
          isPrivateMessage: true,
        }),
      ],
    };

    const text = (await loadLinkedMemories(ctx(p1)))!;
    expect(text).toContain('<group_memory group="兄弟群" members="老二、大哥、小明">');
    expect(text).toContain("二哥 在這個群裡的名字是「老二」。");
    expect(text).toContain("大哥：今天群裡很熱鬧");
    expect(text).toContain("小明：大哥！\n大哥：怎麼了");
    expect(text).not.toContain("偷偷跟你說");
  });

  it("auto 連到別的私聊時，這個私聊不帶群聊記憶", async () => {
    const p1 = privateChat("p1", "c1", 5);
    const p2 = privateChat("p2", "c1", 1);
    const group = groupChat("g", [member("c1")]);
    store.chats = [p1, p2, group];
    store.lastActive = { c1: "p1" };
    store.messages = { g: [stored("g1", "user", "嗨", 1), stored("g2", "assistant", "嗨", 2)] };
    expect(await loadLinkedMemories(ctx(p2))).toBeUndefined();
  });
});

describe("設定面板資料", () => {
  it("loadMemberLinkOptions：列出私聊選項，標示虛擬成員與沒有私聊的成員", async () => {
    store.chats = [
      privateChat("p1", "c1", new Date(2026, 9, 14, 12).getTime(), { name: "主線" }),
      privateChat("b1", "c1", new Date(2026, 9, 10, 12).getTime(), {
        name: "如果線",
        isBranch: true,
      }),
    ];
    const group = groupChat("g", [
      member("c1", { memoryLink: { mode: "chat", chatId: "deleted" } }),
      member("gm_1", { isVirtual: true, name: "小美" }),
      member("c3"),
    ]);
    const options = await loadMemberLinkOptions(group, (id) => names[id]);
    expect(options[0]).toMatchObject({ name: "二哥", status: "linkable", link: { mode: "none" } });
    expect(options[0].chats.map((c) => c.label)).toEqual([
      "主線 · 10/14",
      "如果線（分支） · 10/10",
    ]);
    expect(options[1]).toMatchObject({ name: "小美", status: "virtual", chats: [] });
    expect(options[2]).toMatchObject({ name: "c3", status: "no-chat", chats: [] });
  });

  it("loadLinkedGroupNames：回傳連到這個私聊的群名", async () => {
    const p1 = privateChat("p1", "c1", 5);
    store.chats = [p1, groupChat("g", [member("c1")])];
    expect(await loadLinkedGroupNames(p1)).toEqual(["兄弟群"]);
  });
});
