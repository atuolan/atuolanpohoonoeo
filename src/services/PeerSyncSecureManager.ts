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
  PeerSessionAnswer,
  SelfHostedSyncEntityEnvelope,
  SelfHostedSyncEntityType,
  SelfHostedSyncPullResponse,
} from "@/types/selfHostedSync";
import {
  isPeerSyncSocketOpen,
  onPeerMessage,
  onPeerSocketDisconnect,
  sendPeerMessage,
} from "@/services/peerSyncSocket";
import { getSelfHostedSyncService } from "@/services/SelfHostedSyncService";
import { computeBucketHashes, diffBuckets } from "@/services/peerHash";
import { getPeerSyncCrypto } from "@/services/PeerSyncCrypto";

const DEFAULT_REQUEST_TIMEOUT_MS = 60000;
const FETCH_REQUEST_TIMEOUT_MS = 300_000;
const APPLY_REQUEST_TIMEOUT_MS = 300_000;
const APPLY_BATCH_SIZE = 20;
const APPLY_BATCH_MAX_BYTES = 3 * 1024 * 1024;

type PendingRequest<T> = {
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
  expectedResponseType: PeerMessage["type"];
  timer: ReturnType<typeof setTimeout>;
  startedAt: number;
  accumulator?: unknown;
};

type FetchAccumulator = {
  envelopes: SelfHostedSyncEntityEnvelope[];
};

class PeerSyncSecureManager {
  private pending = new Map<string, PendingRequest<unknown>>();
  private unsubscribe: (() => void) | null = null;
  private disconnectUnsubscribe: (() => void) | null = null;
  private readonly crypto = getPeerSyncCrypto();

  private log(...args: unknown[]): void {
    console.log("[PeerSyncSecureManager]", ...args);
  }

  private warn(...args: unknown[]): void {
    console.warn("[PeerSyncSecureManager]", ...args);
  }

  constructor() {
    this.unsubscribe = onPeerMessage((message) => {
      void this.handleIncoming(message);
    });
    this.disconnectUnsubscribe = onPeerSocketDisconnect(() => this.handleSocketDisconnect());
  }

