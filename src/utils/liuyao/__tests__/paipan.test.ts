import { HEXAGRAMS } from "@/data/liuyao/hexagrams";
import type { Dizhi, GanzhiTime, Tiangan, YaoValue } from "@/types/liuyao";
import { describe, expect, it } from "vitest";
import { throwCoins } from "../coins";
import { findHexagram, paipan } from "../paipan";

function fakeTime(dayGan: Tiangan, dayZhi: Dizhi = "寅", monthZhi: Dizhi = "戌"): GanzhiTime {
  return {
    timestamp: 0,
    year: "丙午",
    month: `戊${monthZhi}`,
    day: `${dayGan}${dayZhi}`,
    hour: "癸未",
    monthZhi,
    dayGan,
    dayZhi,
    xunKong: ["午", "未"],
    lunarText: "",
  };
}

const najia = (c: ReturnType<typeof paipan>) => c.lines.map((l) => `${l.liuqin}${l.zhi}${l.wuxing}`);

describe("throwCoins", () => {
  it("字＝2、背＝3，和就是爻值", () => {
    const seq = [0.1, 0.1, 0.1, 0.9, 0.9, 0.9, 0.1, 0.9, 0.9];
    let i = 0;
    const rng = () => seq[i++];
    expect(throwCoins(rng)).toEqual({ coins: [2, 2, 2], value: 6 });
    expect(throwCoins(rng)).toEqual({ coins: [3, 3, 3], value: 9 });
    expect(throwCoins(rng)).toEqual({ coins: [2, 3, 3], value: 8 });
  });

  it("預設用亂數，值一定在 6–9", () => {
    for (let k = 0; k < 50; k++) expect([6, 7, 8, 9]).toContain(throwCoins().value);
  });
});

describe("64 卦表", () => {
  it("64 卦齊全、卦序不重複", () => {
    expect(HEXAGRAMS).toHaveLength(64);
    expect(new Set(HEXAGRAMS.map((h) => h.index)).size).toBe(64);
    expect(new Set(HEXAGRAMS.map((h) => `${h.upper}${h.lower}`)).size).toBe(64);
  });

  it.each([
    ["乾", "乾", 1, "乾為天"],
    ["坤", "坤", 2, "坤為地"],
    ["坤", "乾", 11, "地天泰"],
    ["乾", "坤", 12, "天地否"],
    ["離", "乾", 14, "火天大有"],
    ["坎", "坎", 29, "坎為水"],
    ["離", "離", 30, "離為火"],
    ["離", "坤", 35, "火地晉"],
    ["乾", "巽", 44, "天風姤"],
    ["巽", "巽", 57, "巽為風"],
    ["坎", "離", 63, "水火既濟"],
    ["離", "坎", 64, "火水未濟"],
  ] as const)("上%s下%s → 第 %i 卦 %s", (upper, lower, index, fullName) => {
    const h = findHexagram(lower, upper);
    expect(h.index).toBe(index);
    expect(h.fullName).toBe(fullName);
  });

  it("八宮各 8 卦，每宮本宮到歸魂各一", () => {
    const all = HEXAGRAMS.map((h) => findHexagram(h.lower, h.upper));
    for (const palace of ["乾", "兌", "離", "震", "巽", "坎", "艮", "坤"]) {
      const gens = all.filter((h) => h.palace === palace).map((h) => h.generation);
      expect(gens.sort()).toEqual(["一世", "三世", "二世", "五世", "四世", "本宮", "歸魂", "遊魂"].sort());
    }
  });
});

