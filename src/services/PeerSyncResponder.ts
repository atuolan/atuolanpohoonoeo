/**
 * PeerSyncResponder
 *
 * 當其他裝置把 peer:manifest-request / fetch-request / apply-request 送過來時，
 * 由這個模組負責在本機掃 IndexedDB 產生回覆。
 *
 * 發起端（PeerSyncManager）等的就是這些回覆。
 */

import type {
  PeerApplyRequest,
  PeerFetchRequest,
  PeerHashRequest,
  PeerManifestEntry,
  PeerManifestRequest,
  PeerMessage,
  SelfHostedSyncEntityEnvelope,
  SelfHostedSyncEntityType,
} from "@/types/selfHostedSync";
import {
  onPeerMessage,
  sendPeerMessage,
} from "@/services/peerSyncSocket";
import { getSelfHostedSyncService } from "@/services/SelfHostedSyncService";
import type { SelfHostedSyncPullResponse } from "@/types/selfHostedSync";
import { computeBucketHashes } from "@/services/peerHash";
import { requestPeerApplyApproval } from "@/composables/usePeerApplyGate";
import { useSelfHostedSyncStore } from "@/stores/selfHostedSync";

const FETCH_BATCH_SIZE = 100;
const LOG = "[PeerSyncResponder]";

let unsubscribe: (() => void) | null = null;
// 簡單的回覆緩存：同一次 manifest-request 產生的 envelope 清單，用於後續可能的 fetch-request 加速
// Phase 1 先不做緩存，每次 fetch 重新掃。

function log(...args: unknown[]): void {
  console.log(LOG, ...args);
}

function warn(...args: unknown[]): void {
  console.warn(LOG, ...args);
}

async function handleManifestRequest(msg: PeerManifestRequest & {
  sourceDeviceId?: string;
}): Promise<void> {
  const sourceDeviceId = msg.sourceDeviceId;
  if (!sourceDeviceId) {
    warn("收到 manifest-request 但沒有 sourceDeviceId，忽略", msg);
    return;
  }
  const entityTypeFilter = Array.isArray(msg.entityTypes) && msg.entityTypes.length > 0
    ? new Set<SelfHostedSyncEntityType>(msg.entityTypes)
    : null;
  log("收到 manifest-request，開始掃本機", {
    requestId: msg.requestId,
    sourceDeviceId,
    entityTypes: entityTypeFilter ? Array.from(entityTypeFilter) : "ALL",
  });

  try {
    const service = getSelfHostedSyncService();
    const envelopes = await service.collectAllEnvelopesForManifest();
    const entries: PeerManifestEntry[] = [];
    for (const env of envelopes) {
      if (entityTypeFilter && !entityTypeFilter.has(env.entityType)) continue;
      entries.push({
        entityType: env.entityType,
        entityId: env.entityId,
        updatedAt: env.updatedAt,
        deletedAt: env.deletedAt,
      });
    }

    log("manifest 產生完成，準備回覆", {
      requestId: msg.requestId,
      entryCount: entries.length,
      totalScanned: envelopes.length,
    });

    sendPeerMessage({
      type: "peer:manifest-response",
      requestId: msg.requestId,
      sourceDeviceId: "__self__", // 伺服器會改成正確的 sourceDeviceId
      totalCount: entries.length,
      entries,
      entityTypes: entityTypeFilter ? Array.from(entityTypeFilter) : undefined,
      // targetDeviceId 用來讓伺服器路由回去
      ...({ targetDeviceId: sourceDeviceId } as Record<string, unknown>),
    } as unknown as PeerMessage);
  } catch (error) {
    warn("處理 manifest-request 失敗", error);
    sendPeerMessage({
      type: "peer:error",
      requestId: msg.requestId,
      reason: "responder-manifest-failed",
      detail: error instanceof Error ? error.message : String(error),
      ...({ targetDeviceId: sourceDeviceId } as Record<string, unknown>),
    } as unknown as PeerMessage);
  }
}

