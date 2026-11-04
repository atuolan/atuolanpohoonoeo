import type {
  PeerApplyRequest,
  PeerFetchRequest,
  PeerHashRequest,
  PeerManifestEntry,
  PeerManifestRequest,
  PeerMessage,
  PeerSessionOffer,
  SelfHostedSyncEntityEnvelope,
  SelfHostedSyncEntityType,
  SelfHostedSyncPullResponse,
} from "@/types/selfHostedSync";
import {
  isPeerSyncSocketOpen,
  onPeerMessage,
  sendPeerMessage,
} from "@/services/peerSyncSocket";
import { getSelfHostedSyncService } from "@/services/SelfHostedSyncService";
import { computeBucketHashes } from "@/services/peerHash";
import { reportPeerApplyProgress, requestPeerApplyApproval } from "@/composables/usePeerApplyGate";
import { useSelfHostedSyncStore } from "@/stores/selfHostedSync";
import { useNotificationStore } from "@/stores";
import { getPeerSyncCrypto } from "@/services/PeerSyncCrypto";

const FETCH_BATCH_SIZE = 100;
const LOG = "[PeerSyncSecureResponder]";

let unsubscribe: (() => void) | null = null;
const peerCrypto = getPeerSyncCrypto("responder");

function log(...args: unknown[]): void {
  console.log(LOG, ...args);
}

function warn(...args: unknown[]): void {
  console.warn(LOG, ...args);
}

function notifyPeerStatus(title: string, message: string): void {
  try {
    useNotificationStore().notifySystem(title, message);
  } catch {
    // ignore
  }
}

// 對方一次傳輸會切成好幾批：同一台裝置的結果等批次都到齊（安靜一陣子）才合成一則通知
const BATCH_NOTICE_QUIET_MS = 3000;
const batchNotices = new Map<string, { applied: number; timer: ReturnType<typeof setTimeout> }>();

function notifyPeerBatchResult(sourceDeviceId: string, result: "applied" | "rejected", applied = 0): void {
  const key = `${sourceDeviceId}::${result}`;
  const pending = batchNotices.get(key);
  if (pending) clearTimeout(pending.timer);
  const total = (pending?.applied ?? 0) + applied;
  const timer = setTimeout(() => {
    batchNotices.delete(key);
    const name = resolveSourceDisplayName(sourceDeviceId);
    if (result === "applied") {
      notifyPeerStatus("裝置同步完成", `已從 ${name} 套用 ${total} 筆資料`);
    } else {
      notifyPeerStatus("已拒絕裝置同步", `你已拒絕 ${name} 傳來的同步資料`);
    }
  }, BATCH_NOTICE_QUIET_MS);
  batchNotices.set(key, { applied: total, timer });
}

function sendPeerFailure(
  sourceDeviceId: string,
  requestId: string,
  reason: string,
  detail: unknown,
  stage: "session" | "hash" | "manifest" | "fetch" | "apply" | "decrypt" | "local-apply",
): void {
  sendPeerMessage({
    type: "peer:error",
    requestId,
    reason,
    detail,
    stage,
    endpoint: "target",
    ...({ targetDeviceId: sourceDeviceId } as Record<string, unknown>),
  } as unknown as PeerMessage);
}

