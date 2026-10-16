/**
 * 防截斷：跨請求的連續計數與結算
 */
import type { AntiTruncationDiagnostics } from "@/types/chat";
import { summarizeRestoreStats, type AntiTruncationOptions, type AntiTruncationResult, type RestoreStats } from "./stats";

const WARNING_STREAK = 3;

export const MISSED_WARNING = `連續 ${WARNING_STREAK} 次模型沒有使用防截斷通道，這個渠道或模型可能不支援工具呼叫。`;
export const PLAIN_WON_WARNING = `連續 ${WARNING_STREAK} 次一般正文比防截斷通道完整，這個渠道可能本身就不會截斷，可以考慮關掉防截斷。`;

/** 渠道拒絕帶工具的請求時，不帶防截斷重送一次 */
export const FALLBACK_STATUSES = new Set([400, 404, 422]);

export function fallbackWarning(status: number): string {
  return `防截斷請求被渠道拒絕（HTTP ${status}），這次改用一般方式重送`;
}

export class AntiTruncationMonitor {
  private missStreak = 0;
  private plainWinStreak = 0;

  /** 記錄一次結果；剛好連續達到門檻時回傳警告文字 */
  record(result: AntiTruncationResult): string | null {
    if (result === "missed") {
      this.missStreak += 1;
      return this.missStreak === WARNING_STREAK ? MISSED_WARNING : null;
    }
    this.missStreak = 0;
    if (result === "plain-won") {
      this.plainWinStreak += 1;
      return this.plainWinStreak === WARNING_STREAK ? PLAIN_WON_WARNING : null;
    }
    this.plainWinStreak = 0;
    return null;
  }
}

export const antiTruncationMonitor = new AntiTruncationMonitor();

/** 一次請求結束：算出診斷結果、記進連續計數，需要時提示 */
export function settleAntiTruncation(
  stats: RestoreStats | undefined,
  options: AntiTruncationOptions,
  monitor: AntiTruncationMonitor = antiTruncationMonitor,
): AntiTruncationDiagnostics {
  const result = summarizeRestoreStats(stats);
  const warning = monitor.record(result);
  if (warning) options.onWarning?.(warning);
  return { result };
}
