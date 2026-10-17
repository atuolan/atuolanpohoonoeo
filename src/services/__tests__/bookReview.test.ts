import { describe, expect, it } from "vitest";
import {
  agoLabel,
  buildCardsPrompt,
  chapterCardMaterial,
  dueCards,
  hasCardMaterial,
  intervalLabel,
  newCard,
  nextInterval,
  nextReview,
  parseCards,
} from "@/services/bookReview";
import type { BookChapter, BookHighlight, BookSummary } from "@/types/book";

const DAY = 86_400_000;
const at = (y: number, m: number, d: number, h = 0) => new Date(y, m - 1, d, h).getTime();

const card = (intervalDays: number) => ({
  ...newCard({ source: "highlight" as const, chapterIndex: 0, charOffset: 0, question: "q", answer: "a" }, at(2026, 10, 1)),
  intervalDays,
});

describe("排程", () => {
  it("模糊歸零成 1 天；記得至少 4 天、翻倍；很熟至少 14 天、乘 3.5", () => {
    expect(nextInterval(20, "fuzzy")).toBe(1);
    expect(nextInterval(0, "remember")).toBe(4);
    expect(nextInterval(10, "remember")).toBe(20);
    expect(nextInterval(0, "easy")).toBe(14);
    expect(nextInterval(10, "easy")).toBe(35);
  });

  it("排到那天的 0 點，次數加一、記下自評", () => {
    const next = nextReview(card(0), "remember", at(2026, 10, 17, 21));
    expect(next.dueAt).toBe(at(2026, 10, 21));
    expect(next.intervalDays).toBe(4);
    expect(next.reviews).toBe(1);
    expect(next.lastGrade).toBe("remember");
    expect(nextReview(card(4), "fuzzy", at(2026, 10, 17, 23)).dueAt).toBe(at(2026, 10, 18));
  });

  it("新卡馬上到期；觀點鏡頭的卡可以排幾天後", () => {
    const now = at(2026, 10, 17, 15);
    expect(newCard({ source: "summary", chapterIndex: 0, charOffset: 0, question: "q", answer: "a" }, now).dueAt).toBe(now);
    const lens = newCard({ source: "lens", chapterIndex: 0, charOffset: 0, question: "q", answer: "a" }, now, 3);
    expect(lens.dueAt).toBe(at(2026, 10, 20));
    expect(lens.intervalDays).toBe(3);
  });

  it("到期的卡依到期時間排", () => {
    const now = at(2026, 10, 17, 12);
    const list = [{ dueAt: now + DAY }, { dueAt: now - 5 }, { dueAt: now - DAY }, { dueAt: now }];
    expect(dueCards(list, now).map((c) => c.dueAt)).toEqual([now - DAY, now - 5, now]);
    expect(dueCards(undefined, now)).toEqual([]);
  });

  it("下次時間與幾天前的文字", () => {
    expect(intervalLabel(1)).toBe("明天再考");
    expect(intervalLabel(4)).toBe("4 天後");
    expect(intervalLabel(14)).toBe("2 週後");
    expect(intervalLabel(90)).toBe("3 個月後");
    expect(agoLabel(at(2026, 10, 17, 1), at(2026, 10, 17, 23))).toBe("今天");
    expect(agoLabel(at(2026, 10, 16, 23), at(2026, 10, 17, 1))).toBe("昨天");
    expect(agoLabel(at(2026, 10, 15), at(2026, 10, 17))).toBe("2 天前");
  });
});

const chapter: BookChapter = {
  id: "c1",
  title: "逍遙遊",
  order: 0,
  content: "北冥有魚，其名為鯤。\n\n蜩與學鳩笑之曰：我決起而飛。\n\n小知不及大知，小年不及大年。\n\n後面還沒讀到的祕密。",
};
const hl = (text: string, note?: string): BookHighlight => {
  const start = chapter.content.indexOf(text);
  return { id: `h-${text}`, chapterId: "c1", chapterIndex: 0, start, end: start + text.length, text, note, createdAt: 0, updatedAt: 0 };
};
const summary = (from: [number, number], to: [number, number], title: string): BookSummary => ({
  id: title,
  from: { chapterIndex: from[0], charOffset: from[1] },
  to: { chapterIndex: to[0], charOffset: to[1] },
  title,
  content: `- ${title}的重點`,
  auto: false,
  createdAt: 0,
  updatedAt: 0,
});

describe("出卡材料", () => {
  it("劃線帶整段原文與筆記；只取這章範圍內的摘要", () => {
    const m = chapterCardMaterial(chapter, 0, [hl("決起而飛", "好可愛"), hl("北冥")], [
      summary([0, 0], [0, 20], "本章"),
      summary([0, 20], [1, 0], "跨到章尾"),
      summary([1, 0], [1, 50], "下一章"),
    ]);
    expect(m.highlights.map((h) => h.text)).toEqual(["北冥", "決起而飛"]);
    expect(m.highlights[1].paragraph).toBe("蜩與學鳩笑之曰：我決起而飛。");
    expect(m.highlights[1].note).toBe("好可愛");
    expect(m.summaries.map((s) => s.title)).toEqual(["本章", "跨到章尾"]);
    expect(hasCardMaterial(m)).toBe(true);
    expect(hasCardMaterial(chapterCardMaterial(chapter, 0, [], []))).toBe(false);
  });

  it("章還沒讀完時，段落與摘要都不超過讀到的位置", () => {
    const readEnd = chapter.content.indexOf("小年");
    const m = chapterCardMaterial(chapter, 0, [hl("小知不及大知")], [summary([0, 0], [0, 60], "超過了")], readEnd);
    expect(m.highlights[0].paragraph).toBe("小知不及大知，");
    expect(m.summaries).toEqual([]);
  });

  it("提示詞只有材料，不含讀到位置之後的文字，也不送整章", () => {
    const readEnd = chapter.content.indexOf("後面");
    const m = chapterCardMaterial(chapter, 0, [hl("決起而飛", "好可愛")], [summary([0, 0], [0, 20], "鯤")], readEnd);
    const [system, user] = buildCardsPrompt({ bookTitle: "莊子", chapterTitle: "逍遙遊", material: m });
    expect(system.content).toContain("不可以補充或猜測");
    expect(user.content).toContain("[劃線 1] 「決起而飛」");
    expect(user.content).toContain("讀者的筆記：好可愛");
    expect(user.content).toContain("鯤的重點");
    expect(user.content).not.toContain("祕密");
    expect(user.content).not.toContain("北冥有魚");
  });
});

describe("parseCards", () => {
  it("劃線編號換回 id，最多 3 張，壞掉的略過", () => {
    const text = '```json\n[{"question":"誰笑大鵬？","answer":"蜩與學鳩","highlight":1},{"question":"小大之辯？","answer":"小知不及大知"},{"question":"","answer":"x"},{"question":"q3","answer":"a3","highlight":9},{"question":"q4","answer":"a4"}]\n```';
    const cards = parseCards(text, ["h1"]);
    expect(cards).toEqual([
      { question: "誰笑大鵬？", answer: "蜩與學鳩", highlightId: "h1" },
      { question: "小大之辯？", answer: "小知不及大知", highlightId: undefined },
      { question: "q3", answer: "a3", highlightId: undefined },
    ]);
  });

  it("包在 cards 欄位裡也可以；不是 JSON 回傳空陣列", () => {
    expect(parseCards('{"cards":[{"question":"q","answer":"a","highlight":"1"}]}', ["h1"])[0].highlightId).toBe("h1");
    expect(parseCards("抱歉", [])).toEqual([]);
  });
});
