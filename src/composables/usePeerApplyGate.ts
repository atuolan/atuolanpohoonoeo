/**
 * usePeerApplyGate
 *
 * 全域單例 gate：當 PeerSyncResponder 收到 peer:apply-request 時，
 * 呼叫 requestApproval() 暫停執行並等待使用者確認。
 * UI 層監聽 pendingApply，顯示確認 dialog，點擊後呼叫 approve() / reject()。
 */

import { ref, readonly } from "vue";
import type { SelfHostedSyncEntityType } from "@/types/selfHostedSync";

const PEER_APPROVAL_TIMEOUT_MS = 295_000;

export type PeerApprovalOperation = "push" | "pull";

export interface PeerApplySummaryEntry {
  entityType: SelfHostedSyncEntityType | string;
  count: number;
}

export interface PeerApplyRequest {
  requestId: string;
  sourceDeviceId: string;
  operation: PeerApprovalOperation;
  totalEnvelopes: number;
  summary: PeerApplySummaryEntry[];
  /** 呼叫端解析出的顯示名稱（customName > model > shortId） */
  sourceDisplayName: string;
  /** Unix ms，請求到達時間，用來顯示倒數 */
  receivedAt: number;
  /** 發送方 timeout 接近 5 分鐘，我們預留 5 秒緩衝給使用者操作 */
  expiresAt: number;
}

type GateResolve = (accepted: boolean) => void;

const _pending = ref<PeerApplyRequest | null>(null);
let _resolve: GateResolve | null = null;

/** 已通過確認的 sender session：deviceId -> expiresAt（ms） */
const _trustedSenders = new Map<string, number>();
const TRUST_SESSION_MS = 10 * 60 * 1000; // 10 分鐘
/** 已被拒絕的 sender session（本次拒絕後自動拒絕同一 sender 的後續批次） */
const _rejectedSenders = new Set<string>();

function log(...args: unknown[]): void {
  console.log("[usePeerApplyGate]", ...args);
}

function sessionKey(sourceDeviceId: string, operation: PeerApprovalOperation): string {
  return `${sourceDeviceId}::${operation}`;
}

/** 清除 sender 的信任/拒絕狀態（下次需重新確認） */
export function clearPeerSenderSession(sourceDeviceId: string): void {
  _trustedSenders.delete(sessionKey(sourceDeviceId, "push"));
  _trustedSenders.delete(sessionKey(sourceDeviceId, "pull"));
  _rejectedSenders.delete(sessionKey(sourceDeviceId, "push"));
  _rejectedSenders.delete(sessionKey(sourceDeviceId, "pull"));
}

/** 由 PeerSyncResponder 呼叫：暫停執行，等待使用者確認。回傳 true = 接受，false = 拒絕 */
export async function requestPeerApplyApproval(
  request: Omit<PeerApplyRequest, "receivedAt" | "expiresAt">,
): Promise<boolean> {
  const { sourceDeviceId, operation } = request;
  const key = sessionKey(sourceDeviceId, operation);
  log("收到同意請求", {
    requestId: request.requestId,
    sourceDeviceId,
    operation,
    totalEnvelopes: request.totalEnvelopes,
  });

  // 已拒絕的 sender → 自動拒絕後續批次
  if (_rejectedSenders.has(key)) {
    log("自動拒絕已被拒過的請求", {
      requestId: request.requestId,
      sourceDeviceId,
      operation,
    });
    return false;
  }

  // 已信任的 sender（還在 session 內）→ 自動放行
  const trustedUntil = _trustedSenders.get(key);
  if (trustedUntil && trustedUntil > Date.now()) {
    log("自動放行已信任請求", {
      requestId: request.requestId,
      sourceDeviceId,
      operation,
      trustedForMs: trustedUntil - Date.now(),
    });
    return true;
  }
  _trustedSenders.delete(key);

  // 如果已有 dialog 在等另一個 sender 的決定，先拒絕舊的
  if (_resolve) {
    log("已有待決 dialog，先拒絕上一個請求");
    _resolve(false);
  }

  const receivedAt = Date.now();
  const expiresAt = receivedAt + PEER_APPROVAL_TIMEOUT_MS;

  _pending.value = { ...request, receivedAt, expiresAt };
  log("顯示同意 dialog", {
    requestId: request.requestId,
    sourceDeviceId,
    operation,
    expiresInMs: expiresAt - receivedAt,
  });

  return new Promise<boolean>((resolve) => {
    _resolve = resolve;
  });
}

/** 使用者點擊「接受」 */
export function approvePeerApply(): void {
  if (!_resolve || !_pending.value) return;
  const { sourceDeviceId, operation } = _pending.value;
  const key = sessionKey(sourceDeviceId, operation);
  log("使用者接受請求", {
    requestId: _pending.value.requestId,
    sourceDeviceId,
    operation,
  });
  const r = _resolve;
  _resolve = null;
  _pending.value = null;
  _trustedSenders.set(key, Date.now() + TRUST_SESSION_MS);
  _rejectedSenders.delete(key);
  r(true);
}

/** 使用者點擊「拒絕」或 dialog 關閉 */
export function rejectPeerApply(): void {
  if (!_resolve || !_pending.value) return;
  const { sourceDeviceId, operation } = _pending.value;
  const key = sessionKey(sourceDeviceId, operation);
  log("使用者拒絕請求", {
    requestId: _pending.value.requestId,
    sourceDeviceId,
    operation,
  });
  const r = _resolve;
  _resolve = null;
  _pending.value = null;
  _rejectedSenders.add(key);
  // 拒絕 session 在 5 分鐘後自動清除（避免永遠鎖死）
  setTimeout(() => _rejectedSenders.delete(key), 5 * 60 * 1000);
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