function resolveSourceDisplayName(sourceDeviceId: string): string {
  try {
    const store = useSelfHostedSyncStore();
    const peer = store.peerList.find((item) => item.deviceId === sourceDeviceId);
    if (peer) {
      return peer.customName ?? peer.model ?? `${sourceDeviceId.slice(0, 6)}…${sourceDeviceId.slice(-4)}`;
    }
  } catch {
    // ignore
  }
  return `${sourceDeviceId.slice(0, 6)}…${sourceDeviceId.slice(-4)}`;
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

/**
 * 一次同步會先要 hash、再要差異類別的 manifest，兩次間隔只有幾秒，
 * 同一個 session 收集一次就好，省掉第二次掃整個資料庫。
 */
const REFS_CACHE_TTL_MS = 60_000;
const refsCache = new Map<string, { at: number; refs: Promise<PeerManifestEntry[]> }>();

function collectRefsForSession(
  sourceDeviceId: string,
  sessionId: string | undefined,
): Promise<PeerManifestEntry[]> {
  const now = Date.now();
  for (const [key, entry] of refsCache) {
    if (now - entry.at > REFS_CACHE_TTL_MS) refsCache.delete(key);
  }
  const collect = () => getSelfHostedSyncService().collectManifestRefs();
  if (!sessionId) return collect();
  const key = `${sourceDeviceId}::${sessionId}`;
  const cached = refsCache.get(key);
  if (cached) return cached.refs;
  const refs = collect();
  refsCache.set(key, { at: now, refs });
  refs.catch(() => refsCache.delete(key));
  return refs;
}

/** 本機寫入了別人傳來的資料，之前收集的清單就不準了 */
function invalidateRefsCache(): void {
  refsCache.clear();
}

/** 還在寫入別台推過來的資料：這時再開始新的同步，比對結果會不準，也會拖慢正在寫的那批 */
let activeApplyCount = 0;

/**
 * 使用者按了接受（或同一次傳輸的後續批次自動放行）就先告訴對方，
 * 對方才知道不用再等人按，畫面可以換成「寫入中」，等待時間也從這裡重新算。
 * 舊版收到不認得的 peer 訊息會直接忽略，不影響相容。
 */
function sendPeerAccepted(sourceDeviceId: string, requestId: string): void {
  try {
    sendPeerMessage({
      type: "peer:accepted",
      requestId,
      sourceDeviceId: "__self__",
      ...({ targetDeviceId: sourceDeviceId } as Record<string, unknown>),
    } as unknown as PeerMessage);
  } catch (error) {
    warn("送出 peer:accepted 失敗", error);
  }
}

async function handleSessionOffer(
  msg: PeerSessionOffer & {
    sourceDeviceId?: string;
  },
): Promise<void> {
  const sourceDeviceId = msg.sourceDeviceId;
  if (!sourceDeviceId) {
    warn("收到 session-offer 但沒有 sourceDeviceId，忽略", msg);
    return;
  }
  try {
    const answer = await peerCrypto.acceptOffer(sourceDeviceId, msg.sessionId, msg.publicKeyJwk);
    sendPeerMessage({
      type: "peer:session-answer",
      requestId: msg.requestId,
      sourceDeviceId: "__self__",
      sessionId: msg.sessionId,
      publicKeyJwk: answer.publicKeyJwk,
      ...({ targetDeviceId: sourceDeviceId } as Record<string, unknown>),
    } as unknown as PeerMessage);
  } catch (error) {
    warn("建立 peer session 失敗", error);
    notifyPeerStatus("裝置同步失敗", `無法與 ${resolveSourceDisplayName(sourceDeviceId)} 建立加密連線`);
    sendPeerFailure(
      sourceDeviceId,
      msg.requestId,
      "responder-session-failed",
      error instanceof Error ? error.message : String(error),
      "session",
    );
  }
}

async function handleManifestRequest(
  msg: PeerManifestRequest & {
    sourceDeviceId?: string;
  },
): Promise<void> {
  const sourceDeviceId = msg.sourceDeviceId;
  if (!sourceDeviceId) {
    warn("收到 manifest-request 但沒有 sourceDeviceId，忽略", msg);
    return;
  }
  const entityTypeFilter = Array.isArray(msg.entityTypes) && msg.entityTypes.length > 0
    ? new Set<SelfHostedSyncEntityType>(msg.entityTypes)
    : null;
  try {
    const allRefs = await collectRefsForSession(sourceDeviceId, msg.sessionId);
    const entries: PeerManifestEntry[] = entityTypeFilter
      ? allRefs.filter((entry) => entityTypeFilter.has(entry.entityType))
      : allRefs;
    if (msg.sessionId) {
      const encryptedPayload = await peerCrypto.encrypt(sourceDeviceId, msg.sessionId, {
        entries,
        totalCount: entries.length,
      });
      sendPeerMessage({
        type: "peer:manifest-response",
        requestId: msg.requestId,
        sourceDeviceId: "__self__",
        sessionId: msg.sessionId,
        encryptedPayload,
        entityTypes: entityTypeFilter ? Array.from(entityTypeFilter) : undefined,
        ...({ targetDeviceId: sourceDeviceId } as Record<string, unknown>),
      } as unknown as PeerMessage);
      return;
    }
    sendPeerMessage({
      type: "peer:manifest-response",
      requestId: msg.requestId,
      sourceDeviceId: "__self__",
      totalCount: entries.length,
      entries,
      entityTypes: entityTypeFilter ? Array.from(entityTypeFilter) : undefined,
      ...({ targetDeviceId: sourceDeviceId } as Record<string, unknown>),
    } as unknown as PeerMessage);
  } catch (error) {
    warn("處理 manifest-request 失敗", error);
    sendPeerFailure(
      sourceDeviceId,
      msg.requestId,
      "responder-manifest-failed",
      error instanceof Error ? error.message : String(error),
      msg.sessionId ? "decrypt" : "manifest",
    );
  }
}

async function handleHashRequest(
  msg: PeerHashRequest & {
    sourceDeviceId?: string;
  },
): Promise<void> {
  const sourceDeviceId = msg.sourceDeviceId;
  if (!sourceDeviceId) {
    warn("收到 hash-request 但沒有 sourceDeviceId，忽略", msg);
    return;
  }
  if (activeApplyCount > 0) {
    log("還在寫入上一次收到的資料，先不開始新的比對", { sourceDeviceId, activeApplyCount });
    sendPeerFailure(
      sourceDeviceId,
      msg.requestId,
      "responder-busy-applying",
      { activeApplyCount },
      "hash",
    );
    return;
  }
  try {
    const entries = await collectRefsForSession(sourceDeviceId, msg.sessionId);
    const payload = computeBucketHashes(entries);
    if (msg.sessionId) {
      const encryptedPayload = await peerCrypto.encrypt(sourceDeviceId, msg.sessionId, payload);
      sendPeerMessage({
        type: "peer:hash-response",
        requestId: msg.requestId,
        sourceDeviceId: "__self__",
        sessionId: msg.sessionId,
        encryptedPayload,
        ...({ targetDeviceId: sourceDeviceId } as Record<string, unknown>),
      } as unknown as PeerMessage);
      return;
    }
    sendPeerMessage({
      type: "peer:hash-response",
      requestId: msg.requestId,
      sourceDeviceId: "__self__",
      buckets: payload.buckets,
      rootHash: payload.rootHash,
      totalCount: payload.totalCount,
      ...({ targetDeviceId: sourceDeviceId } as Record<string, unknown>),
    } as unknown as PeerMessage);
  } catch (error) {
    warn("處理 hash-request 失敗", error);
    sendPeerFailure(
      sourceDeviceId,
      msg.requestId,
      "responder-hash-failed",
      error instanceof Error ? error.message : String(error),
      "hash",
    );
  }
}

async function handleFetchRequest(
  msg: PeerFetchRequest & {
    sourceDeviceId?: string;
  },
): Promise<void> {
  const sourceDeviceId = msg.sourceDeviceId;
  if (!sourceDeviceId) {
    warn("收到 fetch-request 但沒有 sourceDeviceId，忽略", msg);
    return;
  }

  let entityRefs = msg.entityRefs || [];
  try {
    if (msg.encryptedPayload && msg.sessionId) {
      const payload = await peerCrypto.decrypt<{ entityRefs: typeof entityRefs; cursor?: number | null }>(
        sourceDeviceId,
        msg.sessionId,
        msg.encryptedPayload,
      );
      entityRefs = payload.entityRefs ?? [];
    }
  } catch (error) {
    warn("fetch-request 解密失敗", error);
    notifyPeerStatus("裝置同步失敗", `${resolveSourceDisplayName(sourceDeviceId)} 的下載請求無法解密`);
    sendPeerFailure(
      sourceDeviceId,
      msg.requestId,
      "responder-fetch-decrypt-failed",
      error instanceof Error ? error.message : String(error),
      "decrypt",
    );
    return;
  }

  try {
    const accepted = await requestPeerApplyApproval({
      requestId: msg.requestId,
      sourceDeviceId,
      operation: "pull",
      totalEnvelopes: entityRefs.length,
      summary: buildFetchSummary(entityRefs),
      sourceDisplayName: resolveSourceDisplayName(sourceDeviceId),
    });

    if (!accepted) {
      notifyPeerStatus("已拒絕裝置下載", `你已拒絕 ${resolveSourceDisplayName(sourceDeviceId)} 從本機拉取資料`);
      sendPeerFailure(sourceDeviceId, msg.requestId, "rejected-by-user", "peer fetch rejected by user", "fetch");
      return;
    }
    sendPeerAccepted(sourceDeviceId, msg.requestId);

    const matched = await getSelfHostedSyncService().collectEnvelopesForRefs(entityRefs);

    for (let index = 0; index < matched.length; index += FETCH_BATCH_SIZE) {
      if (!isPeerSyncSocketOpen()) {
        notifyPeerStatus("裝置同步中斷", `${resolveSourceDisplayName(sourceDeviceId)} 拉取資料時連線中斷`);
        return;
      }
      const batch = matched.slice(index, index + FETCH_BATCH_SIZE);
      const hasMore = index + FETCH_BATCH_SIZE < matched.length;
      if (msg.sessionId) {
        const encryptedPayload = await peerCrypto.encrypt(sourceDeviceId, msg.sessionId, {
          envelopes: batch,
          hasMore,
          nextCursor: hasMore ? index + FETCH_BATCH_SIZE : null,
        });
        sendPeerMessage({
          type: "peer:fetch-response",
          requestId: msg.requestId,
          sourceDeviceId: "__self__",
          sessionId: msg.sessionId,
          encryptedPayload,
          ...({ targetDeviceId: sourceDeviceId } as Record<string, unknown>),
        } as unknown as PeerMessage);
      } else {
        sendPeerMessage({
          type: "peer:fetch-response",
          requestId: msg.requestId,
          sourceDeviceId: "__self__",
          envelopes: batch,
          hasMore,
          nextCursor: hasMore ? index + FETCH_BATCH_SIZE : null,
          ...({ targetDeviceId: sourceDeviceId } as Record<string, unknown>),
        } as unknown as PeerMessage);
      }
    }

    if (matched.length === 0) {
      if (msg.sessionId) {
        const encryptedPayload = await peerCrypto.encrypt(sourceDeviceId, msg.sessionId, {
          envelopes: [],
          hasMore: false,
          nextCursor: null,
        });
        sendPeerMessage({
          type: "peer:fetch-response",
          requestId: msg.requestId,
          sourceDeviceId: "__self__",
          sessionId: msg.sessionId,
          encryptedPayload,
          ...({ targetDeviceId: sourceDeviceId } as Record<string, unknown>),
        } as unknown as PeerMessage);
      } else {
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
    }

    notifyPeerStatus("裝置同步完成", `已提供 ${matched.length} 筆資料給 ${resolveSourceDisplayName(sourceDeviceId)}`);
  } catch (error) {
    warn("處理 fetch-request 失敗", error);
    notifyPeerStatus("裝置同步失敗", `${resolveSourceDisplayName(sourceDeviceId)} 的下載請求處理失敗`);
    sendPeerFailure(
      sourceDeviceId,
      msg.requestId,
      "responder-fetch-failed",
      error instanceof Error ? error.message : String(error),
      "fetch",
    );
  }
}

async function handleApplyRequest(
  msg: PeerApplyRequest & {
    sourceDeviceId?: string;
  },
): Promise<void> {
  const sourceDeviceId = msg.sourceDeviceId;
  if (!sourceDeviceId) {
    warn("收到 apply-request 但沒有 sourceDeviceId，忽略", msg);
    return;
  }

  let envelopes = msg.envelopes || [];
  try {
    if (msg.encryptedPayload && msg.sessionId) {
      const payload = await peerCrypto.decrypt<{ envelopes: SelfHostedSyncEntityEnvelope[] }>(
        sourceDeviceId,
        msg.sessionId,
        msg.encryptedPayload,
      );
      envelopes = payload.envelopes ?? [];
    }
  } catch (error) {
    warn("apply-request 解密失敗", error);
    notifyPeerStatus("裝置同步失敗", `${resolveSourceDisplayName(sourceDeviceId)} 傳來的資料無法解密`);
    sendPeerFailure(
      sourceDeviceId,
      msg.requestId,
      "responder-apply-decrypt-failed",
      error instanceof Error ? error.message : String(error),
      "decrypt",
    );
    return;
  }

  const accepted = await requestPeerApplyApproval({
    requestId: msg.requestId,
    sourceDeviceId,
    operation: "push",
    totalEnvelopes: envelopes.length,
    summary: buildApplySummary(envelopes),
    sourceDisplayName: resolveSourceDisplayName(sourceDeviceId),
  });

  if (!accepted) {
    notifyPeerBatchResult(sourceDeviceId, "rejected");
    const rejected = envelopes.map((env) => ({
      entityType: env.entityType,
      entityId: env.entityId,
      reason: "rejected-by-user",
    }));
    if (msg.sessionId) {
      const encryptedPayload = await peerCrypto.encrypt(sourceDeviceId, msg.sessionId, {
        applied: 0,
        rejected,
        serverTime: Date.now(),
      });
      sendPeerMessage({
        type: "peer:apply-response",
        requestId: msg.requestId,
        sourceDeviceId: "__self__",
        sessionId: msg.sessionId,
        encryptedPayload,
        ...({ targetDeviceId: sourceDeviceId } as Record<string, unknown>),
      } as unknown as PeerMessage);
    } else {
      sendPeerMessage({
        type: "peer:apply-response",
        requestId: msg.requestId,
        sourceDeviceId: "__self__",
        applied: 0,
        rejected,
        ...({ targetDeviceId: sourceDeviceId } as Record<string, unknown>),
      } as unknown as PeerMessage);
    }
    return;
  }

  sendPeerAccepted(sourceDeviceId, msg.requestId);
  activeApplyCount += 1;
  try {
    const service = getSelfHostedSyncService();
    const pseudoResponse: SelfHostedSyncPullResponse = {
      serverTime: Date.now(),
      items: envelopes,
      hasMore: false,
      nextSince: undefined,
    };
    let applied: number;
    try {
      applied = await service.applyPullResponsePublic(pseudoResponse, {
        forceOverwrite: true,
      });
    } finally {
      activeApplyCount = Math.max(0, activeApplyCount - 1);
      invalidateRefsCache();
    }
    notifyPeerBatchResult(sourceDeviceId, "applied", applied);
    reportPeerApplyProgress(sourceDeviceId, envelopes.length);
    if (msg.sessionId) {
      const encryptedPayload = await peerCrypto.encrypt(sourceDeviceId, msg.sessionId, {
        applied,
        rejected: [],
        serverTime: Date.now(),
      });
      sendPeerMessage({
        type: "peer:apply-response",
        requestId: msg.requestId,
        sourceDeviceId: "__self__",
        sessionId: msg.sessionId,
        encryptedPayload,
        ...({ targetDeviceId: sourceDeviceId } as Record<string, unknown>),
      } as unknown as PeerMessage);
    } else {
      sendPeerMessage({
        type: "peer:apply-response",
        requestId: msg.requestId,
        sourceDeviceId: "__self__",
        applied,
        rejected: [],
        ...({ targetDeviceId: sourceDeviceId } as Record<string, unknown>),
      } as unknown as PeerMessage);
    }
  } catch (error) {
    warn("處理 apply-request 失敗", error);
    notifyPeerStatus("裝置同步失敗", `${resolveSourceDisplayName(sourceDeviceId)} 的資料套用失敗`);
    reportPeerApplyProgress(sourceDeviceId, envelopes.length);
    sendPeerFailure(
      sourceDeviceId,
      msg.requestId,
      "responder-apply-failed",
      error instanceof Error ? error.message : String(error),
      "local-apply",
    );
  }
}

export function startPeerSyncResponder(): void {
  if (unsubscribe) {
    log("responder 已啟動，略過");
    return;
  }
  unsubscribe = onPeerMessage((message) => {
    switch (message.type) {
      case "peer:session-offer":
        void handleSessionOffer(message as PeerSessionOffer);
        break;
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
        break;
    }
  });
}

export function stopPeerSyncResponder(): void {
  if (unsubscribe) {
    unsubscribe();
    unsubscribe = null;
  }
}
