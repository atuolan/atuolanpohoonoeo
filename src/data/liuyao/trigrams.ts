import type { Dizhi, TrigramName, Wuxing } from "@/types/liuyao";

export interface TrigramData {
  name: TrigramName;
  symbol: string;
  nature: string;
  lines: [boolean, boolean, boolean];
  wuxing: Wuxing;
  inner: [Dizhi, Dizhi, Dizhi];
  outer: [Dizhi, Dizhi, Dizhi];
}

export const DIZHI_WUXING: Record<Dizhi, Wuxing> = {
  子: "水",
  丑: "土",
  寅: "木",
  卯: "木",
  辰: "土",
  巳: "火",
  午: "火",
  未: "土",
  申: "金",
  酉: "金",
  戌: "土",
  亥: "水",
};

export const TRIGRAMS: Record<TrigramName, TrigramData> = {
  乾: {
    name: "乾",
    symbol: "☰",
    nature: "天",
    lines: [true, true, true],
    wuxing: "金",
    inner: ["子", "寅", "辰"],
    outer: ["午", "申", "戌"],
  },
  兌: {
    name: "兌",
    symbol: "☱",
    nature: "澤",
    lines: [true, true, false],
    wuxing: "金",
    inner: ["巳", "卯", "丑"],
    outer: ["亥", "酉", "未"],
  },
  離: {
    name: "離",
    symbol: "☲",
    nature: "火",
    lines: [true, false, true],
    wuxing: "火",
    inner: ["卯", "丑", "亥"],
    outer: ["酉", "未", "巳"],
  },
  震: {
    name: "震",
    symbol: "☳",
    nature: "雷",
    lines: [true, false, false],
    wuxing: "木",
    inner: ["子", "寅", "辰"],
    outer: ["午", "申", "戌"],
  },
  巽: {
    name: "巽",
    symbol: "☴",
    nature: "風",
    lines: [false, true, true],
    wuxing: "木",
    inner: ["丑", "亥", "酉"],
    outer: ["未", "巳", "卯"],
  },
  坎: {
    name: "坎",
    symbol: "☵",
    nature: "水",
    lines: [false, true, false],
    wuxing: "水",
    inner: ["寅", "辰", "午"],
    outer: ["申", "戌", "子"],
  },
  艮: {
    name: "艮",
    symbol: "☶",
    nature: "山",
    lines: [false, false, true],
    wuxing: "土",
    inner: ["辰", "午", "申"],
    outer: ["戌", "子", "寅"],
  },
  坤: {
    name: "坤",
    symbol: "☷",
    nature: "地",
    lines: [false, false, false],
    wuxing: "土",
    inner: ["未", "巳", "卯"],
    outer: ["丑", "亥", "酉"],
  },
};

export function trigramFromLines(lines: [boolean, boolean, boolean]): TrigramName {
  const [b0, b1, b2] = lines;
  for (const trigram of Object.values(TRIGRAMS)) {
    if (trigram.lines[0] === b0 && trigram.lines[1] === b1 && trigram.lines[2] === b2) {
      return trigram.name;
    }
  }
  throw new Error(`未知卦象: ${lines.join(",")}`);
}
