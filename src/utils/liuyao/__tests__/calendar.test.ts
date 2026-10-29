import { describe, expect, it } from "vitest";
import { getGanzhiTime } from "../calendar";

const at = (y: number, m: number, d: number, h: number, mi = 0) => new Date(y, m - 1, d, h, mi).getTime();

describe("getGanzhiTime", () => {
  it("一般時間的四柱與旬空", async () => {
    const t = await getGanzhiTime(at(2026, 10, 29, 14, 5));
    expect([t.year, t.month, t.day, t.hour]).toEqual(["丙午", "戊戌", "丙子", "乙未"]);
    expect(t.monthZhi).toBe("戌");
    expect(t.dayGan).toBe("丙");
    expect(t.dayZhi).toBe("子");
    expect(t.xunKong).toEqual(["申", "酉"]);
    expect(t.lunarText).toBe("農曆九月二十 未時");
  });

  it("23:00 之後算隔天的日柱", async () => {
    const t = await getGanzhiTime(at(2026, 10, 29, 23, 30));
    expect(t.day).toBe("丁丑");
    expect(t.hour).toBe("庚子");
  });

  it("立春前一刻還是上一年、丑月", async () => {
    const t = await getGanzhiTime(at(2026, 2, 4, 1));
    expect(t.year).toBe("乙巳");
    expect(t.month).toBe("己丑");
    expect(t.monthZhi).toBe("丑");
  });
});
