/**
 * 防截斷：型別與統計歸納
 */
import type { AntiTruncationDiagnostics } from "@/types/chat";

/** 呼叫端傳進 API 客戶端的選項；有傳就代表這次請求要防截斷 */
export interface AntiTruncationOptions {
  /** 連續異常或渠道拒絕時的提示（ChatScreen 接 showToast） */
  onWarning?: (message: string) => void;
}

export type AntiTruncationResult = AntiTruncationDiagnostics["result"];

/** 回應端還原需要的資訊：本次假工具名與角色工具名 */
export interface RestoreContext {
  toolName: string;
  clientToolNames: Set<string>;
}

/** 還原過程的統計 */
export interface RestoreStats {
  /** 看到自己的假工具呼叫 */
  syntheticSeen: boolean;
  /** 一般正文和工具通道都有字 */
  contentConflict: boolean;
  /** 兩邊都有字時一般正文較長、被採用 */
  plainWon: boolean;
  /** 從工具參數解出並送出的字數 */
  decodedChars: number;
}

export function createRestoreStats(): RestoreStats {
  return { syntheticSeen: false, contentConflict: false, plainWon: false, decodedChars: 0 };
}

export function summarizeRestoreStats(stats: RestoreStats | undefined): AntiTruncationResult {
  if (!stats?.syntheticSeen) return "missed";
  if (stats.plainWon) return "plain-won";
  return stats.decodedChars > 0 ? "tool" : "missed";
}

const RESULT_LABELS: Record<AntiTruncationResult, string> = {
  tool: "工具通道",
  "plain-won": "一般正文較長",
  missed: "模型沒用工具",
};

/** 串流視窗診斷列的顯示文字 */
export function describeAntiTruncation(diagnostics: AntiTruncationDiagnostics): { value: string; warning: boolean } {
  if (diagnostics.fellBack) return { value: "渠道不支援，已改一般方式", warning: true };
  return { value: RESULT_LABELS[diagnostics.result], warning: diagnostics.result === "missed" };
}
