import { describe, expect, it } from "vitest";
import { buildLensPrompt, lensContext, LENSES, parseLens, type LensInput } from "@/services/bookLens";

const content = "北冥有魚，其名為鯤。蜩與學鳩笑之曰：我決起而飛。小知不及大知。後面還沒讀到的祕密。";
const start = content.indexOf("蜩");
const end = content.indexOf("：") + 1;
const readEnd = content.indexOf("後面");

describe("lensContext", () => {
  it("前後都取，但後面不超過讀到的位置", () => {
    const { before, after } = lensContext(content, start, end, readEnd);
    expect(before).toBe("北冥有魚，其名為鯤。");
    expect(after).toBe("我決起而飛。小知不及大知。");
    expect(after).not.toContain("祕密");
  });

  it("前面太長就截斷並加省略號", () => {
    const { before } = lensContext(content, start, end, readEnd, 4);
    expect(before).toBe("……名為鯤。");
  });
});

const input: LensInput = {
  bookTitle: "莊子",
  author: "莊周",
  chapterTitle: "逍遙遊",
  quote: "蜩與學鳩笑之曰",
  ...lensContext(content, start, end, readEnd),
  summaries: "【逍遙遊｜鯤化為鵬】\n- 大魚化大鳥",
  lens: "devil",
};

describe("buildLensPrompt", () => {
  it("帶引文、上下文、前情摘要與鏡頭說明，不含讀到位置之後的文字", () => {
    const [system, user] = buildLensPrompt(input);
    expect(system.content).toContain("不可以透露");
    expect(system.content).toContain("不要捏造出處");
    expect(user.content).toContain("「蜩與學鳩笑之曰」");
    expect(user.content).toContain("鯤化為鵬");
    expect(user.content).toContain("唱反調");
    expect(user.content).not.toContain("祕密");
  });

  it("追問時接上前面的對話", () => {
    const msgs = buildLensPrompt(input, [{ answer: "第一次的回答", followUp: "那大鵬呢？" }], "那大鵬呢？");
    expect(msgs.map((m) => m.role)).toEqual(["system", "user", "assistant", "user"]);
    expect(msgs[2].content).toContain("第一次的回答");
    expect(msgs[3].content).toBe("那大鵬呢？");
  });

  it("每個鏡頭都有說明與記憶卡問題", () => {
    for (const l of LENSES) {
      expect(l.instruction.length).toBeGreaterThan(10);
      expect(l.cardQuestion).toMatch(/？$/);
    }
  });
});

describe("parseLens", () => {
  it("解析 JSON", () => {
    expect(parseLens('```json\n{"answer":"小鳥也有道理","followUp":"那誰才逍遙？"}\n```')).toEqual({
      answer: "小鳥也有道理",
      followUp: "那誰才逍遙？",
    });
  });

  it("不是 JSON 時整段當回答；空的回傳 null", () => {
    expect(parseLens("就是說小鳥不懂大鵬")).toEqual({ answer: "就是說小鳥不懂大鵬" });
    expect(parseLens('{"answer":"x","followUp":""}')).toEqual({ answer: "x", followUp: undefined });
    expect(parseLens("  ")).toBeNull();
  });
});
