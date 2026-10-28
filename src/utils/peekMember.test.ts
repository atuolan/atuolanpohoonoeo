import { describe, expect, it } from "vitest";
import type { Chat, ChatMessage, MultiCharMember } from "@/types/chat";
import type { StoredCharacter } from "@/types/character";
import type { PeekChatThread } from "@/types/peekPhone";
import { buildMemberCharacter, findPeekMember, listPeekMembers, peekGroupInfo } from "@/utils/peekMember";
import { buildGroupThread, mergeRealGroupThread } from "@/utils/peekRealData";

function member(partial: Partial<MultiCharMember> & { id: string; name: string }): MultiCharMember {
  return { avatar: "", ...partial } as MultiCharMember;
}

function chatWith(members: MultiCharMember[], groupName = "小圈圈"): Pick<Chat, "groupMetadata" | "name"> {
  return {
    name: "聊天名稱",
    groupMetadata: {
      groupName,
      members: [],
      isMultiCharCard: true,
      multiCharMembers: members,
    },
  } as unknown as Chat;
}

function card(partial: Partial<StoredCharacter> = {}): StoredCharacter {
  return {
    id: "card-1",
    nickname: "多人卡",
    avatar: "card-avatar.png",
    data: {
      name: "多人卡",
      description: "卡的描述",
      personality: "卡的個性",
      scenario: "卡的場景",
    },
    lorebookIds: ["lb-1"],
    source: "manual",
    createdAt: 1,
    updatedAt: 1,
    ...partial,
  } as unknown as StoredCharacter;
}

describe("listPeekMembers", () => {
  it("不是多人卡回空陣列", () => {
    expect(listPeekMembers(null)).toEqual([]);
    expect(listPeekMembers({}) as unknown as Chat).toEqual([]);
    expect(
      listPeekMembers({ groupMetadata: { groupName: "x", members: [], isMultiCharCard: false } } as unknown as Chat),
    ).toEqual([]);
  });

  it("排除使用者角色型成員與空名字", () => {
    const members = [
      member({ id: "m1", name: "阿明" }),
      member({ id: "m2", name: "我", isPersonaMember: true }),
      member({ id: "m3", name: "分身", source: "persona" }),
      member({ id: "m4", name: "  " }),
    ];
    expect(listPeekMembers(chatWith(members)).map((m) => m.id)).toEqual(["m1"]);
  });

  it("findPeekMember 用 id 找，空 id 回 undefined", () => {
    const chat = chatWith([member({ id: "m1", name: "阿明" })]);
    expect(findPeekMember(chat, "m1")?.name).toBe("阿明");
    expect(findPeekMember(chat, null)).toBeUndefined();
    expect(findPeekMember(chat, "nope")).toBeUndefined();
  });
});

describe("buildMemberCharacter", () => {
  it("引入角色卡：用那張卡的角色資料，世界書去重聯集", () => {
    const src = card({
      id: "src-1",
      nickname: "來源",
      avatar: "src-avatar.png",
      data: { name: "來源", description: "來源的描述", personality: "來源的個性", scenario: "來源的場景" },
      lorebookIds: ["lb-1", "lb-2"],
    } as unknown as Partial<StoredCharacter>);
    const result = buildMemberCharacter(
      card(),
      member({ id: "m1", name: "阿明", source: "character", sourceId: "src-1", avatar: "" }),
      [src],
    );
    expect(result.id).toBe("m1");
    expect(result.nickname).toBe("阿明");
    expect(result.data.name).toBe("阿明");
    expect(result.data.description).toBe("來源的描述");
    expect(result.avatar).toBe("src-avatar.png");
    expect(result.lorebookIds).toEqual(["lb-1", "lb-2"]);
  });

  it("人設快照：用快照的三欄", () => {
    const result = buildMemberCharacter(
      card(),
      member({
        id: "m2",
        name: "小美",
        avatar: "m2.png",
        source: "persona",
        personaSnapshot: { description: "快照描述", personality: "快照個性" },
      }),
      [],
    );
    expect(result.data.description).toBe("快照描述");
    expect(result.data.personality).toBe("快照個性");
    expect(result.data.scenario).toBe("卡的場景");
    expect(result.avatar).toBe("m2.png");
    expect(result.lorebookIds).toEqual(["lb-1"]);
  });

  it("卡內直接寫的成員：保留卡的角色資料，只換名字與 id", () => {
    const result = buildMemberCharacter(card(), member({ id: "m3", name: "阿宏" }), []);
    expect(result.id).toBe("m3");
    expect(result.nickname).toBe("阿宏");
    expect(result.data.name).toBe("阿宏");
    expect(result.data.description).toBe("卡的描述");
    expect(result.avatar).toBe("");
  });
});

