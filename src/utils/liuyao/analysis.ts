/**
 * 斷卦事實：查表就能確定的生剋沖合、旺衰、空破、動變、伏神出不出
 * 規則依《增刪卜易》；算好直接交給 AI，不讓它自己算地支
 */
import { DIZHI_WUXING } from "@/data/liuyao/trigrams";
import type {
  BranchRel,
  ChangeRel,
  ChartFacts,
  Dizhi,
  LifeStage,
  LiuyaoChart,
  MovingPattern,
  TrigramName,
  Wuxing,
  YaoFacts,
  YaoLine,
} from "@/types/liuyao";

const POS = ["初爻", "二爻", "三爻", "四爻", "五爻", "上爻"];

/** a 生 b */
const GENERATES: Record<Wuxing, Wuxing> = { 木: "火", 火: "土", 土: "金", 金: "水", 水: "木" };
/** a 剋 b */
const OVERCOMES: Record<Wuxing, Wuxing> = { 木: "土", 土: "水", 水: "火", 火: "金", 金: "木" };

const CLASH_PAIRS = ["子午", "丑未", "寅申", "卯酉", "辰戌", "巳亥"];
const HE_PAIRS = ["子丑", "寅亥", "卯戌", "辰酉", "巳申", "午未"];

const SANHE: { ju: string; zhi: Dizhi[] }[] = [
  { ju: "水局", zhi: ["申", "子", "辰"] },
  { ju: "木局", zhi: ["亥", "卯", "未"] },
  { ju: "火局", zhi: ["寅", "午", "戌"] },
  { ju: "金局", zhi: ["巳", "酉", "丑"] },
];

/** 長生、帝旺、墓、絕（土隨水） */
const STAGES: Record<Wuxing, [Dizhi, Dizhi, Dizhi, Dizhi]> = {
  木: ["亥", "卯", "未", "申"],
  火: ["寅", "午", "戌", "亥"],
  金: ["巳", "酉", "丑", "寅"],
  水: ["申", "子", "辰", "巳"],
  土: ["申", "子", "辰", "巳"],
};
const STAGE_NAMES: LifeStage[] = ["長生", "帝旺", "墓", "絕"];

const ADVANCE: Partial<Record<Dizhi, Dizhi>> = {
  亥: "子",
  寅: "卯",
  巳: "午",
  申: "酉",
  丑: "辰",
  辰: "未",
  未: "戌",
  戌: "丑",
};

/** 卦反吟：互變的兩卦相沖 */
const FANYIN_PAIRS = ["乾巽", "坤艮", "坎離", "震兌"];

const wx = (z: Dizhi) => DIZHI_WUXING[z];

function pairIn(pairs: string[], a: string, b: string): boolean {
  return pairs.includes(a + b) || pairs.includes(b + a);
}

export const isClash = (a: Dizhi, b: Dizhi) => pairIn(CLASH_PAIRS, a, b);
export const isHe = (a: Dizhi, b: Dizhi) => pairIn(HE_PAIRS, a, b);

/** 五行關係：以 ref 看 yao */
function wuxingRel(yao: Wuxing, ref: Wuxing): BranchRel {
  if (yao === ref) return "扶";
  if (GENERATES[ref] === yao) return "生";
  if (OVERCOMES[ref] === yao) return "剋";
  if (GENERATES[yao] === ref) return "洩";
  return "耗";
}

export function branchRels(yao: Dizhi, ref: Dizhi): BranchRel[] {
  if (yao === ref) return ["臨"];
  const rels: BranchRel[] = [wuxingRel(wx(yao), wx(ref))];
  if (isClash(yao, ref)) rels.push("沖");
  if (isHe(yao, ref)) rels.push("合");
  return rels;
}

export function lifeStage(w: Wuxing, zhi: Dizhi): LifeStage | undefined {
  const i = STAGES[w].indexOf(zhi);
  return i < 0 ? undefined : STAGE_NAMES[i];
}

