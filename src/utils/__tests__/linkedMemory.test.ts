import { describe, expect, it } from "vitest";
import type { Chat, GroupMember } from "@/types/chat";
import type { ChatScreenMessage } from "@/types/chatScreen";
import {
  canMemberLink,
  clampMaxRawTurns,
  findGroupsLinkedToChat,
  formatMessageLines,
  getMemberDisplayName,
  getPrivateChatCandidates,
  getSummaryBoundary,
  isLinkableMessage,
  isMemorySharingGroup,
  pickRecentMessages,
  resolveMemberLinkChatId,
} from "@/utils/linkedMemory";
import type { BoundarySummary } from "@/utils/linkedMemory";

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
      groupName: id,
      members,
      memorySharing: { enabled: true, maxRawTurns: 15 },
    },
    ...extra,
  };
}

const names: Record<string, string> = { c1: "二哥", c2: "大哥" };
const getName = (id: string) => names[id];

describe("clampMaxRawTurns", () => {
  it("限制在 0–30 的整數，不是數字時用預設值 15", () => {
    expect(clampMaxRawTurns(-3)).toBe(0);
    expect(clampMaxRawTurns(12.6)).toBe(13);
    expect(clampMaxRawTurns(99)).toBe(30);
    expect(clampMaxRawTurns(Number.NaN)).toBe(15);
  });
});

describe("getMemberDisplayName", () => {
  it("群暱稱優先，其次角色名，最後 characterId", () => {
    expect(getMemberDisplayName(member("c1", { nickname: "老二" }), getName)).toBe("老二");
    expect(getMemberDisplayName(member("c1"), getName)).toBe("二哥");
    expect(getMemberDisplayName(member("c9"), getName)).toBe("c9");
  });

  it("虛擬成員用自己的名字", () => {
    expect(
      getMemberDisplayName(member("gm_1", { isVirtual: true, name: "小美" }), getName),
    ).toBe("小美");
  });
});

describe("canMemberLink", () => {
  it("虛擬成員與代演成員不能連結", () => {
    expect(canMemberLink(member("c1"))).toBe(true);
    expect(canMemberLink(member("gm_1", { isVirtual: true }))).toBe(false);
    expect(canMemberLink(member("gm_2", { isPersonaMember: true }))).toBe(false);
  });
});

describe("getPrivateChatCandidates", () => {
  it("只留該角色的非群聊、非小劇場私聊，新的在前，分支算在內", () => {
    const chats = [
      privateChat("old", "c1", 1),
      privateChat("new", "c1", 5),
      privateChat("branch", "c1", 3, { isBranch: true }),
      privateChat("theater", "c1", 9, { isTheater: true }),
      privateChat("other", "c2", 7),
      groupChat("g", [member("c1"), member("c2")]),
    ];
    expect(getPrivateChatCandidates(chats, "c1").map((c) => c.id)).toEqual([
      "new",
      "branch",
      "old",
    ]);
  });
});

describe("resolveMemberLinkChatId", () => {
  const candidates = [privateChat("new", "c1", 5), privateChat("old", "c1", 1)];

  it("auto：優先用 lastActive，否則用最新的", () => {
    expect(resolveMemberLinkChatId(member("c1"), candidates, "old")).toBe("old");
    expect(resolveMemberLinkChatId(member("c1"), candidates)).toBe("new");
    expect(resolveMemberLinkChatId(member("c1"), candidates, "theater")).toBe("new");
  });

  it("chat：指定的私聊不在候選中就不連結", () => {
    const pinned = member("c1", { memoryLink: { mode: "chat", chatId: "old" } });
    const stale = member("c1", { memoryLink: { mode: "chat", chatId: "deleted" } });
    expect(resolveMemberLinkChatId(pinned, candidates)).toBe("old");
    expect(resolveMemberLinkChatId(stale, candidates)).toBeUndefined();
  });

  it("none、沒有候選、虛擬成員都不連結", () => {
    const none = member("c1", { memoryLink: { mode: "none" } });
    expect(resolveMemberLinkChatId(none, candidates)).toBeUndefined();
    expect(resolveMemberLinkChatId(member("c1"), [])).toBeUndefined();
    expect(
      resolveMemberLinkChatId(member("gm_1", { isVirtual: true }), candidates),
    ).toBeUndefined();
  });
});

