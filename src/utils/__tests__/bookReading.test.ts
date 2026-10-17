import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  bookPercent,
  offsetForPage,
  pageForOffset,
  remainingMinutes,
  splitParagraphs,
  type PageProbe,
} from "@/utils/bookReading";
import type { BookChapter } from "@/types/book";

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