function season(w: Wuxing, monthZhi: Dizhi): "旺" | "相" | "休囚" {
  const m = wx(monthZhi);
  if (w === m) return "旺";
  if (GENERATES[m] === w) return "相";
  return "休囚";
}

const supports = (rels: BranchRel[]) => rels.some((r) => r === "臨" || r === "扶" || r === "生");

function changeRels(a: Dizhi, b: Dizhi, xunKong: Dizhi[], monthZhi: Dizhi): ChangeRel[] {
  if (a === b) return ["比和"];
  const out: ChangeRel[] = [];
  const wa = wx(a);
  const wb = wx(b);
  if (GENERATES[wb] === wa) out.push("回頭生");
  else if (OVERCOMES[wb] === wa) out.push("回頭剋");
  else if (wa === wb) out.push("比和");
  if (ADVANCE[a] === b) out.push("化進");
  else if (ADVANCE[b] === a) out.push("化退");
  if (xunKong.includes(b)) out.push("化空");
  if (isClash(b, monthZhi)) out.push("化破");
  const stage = lifeStage(wa, b);
  if (stage) out.push(`化${stage}` as ChangeRel);
  if (isHe(a, b)) out.push("化合");
  if (isClash(a, b)) out.push("化沖");
  return out;
}

interface BaseFacts {
  f: YaoFacts;
  monthOk: boolean;
}

function baseFacts(line: YaoLine, chart: LiuyaoChart): BaseFacts {
  const { monthZhi, dayZhi, xunKong } = chart.time;
  const monthRels = branchRels(line.zhi, monthZhi);
  const dayRels = branchRels(line.zhi, dayZhi);
  const s = season(line.wuxing, monthZhi);
  const monthBreak = isClash(line.zhi, monthZhi);
  const monthOk = s !== "休囚" && !monthBreak;
  const f: YaoFacts = {
    position: line.position,
    month: { rels: monthRels, season: s },
    day: { rels: dayRels, stage: lifeStage(line.wuxing, dayZhi) },
    strong: monthOk || supports(dayRels),
    monthBreak,
  };
  if (dayRels.includes("沖")) {
    if (line.moving) f.movingDayClash = monthOk ? "逢日沖" : "沖散";
    else f.staticDayClash = monthOk ? "暗動" : "日破";
  }
  if (line.moving && line.changed) {
    f.change = changeRels(line.zhi, line.changed.zhi, xunKong, monthZhi);
  }
  return { f, monthOk };
}

function kongFacts(line: YaoLine, f: YaoFacts, chart: LiuyaoChart): YaoFacts["kong"] {
  if (!chart.time.xunKong.includes(line.zhi)) return undefined;
  const reasons: string[] = [];
  if (f.strong) reasons.push("旺相不為空");
  if (line.moving) reasons.push("動不為空");
  if (f.day.rels.includes("沖")) reasons.push("日沖為沖空（實）");
  if (f.day.rels.includes("生") || f.day.rels.includes("扶")) reasons.push("日辰生扶不為空");
  const movingHelp = chart.lines.some(
    (o) => o.moving && o.position !== line.position && (GENERATES[o.wuxing] === line.wuxing || o.wuxing === line.wuxing),
  );
  if (movingHelp) reasons.push("動爻生扶不為空");
  return { reasons, monthBreakToo: f.monthBreak };
}

