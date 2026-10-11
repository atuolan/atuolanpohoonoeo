/**
 * 決定哪些對話總結要送給 AI。
 * 聊天、主動訊息、電話、雲端推播都走這裡，規則才會一致：
 * - 已被合併進元總結的不送（內容已包含在元總結裡）
 * - 釘選（isImportant）的一定送，不受讀取數量限制
 * - 其餘依「涵蓋到的時間」取最新 N 條
 */

export interface SelectableSummary {
  id: string;
  createdAt: number;
  isImportant?: boolean;
  /** 已被合併進哪一條元總結 */
  mergedInto?: string;
  coveredUntil?: number;
}

/** 總結在劇情時間軸上的位置：涵蓋到的最後一則訊息時間，舊資料退回建立時間 */
export function summaryTimelineKey(s: Pick<SelectableSummary, "createdAt" | "coveredUntil">): number {
  return s.coveredUntil ?? s.createdAt ?? 0;
}

/** 未被合併、仍會被 AI 讀到的總結 */
export function isActiveSummary(s: Pick<SelectableSummary, "mergedInto">): boolean {
  return !s.mergedInto;
}

/**
 * 挑出要送給 AI 的總結，回傳依時間軸由舊到新排列。
 * @param readCount 「最近 N 條」的 N；傳 Infinity 代表全部
 */
export function selectSummariesForPrompt<T extends SelectableSummary>(
  summaries: readonly T[],
  readCount: number,
): T[] {
  const active = summaries
    .filter(isActiveSummary)
    .sort((a, b) => summaryTimelineKey(b) - summaryTimelineKey(a));
  const picked = new Set(active.slice(0, Math.max(0, readCount)));
  for (const s of active) {
    if (s.isImportant) picked.add(s);
  }
  return active.filter((s) => picked.has(s)).reverse();
}

/** 依聊天的總結讀取設定換算讀取數量 */
export function resolveSummaryReadCount(
  settings: { summaryReadMode?: "all" | "recent"; summaryReadCount?: number } | undefined,
  fallback = 5,
): number {
  if (settings?.summaryReadMode === "all") return Infinity;
  return settings?.summaryReadCount ?? fallback;
}
