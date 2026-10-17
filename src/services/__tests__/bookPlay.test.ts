import { describe, expect, it } from "vitest";
import { extractJson } from "@/services/BookAIService";
import {
  buildDuelPrompt,
  buildSummonPrompt,
  duelScore,
  parseBranches,
  parseDuelQuestions,
  petLine,
  petState,
  petXp,
} from "@/services/bookPlay";

describe("extractJson", () => {
  it("容許圍欄與前後文字", () => {
    expect(extractJson('好的：\n```json\n[{"a":1}]\n```\n以上')).toEqual([{ a: 1 }]);
    expect(extractJson('結果 {"x":"y"} 完')).toEqual({ x: "y" });
    expect(extractJson("沒有 json")).toBeNull();
  });
});

describe("讀書靈獸", () => {
  it("經驗值與階段", () => {
    expect(petXp({ totalMinutes: 20.7, highlights: 2, notes: 1 })).toBe(31);
    expect(petState(0).stage.name).toBe("魚卵");
    const s = petState(115);
    expect(s.stage.name).toBe("小鯤");
    expect(s.next?.name).toBe("大鯤");
    expect(s.progress).toBeCloseTo(0.5);
    expect(petState(5000)).toMatchObject({ progress: 1, next: undefined });
  });

  it("說的話看今天讀了多少", () => {
    const s = petState(10);
    expect(petLine(s, { minutes: 0, goal: 15, streak: 0 })).toContain("還沒讀書");
    expect(petLine(s, { minutes: 5, goal: 15, streak: 0 })).toContain("10 分鐘");
    expect(petLine(s, { minutes: 20, goal: 15, streak: 4 })).toContain("連讀 4 天");
    expect(petLine(petState(28), { minutes: 1, goal: 15, streak: 0 })).toContain("小鯤");
  });
});

describe("擂台", () => {
  it("只留格式正確的題目，對手答案超出範圍時當他答對", () => {
    const text = JSON.stringify([
      { question: "Q1", options: ["a", "b", "c", "d"], answer: 1, explain: "e", rivalPick: 3, rivalLine: "哼" },
      { question: "Q2", options: ["a", "b"], answer: 0 },
      { question: "Q3", options: ["a", "b", "c", "d"], answer: 9 },
      { question: "Q4", options: ["a", "b", "c", "d"], answer: 2, rivalPick: 7 },
    ]);
    const qs = parseDuelQuestions(text);
    expect(qs.map((q) => q.question)).toEqual(["Q1", "Q4"]);
    expect(qs[1].rivalPick).toBe(2);
  });

  it("提示詞含對手與防劇透", () => {
    const [sys] = buildDuelPrompt("莊子", "北冥有魚", { name: "惠施", personality: "愛抬槓" });
    expect(sys.content).toContain("惠施");
    expect(sys.content).toContain("不可以透露");
  });

  it("計分", () => {
    expect(duelScore(false, 10, 10)).toBe(0);
    expect(duelScore(true, 10, 10)).toBe(150);
    expect(duelScore(true, 0, 10)).toBe(100);
  });
});

describe("平行宇宙", () => {
  it("JSON 或條列都讀得懂，最多三個", () => {
    expect(parseBranches('["甲","乙","丙","丁"]').map((b) => b.title)).toEqual(["甲", "乙", "丙"]);
    expect(parseBranches("1. 牠回到海裡\n2、牠學會短飛").map((b) => b.title)).toEqual(["牠回到海裡", "牠學會短飛"]);
  });
});

describe("召喚作者", () => {
  it("作者與客人用不同身分，帶入對話紀錄", () => {
    const base = {
      bookTitle: "莊子",
      author: "莊子",
      readingText: "北冥有魚",
      style: "modern" as const,
      userName: "小林",
      history: [{ role: "user" as const, name: "小林", content: "上班好累", timestamp: 1 }],
    };
    const author = buildSummonPrompt({ ...base, speaker: "author" });
    expect(author[0].content).toContain("作者 莊子");
    expect(author[1].content).toContain("小林：上班好累");
    const guest = buildSummonPrompt({ ...base, speaker: "guest", guest: "惠施", style: "original" });
    expect(guest[0].content).toContain("你是 惠施");
    expect(guest[0].content).toContain("原本的文風");
  });
});
