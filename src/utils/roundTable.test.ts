import { describe, expect, it } from "vitest";
import {
  ROUND_TABLE_PASS,
  buildHostMessages,
  buildHostTranscript,
  buildRoundTableInstruction,
  formatRoundTableUsage,
  parseHostDecision,
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
  it("只有被 @ 的講；沒人被 @ 就全部", () => {
    expect(orderRoundTableSpeakers(speakers, ["乙"], undefined, true).map((s) => s.name)).toEqual(["乙"]);
    expect(orderRoundTableSpeakers(speakers, [], undefined, true)).toHaveLength(3);
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

describe("圓桌指令選項", () => {
  it("各自作答、長篇討論", () => {
    const text = buildRoundTableInstruction("甲", [], "我", { style: "long", independent: true });
    expect(text).toContain("各自作答");
    expect(text).toContain("條列");
    expect(buildRoundTableInstruction("甲", [], "我")).not.toContain("條列");
  });
});

describe("主持人", () => {
  const names = ["小明", "小明明", "阿花"];
  it("對到名字，長的名字優先", () => {
    expect(parseHostDecision("小明明", names)).toBe("小明明");
    expect(parseHostDecision("下一位：阿花", names)).toBe("阿花");
    expect(parseHostDecision("<think>小明</think>阿花", names)).toBe("阿花");
  });
  it("說結束或對不到人 → null", () => {
    expect(parseHostDecision("結束", names)).toBeNull();
    expect(parseHostDecision("", names)).toBeNull();
  });
  it("對話截短、只留最後幾則", () => {
    const t = buildHostTranscript(
      [
        { speaker: "甲", content: "一" },
        { speaker: "乙", content: "二三四五" },
      ],
      1,
      2,
    );
    expect(t).toBe("乙：二三…");
  });
  it("提示詞列出成員和這輪講過的人", () => {
    const [, user] = buildHostMessages("甲：嗨", ["甲", "乙"], ["甲"]);
    expect(user.content).toContain("成員：甲、乙");
    expect(user.content).toContain("這一輪已經發言：甲");
  });
});

describe("接力：前面的人說了什麼", () => {
  it("照順序列在指令前面，空的不列", () => {
    const text = buildRoundTableInstruction("丙", ["甲", "乙"], "我", {
      earlierReplies: [
        { speaker: "甲", content: "贊成" },
        { speaker: "乙", content: " " },
      ],
    });
    expect(text.startsWith("[圓桌] 這一輪前面的人已經說了：\n[甲] 贊成")).toBe(true);
    expect(text).not.toContain("[乙]");
    expect(text).toContain("只由「丙」發言");
  });
});

describe("悄悄話與用量", () => {
  it("悄悄話指令講明其他人看不到", () => {
    expect(buildRoundTableInstruction("甲", ["乙"], "我", { whisper: true })).toContain("私下傳給 甲 的悄悄話");
  });
  it("用量小字", () => {
    expect(formatRoundTableUsage({ calls: 3, promptTokens: 34567, completionTokens: 800 })).toBe(
      "3 次・輸入 34.6k／輸出 800 tokens",
    );
  });
});
