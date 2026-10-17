import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  buildSummaryPrompt,
  charsBetween,
  fromGlobal,
  lastSummaryEnd,
  parseSummary,
  rangeLabel,
  recapSource,
  shouldAutoSummarize,
  splitRange,
  summariesBefore,
  textBetween,
  toGlobal,
} from "@/services/bookSummary";
import type { BookChapter, BookSummary } from "@/types/book";

const ch = (title: string, content: string): BookChapter => ({ id: title, title, content, order: 0 });
const pos = (chapterIndex: number, charOffset: number) => ({ chapterIndex, charOffset });
const summary = (from: [number, number], to: [number, number], title = "t"): BookSummary => ({
  id: title,
  from: pos(...from),
  to: pos(...to),
  title,
  content: "- 重點",
  auto: false,
  createdAt: 0,
  updatedAt: 0,
});

describe("textBetween", () => {
  const chapters = [ch("一", "甲乙丙\n丁戊"), ch("二", "子丑寅卯"), ch("空", ""), ch("三", "天地玄黃")];

  it("同一章只取範圍內", () => {
    expect(textBetween(chapters, pos(1, 1), pos(1, 3))).toBe("【二】\n……丑寅");
  });

  it("跨章時每章前加章名，空章略過", () => {
    const text = textBetween(chapters, pos(0, 4), pos(3, 2));
    expect(text).toBe("【一】\n……丁戊\n\n【二】\n子丑寅卯\n\n【三】\n天地");
    expect(text).not.toContain("玄");
  });

  it("結尾在下一章開頭時不帶出下一章", () => {
    expect(textBetween(chapters, pos(0, 0), pos(1, 0))).toBe("【一】\n甲乙丙\n丁戊");
  });

  it("範圍反了或是空的回傳空字串", () => {
    expect(textBetween(chapters, pos(1, 3), pos(1, 1))).toBe("");
    expect(textBetween(chapters, pos(1, 2), pos(1, 2))).toBe("");
  });
});

describe("位置換算", () => {
  const chapters = [ch("一", "12345"), ch("二", "678"), ch("三", "90")];

  it("toGlobal / fromGlobal 互換，交界算下一章開頭", () => {
    expect(toGlobal(chapters, pos(1, 2))).toBe(7);
    expect(fromGlobal(chapters, 7)).toEqual(pos(1, 2));
    expect(fromGlobal(chapters, 5)).toEqual(pos(1, 0));
    expect(fromGlobal(chapters, 10)).toEqual(pos(2, 2));
  });

  it("charsBetween 跨章累加", () => {
    expect(charsBetween(chapters, pos(0, 3), pos(2, 1))).toBe(6);
  });
});

describe("splitRange", () => {
  const para = (n: number, c: string) => c.repeat(n);

  it("不超過上限就只有一段", () => {
    const chapters = [ch("一", "短短的一章")];
    expect(splitRange(chapters, pos(0, 0), pos(0, 5), 100)).toEqual([{ from: pos(0, 0), to: pos(0, 5) }]);
  });

  it("優先在段落開頭切", () => {
    const content = [para(40, "甲"), para(40, "乙"), para(40, "丙")].join("\n");
    const ranges = splitRange([ch("一", content)], pos(0, 0), pos(0, content.length), 90);
    expect(ranges.map((r) => r.to.charOffset)).toEqual([82, content.length]);
  });

  it("單一段落太長就硬切", () => {
    const ranges = splitRange([ch("一", para(250, "字"))], pos(0, 0), pos(0, 250), 100);
    expect(ranges.map((r) => [r.from.charOffset, r.to.charOffset])).toEqual([
      [0, 100],
      [100, 200],
      [200, 250],
    ]);
  });

  it("每段不超過上限，首尾相接不漏字（隨機）", () => {
    const chapterArb = fc
      .array(fc.string({ unit: fc.constantFrom("字", "句", "\n"), maxLength: 300 }), { minLength: 1, maxLength: 5 })
      .map((contents) => contents.map((c, i) => ch(`第${i}章`, c)));
    fc.assert(
      fc.property(chapterArb, fc.integer({ min: 1, max: 120 }), fc.nat(), fc.nat(), (chapters, max, x, y) => {
        const total = chapters.reduce((n, c) => n + c.content.length, 0);
        const [a, b] = [x % (total + 1), y % (total + 1)].sort((p, q) => p - q);
        const from = fromGlobal(chapters, a);
        const to = fromGlobal(chapters, b);
        const ranges = splitRange(chapters, from, to, max);
        if (a === b) return ranges.length === 0;
        let cursor = a;
        for (const r of ranges) {
          const s = toGlobal(chapters, r.from);
          const e = toGlobal(chapters, r.to);
          if (s !== cursor || e <= s || e - s > max) return false;
          cursor = e;
        }
        return cursor === b;
      }),
    );
  });
});