describe("paipan", () => {
  it("天風姤四爻動 → 巽為風（庚日）", () => {
    const values: YaoValue[] = [8, 7, 7, 9, 7, 7];
    const c = paipan(values, fakeTime("庚"));
    expect(c.original).toMatchObject({ index: 44, fullName: "天風姤", palace: "乾", palaceWuxing: "金", generation: "一世", shi: 1, ying: 4 });
    expect(najia(c)).toEqual(["父母丑土", "子孫亥水", "兄弟酉金", "官鬼午火", "兄弟申金", "父母戌土"]);
    expect(c.lines.map((l) => l.liushen)).toEqual(["白虎", "玄武", "青龍", "朱雀", "勾陳", "螣蛇"]);
    expect(c.lines.map((l) => l.moving)).toEqual([false, false, false, true, false, false]);
    expect(c.lines.map((l) => l.yang)).toEqual([false, true, true, true, true, true]);
    expect(c.lines[0].isShi).toBe(true);
    expect(c.lines[3].isYing).toBe(true);
    // 缺妻財，伏乾為天二爻寅木
    expect(c.lines[1].fushen).toEqual({ zhi: "寅", wuxing: "木", liuqin: "妻財" });
    expect(c.lines.filter((l) => l.fushen)).toHaveLength(1);
    // 變卦
    expect(c.changed).toMatchObject({ index: 57, fullName: "巽為風", palace: "巽", generation: "本宮", shi: 6, ying: 3 });
    expect(c.lines.map((l) => `${l.changed!.liuqin}${l.changed!.zhi}${l.changed!.wuxing}`)).toEqual([
      "父母丑土",
      "子孫亥水",
      "兄弟酉金",
      "父母未土",
      "官鬼巳火",
      "妻財卯木",
    ]);
    expect(c.lines[3].changed!.yang).toBe(false);
  });

  it("地天泰安靜（甲日）：沒有變卦、伏父母巳火", () => {
    const c = paipan([7, 7, 7, 8, 8, 8], fakeTime("甲"));
    expect(c.original).toMatchObject({ index: 11, palace: "坤", palaceWuxing: "土", generation: "三世", shi: 3, ying: 6 });
    expect(najia(c)).toEqual(["妻財子水", "官鬼寅木", "兄弟辰土", "兄弟丑土", "妻財亥水", "子孫酉金"]);
    expect(c.lines.map((l) => l.liushen)).toEqual(["青龍", "朱雀", "勾陳", "螣蛇", "白虎", "玄武"]);
    expect(c.changed).toBeNull();
    expect(c.lines.every((l) => l.changed === undefined)).toBe(true);
    expect(c.lines[1].fushen).toEqual({ zhi: "巳", wuxing: "火", liuqin: "父母" });
  });

  it("乾為天六爻全動 → 坤為地（戊日）", () => {
    const c = paipan([9, 9, 9, 9, 9, 9], fakeTime("戊"));
    expect(c.original).toMatchObject({ index: 1, generation: "本宮", shi: 6, ying: 3 });
    expect(najia(c)).toEqual(["子孫子水", "妻財寅木", "父母辰土", "官鬼午火", "兄弟申金", "父母戌土"]);
    expect(c.lines.map((l) => l.liushen)).toEqual(["勾陳", "螣蛇", "白虎", "玄武", "青龍", "朱雀"]);
    expect(c.lines.some((l) => l.fushen)).toBe(false);
    expect(c.changed?.fullName).toBe("坤為地");
    expect(c.lines.map((l) => `${l.changed!.liuqin}${l.changed!.zhi}`)).toEqual([
      "父母未",
      "官鬼巳",
      "妻財卯",
      "父母丑",
      "子孫亥",
      "兄弟酉",
    ]);
  });

  it("火水未濟（己日）：離宮三世、伏官鬼亥水在三爻", () => {
    const c = paipan([8, 7, 8, 7, 8, 7], fakeTime("己"));
    expect(c.original).toMatchObject({ index: 64, palace: "離", palaceWuxing: "火", generation: "三世", shi: 3, ying: 6 });
    expect(najia(c)).toEqual(["父母寅木", "子孫辰土", "兄弟午火", "妻財酉金", "子孫未土", "兄弟巳火"]);
    expect(c.lines.map((l) => l.liushen)).toEqual(["螣蛇", "白虎", "玄武", "青龍", "朱雀", "勾陳"]);
    expect(c.lines[2].fushen).toEqual({ zhi: "亥", wuxing: "水", liuqin: "官鬼" });
  });

  it("遊魂、歸魂的世應", () => {
    const jin = paipan([8, 8, 8, 7, 8, 7], fakeTime("壬"));
    expect(jin.original).toMatchObject({ fullName: "火地晉", palace: "乾", generation: "遊魂", shi: 4, ying: 1 });
    expect(jin.lines.map((l) => l.liushen)[0]).toBe("玄武");
    const dayou = paipan([7, 7, 7, 7, 8, 7], fakeTime("丙"));
    expect(dayou.original).toMatchObject({ fullName: "火天大有", palace: "乾", generation: "歸魂", shi: 3, ying: 6 });
    expect(dayou.lines.map((l) => l.liushen)[0]).toBe("朱雀");
  });

  it("老陰動變陽", () => {
    const c = paipan([6, 8, 8, 8, 8, 8], fakeTime("甲"));
    expect(c.original.fullName).toBe("坤為地");
    expect(c.changed?.fullName).toBe("地雷復");
    expect(c.lines[0].changed!.yang).toBe(true);
  });
});