describe("isMemorySharingGroup / findGroupsLinkedToChat", () => {
  const p1 = privateChat("p1", "c1", 5);
  const p2 = privateChat("p2", "c1", 1);

  it("auto 連結解析到這個私聊的群才算", () => {
    const g = groupChat("g", [member("c1"), member("c2")]);
    const all = [p1, p2, g];
    expect(findGroupsLinkedToChat(p1, all).map((c) => c.id)).toEqual(["g"]);
    expect(findGroupsLinkedToChat(p2, all)).toEqual([]);
    expect(findGroupsLinkedToChat(p2, all, "p2").map((c) => c.id)).toEqual(["g"]);
  });

  it("開關關閉、多人卡、成員不連結、指定其他私聊都不算", () => {
    const off = groupChat("off", [member("c1")]);
    off.groupMetadata!.memorySharing = { enabled: false, maxRawTurns: 15 };
    const multi = groupChat("multi", [member("c1")]);
    multi.groupMetadata!.isMultiCharCard = true;
    const none = groupChat("none", [member("c1", { memoryLink: { mode: "none" } })]);
    const other = groupChat("other", [
      member("c1", { memoryLink: { mode: "chat", chatId: "p2" } }),
    ]);
    expect(isMemorySharingGroup(off)).toBe(false);
    expect(isMemorySharingGroup(multi)).toBe(false);
    expect(findGroupsLinkedToChat(p1, [p1, p2, off, multi, none, other])).toEqual([]);
  });

  it("目前是群聊或小劇場時回傳空陣列", () => {
    const g = groupChat("g", [member("c1")]);
    const theater = privateChat("t", "c1", 9, { isTheater: true });
    expect(findGroupsLinkedToChat(g, [g])).toEqual([]);
    expect(findGroupsLinkedToChat(theater, [theater, g])).toEqual([]);
  });
});

function ui(
  id: string,
  role: "user" | "ai" | "system",
  content: string,
  timestamp: number,
  extra: Partial<ChatScreenMessage> = {},
): ChatScreenMessage {
  return { id, role, content, timestamp, ...extra };
}

describe("getSummaryBoundary", () => {
  it("取非匯入總結的 coveredUntil ?? createdAt 最大值，已合併的也算", () => {
    expect(getSummaryBoundary([])).toBe(0);
    const merged = { createdAt: 300, coveredUntil: 250, mergedInto: "meta" } as BoundarySummary;
    expect(
      getSummaryBoundary([
        { createdAt: 100, coveredUntil: 80 },
        { createdAt: 90 },
        merged,
        { createdAt: 500, coveredUntil: 400, isImported: true },
      ]),
    ).toBe(250);
  });
});

describe("isLinkableMessage", () => {
  it("排除系統訊息、群內私信、撤回、群管理動作、聊天記錄卡片", () => {
    expect(isLinkableMessage(ui("a", "user", "嗨", 1))).toBe(true);
    expect(isLinkableMessage(ui("b", "ai", "嗨", 1))).toBe(true);
    expect(isLinkableMessage(ui("c", "system", "通知", 1))).toBe(false);
    expect(isLinkableMessage(ui("d", "ai", "私信", 1, { isPrivateMessage: true }))).toBe(false);
    expect(isLinkableMessage(ui("e", "ai", "撤回", 1, { isRecall: true }))).toBe(false);
    expect(isLinkableMessage(ui("f", "ai", "改群名", 1, { isGroupAction: true }))).toBe(false);
    expect(isLinkableMessage(ui("g", "user", "", 1, { isGroupChatHistory: true }))).toBe(false);
  });
});

describe("pickRecentMessages", () => {
  const messages = [
    ui("u1", "user", "第一輪", 10),
    ui("a1", "ai", "回 1", 11),
    ui("u2", "user", "第二輪", 20),
    ui("a2", "ai", "回 2", 21),
    ui("a2b", "ai", "回 2 續", 22),
    ui("u3", "user", "第三輪", 30),
    ui("a3", "ai", "回 3", 31),
  ];

  it("只取邊界之後的訊息", () => {
    expect(pickRecentMessages(messages, 21, 10).map((m) => m.id)).toEqual(["a2b", "u3", "a3"]);
  });

  it("最多 N 輪，一輪是使用者一句加角色整段回覆", () => {
    expect(pickRecentMessages(messages, 0, 2).map((m) => m.id)).toEqual([
      "u2",
      "a2",
      "a2b",
      "u3",
      "a3",
    ]);
  });

  it("N 為 0 時沒有原文", () => {
    expect(pickRecentMessages(messages, 0, 0)).toEqual([]);
  });

  it("過濾掉不能帶入的訊息", () => {
    const withDm = [...messages, ui("dm", "ai", "私信", 40, { isPrivateMessage: true })];
    expect(pickRecentMessages(withDm, 30, 5).map((m) => m.id)).toEqual(["a3"]);
  });
});

describe("formatMessageLines", () => {
  it("轉成「名字：內容」，卡片轉文字，超過 600 字截斷", () => {
    const lines = formatMessageLines(
      [
        ui("u", "user", "你好", 1),
        ui("a", "ai", "[sticker:開心]", 2, { senderCharacterName: "大哥" }),
        ui("v", "user", "", 3, { messageType: "audio", audioTranscript: "在嗎" }),
        ui("long", "ai", "字".repeat(700), 4),
      ],
      "小明",
      (m) => m.senderCharacterName || "二哥",
    );
    expect(lines).toEqual([
      "小明：你好",
      "大哥：[貼圖]",
      "小明：[語音] 在嗎",
      `二哥：${"字".repeat(600)}…`,
    ]);
  });
});
