import { describe, expect, it } from "vitest";
import {
  resolveSummaryReadCount,
  selectSummariesForPrompt,
  summaryTimelineKey,
} from "./summarySelection";

const s = (id: string, createdAt: number, extra: Record<string, unknown> = {}) => ({
  id,
  createdAt,
  ...extra,
});

describe("selectSummariesForPrompt", () => {
  it("取最新 N 條，回傳由舊到新", () => {
    const list = [s("a", 1), s("b", 2), s("c", 3), s("d", 4)];
    expect(selectSummariesForPrompt(list, 2).map((x) => x.id)).toEqual(["c", "d"]);
  });

  it("釘選的舊總結一定會送，不佔最近 N 條的名額", () => {
    const list = [s("old", 1, { isImportant: true }), s("b", 2), s("c", 3), s("d", 4)];
    expect(selectSummariesForPrompt(list, 2).map((x) => x.id)).toEqual(["old", "c", "d"]);
  });

  it("已合併的總結不送，元總結依涵蓋時間排在原位置", () => {
    const list = [
      s("a", 1, { mergedInto: "meta" }),
      s("b", 2, { mergedInto: "meta" }),
      s("c", 3),
      // 元總結最晚建立，但涵蓋的是 a、b 那段
      s("meta", 100, { isMeta: true, coveredUntil: 2 }),
    ];
    expect(selectSummariesForPrompt(list, 1).map((x) => x.id)).toEqual(["c"]);
    expect(selectSummariesForPrompt(list, Infinity).map((x) => x.id)).toEqual(["meta", "c"]);
  });

  it("讀取數量依設定換算", () => {
    expect(resolveSummaryReadCount({ summaryReadMode: "all", summaryReadCount: 3 })).toBe(Infinity);
    expect(resolveSummaryReadCount({ summaryReadMode: "recent", summaryReadCount: 3 })).toBe(3);
    expect(resolveSummaryReadCount(undefined)).toBe(5);
  });

  it("時間軸位置優先用涵蓋範圍", () => {
    expect(summaryTimelineKey({ createdAt: 10, coveredUntil: 5 })).toBe(5);
    expect(summaryTimelineKey({ createdAt: 10 })).toBe(10);
  });
});
