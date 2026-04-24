/**
 * usePeerApplyGate
 *
 * 全域單例 gate：當 PeerSyncResponder 收到 peer:apply-request 時，
 * 呼叫 requestApproval() 暫停執行並等待使用者確認。
 * UI 層監聽 pendingApply，顯示確認 dialog，點擊後呼叫 approve() / reject()。
 */

import { ref, readonly } from "vue";
import type { SelfHostedSyncEntityType } from "@/types/selfHostedSync";

export interface PeerApplySummaryEntry {
  entityType: SelfHostedSyncEntityType | string;
  count: number;
}

export interface PeerApplyRequest {
  requestId: string;
  sourceDeviceId: string;
  totalEnvelopes: number;
  summary: PeerApplySummaryEntry[];
  /** 呼叫端解析出的顯示名稱（customName > model > shortId） */
  sourceDisplayName: string;
  /** Unix ms，請求到達時間，用來顯示倒數 */
  receivedAt: number;
  /** 發送方 timeout 是 60s，我們給使用者 55s，快到時顯示警告 */
  expiresAt: number;
}

type GateResolve = (accepted: boolean) => void;

const _pending = ref<PeerApplyRequest | null>(null);
let _resolve: GateResolve | null = null;

/** 由 PeerSyncResponder 呼叫：暫停執行，等待使用者確認。回傳 true = 接受，false = 拒絕 */
export async function requestPeerApplyApproval(
  request: Omit<PeerApplyRequest, "receivedAt" | "expiresAt">,
): Promise<boolean> {
  // 如果已有待處理的請求，自動拒絕舊的
  if (_resolve) {
    _resolve(false);
  }

  const receivedAt = Date.now();
  const expiresAt = receivedAt + 55_000; // 55s 給用戶決定（sender 會再等剩餘的傳輸時間）

  _pending.value = { ...request, receivedAt, expiresAt };

  return new Promise<boolean>((resolve) => {
    _resolve = resolve;
  });
}

/** 使用者點擊「接受」 */
export function approvePeerApply(): void {
  if (!_resolve) return;
  const r = _resolve;
  _resolve = null;
  _pending.value = null;
  r(true);
}

/** 使用者點擊「拒絕」或 dialog 關閉 */
export function rejectPeerApply(): void {
  if (!_resolve) return;
  const r = _resolve;
  _resolve = null;
  _pending.value = null;
  r(false);
}

/** 供 UI 監聽的唯讀 ref */
export const pendingPeerApply = readonly(_pending);

// ===== Entity type 中文標籤 =====

const ENTITY_TYPE_LABELS: Record<string, string> = {
  chat_record: "對話記錄",
  chat_message: "對話訊息",
  settings_preferences: "偏好設定",
  settings_profiles: "API 設定檔",
  settings_full: "完整設定",
  qzone_post: "Q區貼文",
  qzone_settings: "Q區設定",
  character: "角色",
  lorebook: "世界書",
  prompt_library_item: "Prompt 庫",
  sticker_category: "貼圖",
  user_data: "用戶資料",
  conversation_summary: "對話摘要",
  important_events_log: "重要事件",
  diary_entry: "日記",
  idb_store_snapshot: "資料快照",
};

export function formatEntityTypeLabel(type: string): string {
  return ENTITY_TYPE_LABELS[type] ?? type;
}