function fushenFacts(line: YaoLine, fly: YaoFacts, chart: LiuyaoChart): YaoFacts["fushen"] {
  const fu = line.fushen;
  if (!fu) return undefined;
  const { monthZhi, dayZhi, xunKong } = chart.time;
  const flyWx = line.wuxing;

  const rels: string[] = [];
  if (GENERATES[flyWx] === fu.wuxing) rels.push("飛神生伏");
  else if (OVERCOMES[flyWx] === fu.wuxing) rels.push("飛神剋伏");
  else if (GENERATES[fu.wuxing] === flyWx) rels.push("伏生飛");
  else if (OVERCOMES[fu.wuxing] === flyWx) rels.push("伏剋飛");
  else rels.push("飛伏比和");

  const fuSeason = season(fu.wuxing, monthZhi);
  const fuMonth = branchRels(fu.zhi, monthZhi);
  const fuDay = branchRels(fu.zhi, dayZhi);
  const moving = chart.lines.filter((o) => o.moving);

  const helps = new Set<string>();
  if (fuMonth.includes("臨")) helps.add("臨月建");
  else if (fuMonth.includes("生") || fuMonth.includes("扶")) helps.add("得月建生扶");
  if (fuDay.includes("臨")) helps.add("臨日辰");
  else if (fuDay.includes("生") || fuDay.includes("扶")) helps.add("得日辰生扶");
  if (fuSeason !== "休囚") helps.add("伏神旺相");
  if (rels[0] === "飛神生伏") helps.add("飛神生伏");
  if (moving.some((o) => GENERATES[o.wuxing] === fu.wuxing)) helps.add("動爻生伏");
  const flyMonth = fly.month.rels;
  const flyDay = fly.day.rels;
  if (flyMonth.includes("沖")) helps.add("月建沖飛神");
  if (flyMonth.includes("剋")) helps.add("月建剋飛神");
  if (flyDay.includes("沖")) helps.add("日辰沖飛神");
  if (flyDay.includes("剋")) helps.add("日辰剋飛神");
  for (const o of moving) {
    if (o.position === line.position) continue;
    if (isClash(o.zhi, line.zhi)) helps.add("動爻沖飛神");
    if (OVERCOMES[o.wuxing] === flyWx) helps.add("動爻剋飛神");
  }
  if (xunKong.includes(line.zhi)) helps.add("飛神旬空");
  if (fly.monthBreak) helps.add("飛神月破");
  if (fly.month.season === "休囚") helps.add("飛神休囚");
  if (fly.day.stage === "墓") helps.add("飛神墓於日");
  if (fly.day.stage === "絕") helps.add("飛神絕於日");

  const hinders = new Set<string>();
  if (fuSeason === "休囚" && !supports(fuDay)) hinders.add("伏神休囚無氣");
  if (fuMonth.includes("沖") || fuMonth.includes("剋")) hinders.add("被月建沖剋");
  if (fuDay.includes("沖") || fuDay.includes("剋")) hinders.add("被日辰沖剋");
  if (rels[0] === "飛神剋伏" && fly.strong) hinders.add("被旺相飛神剋");
  const graveOrCut = (z: Dizhi) => {
    const st = lifeStage(fu.wuxing, z);
    return st === "墓" || st === "絕";
  };
  if (graveOrCut(dayZhi)) hinders.add("伏神墓絕於日");
  if (graveOrCut(monthZhi)) hinders.add("伏神墓絕於月");
  if (graveOrCut(line.zhi)) hinders.add("伏神墓絕於飛神");
  if (fuSeason === "休囚" && (xunKong.includes(fu.zhi) || isClash(fu.zhi, monthZhi))) hinders.add("伏神休囚又逢空破");

  const h = [...helps];
  const x = [...hinders];
  const verdict = h.length === 0 ? "難出" : x.length === 0 ? "可出" : "有助有阻";
  return { rels, helps: h, hinders: x, verdict };
}

function movingPattern(n: number): MovingPattern {
  if (n === 0) return "安靜";
  if (n === 1) return "獨發";
  if (n === 5) return "獨靜";
  if (n === 6) return "亂動";
  return "一般";
}

function allPairs(zhi: Dizhi[], test: (a: Dizhi, b: Dizhi) => boolean): boolean {
  return [0, 1, 2].every((i) => test(zhi[i], zhi[i + 3]));
}

