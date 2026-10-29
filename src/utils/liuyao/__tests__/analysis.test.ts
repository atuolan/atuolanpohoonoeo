import type { Dizhi, GanzhiTime, Tiangan, YaoValue } from "@/types/liuyao";
import { describe, expect, it } from "vitest";
import { analyzeChart, branchRels, lifeStage } from "../analysis";
import { paipan } from "../paipan";

function t(dayGan: Tiangan, dayZhi: Dizhi, monthZhi: Dizhi, xunKong: [Dizhi, Dizhi]): GanzhiTime {
  return {
    timestamp: 0,
    year: "丙午",
    month: `戊${monthZhi}`,
    day: `${dayGan}${dayZhi}`,
    hour: "甲子",
    monthZhi,
    dayGan,
    dayZhi,
    xunKong,
    lunarText: "",
  };
}

const facts = (values: YaoValue[], time: GanzhiTime) => analyzeChart(paipan(values, time));
const set = (a: string[]) => new Set(a);

describe("對照表", () => {
  it("branchRels：五行關係在前，沖、合在後；同支只回臨", () => {
    expect(branchRels("戌", "戌")).toEqual(["臨"]);
    expect(branchRels("丑", "戌")).toEqual(["扶"]);
    expect(branchRels("酉", "戌")).toEqual(["生"]);
    expect(branchRels("亥", "戌")).toEqual(["剋"]);
    expect(branchRels("午", "戌")).toEqual(["洩"]);
    expect(branchRels("亥", "寅")).toEqual(["洩", "合"]);
    expect(branchRels("申", "寅")).toEqual(["耗", "沖"]);
    expect(branchRels("辰", "戌")).toEqual(["扶", "沖"]);
    expect(branchRels("丑", "子")).toEqual(["耗", "合"]);
  });

  it("lifeStage：土隨水", () => {
    expect(lifeStage("木", "亥")).toBe("長生");
    expect(lifeStage("火", "戌")).toBe("墓");
    expect(lifeStage("金", "寅")).toBe("絕");
    expect(lifeStage("水", "子")).toBe("帝旺");
    expect(lifeStage("土", "申")).toBe("長生");
    expect(lifeStage("土", "辰")).toBe("墓");
    expect(lifeStage("土", "巳")).toBe("絕");
    expect(lifeStage("木", "寅")).toBeUndefined();
  });
});

describe("天風姤四爻動（戌月庚寅日，空午未）", () => {
  const f = facts([8, 7, 7, 9, 7, 7], t("庚", "寅", "戌", ["午", "未"]));

  it("月建、日辰、旺衰", () => {
    expect(f.lines.map((l) => l.month.rels)).toEqual([["扶"], ["剋"], ["生"], ["洩"], ["生"], ["臨"]]);
    expect(f.lines.map((l) => l.month.season)).toEqual(["旺", "休囚", "相", "休囚", "相", "旺"]);
    expect(f.lines.map((l) => l.day.rels)).toEqual([["剋"], ["洩", "合"], ["耗"], ["生"], ["耗", "沖"], ["剋"]]);
    expect(f.lines.map((l) => l.day.stage)).toEqual([undefined, undefined, "絕", "長生", "絕", undefined]);
    expect(f.lines.map((l) => l.strong)).toEqual([true, false, true, true, true, true]);
    expect(f.lines.every((l) => !l.monthBreak)).toBe(true);
  });

  it("靜爻旺相被日沖為暗動", () => {
    expect(f.lines[4].staticDayClash).toBe("暗動");
    expect(f.lines.filter((l) => l.staticDayClash)).toHaveLength(1);
    expect(f.lines.some((l) => l.movingDayClash)).toBe(false);
  });

  it("旬空與不為空的理由", () => {
    expect(f.lines[3].kong).toEqual({
      reasons: ["旺相不為空", "動不為空", "日辰生扶不為空"],
      monthBreakToo: false,
    });
    expect(f.lines.filter((l) => l.kong)).toHaveLength(1);
  });

  it("動變：午化未", () => {
    expect(f.lines[3].change).toEqual(["化空", "化合"]);
    expect(f.lines.filter((l) => l.change)).toHaveLength(1);
  });

  it("伏神妻財寅木可出", () => {
    const fs = f.lines[1].fushen!;
    expect(fs.rels).toEqual(["飛神生伏"]);
    expect(set(fs.helps)).toEqual(set(["臨日辰", "飛神生伏", "月建剋飛神", "飛神休囚"]));
    expect(fs.hinders).toEqual([]);
    expect(fs.verdict).toBe("可出");
  });

  it("全卦", () => {
    expect(f.movingCount).toBe(1);
    expect(f.movingPattern).toBe("獨發");
    expect(f.liuchong).toEqual({ original: false, changed: true });
    expect(f.liuhe).toEqual({ original: false, changed: false });
    expect(f.fanyin).toEqual(["外卦"]);
    expect(f.fuyin).toEqual([]);
    expect(f.sanhe).toHaveLength(1);
    expect(f.sanhe[0].ju).toBe("火局");
    expect(f.sanhe[0].zhi).toEqual(["寅", "午", "戌"]);
    expect(set(f.sanhe[0].sources)).toEqual(set(["日辰", "四爻動", "月建"]));
    expect(f.shiYing).toEqual(["應生世", "應爻旬空"]);
  });
});

