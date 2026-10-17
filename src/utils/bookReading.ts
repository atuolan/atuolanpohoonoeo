/**
 * 閱讀位置換算（純函式）
 * 進度以「章內字元位置」保存，換字級、換螢幕後仍能翻回同一段
 */

import type { BookChapter, BookMeta, StoredBook } from "@/types/book";

export interface ParagraphSpan {
  /** 在章節 content 中的起始字元位置 */
  start: number;
  /** 段落文字長度 */
  length: number;
  text: string;
}

/** 依換行切段，略過空白行，保留每段在原文中的位置 */
export function splitParagraphs(content: string): ParagraphSpan[] {
  const spans: ParagraphSpan[] = [];
  let cursor = 0;
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (trimmed) {
      spans.push({ start: cursor + line.indexOf(trimmed), length: trimmed.length, text: trimmed });
    }
    cursor += line.length + 1;
  }
  return spans;
}

/** 全書百分比（0–100，四捨五入） */
export function bookPercent(chapters: BookChapter[], chapterIndex: number, charOffset: number): number {
  return bookPercentFromLengths(
    chapters.map((c) => c.content.length),
    chapterIndex,
    charOffset,
  );
}

/** 只有各章字數時的全書百分比 */
export function bookPercentFromLengths(
  lengths: number[],
  chapterIndex: number,
  charOffset: number,
): number {
  let total = 0;
  let before = 0;
  lengths.forEach((len, i) => {
    total += len;
    if (i < chapterIndex) before += len;
  });
  if (total === 0) return 0;
  const current = lengths[chapterIndex] ?? 0;
  const read = before + Math.min(Math.max(charOffset, 0), current);
  return Math.min(100, Math.max(0, Math.round((read / total) * 100)));
}

// ===== 閱讀時數 =====

/** 本地日期 YYYY-MM-DD */
export function dateKey(ts: number): string {
  const d = new Date(ts);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

function shiftDay(key: string, delta: number): string {
  const [y, m, d] = key.split("-").map(Number);
  return dateKey(new Date(y, m - 1, d + delta).getTime());
}

/** 把多本書的每日秒數加總 */
export function mergeDailySeconds(
  records: Array<Record<string, number> | undefined>,
): Record<string, number> {
  const total: Record<string, number> = {};
  for (const rec of records) {
    for (const [day, secs] of Object.entries(rec ?? {})) total[day] = (total[day] ?? 0) + secs;
  }
  return total;
}

/**
 * 連讀天數：從今天往回數，每天至少讀 minSeconds 秒；
 * 今天還沒讀夠時從昨天開始數（今天還有機會，不算斷）
 */
export function readingStreak(
  daily: Record<string, number>,
  today: string,
  minSeconds = 60,
): number {
  let day = (daily[today] ?? 0) >= minSeconds ? today : shiftDay(today, -1);
  let streak = 0;
  while ((daily[day] ?? 0) >= minSeconds) {
    streak++;
    day = shiftDay(day, -1);
  }
  return streak;
}

/** 加上某天的秒數，順便丟掉一年多以前的紀錄 */
export function addDailySeconds(
  daily: Record<string, number> | undefined,
  day: string,
  seconds: number,
): Record<string, number> {
  const oldest = shiftDay(day, -400);
  const next: Record<string, number> = {};
  for (const [k, v] of Object.entries(daily ?? {})) if (k >= oldest) next[k] = v;
  next[day] = (next[day] ?? 0) + seconds;
  return next;
}

export function toBookMeta(book: StoredBook): BookMeta {
  return {
    id: book.id,
    title: book.title,
    author: book.author,
    cover: book.cover,
    format: book.format,
    chapterTitles: book.chapters.map((c) => c.title),
    chapterLengths: book.chapters.map((c) => c.content.length),
    totalChars: book.totalChars,
    createdAt: book.createdAt,
    updatedAt: book.updatedAt,
  };
}

/** 本章剩餘閱讀分鐘數（中文約每分鐘 400 字） */
export function remainingMinutes(chapterLength: number, charOffset: number, charsPerMinute = 400): number {
  return Math.ceil(Math.max(chapterLength - charOffset, 0) / charsPerMinute);
}

/** 量測回呼：第 i 段的開頭／結尾落在第幾頁 */
export interface PageProbe {
  startPage(i: number): number;
  endPage(i: number): number;
}

/** 第一個開頭頁 >= page 的段落；都沒有則回傳 paras.length */
function firstStartingAtOrAfter(count: number, page: number, probe: PageProbe): number {
  let lo = 0;
  let hi = count;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (probe.startPage(mid) >= page) hi = mid;
    else lo = mid + 1;
  }
  return lo;
}

/** 某一頁頂端對應的章內字元位置 */
export function offsetForPage(paras: ParagraphSpan[], page: number, probe: PageProbe): number {
  if (paras.length === 0) return 0;
  const j = firstStartingAtOrAfter(paras.length, page, probe);
  const prev = j - 1;
  if (prev >= 0 && probe.endPage(prev) >= page) {
    // 這一頁從上一段的中間開始：按頁數比例估算位置
    const p = paras[prev];
    const s = probe.startPage(prev);
    const span = probe.endPage(prev) - s + 1;
    const into = Math.ceil(((page - s) / span) * p.length);
    return p.start + Math.min(into, Math.max(p.length - 1, 0));
  }
  return j < paras.length ? paras[j].start : paras[paras.length - 1].start;
}

/** 某個章內字元位置所在的頁 */
export function pageForOffset(paras: ParagraphSpan[], offset: number, probe: PageProbe): number {
  if (paras.length === 0) return 0;
  // 最後一個 start <= offset 的段落
  let lo = 0;
  let hi = paras.length - 1;
  if (offset < paras[0].start) return probe.startPage(0);
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (paras[mid].start <= offset) lo = mid;
    else hi = mid - 1;
  }
  const p = paras[lo];
  const s = probe.startPage(lo);
  const e = probe.endPage(lo);
  if (e <= s || p.length === 0) return s;
  const frac = Math.min((offset - p.start) / p.length, 1);
  return Math.min(s + Math.floor(frac * (e - s + 1)), e);
}
