/**
 * 《周易》原文＋白話，依卦序 8 卦一檔，用到才載入
 */

export interface ZhouyiLine {
  /** 爻辭原文，含爻題，例如「初九：潛龍勿用。」 */
  text: string;
  /** 小象原文，例如「象曰：潛龍勿用，陽在下也。」 */
  xiang: string;
  /** 白話一兩句 */
  plain: string;
}

export interface ZhouyiText {
  /** 文王卦序 1–64 */
  index: number;
  /** 卦辭原文 */
  guaci: string;
  /** 卦辭白話 */
  guaciPlain: string;
  /** 彖傳原文（含「彖曰：」） */
  tuan: string;
  /** 大象原文（含「象曰：」） */
  xiang: string;
  /** 初爻 → 上爻 */
  lines: ZhouyiLine[];
  /** 乾用九、坤用六 */
  yong?: ZhouyiLine;
}

export type ZhouyiPart = Record<number, ZhouyiText>;

const PARTS: Array<() => Promise<{ default: ZhouyiPart }>> = [
  () => import("./part1"),
  () => import("./part2"),
  () => import("./part3"),
  () => import("./part4"),
  () => import("./part5"),
  () => import("./part6"),
  () => import("./part7"),
  () => import("./part8"),
];

export async function loadZhouyi(index: number): Promise<ZhouyiText | null> {
  const load = PARTS[Math.floor((index - 1) / 8)];
  if (!load) return null;
  const part = (await load()).default;
  return part[index] ?? null;
}
