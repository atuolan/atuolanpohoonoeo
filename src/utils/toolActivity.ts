import type { ToolResult } from "@/services/toolCalling/types";
import type { LiveToolActivity, ToolActivityRecord } from "@/types/toolActivity";

const SUMMARY_LIMIT = 200;

export function summarizeToolResult(result: ToolResult): Pick<ToolActivityRecord, "status" | "summary" | "imageCount"> {
  const status = result.rejected ? "rejected" : result.ok ? "success" : "error";
  const text = (result.ok ? result.content : result.error ?? result.content).trim();
  return {
    status,
    ...(text ? { summary: text.slice(0, SUMMARY_LIMIT) } : {}),
    ...(result.images?.length ? { imageCount: result.images.length } : {}),
  };
}

export function upsertLiveActivity(entries: LiveToolActivity[], entry: LiveToolActivity): LiveToolActivity[] {
  const index = entries.findIndex((item) => item.id === entry.id);
  if (index === -1) return [...entries, entry];
  const next = [...entries];
  next[index] = { ...next[index], ...entry };
  return next;
}

/** 這一輪結束：還在跑或等確認的視為取消，轉成可存檔的紀錄 */
export function finalizeLiveActivity(entries: LiveToolActivity[]): ToolActivityRecord[] {
  return entries.map((entry) => ({
    ...entry,
    status: entry.status === "running" || entry.status === "awaiting_confirmation" ? "cancelled" : entry.status,
  }));
}