describe("peekGroupInfo", () => {
  it("不是多人卡回 undefined", () => {
    expect(peekGroupInfo(null, "m1")).toBeUndefined();
  });

  it("群名、其他成員不含自己", () => {
    const chat = chatWith(
      [member({ id: "m1", name: "阿明" }), member({ id: "m2", name: "小美" }), member({ id: "m3", name: "我", isPersonaMember: true })],
      "  小圈圈  ",
    );
    const info = peekGroupInfo(chat, "m1");
    expect(info?.groupName).toBe("小圈圈");
    expect(info?.otherMembers).toEqual(["小美", "我"]);
  });
});

function msg(partial: Partial<ChatMessage>): ChatMessage {
  return { id: "x", sender: "assistant", content: "嗨", createdAt: 1000, ...partial } as ChatMessage;
}

const groupOptions = {
  memberId: "m1",
  memberName: "阿明",
  userName: "使用者",
  groupName: "小圈圈",
  groupAvatar: "g.png",
};

describe("buildGroupThread", () => {
  it("自己的訊息 isSelf、使用者的訊息用 userName、別人的用名字", () => {
    const thread = buildGroupThread(
      [
        msg({ id: "a", sender: "assistant", content: "我來了", senderCharacterId: "m1", senderCharacterName: "阿明" }),
        msg({ id: "b", sender: "user", content: "安安", name: "使用者" }),
        msg({ id: "c", sender: "assistant", content: "你好", senderCharacterId: "m2", senderCharacterName: "小美" }),
      ],
      groupOptions,
    );
    expect(thread?.isRealGroup).toBe(true);
    expect(thread?.contactName).toBe("小圈圈");
    expect(thread?.messages.map((m) => [m.senderName, m.isSelf, m.id])).toEqual([
      ["阿明", true, "real-group-a"],
      ["使用者", false, "real-group-b"],
      ["小美", false, "real-group-c"],
    ]);
    expect(thread?.updatedAt).toBe(1000);
  });

  it("收回的、系統通知、非聊天訊息都跳過", () => {
    const thread = buildGroupThread(
      [
        msg({ id: "a", content: "留著", senderCharacterId: "m1" }),
        msg({ id: "b", content: "收回", isCharRecall: true }),
        msg({ id: "c", content: "收回2", isRecall: true }),
        msg({ id: "d", content: "使用者收回", isUserRecalled: true }),
        msg({ id: "e", content: "系統", isSystemNotification: true }),
        msg({ id: "f", sender: "system", content: "系統訊息" }),
      ],
      groupOptions,
    );
    expect(thread?.messages.map((m) => m.id)).toEqual(["real-group-a"]);
  });

  it("沒訊息回 null", () => {
    expect(buildGroupThread([], groupOptions)).toBeNull();
  });
});

describe("mergeRealGroupThread", () => {
  it("拿掉同名的 AI 群組串，保留使用者串，真的在最前面", () => {
    const threads: PeekChatThread[] = [
      { id: "ai-1", contactName: "別的群", messages: [], updatedAt: 1 },
      { id: "ai-2", contactName: "小圈圈", messages: [], updatedAt: 2 },
      { id: "user", contactName: "小圈圈", isUser: true, messages: [], updatedAt: 3 },
    ];
    const group: PeekChatThread = {
      id: "real-group",
      contactName: "小圈圈",
      isRealGroup: true,
      messages: [],
      updatedAt: 4,
    };
    const result = mergeRealGroupThread(threads, group);
    expect(result.map((t) => t.id)).toEqual(["real-group", "ai-1", "user"]);
    expect(mergeRealGroupThread(threads, null)).toBe(threads);
  });
});
