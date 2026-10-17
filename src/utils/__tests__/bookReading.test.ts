import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  addDailySeconds,
  addHighlight,
  bookPercent,
  dateKey,
  mergeDailySeconds,
  readingStreak,
  offsetForPage,
  pageForOffset,
  paragraphSegments,
  remainingMinutes,
  splitParagraphs,
  type PageProbe,
} from "@/utils/bookReading";
import type { BookChapter, BookHighlight } from "@/types/book";

function chapter(content: string): BookChapter {
  return { id: content.slice(0, 4), title: "章", content, order: 0 };
}

describe("splitParagraphs", () => {
  it("略過空白行並記下原文位置", () => {
    const content = "北冥有魚\n\n  其名為鯤  \n化而為鳥";
    const paras = splitParagraphs(content);
    expect(paras.map((p) => p.text)).toEqual(["北冥有魚", "其名為鯤", "化而為鳥"]);
    for (const p of paras) expect(content.slice(p.start, p.start + p.length)).toBe(p.text);
  });
});

describe("bookPercent", () => {
  it("用字數算全書進度", () => {
    const chapters = [chapter("a".repeat(100)), chapter("b".repeat(300))];
    expect(bookPercent(chapters, 0, 0)).toBe(0);
    expect(bookPercent(chapters, 1, 0)).toBe(25);
    expect(bookPercent(chapters, 1, 300)).toBe(100);
    expect(bookPercent([], 0, 0)).toBe(0);
  });
});

describe("劃線", () => {
  const content = "北冥有魚，其名為鯤。鯤之大，不知其幾千里也。";
  const slice = (s: number, e: number) => content.slice(s, e);
  const hl = (id: string, start: number, end: number, note?: string, chapterId = "c1"): BookHighlight => ({
    id, chapterId, chapterIndex: 0, start, end, text: slice(start, end), note, createdAt: Number(id.slice(1)), updatedAt: 0,
  });

  it("不重疊就直接加", () => {
    const list = addHighlight([hl("h1", 0, 4)], hl("h2", 10, 14), slice);
    expect(list.map((h) => h.id)).toEqual(["h1", "h2"]);
  });

  it("重疊或相接的併成一筆，筆記接起來", () => {
    const list = addHighlight([hl("h1", 0, 4, "魚"), hl("h3", 6, 9, "鯤")], hl("h5", 3, 6, "新"), slice);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: "h1", start: 0, end: 9, text: slice(0, 9), note: "魚\n鯤\n新" });
  });

  it("不同章不合併", () => {
    expect(addHighlight([hl("h1", 0, 4)], hl("h2", 2, 6, undefined, "c2"), slice)).toHaveLength(2);
  });

  it("段落切塊", () => {
    // 段落從 10 開始、長 12；劃線 [8,13) 與 [15,30)
    expect(paragraphSegments(10, 12, [{ id: "b", start: 15, end: 30 }, { id: "a", start: 8, end: 13 }])).toEqual([
      { from: 0, to: 3, highlightId: "a" },
      { from: 3, to: 5 },
      { from: 5, to: 12, highlightId: "b" },
    ]);
    expect(paragraphSegments(0, 5, [])).toEqual([{ from: 0, to: 5 }]);
  });
});

describe("閱讀時數", () => {
  it("dateKey 用本地日期", () => {
    expect(dateKey(new Date(2026, 9, 7, 23, 59).getTime())).toBe("2026-10-07");
  });

  it("多本書加總", () => {
    expect(mergeDailySeconds([{ "2026-10-17": 60 }, undefined, { "2026-10-17": 30, "2026-10-16": 5 }])).toEqual({
      "2026-10-17": 90,
      "2026-10-16": 5,
    });
  });

  it("連讀天數：今天還沒讀不算斷，跨月也能數", () => {
    const daily = { "2026-09-30": 120, "2026-10-01": 600, "2026-10-02": 61 };
    expect(readingStreak(daily, "2026-10-02")).toBe(3);
    expect(readingStreak(daily, "2026-10-03")).toBe(3);
    expect(readingStreak(daily, "2026-10-04")).toBe(0);
    expect(readingStreak({ ...daily, "2026-10-01": 10 }, "2026-10-02")).toBe(1);
  });

  it("累加並丟掉太舊的紀錄", () => {
    const next = addDailySeconds({ "2024-01-01": 99, "2026-10-17": 60 }, "2026-10-17", 15);
    expect(next).toEqual({ "2026-10-17": 75 });
  });
});

describe("remainingMinutes", () => {
  it("向上取整", () => {
    expect(remainingMinutes(1000, 0)).toBe(3);
    expect(remainingMinutes(1000, 1000)).toBe(0);
  });
});

/** 由「每段開頭頁、結尾頁」造出量測回呼 */
function probeOf(layout: Array<[number, number]>): PageProbe {
  return { startPage: (i) => layout[i][0], endPage: (i) => layout[i][1] };
}

describe("頁 ↔ 字元位置", () => {
  const paras = [
    { start: 0, length: 40, text: "" },
    { start: 41, length: 900, text: "" }, // 跨第 0–2 頁
    { start: 942, length: 30, text: "" },
  ];
  const probe = probeOf([
    [0, 0],
    [0, 2],
    [2, 2],
  ]);

  it("從段落中間開始的頁，回到同一頁", () => {
    for (const page of [0, 1, 2]) {
      expect(pageForOffset(paras, offsetForPage(paras, page, probe), probe)).toBe(page);
    }
  });

  it("位置在第一段之前時回第一段的頁", () => {
    expect(pageForOffset([{ start: 5, length: 3, text: "" }], 0, probeOf([[1, 1]]))).toBe(1);
  });

  it("任意版面：每一頁存了再還原都回到同一頁", () => {
    // 產生合理版面：段落依序排，下一段從上一段結尾頁或之後開始；跨頁段落夠長
    const layoutArb = fc
      .array(fc.tuple(fc.integer({ min: 0, max: 2 }), fc.integer({ min: 0, max: 3 })), {
        minLength: 1,
        maxLength: 40,
      })
      .map((steps) => {
        const layout: Array<[number, number]> = [];
        const spans: Array<{ start: number; length: number; text: string }> = [];
        let page = 0;
        let cursor = 0;
        steps.forEach(([gap, extra], i) => {
          const start = i === 0 ? 0 : page + (gap === 2 ? 1 : 0);
          const end = start + extra;
          layout.push([start, end]);
          const length = 20 + (extra + 1) * 300;
          spans.push({ start: cursor, length, text: "" });
          cursor += length + 1;
          page = end;
        });
        return { layout, spans, lastPage: page };
      });

    fc.assert(
      fc.property(layoutArb, ({ layout, spans, lastPage }) => {
        const probe = probeOf(layout);
        for (let page = 0; page <= lastPage; page++) {
          const hasContent = layout.some(([s, e]) => s <= page && e >= page);
          if (!hasContent) continue;
          const offset = offsetForPage(spans, page, probe);
          expect(pageForOffset(spans, offset, probe)).toBe(page);
        }
      }),
    );
  });
});