function trigramChanges(chart: LiuyaoChart): { side: "內卦" | "外卦"; from: TrigramName; to: TrigramName }[] {
  if (!chart.changed) return [];
  const out: { side: "內卦" | "外卦"; from: TrigramName; to: TrigramName }[] = [];
  const innerMoving = chart.lines.slice(0, 3).some((l) => l.moving);
  const outerMoving = chart.lines.slice(3).some((l) => l.moving);
  if (innerMoving) out.push({ side: "內卦", from: chart.original.lower, to: chart.changed.lower });
  if (outerMoving) out.push({ side: "外卦", from: chart.original.upper, to: chart.changed.upper });
  return out;
}

function sanheFacts(chart: LiuyaoChart): ChartFacts["sanhe"] {
  const { monthZhi, dayZhi } = chart.time;
  const moving = chart.lines.filter((l) => l.moving);
  const out: ChartFacts["sanhe"] = [];
  for (const { ju, zhi } of SANHE) {
    const perZhi = zhi.map((z) => {
      const src: string[] = [];
      for (const l of moving) if (l.zhi === z) src.push(`${POS[l.position - 1]}動`);
      for (const l of moving) if (l.changed?.zhi === z) src.push(`${POS[l.position - 1]}變`);
      if (dayZhi === z) src.push("日辰");
      if (monthZhi === z) src.push("月建");
      return src;
    });
    if (perZhi.some((s) => s.length === 0)) continue;
    const sources = [...new Set(perZhi.flat())];
    if (!sources.some((s) => s.endsWith("動"))) continue;
    out.push({ ju, zhi: [...zhi], sources });
  }
  return out;
}

function shiYingFacts(chart: LiuyaoChart, lines: YaoFacts[]): string[] {
  const shi = chart.lines[chart.original.shi - 1];
  const ying = chart.lines[chart.original.ying - 1];
  const out: string[] = [];
  const s = shi.wuxing;
  const y = ying.wuxing;
  if (GENERATES[y] === s) out.push("應生世");
  else if (GENERATES[s] === y) out.push("世生應");
  else if (OVERCOMES[y] === s) out.push("應剋世");
  else if (OVERCOMES[s] === y) out.push("世剋應");
  else out.push("世應比和");
  if (isClash(shi.zhi, ying.zhi)) out.push("世應相沖");
  if (isHe(shi.zhi, ying.zhi)) out.push("世應相合");
  const { xunKong } = chart.time;
  if (xunKong.includes(shi.zhi)) out.push("世爻旬空");
  if (xunKong.includes(ying.zhi)) out.push("應爻旬空");
  if (lines[shi.position - 1].monthBreak) out.push("世爻月破");
  if (lines[ying.position - 1].monthBreak) out.push("應爻月破");
  return out;
}

export function analyzeChart(chart: LiuyaoChart): ChartFacts {
  const lines = chart.lines.map((line) => {
    const { f } = baseFacts(line, chart);
    const kong = kongFacts(line, f, chart);
    if (kong) f.kong = kong;
    const fushen = fushenFacts(line, f, chart);
    if (fushen) f.fushen = fushen;
    return f;
  });

  const movingCount = chart.lines.filter((l) => l.moving).length;
  const origZhi = chart.lines.map((l) => l.zhi);
  const changedZhi = chart.changed ? chart.lines.map((l) => l.changed!.zhi) : null;

  const changes = trigramChanges(chart);
  const fanyin = changes.filter((c) => pairIn(FANYIN_PAIRS, c.from, c.to)).map((c) => c.side);
  const fuyin = changes
    .filter((c) => (c.from === "乾" && c.to === "震") || (c.from === "震" && c.to === "乾"))
    .map((c) => c.side);

  return {
    lines,
    movingCount,
    movingPattern: movingPattern(movingCount),
    liuchong: {
      original: allPairs(origZhi, isClash),
      changed: changedZhi ? allPairs(changedZhi, isClash) : false,
    },
    liuhe: {
      original: allPairs(origZhi, isHe),
      changed: changedZhi ? allPairs(changedZhi, isHe) : false,
    },
    fanyin,
    fuyin,
    sanhe: sanheFacts(chart),
    shiYing: shiYingFacts(chart, lines),
  };
}