  dispose(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.disconnectUnsubscribe?.();
    this.disconnectUnsubscribe = null;
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(new Error("PeerSyncSecureManager disposed"));
    }
    this.pending.clear();
  }

  private handleSocketDisconnect(): void {
    const count = this.pending.size;
    if (count === 0) return;
    this.warn("WebSocket 斷線，立即 reject 所有 pending request", {
      count,
      requestIds: Array.from(this.pending.keys()),
    });
    for (const [requestId, pending] of this.pending.entries()) {
      clearTimeout(pending.timer);
      pending.reject(
        Object.assign(new Error(`Peer request ${requestId} aborted: WebSocket disconnected`), {
          peerAbortReason: "socket-disconnected",
        }),
      );
    }
    this.pending.clear();
  }

  private buildPeerError(message: PeerErrorMessage): Error {
    return Object.assign(new Error(`Peer error: ${message.reason}`), {
      peerReason: message.reason,
      peerDetail: message.detail,
      peerStage: message.stage,
      peerEndpoint: message.endpoint,
      peerSourceDeviceId: message.sourceDeviceId,
      peerTargetDeviceId: message.targetDeviceId,
    });
  }

  private async handleIncoming(message: PeerMessage): Promise<void> {
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
      this.warn("收到 peer:error", {
        requestId: message.requestId,
        expectedResponseType: pending.expectedResponseType,
        elapsedMs: Date.now() - pending.startedAt,
        reason: errMsg.reason,
        detail: errMsg.detail,
        stage: errMsg.stage,
        endpoint: errMsg.endpoint,
      });
      pending.reject(this.buildPeerError(errMsg));
      return;
    }

    if (message.type !== pending.expectedResponseType) {
      return;
    }

    if (message.type === "peer:fetch-response") {
      const fetchMsg = message as PeerFetchResponse;
      const acc = pending.accumulator as FetchAccumulator;
      const payload = await this.decodeFetchResponse(fetchMsg);
      acc.envelopes.push(...payload.envelopes);
      this.log("收到 fetch-response 批次", {
        requestId: message.requestId,
        batchCount: payload.envelopes.length,
        accumulatedCount: acc.envelopes.length,
        hasMore: payload.hasMore,
        elapsedMs: Date.now() - pending.startedAt,
      });
      if (!payload.hasMore) {
        clearTimeout(pending.timer);
        this.pending.delete(message.requestId);
        pending.resolve(acc.envelopes);
      }
      return;
    }

    clearTimeout(pending.timer);
    this.pending.delete(message.requestId);
    this.log("收到回應並結束等待", {
      requestId: message.requestId,
      responseType: message.type,
      elapsedMs: Date.now() - pending.startedAt,
    });
    pending.resolve(message);
  }

  private nextRequestId(prefix: string): string {
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }

  private registerPending<T>(
    requestId: string,
    expectedResponseType: PeerMessage["type"],
    timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
    accumulator?: unknown,
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const startedAt = Date.now();
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        this.warn("等待 peer 回應逾時", {
          requestId,
          expectedResponseType,
          timeoutMs,
          elapsedMs: Date.now() - startedAt,
        });
        reject(new Error(`Peer request ${requestId} timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      this.pending.set(requestId, {
        resolve: resolve as (value: unknown) => void,
        reject,
        expectedResponseType,
        timer,
        startedAt,
        accumulator,
      });
    });
  }

  private async decodeHashResponse(
    targetDeviceId: string,
    response: PeerHashResponse,
  ): Promise<{ buckets: PeerBucketHash[]; rootHash: string; totalCount: number }> {
    if (response.encryptedPayload && response.sessionId) {
      return this.crypto.decrypt(targetDeviceId, response.sessionId, response.encryptedPayload);
    }
    return {
      buckets: response.buckets ?? [],
      rootHash: response.rootHash ?? "",
      totalCount: response.totalCount ?? 0,
    };
  }

  private async decodeManifestResponse(
    targetDeviceId: string,
    response: PeerManifestResponse,
  ): Promise<{ entries: PeerManifestEntry[]; totalCount: number }> {
    if (response.encryptedPayload && response.sessionId) {
      return this.crypto.decrypt(targetDeviceId, response.sessionId, response.encryptedPayload);
    }
    return {
      entries: response.entries ?? [],
      totalCount: response.totalCount ?? 0,
    };
  }

  private async decodeFetchResponse(
    response: PeerFetchResponse,
  ): Promise<{ envelopes: SelfHostedSyncEntityEnvelope[]; hasMore: boolean; nextCursor: number | null }> {
    if (response.encryptedPayload && response.sessionId) {
      return this.crypto.decrypt(response.sourceDeviceId, response.sessionId, response.encryptedPayload);
    }
    return {
      envelopes: response.envelopes ?? [],
      hasMore: response.hasMore ?? false,
      nextCursor: response.nextCursor ?? null,
    };
  }

  private async decodeApplyResponse(
    targetDeviceId: string,
    response: PeerApplyResponse,
  ): Promise<PeerApplyResponse> {
    if (!response.encryptedPayload || !response.sessionId) {
      return {
        ...response,
        applied: response.applied ?? 0,
        rejected: response.rejected ?? [],
      };
    }
    const payload = await this.crypto.decrypt<{
      applied: number;
      rejected: NonNullable<PeerApplyResponse["rejected"]>;
      serverTime?: number;
    }>(targetDeviceId, response.sessionId, response.encryptedPayload);
    return {
      ...response,
      applied: payload.applied,
      rejected: payload.rejected,
      serverTime: payload.serverTime,
    };
  }

  async openSession(targetDeviceId: string): Promise<string> {
    if (!isPeerSyncSocketOpen()) {
      throw new Error("WebSocket 未連線，無法進行同步");
    }
    const requestId = this.nextRequestId("session");
    const promise = this.registerPending<PeerSessionAnswer>(requestId, "peer:session-answer");
    const offer = await this.crypto.createOffer(targetDeviceId);
    this.log("發送 peer session offer", {
      requestId,
      targetDeviceId,
      sessionId: offer.sessionId,
    });
    try {
      sendPeerMessage({
        type: "peer:session-offer",
        requestId,
        targetDeviceId,
        sessionId: offer.sessionId,
        publicKeyJwk: offer.publicKeyJwk,
      });
      const response = await promise;
      if (response.sessionId !== offer.sessionId) {
        throw new Error("peer-session-mismatch");
      }
      await this.crypto.finalizeAnswer(targetDeviceId, offer.sessionId, response.publicKeyJwk);
      return offer.sessionId;
    } catch (error) {
      this.crypto.dropSession(targetDeviceId, offer.sessionId);
      throw error;
    }
  }

  closeSession(targetDeviceId: string, sessionId: string): void {
    this.crypto.dropSession(targetDeviceId, sessionId);
  }

  async requestRemoteManifest(
    targetDeviceId: string,
    entityTypes?: SelfHostedSyncEntityType[],
    sessionId?: string,
  ): Promise<PeerManifestEntry[]> {
    if (!isPeerSyncSocketOpen()) {
      throw new Error("WebSocket 未連線，無法進行同步");
    }
    const requestId = this.nextRequestId("manifest");
    const promise = this.registerPending<PeerManifestResponse>(requestId, "peer:manifest-response");
    sendPeerMessage({
      type: "peer:manifest-request",
      requestId,
      targetDeviceId,
      ...(entityTypes && entityTypes.length > 0 ? { entityTypes } : {}),
      ...(sessionId ? { sessionId } : {}),
    });
    const response = await promise;
    const payload = await this.decodeManifestResponse(targetDeviceId, response);
    return payload.entries;
  }

  async requestRemoteBucketHashes(
    targetDeviceId: string,
    sessionId?: string,
  ): Promise<{ buckets: PeerBucketHash[]; rootHash: string; totalCount: number }> {
    if (!isPeerSyncSocketOpen()) {
      throw new Error("WebSocket 未連線，無法進行同步");
    }
    const requestId = this.nextRequestId("hash");
    const promise = this.registerPending<PeerHashResponse>(requestId, "peer:hash-response");
    sendPeerMessage({
      type: "peer:hash-request",
      requestId,
      targetDeviceId,
      ...(sessionId ? { sessionId } : {}),
    });
    const response = await promise;
    return this.decodeHashResponse(targetDeviceId, response);
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

  diffBucketHashes(
    local: PeerBucketHash[],
    remote: PeerBucketHash[],
  ): { differingTypes: SelfHostedSyncEntityType[]; matchedTypes: SelfHostedSyncEntityType[] } {
    return diffBuckets(local, remote);
  }

  async collectLocalManifest(): Promise<PeerManifestEntry[]> {
    const service = getSelfHostedSyncService();
    const envelopes = await service.collectAllEnvelopesForManifest();
    return envelopes.map((item) => ({
      entityType: item.entityType,
      entityId: item.entityId,
      updatedAt: item.updatedAt,
      deletedAt: item.deletedAt,
    }));
  }

  computeDiff(local: PeerManifestEntry[], remote: PeerManifestEntry[]) {
    const keyOf = (entry: PeerManifestEntry) => `${entry.entityType}::${entry.entityId}`;
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
    const conflicts: Array<{ local: PeerManifestEntry; remote: PeerManifestEntry }> = [];
    let identicalCount = 0;
    for (const [key, localEntry] of localMap) {
      const remoteEntry = remoteMap.get(key);
      if (!remoteEntry) {
        onlyLocal.push(localEntry);
        continue;
      }
      if (localEntry.updatedAt === remoteEntry.updatedAt) {
        identicalCount += 1;
      } else if (localEntry.updatedAt > remoteEntry.updatedAt) {
        onlyLocal.push(localEntry);
      } else {
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
    sessionId: string,
  ): Promise<SelfHostedSyncEntityEnvelope[]> {
    if (entityRefs.length === 0) return [];
    if (!isPeerSyncSocketOpen()) {
      throw new Error("WebSocket 未連線，無法進行同步");
    }
    const accumulator: FetchAccumulator = { envelopes: [] };
    const requestId = this.nextRequestId("fetch");
    const promise = this.registerPending<SelfHostedSyncEntityEnvelope[]>(
      requestId,
      "peer:fetch-response",
      FETCH_REQUEST_TIMEOUT_MS,
      accumulator,
    );
    const encryptedPayload = await this.crypto.encrypt(targetDeviceId, sessionId, {
      entityRefs,
      cursor: null,
    });
    sendPeerMessage({
      type: "peer:fetch-request",
      requestId,
      targetDeviceId,
      sessionId,
      encryptedPayload,
    });
    return promise;
  }

  async requestApply(
    targetDeviceId: string,
    envelopes: SelfHostedSyncEntityEnvelope[],
    sessionId: string,
  ): Promise<PeerApplyResponse> {
    if (!isPeerSyncSocketOpen()) {
      throw new Error("WebSocket 未連線，無法進行同步");
    }
    let applied = 0;
    const rejected: NonNullable<PeerApplyResponse["rejected"]> = [];
    let lastServerTime: number | undefined;

    const buildBatches = (): SelfHostedSyncEntityEnvelope[][] => {
      const batches: SelfHostedSyncEntityEnvelope[][] = [];
      let current: SelfHostedSyncEntityEnvelope[] = [];
      let currentBytes = 0;
      for (const env of envelopes) {
        const envBytes = JSON.stringify(env).length;
        if (
          current.length > 0 &&
          (current.length >= APPLY_BATCH_SIZE || currentBytes + envBytes > APPLY_BATCH_MAX_BYTES)
        ) {
          batches.push(current);
          current = [];
          currentBytes = 0;
        }
        current.push(env);
        currentBytes += envBytes;
      }
      if (current.length > 0) {
        batches.push(current);
      }
      return batches;
    };

    const batches = buildBatches();
    const batchPromises = batches.map(async (batch) => {
      const requestId = this.nextRequestId("apply");
      const promise = this.registerPending<PeerApplyResponse>(
        requestId,
        "peer:apply-response",
        APPLY_REQUEST_TIMEOUT_MS,
      );
      const encryptedPayload = await this.crypto.encrypt(targetDeviceId, sessionId, {
        envelopes: batch,
        mode: "overwrite" as const,
      });
      sendPeerMessage({
        type: "peer:apply-request",
        requestId,
        targetDeviceId,
        sessionId,
        encryptedPayload,
      });
      const response = await promise;
      return this.decodeApplyResponse(targetDeviceId, response);
    });

    const responses = await Promise.all(batchPromises);
    for (const response of responses) {
      applied += response.applied ?? 0;
      if (response.rejected?.length) {
        rejected.push(...response.rejected);
      }
      lastServerTime = response.serverTime ?? lastServerTime;
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

  async applyEnvelopesLocally(envelopes: SelfHostedSyncEntityEnvelope[]): Promise<number> {
    if (envelopes.length === 0) return 0;
    const service = getSelfHostedSyncService();
    const pseudoResponse: SelfHostedSyncPullResponse = {
      serverTime: Date.now(),
      items: envelopes,
      hasMore: false,
      nextSince: undefined,
    };
    return service.applyPullResponsePublic(pseudoResponse, {
      forceOverwrite: true,
    });
  }
}

let instance: PeerSyncSecureManager | null = null;

export function getPeerSyncManager(): PeerSyncSecureManager {
  if (!instance) {
    instance = new PeerSyncSecureManager();
  }
  return instance;
}

export function disposePeerSyncManager(): void {
  instance?.dispose();
  instance = null;
}

export type { PeerSyncSecureManager as PeerSyncManager };
