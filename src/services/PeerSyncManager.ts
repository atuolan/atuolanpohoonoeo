/**
 * Peer-to-Peer 同步管理器
 *
 * 負責：
 * - 透過 peerSyncSocket 送出 manifest / fetch / apply 請求，配對 requestId
 * - 計算兩端 manifest 的差集與衝突
 * - 呼叫 SelfHostedSyncService 的 apply 邏輯把收到的 envelope 寫入本機
 * - 組裝本機 envelope 供 push 使用
 */

import type {
  PeerApplyResponse,
  PeerBucketHash,
  PeerEntityRef,
  PeerErrorMessage,
  PeerFetchResponse,
  PeerHashResponse,
  PeerManifestEntry,
  PeerManifestResponse,
  PeerMessage,
  PeerSyncDiff,
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
import { computeBucketHashes, diffBuckets } from "@/services/peerHash";

const DEFAULT_REQUEST_TIMEOUT_MS = 60000;
const APPLY_BATCH_SIZE = 100;

interface PendingRequest<T> {
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
  expectedResponseType: PeerMessage["type"];
  timer: ReturnType<typeof setTimeout>;
  // 針對 fetch 這種會分批回傳多次的類型，允許累加
  accumulator?: unknown;
}

class PeerSyncManager {
  private pending = new Map<string, PendingRequest<unknown>>();
  private unsubscribe: (() => void) | null = null;

  constructor() {
    this.unsubscribe = onPeerMessage((message) => this.handleIncoming(message));
  }

  dispose(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(new Error("PeerSyncManager disposed"));
    }
    this.pending.clear();
  }

  private handleIncoming(message: PeerMessage): void {
    if (!("requestId" in message) || !message.requestId) {
      return;
    }
    const pending = this.pending.get(message.requestId);
    if (!pending) {
      return;
    }

    if (message.type === "peer:error") {
      clearTimeout(pending.timer);
      this.pending.delete(message.requestId);
      const errMsg = message as PeerErrorMessage;
      pending.reject(
        new Error(`Peer error: ${errMsg.reason}`) as Error & {
          peerReason: string;
          peerDetail: unknown;
        },
      );
      return;
    }

    if (message.type !== pending.expectedResponseType) {
      return;
    }

    // fetch 回覆可能是分批的；由 requestFetch 自己處理，不在這裡 resolve
    if (message.type === "peer:fetch-response") {
      const fetchMsg = message as PeerFetchResponse;
      const acc = pending.accumulator as {
        envelopes: SelfHostedSyncEntityEnvelope[];
      };
      acc.envelopes.push(...fetchMsg.envelopes);
      if (!fetchMsg.hasMore) {
        clearTimeout(pending.timer);
        this.pending.delete(message.requestId);
        pending.resolve(acc.envelopes);
      }
      // 若 hasMore=true 由呼叫端繼續發 cursor 請求
      return;
    }

    clearTimeout(pending.timer);
    this.pending.delete(message.requestId);
    pending.resolve(message);
  }

  private nextRequestId(prefix: string): string {
    return `${prefix}-${Date.now().toString(36)}-${Math.random()
      .toString(36)
      .slice(2, 8)}`;
  }

  private registerPending<T>(
    requestId: string,
    expectedResponseType: PeerMessage["type"],
    timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
    accumulator?: unknown,
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        reject(new Error(`Peer request ${requestId} timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      this.pending.set(requestId, {
        resolve: resolve as (v: unknown) => void,
        reject,
        expectedResponseType,
        timer,
        accumulator,
      });
    });
  }

  // ===== High-level operations =====

  async requestRemoteManifest(
    targetDeviceId: string,
    entityTypes?: SelfHostedSyncEntityType[],
  ): Promise<PeerManifestEntry[]> {
    if (!isPeerSyncSocketOpen()) {
      throw new Error("WebSocket 未連線，無法進行同步");
    }
    const requestId = this.nextRequestId("manifest");
    const promise = this.registerPending<PeerManifestResponse>(
      requestId,
      "peer:manifest-response",
    );
    sendPeerMessage({
      type: "peer:manifest-request",
      requestId,
      targetDeviceId,
      ...(entityTypes && entityTypes.length > 0 ? { entityTypes } : {}),
    });
    const response = await promise;
    return response.entries;
  }

  /**
   * 向對方請求 bucket-level hash。用途是在交換完整 manifest 前先確認哪些類別有差異。
   * 若所有 bucket hash 都一致，就完全不需要傳 manifest。
   */
  async requestRemoteBucketHashes(
    targetDeviceId: string,
  ): Promise<{ buckets: PeerBucketHash[]; rootHash: string; totalCount: number }> {
    if (!isPeerSyncSocketOpen()) {
      throw new Error("WebSocket 未連線，無法進行同步");
    }
    const requestId = this.nextRequestId("hash");
    const promise = this.registerPending<PeerHashResponse>(
      requestId,
      "peer:hash-response",
    );
    sendPeerMessage({
      type: "peer:hash-request",
      requestId,
      targetDeviceId,
    });
    const response = await promise;
    return {
      buckets: response.buckets,
      rootHash: response.rootHash,
      totalCount: response.totalCount,
    };
  }

  async collectLocalBucketHashes(): Promise<{
    buckets: PeerBucketHash[];
    rootHash: string;
    totalCount: number;
    entries: PeerManifestEntry[];
  }> {
    const entries = await this.collectLocalManifest();
    const { buckets, rootHash, totalCount } = computeBucketHashes(entries);
    return { buckets, rootHash, totalCount, entries };
  }

  /** 比對雙方 bucket hash，回傳哪些類別需要後續 manifest 交換 */
  diffBucketHashes(
    local: PeerBucketHash[],
    remote: PeerBucketHash[],
  ): { differingTypes: SelfHostedSyncEntityType[]; matchedTypes: SelfHostedSyncEntityType[] } {
    return diffBuckets(local, remote);
  }

  async collectLocalManifest(): Promise<PeerManifestEntry[]> {
    // Phase 1: 直接呼叫現有的 collectPushItems 再取 meta 欄位。
    // 未來可優化成只掃 meta 以省記憶體。
    const service = getSelfHostedSyncService();
    const envelopes = await service.collectAllEnvelopesForManifest();
    return envelopes.map((item) => ({
      entityType: item.entityType,
      entityId: item.entityId,
      updatedAt: item.updatedAt,
      deletedAt: item.deletedAt,
    }));
  }

  computeDiff(
    local: PeerManifestEntry[],
    remote: PeerManifestEntry[],
  ): PeerSyncDiff {
    const keyOf = (e: PeerManifestEntry) => `${e.entityType}::${e.entityId}`;

    const localMap = new Map<string, PeerManifestEntry>();
    for (const entry of local) {
      localMap.set(keyOf(entry), entry);
    }
    const remoteMap = new Map<string, PeerManifestEntry>();
    for (const entry of remote) {
      remoteMap.set(keyOf(entry), entry);
    }

    const onlyLocal: PeerManifestEntry[] = [];
    const onlyRemote: PeerManifestEntry[] = [];
    const conflicts: PeerSyncDiff["conflicts"] = [];
    let identicalCount = 0;

    // Phase 1 衝突策略：Last-Write-Wins。
    // 沒有向量時鐘，無法真正偵測「同時修改」；任何 updatedAt 差異都視為單邊較新。
    // 只有在兩邊 updatedAt 完全一樣但內容 hash 不同時才算真衝突（此處無 hash，所以永不觸發）。
    for (const [key, localEntry] of localMap) {
      const remoteEntry = remoteMap.get(key);
      if (!remoteEntry) {
        onlyLocal.push(localEntry);
        continue;
      }
      if (localEntry.updatedAt === remoteEntry.updatedAt) {
        identicalCount += 1;
      } else if (localEntry.updatedAt > remoteEntry.updatedAt) {
        // 本機較新 → 推送這一筆
        onlyLocal.push(localEntry);
      } else {
        // 遠端較新 → 拉取這一筆
        onlyRemote.push(remoteEntry);
      }
    }
    for (const [key, remoteEntry] of remoteMap) {
      if (!localMap.has(key)) {
        onlyRemote.push(remoteEntry);
      }
    }

    return { onlyLocal, onlyRemote, conflicts, identicalCount };
  }

  async requestFetch(
    targetDeviceId: string,
    entityRefs: PeerEntityRef[],
  ): Promise<SelfHostedSyncEntityEnvelope[]> {
    if (entityRefs.length === 0) return [];
    if (!isPeerSyncSocketOpen()) {
      throw new Error("WebSocket 未連線，無法進行同步");
    }

    const accumulator: { envelopes: SelfHostedSyncEntityEnvelope[] } = {
      envelopes: [],
    };
    const requestId = this.nextRequestId("fetch");
    const promise = this.registerPending<SelfHostedSyncEntityEnvelope[]>(
      requestId,
      "peer:fetch-response",
      DEFAULT_REQUEST_TIMEOUT_MS,
      accumulator,
    );
    sendPeerMessage({
      type: "peer:fetch-request",
      requestId,
      targetDeviceId,
      entityRefs,
      cursor: null,
    });
    return promise;
  }

  async requestApply(
    targetDeviceId: string,
    envelopes: SelfHostedSyncEntityEnvelope[],
  ): Promise<PeerApplyResponse> {
    if (!isPeerSyncSocketOpen()) {
      throw new Error("WebSocket 未連線，無法進行同步");
    }
    // 分批送，避免單一訊息過大
    let applied = 0;
    const rejected: PeerApplyResponse["rejected"] = [];
    let lastServerTime: number | undefined;

    for (let i = 0; i < envelopes.length; i += APPLY_BATCH_SIZE) {
      const batch = envelopes.slice(i, i + APPLY_BATCH_SIZE);
      const requestId = this.nextRequestId("apply");
      const promise = this.registerPending<PeerApplyResponse>(
        requestId,
        "peer:apply-response",
      );
      sendPeerMessage({
        type: "peer:apply-request",
        requestId,
        targetDeviceId,
        envelopes: batch,
      });
      const resp = await promise;
      applied += resp.applied;
      if (resp.rejected?.length) rejected.push(...resp.rejected);
      lastServerTime = resp.serverTime ?? lastServerTime;
    }

    return {
      type: "peer:apply-response",
      requestId: "aggregate",
      sourceDeviceId: targetDeviceId,
      applied,
      rejected,
      serverTime: lastServerTime,
    };
  }

  async applyEnvelopesLocally(
    envelopes: SelfHostedSyncEntityEnvelope[],
  ): Promise<number> {
    if (envelopes.length === 0) return 0;
    const service = getSelfHostedSyncService();
    const pseudoResponse: SelfHostedSyncPullResponse = {
      serverTime: Date.now(),
      items: envelopes,
      hasMore: false,
      nextSince: undefined,
    };
    // forceOverwrite: 使用者已在 diff 判讀過，按 peer 指示覆蓋即可
    return service.applyPullResponsePublic(pseudoResponse, {
      forceOverwrite: true,
    });
  }
}

let instance: PeerSyncManager | null = null;

export function getPeerSyncManager(): PeerSyncManager {
  if (!instance) {
    instance = new PeerSyncManager();
  }
  return instance;
}

export function disposePeerSyncManager(): void {
  instance?.dispose();
  instance = null;
}

export type { PeerSyncManager };
