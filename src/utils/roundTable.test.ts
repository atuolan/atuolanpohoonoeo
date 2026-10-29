import { describe, expect, it } from "vitest";
import {
  ROUND_TABLE_PASS,
  buildRoundTableInstruction,
  isRoundTableActive,
  orderRoundTableSpeakers,
  pickRoundTableMessages,
} from "./roundTable";

const speakers = [{ name: "甲" }, { name: "乙" }, { name: "丙" }];

describe("isRoundTableActive", () => {
  it("只有一般群聊打開才算", () => {
    expect(isRoundTableActive(null)).toBe(false);
    expect(isRoundTableActive({ groupName: "g", members: [] })).toBe(false);
    expect(
      isRoundTableActive({ groupName: "g", members: [], roundTable: { enabled: true, order: "relay" } }),
    ).toBe(true);
    expect(
      isRoundTableActive({
        groupName: "g",
        members: [],
        isMultiCharCard: true,
        roundTable: { enabled: true, order: "relay" },
      }),
    ).toBe(false);
  });
});

describe("orderRoundTableSpeakers", () => {
  it("被 @ 的先講，其餘照順序", () => {
    expect(orderRoundTableSpeakers(speakers, ["丙"]).map((s) => s.name)).toEqual(["丙", "甲", "乙"]);
  });
  it("有上限時截掉，但被 @ 的都留著", () => {
    expect(orderRoundTableSpeakers(speakers, [], 2).map((s) => s.name)).toEqual(["甲", "乙"]);
    expect(orderRoundTableSpeakers(speakers, ["乙", "丙"], 1).map((s) => s.name)).toEqual(["乙", "丙"]);
  });
});

describe("pickRoundTableMessages", () => {
  const isSpeaker = (name: string) => name === "甲";
  it("只留發言人的訊息，沒名字的算他的", () => {
    const picked = pickRoundTableMessages(
      [
        { senderName: "甲", content: "一" },
        { senderName: "乙", content: "二" },
        { senderName: "", content: "三" },
      ],
      isSpeaker,
      "甲",
    );
    expect(picked).toEqual([
      { senderName: "甲", content: "一" },
      { senderName: "甲", content: "三" },
    ]);
  });
  it("丟掉 pass 和別人的群管理動作", () => {
    const picked = pickRoundTableMessages(
      [
        { senderName: "甲", content: ROUND_TABLE_PASS },
        { senderName: "乙", content: "", isGroupAction: true, groupActionActor: "乙" },
        { senderName: "甲", content: "", isGroupAction: true, groupActionActor: "甲" },
      ],
      isSpeaker,
      "甲",
    );
    expect(picked).toHaveLength(1);
    expect(picked[0].groupActionActor).toBe("甲");
  });
});

describe("buildRoundTableInstruction", () => {
  it("點名發言人、列出不能代講的人", () => {
    const text = buildRoundTableInstruction("甲", ["乙"], "我");
    expect(text).toContain("只由「甲」發言");
    expect(text).toContain("「乙」、「我」");
    expect(text).toContain(ROUND_TABLE_PASS);
  });
});
