import { describe, expect, it } from "vitest";
import type { StoredCharacter } from "@/types/character";
import type { GroupMember, MultiCharMember } from "@/types/chat";
import {
  buildMentionInstruction,
  describeGroupAction,
  findMentionedNames,
  findRemovedMemberByName,
  getGroupMemberAvatarUrl,
  getGroupMemberDisplayName,
  toPromptGroupMember,
  withLiveSubCharSnapshot,
} from "@/utils/groupMembers";

function character(id: string, name: string, extra: Partial<StoredCharacter["data"]> = {}) {
  return {
    id,
    nickname: "",
    avatar: `${id}.png`,
    data: { name, description: `${name}的卡描述`, personality: `${name}的卡性格`, scenario: "", ...extra },
  } as unknown as StoredCharacter;
}

function member(characterId: string, extra: Partial<GroupMember> = {}): GroupMember {
  return { characterId, isAdmin: false, isMuted: false, joinedAt: 0, ...extra };
}

const characters = [character("c1", "阿明")];

describe("群成員名字與頭像", () => {
  it("角色卡成員看角色卡，群暱稱優先", () => {
    expect(getGroupMemberDisplayName(member("c1"), characters)).toBe("阿明");
    expect(getGroupMemberDisplayName(member("c1", { nickname: "明哥" }), characters)).toBe("明哥");
    expect(getGroupMemberAvatarUrl(member("c1"), characters)).toBe("c1.png");
  });

  it("虛擬成員看成員自己的名字與頭像", () => {
    const v = member("gm_1", { isVirtual: true, name: "路人甲", avatar: "a.png" });
    expect(getGroupMemberDisplayName(v, characters)).toBe("路人甲");
    expect(getGroupMemberAvatarUrl(v, characters)).toBe("a.png");
  });
});

describe("轉成 prompt 用的群成員", () => {
  it("角色卡還在時用卡的現況，不用加入當下的人設快照", () => {
    const result = toPromptGroupMember(
      member("c1", { personaSnapshot: { description: "舊快照" } }),
      characters,
    );
    expect(result.name).toBe("阿明");
    expect(result.description).toBe("阿明的卡描述");
    expect(result.personaSnapshot).toBeUndefined();
  });

  it("虛擬成員用名字與快照，不會拿 ID 當名字", () => {
    const result = toPromptGroupMember(
      member("gm_1", { isVirtual: true, name: "路人甲", personaSnapshot: { description: "路人設定" } }),
      characters,
    );
    expect(result.name).toBe("路人甲");
    expect(result.originalName).toBe("路人甲");
    expect(result.description).toBe("路人設定");
  });

  it("角色卡被刪掉時退回成員身上的快照", () => {
    const result = toPromptGroupMember(
      member("deleted", { name: "舊名字", personaSnapshot: { personality: "快照性格" } }),
      characters,
    );
    expect(result.name).toBe("舊名字");
    expect(result.personality).toBe("快照性格");
  });

  it("帶上 sourceId（使用者角色的互相認知要用）", () => {
    const result = toPromptGroupMember(
      member("gm_2", { isVirtual: true, name: "小葵", source: "persona", sourceId: "p1" }),
      characters,
    );
    expect(result.sourceId).toBe("p1");
  });
});

describe("多人卡子角色的人設快照", () => {
  const sub: MultiCharMember = {
    id: "multi_1",
    name: "阿明",
    avatar: "",
    source: "character",
    sourceId: "c1",
    personaSnapshot: { description: "舊快照" },
  };

  it("引入自角色卡的換成卡的現況", () => {
    expect(withLiveSubCharSnapshot(sub, characters).personaSnapshot?.description).toBe("阿明的卡描述");
  });

  it("角色卡被刪掉或本卡子角色，保留原樣", () => {
    expect(withLiveSubCharSnapshot({ ...sub, sourceId: "gone" }, characters)).toEqual({ ...sub, sourceId: "gone" });
    const inline: MultiCharMember = { id: "multi_2", name: "乙", avatar: "" };
    expect(withLiveSubCharSnapshot(inline, characters)).toBe(inline);
  });
});

describe("被移出的成員", () => {
  const removed = [
    { ...member("c1", { nickname: "明哥" }), removedAt: 1, removedBy: "小花" },
    { ...member("gm_1", { isVirtual: true, name: "路人甲" }), removedAt: 2 },
  ];

  it("群暱稱或本名完全相同才找得到", () => {
    expect(findRemovedMemberByName(removed, "明哥", characters)?.characterId).toBe("c1");
    expect(findRemovedMemberByName(removed, "阿明", characters)?.characterId).toBe("c1");
    expect(findRemovedMemberByName(removed, " 路人甲 ", characters)?.characterId).toBe("gm_1");
  });

  it("名字後面帶括號註記也認得", () => {
    expect(findRemovedMemberByName(removed, "阿明（20歲）", characters)?.characterId).toBe("c1");
  });

  it("部分名字不算，避免拉錯人", () => {
    expect(findRemovedMemberByName(removed, "明", characters)).toBeUndefined();
    expect(findRemovedMemberByName(removed, "路人", characters)).toBeUndefined();
  });
});

describe("群管理動作的文字", () => {
  it("移出與拉回寫成一句話給 AI 看", () => {
    expect(
      describeGroupAction({ groupActionType: "kick", groupActionActor: "小花", groupActionTarget: "阿明" }),
    ).toBe("[群管理] 小花 將 阿明 移出了群聊");
    expect(
      describeGroupAction({ groupActionType: "invite", groupActionActor: "我", groupActionTarget: "阿明" }),
    ).toBe("[群管理] 我 把 阿明 拉回了群聊");
  });
});

describe("@點名", () => {
  const names = ["小明", "小明明", "大雄"];

  it("找出 @ 了誰，半形全形都算，不重複", () => {
    expect(findMentionedNames("@大雄 你好 ＠小明 還有 @大雄", names)).toEqual(["大雄", "小明"]);
  });

  it("取最長的名字，@小明明 不會變成 @小明", () => {
    expect(findMentionedNames("@小明明 在嗎", names)).toEqual(["小明明"]);
  });

  it("沒有 @ 或名字對不上時是空的", () => {
    expect(findMentionedNames("小明你好", names)).toEqual([]);
    expect(findMentionedNames("@胖虎", names)).toEqual([]);
  });

  it("點名指令會列出被點名的人", () => {
    expect(buildMentionInstruction(["小明", "大雄"], "我", false)).toContain("@ 了「小明」、「大雄」");
  });
});