describe("乾為天二三爻動 → 天雷無妄（申月甲戌日，空申酉）", () => {
  const f = facts([7, 9, 9, 7, 7, 7], t("甲", "戌", "申", ["申", "酉"]));

  it("月破、沖散", () => {
    expect(f.lines[1].month.rels).toEqual(["剋", "沖"]);
    expect(f.lines[1].monthBreak).toBe(true);
    expect(f.lines[1].strong).toBe(false);
    expect(f.lines[2].movingDayClash).toBe("沖散");
    expect(f.lines[3].day.stage).toBe("墓");
    expect(f.lines.map((l) => l.strong)).toEqual([true, false, true, false, true, true]);
  });

  it("旬空有動爻生扶", () => {
    expect(f.lines[4].kong).toEqual({
      reasons: ["旺相不為空", "日辰生扶不為空", "動爻生扶不為空"],
      monthBreakToo: false,
    });
  });

  it("動變同支只標比和；內卦伏吟；本卦變卦都六沖", () => {
    expect(f.lines[1].change).toEqual(["比和"]);
    expect(f.lines[2].change).toEqual(["比和"]);
    expect(f.fuyin).toEqual(["內卦"]);
    expect(f.fanyin).toEqual([]);
    expect(f.liuchong).toEqual({ original: true, changed: true });
    expect(f.movingPattern).toBe("一般");
    expect(f.sanhe).toEqual([]);
    expect(f.shiYing).toEqual(["世應比和", "世應相沖"]);
  });
});

describe("地天泰安靜（子月癸亥日，空子丑）", () => {
  const f = facts([7, 7, 7, 8, 8, 8], t("癸", "亥", "子", ["子", "丑"]));

  it("真空與不為空", () => {
    expect(f.lines[0].kong).toEqual({ reasons: ["旺相不為空", "日辰生扶不為空"], monthBreakToo: false });
    expect(f.lines[3].kong).toEqual({ reasons: [], monthBreakToo: false });
  });

  it("伏神父母巳火有助有阻", () => {
    const fs = f.lines[1].fushen!;
    expect(fs.rels).toEqual(["飛神生伏"]);
    expect(set(fs.helps)).toEqual(set(["飛神生伏"]));
    expect(set(fs.hinders)).toEqual(set(["伏神休囚無氣", "被月建沖剋", "被日辰沖剋", "伏神墓絕於日"]));
    expect(fs.verdict).toBe("有助有阻");
  });

  it("全卦", () => {
    expect(f.movingPattern).toBe("安靜");
    expect(f.liuhe).toEqual({ original: true, changed: false });
    expect(f.liuchong).toEqual({ original: false, changed: false });
    expect(f.shiYing).toEqual(["世生應", "世應相合"]);
  });
});

describe("化進、化破、化帝旺、日破（震為雷二爻動，酉月甲子日）", () => {
  const f = facts([7, 6, 8, 7, 8, 8], t("甲", "子", "酉", ["戌", "亥"]));
  it("寅化卯", () => {
    expect(f.lines[1].change).toEqual(["比和", "化進", "化破", "化帝旺"]);
  });
  it("靜爻休囚被日沖為日破", () => {
    expect(f.lines[3].staticDayClash).toBe("日破");
  });
});

describe("回頭生剋", () => {
  it("坎為水二爻動：辰化巳回頭生、化絕", () => {
    const f = facts([8, 9, 8, 8, 7, 8], t("甲", "子", "酉", ["戌", "亥"]));
    expect(f.lines[1].change).toEqual(["回頭生", "化絕"]);
  });
  it("離為火三爻動：亥化辰回頭剋、化墓", () => {
    const f = facts([7, 8, 9, 7, 8, 7], t("甲", "子", "酉", ["戌", "亥"]));
    expect(f.lines[2].change).toEqual(["回頭剋", "化墓"]);
  });
  it("乾為天上爻動：戌化未化退", () => {
    const f = facts([7, 7, 7, 7, 7, 9], t("甲", "子", "酉", ["戌", "亥"]));
    expect(f.lines[5].change).toEqual(["比和", "化退"]);
  });
});