async function handleHashRequest(msg: PeerHashRequest & {
  sourceDeviceId?: string;
}): Promise<void> {
  const sourceDeviceId = msg.sourceDeviceId;
  if (!sourceDeviceId) {
    warn("收到 hash-request 但沒有 sourceDeviceId，忽略", msg);
    return;
  }
  log("收到 hash-request，開始掃本機", {
    requestId: msg.requestId,
    sourceDeviceId,
  });

  try {
    const service = getSelfHostedSyncService();
    const envelopes = await service.collectAllEnvelopesForManifest();
    const entries: PeerManifestEntry[] = envelopes.map((env) => ({
      entityType: env.entityType,
      entityId: env.entityId,
      updatedAt: env.updatedAt,
      deletedAt: env.deletedAt,
    }));
    const { buckets, rootHash, totalCount } = computeBucketHashes(entries);

    log("hash 計算完成，準備回覆", {
      requestId: msg.requestId,
      bucketCount: buckets.length,
      totalCount,
      rootHash,
    });

    sendPeerMessage({
      type: "peer:hash-response",
      requestId: msg.requestId,
      sourceDeviceId: "__self__",
      buckets,
      rootHash,
      totalCount,
      ...({ targetDeviceId: sourceDeviceId } as Record<string, unknown>),
    } as unknown as PeerMessage);
  } catch (error) {
    warn("處理 hash-request 失敗", error);
    sendPeerMessage({
      type: "peer:error",
      requestId: msg.requestId,
      reason: "responder-hash-failed",
      detail: error instanceof Error ? error.message : String(error),
      ...({ targetDeviceId: sourceDeviceId } as Record<string, unknown>),
    } as unknown as PeerMessage);
  }
}

async function handleFetchRequest(msg: PeerFetchRequest & {
  sourceDeviceId?: string;
}): Promise<void> {
  const sourceDeviceId = msg.sourceDeviceId;
  if (!sourceDeviceId) {
    warn("收到 fetch-request 但沒有 sourceDeviceId，忽略", msg);
    return;
  }
  log("收到 fetch-request", {
    requestId: msg.requestId,
    sourceDeviceId,
    entityRefCount: msg.entityRefs?.length ?? 0,
  });

  try {
    const entityRefs = msg.entityRefs || [];
    const accepted = await requestPeerApplyApproval({
      requestId: msg.requestId,
      sourceDeviceId,
      operation: "pull",
      totalEnvelopes: entityRefs.length,
      summary: buildFetchSummary(entityRefs),
      sourceDisplayName: resolveSourceDisplayName(sourceDeviceId),
    });

    if (!accepted) {
      log("使用者拒絕 fetch-request", { requestId: msg.requestId });
      sendPeerMessage({
        type: "peer:error",
        requestId: msg.requestId,
        reason: "rejected-by-user",
        detail: "peer fetch rejected by user",
        ...({ targetDeviceId: sourceDeviceId } as Record<string, unknown>),
      } as unknown as PeerMessage);
      return;
    }

    const service = getSelfHostedSyncService();
    const allEnvelopes = await service.collectAllEnvelopesForManifest();
    const refKey = (t: string, id: string) => `${t}::${id}`;
    const wanted = new Set(
      entityRefs.map((r) => refKey(r.entityType, r.entityId)),
    );

    const matched: SelfHostedSyncEntityEnvelope[] = [];
    for (const env of allEnvelopes) {
      if (wanted.has(refKey(env.entityType, env.entityId))) {
        matched.push(env);
      }
    }

    log("fetch-request 比對完成，分批回覆", {
      requestId: msg.requestId,
      matched: matched.length,
      totalLocal: allEnvelopes.length,
      batchSize: FETCH_BATCH_SIZE,
    });

    // 分批回覆
    for (let i = 0; i < matched.length; i += FETCH_BATCH_SIZE) {
      const batch = matched.slice(i, i + FETCH_BATCH_SIZE);
      const hasMore = i + FETCH_BATCH_SIZE < matched.length;
      sendPeerMessage({
        type: "peer:fetch-response",
        requestId: msg.requestId,
        sourceDeviceId: "__self__",
        envelopes: batch,
        hasMore,
        nextCursor: hasMore ? i + FETCH_BATCH_SIZE : null,
        ...({ targetDeviceId: sourceDeviceId } as Record<string, unknown>),
      } as unknown as PeerMessage);
    }

    // 若 matched 為 0，至少回一個空 response 讓對方結束等待
    if (matched.length === 0) {
      sendPeerMessage({
        type: "peer:fetch-response",
        requestId: msg.requestId,
        sourceDeviceId: "__self__",
        envelopes: [],
        hasMore: false,
        nextCursor: null,
        ...({ targetDeviceId: sourceDeviceId } as Record<string, unknown>),
      } as unknown as PeerMessage);
    }
  } catch (error) {
    warn("處理 fetch-request 失敗", error);
    sendPeerMessage({
      type: "peer:error",
      requestId: msg.requestId,
      reason: "responder-fetch-failed",
      detail: error instanceof Error ? error.message : String(error),
      ...({ targetDeviceId: sourceDeviceId } as Record<string, unknown>),
    } as unknown as PeerMessage);
  }
}