describe("summariesBefore / lastSummaryEnd", () => {
  const list = [summary([2, 0], [3, 0], "c"), summary([0, 0], [1, 0], "a"), summary([1, 0], [2, 0], "b"), summary([3, 0], [3, 500], "d")];

  it("只取結尾在位置之前的，舊的在前", () => {
    expect(summariesBefore(list, pos(3, 100), 2).map((s) => s.title)).toEqual(["b", "c"]);
    expect(summariesBefore(list, pos(0, 50), 3)).toEqual([]);
    expect(summariesBefore(undefined, pos(9, 0), 3)).toEqual([]);
  });

  it("最後的結尾", () => {
    expect(lastSummaryEnd(list)).toEqual(pos(3, 500));
    expect(lastSummaryEnd([])).toBeUndefined();
  });
});

describe("自動摘要計數", () => {
  it("到頁數才總結，關掉或失敗太多次不總結", () => {
    expect(shouldAutoSummarize(9, 10, 0)).toBe(false);
    expect(shouldAutoSummarize(10, 10, 0)).toBe(true);
    expect(shouldAutoSummarize(99, 0, 0)).toBe(false);
    expect(shouldAutoSummarize(10, 10, 2)).toBe(true);
    expect(shouldAutoSummarize(10, 10, 3)).toBe(false);
  });
});

describe("rangeLabel", () => {
  const titles = ["逍遙遊", "齊物論", "養生主"];
  it("同一章只寫一次；結尾在下一章開頭算前一章", () => {
    expect(rangeLabel(summary([0, 5], [0, 90]), titles)).toBe("逍遙遊");
    expect(rangeLabel(summary([0, 5], [1, 0]), titles)).toBe("逍遙遊");
    expect(rangeLabel(summary([0, 5], [2, 10]), titles)).toBe("逍遙遊 → 養生主");
  });
});

describe("三句接上的材料", () => {
  const chapters = [ch("一", "甲".repeat(5000)), ch("二", "乙".repeat(2000) + "丙".repeat(3000) + "丁".repeat(5000))];

  it("沒有摘要時退回送最後一段原文", () => {
    const text = recapSource(chapters, pos(1, 100), []);
    expect(text).not.toContain("前情摘要");
    expect(text).toContain("【二】");
  });

  it("有摘要時送最近 3 則＋摘要結尾到目前位置的原文，不含後面", () => {
    const list = [
      summary([0, 0], [0, 2000], "s1"),
      summary([0, 2000], [0, 4000], "s2"),
      summary([0, 4000], [1, 0], "s3"),
      summary([1, 0], [1, 2000], "s4"),
    ];
    const text = recapSource(chapters, pos(1, 5000), list);
    expect(text).toContain("前情摘要");
    expect(text).not.toContain("s1");
    expect(text).toContain("s4");
    // 摘要結尾（第 2000 字）之後的原文，但最多 3000 字
    expect(text).toContain("丙");
    expect(text).not.toContain("乙");
    expect(text).not.toContain("丁");
  });

  it("目前這頁上的摘要也算讀過，不會把讀過的位置之後的原文送出", () => {
    const list = [summary([1, 0], [1, 5800], "這頁")];
    const text = recapSource(chapters, pos(1, 5000), list);
    expect(text).toContain("這頁");
    expect(text).not.toContain("最後讀到的一段");
  });
});

describe("摘要提示詞與解析", () => {
  it("提示詞帶書名、前一則摘要、原文，要求不劇透", () => {
    const [system, user] = buildSummaryPrompt({
      bookTitle: "莊子",
      author: "莊周",
      text: "【逍遙遊】\n北冥有魚",
      previous: summary([0, 0], [0, 1], "鯤化為鵬"),
    });
    expect(system.content).toContain("不可以補充或猜測");
    expect(user.content).toContain("《莊子》");
    expect(user.content).toContain("鯤化為鵬");
    expect(user.content).toContain("北冥有魚");
  });

  it("解析 JSON，陣列內容接成條列", () => {
    expect(parseSummary('```json\n{"title":"小大之辯","content":"- 蜩笑鵬\\n- 小知不及大知"}\n```')).toEqual({
      title: "小大之辯",
      content: "- 蜩笑鵬\n- 小知不及大知",
    });
    expect(parseSummary('{"title":"x","content":["甲","- 乙"]}')).toEqual({ title: "x", content: "- 甲\n- 乙" });
  });

  it("沒有標題就從內容取；沒有內容回傳 null", () => {
    expect(parseSummary('{"content":"- 大鵬南飛"}')?.title).toBe("大鵬南飛");
    expect(parseSummary('{"title":"空的"}')).toBeNull();
    expect(parseSummary("不是 JSON")).toBeNull();
  });
});
