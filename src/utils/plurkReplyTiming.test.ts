import { describe, expect, it } from "vitest";
import { spreadReplyTimes } from "./plurkReplyTiming";

const MIN = 60_000;
const now = 1_000_000;

describe("spreadReplyTimes", () => {
  it("0 則", () => expect(spreadReplyTimes(0, now)).toEqual([]));
  it("第一則 3–6 分鐘後", () => {
    expect(spreadReplyTimes(1, now, () => 0)[0]).toBe(now + 3 * MIN);
    expect(spreadReplyTimes(1, now, () => 0.999)[0]).toBeLessThanOrEqual(now + 6 * MIN);
  });
  it("遞增、全部在 20 分鐘內", () => {
    for (const r of [0, 0.5, 0.999]) {
      const times = spreadReplyTimes(8, now, () => r);
      for (let i = 1; i < times.length; i++) expect(times[i]).toBeGreaterThan(times[i - 1]);
      expect(times[times.length - 1]).toBeLessThanOrEqual(now + 20 * MIN);
    }
  });
  it("間隔 1–5 分鐘（不需壓縮時）", () => {
    const times = spreadReplyTimes(3, now, () => 0);
    expect(times).toEqual([now + 3 * MIN, now + 4 * MIN, now + 5 * MIN]);
  });
});