function buildApplySummary(envelopes: SelfHostedSyncEntityEnvelope[]) {
  const counts = new Map<string, number>();
  for (const env of envelopes) {
    counts.set(env.entityType, (counts.get(env.entityType) ?? 0) + 1);
  }
  return Array.from(counts.entries()).map(([entityType, count]) => ({ entityType, count }));
}

function buildFetchSummary(entityRefs: Array<{ entityType: string }>) {
  const counts = new Map<string, number>();
  for (const ref of entityRefs) {
    counts.set(ref.entityType, (counts.get(ref.entityType) ?? 0) + 1);
  }
  return Array.from(counts.entries()).map(([entityType, count]) => ({ entityType, count }));
}

function resolveSourceDisplayName(sourceDeviceId: string): string {
  try {
    const store = useSelfHostedSyncStore();
    const peer = store.peerList.find((p) => p.deviceId === sourceDeviceId);
    if (peer) {
      return peer.customName ?? peer.model ?? `${sourceDeviceId.slice(0, 6)}…${sourceDeviceId.slice(-4)}`;
    }
  } catch {
    // store 可能尚未初始化
  }
  return `${sourceDeviceId.slice(0, 6)}…${sourceDeviceId.slice(-4)}`;
}

async function handleApplyRequest(msg: PeerApplyRequest & {
  sourceDeviceId?: string;
}): Promise<void> {
  const sourceDeviceId = msg.sourceDeviceId;
  if (!sourceDeviceId) {
    warn("收到 apply-request 但沒有 sourceDeviceId，忽略", msg);
    return;
  }
  const envelopes = msg.envelopes || [];
  log("收到 apply-request，等待使用者確認", {
    requestId: msg.requestId,
    sourceDeviceId,
    envelopeCount: envelopes.length,
  });

  // 顯示確認 dialog，等待使用者決定
  const accepted = await requestPeerApplyApproval({
    requestId: msg.requestId,
    sourceDeviceId,
    operation: "push",
    totalEnvelopes: envelopes.length,
    summary: buildApplySummary(envelopes),
    sourceDisplayName: resolveSourceDisplayName(sourceDeviceId),
  });

  if (!accepted) {
    log("使用者拒絕 apply-request", { requestId: msg.requestId });
    sendPeerMessage({
      type: "peer:apply-response",
      requestId: msg.requestId,
      sourceDeviceId: "__self__",
      applied: 0,
      rejected: envelopes.map((e) => ({ entityType: e.entityType, entityId: e.entityId, reason: "rejected-by-user" })),
      ...({ targetDeviceId: sourceDeviceId } as Record<string, unknown>),
    } as unknown as PeerMessage);
    return;
  }

  try {
    const service = getSelfHostedSyncService();
    const pseudoResponse: SelfHostedSyncPullResponse = {
      serverTime: Date.now(),
      items: envelopes,
      hasMore: false,
      nextSince: undefined,
    };
    const applied = await service.applyPullResponsePublic(pseudoResponse, {
      forceOverwrite: true,
    });

    log("apply-request 套用完成", {
      requestId: msg.requestId,
      applied,
    });

    sendPeerMessage({
      type: "peer:apply-response",
      requestId: msg.requestId,
      sourceDeviceId: "__self__",
      applied,
      rejected: [],
      ...({ targetDeviceId: sourceDeviceId } as Record<string, unknown>),
    } as unknown as PeerMessage);
  } catch (error) {
    warn("處理 apply-request 失敗", error);
    sendPeerMessage({
      type: "peer:error",
      requestId: msg.requestId,
      reason: "responder-apply-failed",
      detail: error instanceof Error ? error.message : String(error),
      ...({ targetDeviceId: sourceDeviceId } as Record<string, unknown>),
    } as unknown as PeerMessage);
  }
}

export function startPeerSyncResponder(): void {
  if (unsubscribe) {
    log("responder 已啟動，略過");
    return;
  }
  log("啟動 responder");
  unsubscribe = onPeerMessage((message) => {
    // 只處理 *-request；response 由 PeerSyncManager 處理
    switch (message.type) {
      case "peer:hash-request":
        void handleHashRequest(message as PeerHashRequest);
        break;
      case "peer:manifest-request":
        void handleManifestRequest(message as PeerManifestRequest);
        break;
      case "peer:fetch-request":
        void handleFetchRequest(message as PeerFetchRequest);
        break;
      case "peer:apply-request":
        void handleApplyRequest(message as PeerApplyRequest);
        break;
      default:
        // response 類型不屬於這個模組
        break;
    }
  });
}

export function stopPeerSyncResponder(): void {
  if (unsubscribe) {
    log("停止 responder");
    unsubscribe();
    unsubscribe = null;
  }
}
