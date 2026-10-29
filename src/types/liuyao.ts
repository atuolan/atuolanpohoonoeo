// ============================================================
// 六爻排卦型別
// 爻的陣列一律 index 0 = 初爻、index 5 = 上爻
// ============================================================

export type Wuxing = "金" | "木" | "水" | "火" | "土";
export type Tiangan = "甲" | "乙" | "丙" | "丁" | "戊" | "己" | "庚" | "辛" | "壬" | "癸";
export type Dizhi = "子" | "丑" | "寅" | "卯" | "辰" | "巳" | "午" | "未" | "申" | "酉" | "戌" | "亥";
export type TrigramName = "乾" | "兌" | "離" | "震" | "巽" | "坎" | "艮" | "坤";
export type Liuqin = "父母" | "兄弟" | "官鬼" | "妻財" | "子孫";
export type Liushen = "青龍" | "朱雀" | "勾陳" | "螣蛇" | "白虎" | "玄武";

/** 三枚銅錢之和：6 老陰（動）、7 少陽、8 少陰、9 老陽（動） */
export type YaoValue = 6 | 7 | 8 | 9;
/** 一枚銅錢：2＝字（陰）、3＝背（陽） */
export type CoinFace = 2 | 3;

export interface CoinThrow {
  coins: [CoinFace, CoinFace, CoinFace];
  value: YaoValue;
}

export type CastMethod = "auto" | "manual" | "shake" | "input";

export type QuestionCategory =
  | "love"
  | "career"
  | "wealth"
  | "exam"
  | "health"
  | "seek"
  | "travel"
  | "other";

/** 起卦時間的干支資訊 */
export interface GanzhiTime {
  /** 起卦時間 timestamp */
  timestamp: number;
  /** 四柱，各兩字，例如「丙午」 */
  year: string;
  month: string;
  day: string;
  hour: string;
  monthZhi: Dizhi;
  dayGan: Tiangan;
  dayZhi: Dizhi;
  /** 日柱旬空 */
  xunKong: [Dizhi, Dizhi];
  /** 例如「農曆九月二十 未時」 */
  lunarText: string;
}

export type PalaceGeneration = "本宮" | "一世" | "二世" | "三世" | "四世" | "五世" | "遊魂" | "歸魂";

export interface HexagramInfo {
  /** 文王卦序 1–64 */
  index: number;
  /** 卦名，例如「姤」 */
  name: string;
  /** 全名，例如「天風姤」「乾為天」 */
  fullName: string;
  upper: TrigramName;
  lower: TrigramName;
  palace: TrigramName;
  palaceWuxing: Wuxing;
  generation: PalaceGeneration;
  /** 世爻位置 1–6 */
  shi: number;
  /** 應爻位置 1–6 */
  ying: number;
}

export interface NajiaInfo {
  zhi: Dizhi;
  wuxing: Wuxing;
  /** 一律以本卦所屬宮的五行論 */
  liuqin: Liuqin;
}

export interface YaoLine extends NajiaInfo {
  /** 1–6 */
  position: number;
  value: YaoValue;
  yang: boolean;
  moving: boolean;
  liushen: Liushen;
  isShi: boolean;
  isYing: boolean;
  /** 伏神（本卦缺的六親，取自本宮首卦同位爻） */
  fushen?: NajiaInfo;
  /** 變卦同位爻（有變卦時六爻都有，不只動爻） */
  changed?: NajiaInfo & { yang: boolean };
}

export interface LiuyaoChart {
  time: GanzhiTime;
  values: YaoValue[];
  original: HexagramInfo;
  changed: HexagramInfo | null;
  lines: YaoLine[];
}

// ===== 斷卦事實（analysis.ts 算） =====

/** 爻對月建、日辰的關係（可能同時多個，例如合中帶剋） */
export type BranchRel = "臨" | "扶" | "生" | "剋" | "沖" | "合" | "洩" | "耗";
export type LifeStage = "長生" | "帝旺" | "墓" | "絕";
export type ChangeRel =
  | "回頭生"
  | "回頭剋"
  | "比和"
  | "化進"
  | "化退"
  | "化空"
  | "化破"
  | "化墓"
  | "化絕"
  | "化長生"
  | "化帝旺"
  | "化合"
  | "化沖";

export interface YaoFacts {
  position: number;
  month: { rels: BranchRel[]; season: "旺" | "相" | "休囚" };
  day: { rels: BranchRel[]; stage?: LifeStage };
  /** 月令旺相，或得日辰臨／扶／生 */
  strong: boolean;
  /** 被月建沖 */
  monthBreak: boolean;
  /** 靜爻被日沖 */
  staticDayClash?: "暗動" | "日破";
  /** 動爻被日沖 */
  movingDayClash?: "沖散" | "逢日沖";
  /** 落旬空時才有；reasons 是「不為空」的理由，空陣列＝真空 */
  kong?: { reasons: string[]; monthBreakToo: boolean };
  /** 動爻才有 */
  change?: ChangeRel[];
  /** 有伏神才有 */
  fushen?: {
    /** 飛伏關係，例如「飛神生伏」「伏剋飛」 */
    rels: string[];
    helps: string[];
    hinders: string[];
    verdict: "可出" | "難出" | "有助有阻";
  };
}

export type MovingPattern = "安靜" | "獨發" | "獨靜" | "亂動" | "一般";

export interface ChartFacts {
  lines: YaoFacts[];
  movingCount: number;
  movingPattern: MovingPattern;
  liuchong: { original: boolean; changed: boolean };
  liuhe: { original: boolean; changed: boolean };
  /** 卦反吟：內／外卦變成相沖的卦 */
  fanyin: ("內卦" | "外卦")[];
  /** 伏吟：內／外卦乾震互變 */
  fuyin: ("內卦" | "外卦")[];
  /** 湊齊的三合，sources 例如「三爻動」「四爻變」「日辰」「月建」 */
  sanhe: { ju: string; zhi: Dizhi[]; sources: string[] }[];
  /** 世應之間的關係，例如「應生世」「世應相沖」 */
  shiYing: string[];
}

/** 傳進聊天的卦象卡片 */
export interface LiuyaoShareSnapshot {
  readingId: string;
  question: string;
  category: QuestionCategory | null;
  values: YaoValue[];
  castTime: number;
  /** 例如「天風姤」 */
  originalName: string;
  changedName?: string;
  /** 動爻位置 1–6 */
  movingPositions: number[];
  readerCharacterId?: string;
  readerName?: string;
  /** 解讀摘要（前段） */
  excerpt?: string;
}

/** 存檔用：卦盤由 values＋castTime 重算 */
export interface LiuyaoReading {
  id: string;
  question: string;
  category: QuestionCategory | null;
  method: CastMethod;
  values: YaoValue[];
  castTime: number;
  readerCharacterId?: string;
  readerName?: string;
  interpretation: string;
  createdAt: number;
}
