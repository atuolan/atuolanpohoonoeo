import { describe, expect, it } from "vitest";
import { PromptBuilder } from "@/engine/prompt/PromptBuilder";

function member(name: string, extra: Record<string, unknown> = {}) {
  return {
    characterId: `id_${name}`,
    name,
    personality: "",
    description: `${name}的人設`,
    avatar: "",
    isAdmin: false,
    isMuted: false,
    ...extra,
  };
}

function build(extra: Record<string, unknown>) {
  return new PromptBuilder({
    character: {
      data: { name: "建群時第一位", description: "第一位的卡描述", personality: "第一位的性格", scenario: "第一位的場景" },
    },
    messages: [],
    userName: "用戶",
    groupChatMode: true,
    ...extra,
  } as any) as any;
}

describe("群聊角色名單", () => {
  it("被禁言的成員不在「必須發言」的人數裡，並另外寫明不能發言", () => {
    const result = build({
      groupMembers: [member("阿明"), member("小花", { isMuted: true }), member("大雄")],
    }).buildGroupCharacterNames();
    expect(result.content).toContain("共有 3 位角色：阿明、小花、大雄");
    expect(result.content).toContain("未被禁言的 2 位角色都必須有機會發言");
    expect(result.content).toContain("「小花」目前被禁言");
  });

  it("沒有人被禁言時維持原本的說法", () => {
    const result = build({ groupMembers: [member("阿明"), member("大雄")] }).buildGroupCharacterNames();
    expect(result.content).toContain("每個角色都必須有機會發言");
    expect(result.content).not.toContain("禁言");
  });
});

describe("群聊成員列表的互相認知", () => {
  it("綁定的使用者角色也在群裡時，用 personaId（sourceId）認出來", () => {
    const result = build({
      groupMembers: [
        member("小葵", { source: "persona", sourceId: "persona_1", isPersonaMember: true }),
        member("阿明", {
          userBinding: { mode: "bound", boundPersonaId: "persona_1", boundPersonaName: "小葵", relationLabel: "戀人" },
        }),
      ],
    }).buildGroupMembersList();
    expect(result.content).toContain("互相認知：「小葵」此刻也在群裡");
  });
});

describe("普通群聊不額外注入主角色卡", () => {
  it("描述、性格、場景交給成員列表，不再單獨注入第一位成員的卡", async () => {
    const builder = build({ groupMembers: [member("阿明"), member("大雄")] });
    for (const id of ["gcCharDescription", "gcCharPersonality", "gcScenario"]) {
      expect(await builder.buildPromptContent(id, {}, undefined)).toBeNull();
    }
  });

  it("多人卡的人設寫在卡上，照常注入", async () => {
    const builder = build({
      isMultiCharCard: true,
      multiCharMembers: [{ id: "multi_1", name: "甲", avatar: "" }],
    });
    const result = await builder.buildPromptContent("gcCharDescription", {}, undefined);
    expect(result.content).toBe("第一位的卡描述");
  });
});

describe("歷史紀錄裡的引用回覆", () => {
  const original = { id: "a", sender: "assistant", name: "上帝之眼", content: "現在是上午九點", is_user: false };

  it("對上原訊息時寫出被引用的人和原文", () => {
    const reply = { id: "b", sender: "assistant", name: "測試小精靈", content: "太猛了", is_user: false, replyTo: "a" };
    expect(build({}).formatReplyPrefix(reply, [original, reply])).toBe("[回覆 上帝之眼：「現在是上午九點」]\n");
  });

  it("原訊息不在這段歷史裡時，用訊息上存的引用文字", () => {
    const reply = {
      id: "b",
      sender: "assistant",
      name: "測試小精靈",
      content: "太猛了",
      is_user: false,
      replyTo: "很久以前的訊息",
      replyToContent: "很久以前說的話",
    };
    expect(build({}).formatReplyPrefix(reply, [reply])).toBe("[回覆：「很久以前說的話」]\n");
  });

  it("沒有引用、或是系統訊息時不加", () => {
    const plain = { id: "c", sender: "assistant", name: "阿明", content: "早安", is_user: false };
    const system = { id: "d", sender: "system", name: "system", content: "x", is_user: false, replyTo: "a" };
    const builder = build({});
    expect(builder.formatReplyPrefix(plain, [original, plain])).toBe("");
    expect(builder.formatReplyPrefix(system, [original, system])).toBe("");
  });
});

describe("被移出的成員", () => {
  it("成員列表後面列出已移出的人和拉回的寫法", () => {
    const result = build({
      groupMembers: [member("阿明"), member("大雄")],
      removedGroupMembers: [{ name: "小花", removedBy: "阿明" }],
    }).buildGroupMembersList();
    expect(result.content).toContain("- 小花（被 阿明 移出）");
    expect(result.content).toContain('type="invite"');
  });

  it("沒有人被移出時不出現這段", () => {
    const result = build({ groupMembers: [member("阿明"), member("大雄")] }).buildGroupMembersList();
    expect(result.content).not.toContain("已被移出");
  });
});
