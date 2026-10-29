/**
 * 六爻卦象卡片：傳進聊天的快照、畫面摘要、寫給角色看的說明
 */
import { trigramFromLines } from "@/data/liuyao/trigrams";
import type { LiuyaoChart, LiuyaoReading, LiuyaoShareSnapshot, YaoValue } from "@/types/liuyao";
import { findHexagram } from "./paipan";
import { CATEGORY_LABEL, POSITION_NAME } from "./prompt";

const EXCERPT_LEN = 300;

function clip(s: string, n: number): string {
  const t = s.trim();
  return t.length > n ? `${t.slice(0, n)}…` : t;
}

/** 去掉 markdown 標記，留純文字摘要 */
function plainExcerpt(md: string): string {
  return md
    .replace(/[#*_>`]/g, "")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

export function buildLiuyaoShareSnapshot(reading: LiuyaoReading, chart: LiuyaoChart): LiuyaoShareSnapshot {
  const snap: LiuyaoShareSnapshot = {
    readingId: reading.id,
    question: reading.question,
    category: reading.category,
    values: [...reading.values],
    castTime: reading.castTime,
    originalName: chart.original.fullName,
    movingPositions: chart.lines.filter((l) => l.moving).map((l) => l.position),
  };
  if (chart.changed) snap.changedName = chart.changed.fullName;
  if (reading.readerCharacterId) snap.readerCharacterId = reading.readerCharacterId;
  if (reading.readerName) snap.readerName = reading.readerName;
  if (reading.interpretation) snap.excerpt = clip(plainExcerpt(reading.interpretation), EXCERPT_LEN);
  return snap;
}

function movingText(s: LiuyaoShareSnapshot): string {
  if (s.movingPositions.length === 0) return "六爻安靜";
  return `${s.movingPositions.map((p) => POSITION_NAME[p - 1]).join("、")}動`;
}

function hexText(s: LiuyaoShareSnapshot): string {
  return s.changedName ? `${s.originalName} → ${s.changedName}` : s.originalName;
}

/** 不用起卦時間就能算的卦名摘要，例如「天風姤 → 巽為風（四爻動）」（紀錄列表用） */
export function liuyaoValuesSummary(values: YaoValue[]): string {
  const yang = values.map((v) => v === 7 || v === 9);
  const changedYang = values.map((v, i) => (v === 6 || v === 9 ? !yang[i] : yang[i]));
  const hex = (ls: boolean[]) =>
    findHexagram(trigramFromLines([ls[0], ls[1], ls[2]]), trigramFromLines([ls[3], ls[4], ls[5]])).fullName;
  const moving = values.map((v, i) => (v === 6 || v === 9 ? i + 1 : 0)).filter((p) => p > 0);
  if (moving.length === 0) return `${hex(yang)}（六爻安靜）`;
  return `${hex(yang)} → ${hex(changedYang)}（${moving.map((p) => POSITION_NAME[p - 1]).join("、")}動）`;
}

/** 聊天列表、轉發用的一行摘要 */
export function liuyaoShareSummary(s: LiuyaoShareSnapshot): string {
  return `[六爻] ${hexText(s)}${s.question ? `｜${clip(s.question, 20)}` : ""}`;
}

function formatDate(ts: number): string {
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

/** 寫給提示詞看的說明 */
export function describeLiuyaoShareForPrompt(
  s: LiuyaoShareSnapshot,
  names: { userName: string; charId?: string },
): string {
  const parts = [
    `[${names.userName} 傳來一張六爻卦象卡片：${formatDate(s.castTime)} 起卦`,
    s.question ? `問「${s.question}」` : "",
    s.category ? `（${CATEGORY_LABEL[s.category]}）` : "",
    `，得 ${hexText(s)}（${movingText(s)}）。`,
  ];
  let text = parts.join("");
  if (s.excerpt) {
    const isYou = !!names.charId && s.readerCharacterId === names.charId;
    const who = isYou ? `這卦是你替 ${names.userName} 解的，你當時的解讀摘要` : `${s.readerName || "占卜師"}的解讀摘要`;
    text += `${who}：${s.excerpt}`;
  }
  return `${text}]`;
}
