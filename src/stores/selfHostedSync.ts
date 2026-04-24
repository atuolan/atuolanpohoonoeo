import { db, DB_STORES } from "@/db/database";
import { SelfHostedSyncClient } from "@/services/SelfHostedSyncClient";
import type {
  SelfHostedSyncGuardAlert,
  SelfHostedSyncMetaDeviceInfo,
  SelfHostedSyncMetaResponse,
} from "@/types/selfHostedSync";
import { DeviceFingerprintCollector } from "@/utils/deviceFingerprint";
import { defineStore } from "pinia";
import { computed, ref } from "vue";

const SETTINGS_KEY = "self-hosted-sync-settings";
const DEFAULT_SELF_HOSTED_SYNC_SERVER_URL = "http://127.0.0.1:3004";

type SyncStatus = "idle" | "connecting" | "syncing" | "success" | "error";

interface PersistedSelfHostedSyncSettings {
  id: string;
  enabled: boolean;
  serverUrl: string;
  username: string;
  accessToken: string | null;
  refreshToken: string | null;
  userId: string | null;
  deviceId: string;
  lastSyncAt: number | null;
  syncStatus: SyncStatus;
  syncError: string | null;
  lastConnectionCheckAt: number | null;
  serverStatusOk: boolean | null;
  serverApiVersion: string | null;
  lastServerTime: number | null;
  lastRemoteUpdateAt: number | null;
  guardAlert: SelfHostedSyncGuardAlert | null;
  lastPushedServerTime: number | null;
  lastPushedUpdatedAt: number | null;
  /** 使用者為這台裝置設定的自訂名稱（持久化於本機） */
  customDeviceName: string | null;
}

export const useSelfHostedSyncStore = defineStore("selfHostedSync", () => {
  const isLoaded = ref(false);
  const isLoading = ref(false);

  const enabled = ref(false);
  const serverUrl = ref("");
  const username = ref("");
  const accessToken = ref<string | null>(null);
  const refreshToken = ref<string | null>(null);
  const userId = ref<string | null>(null);
  const deviceId = ref("");
  const lastSyncAt = ref<number | null>(null);
  const syncStatus = ref<SyncStatus>("idle");
  const syncError = ref<string | null>(null);
  const lastConnectionCheckAt = ref<number | null>(null);
  const serverStatusOk = ref<boolean | null>(null);
  const serverApiVersion = ref<string | null>(null);
  const lastServerTime = ref<number | null>(null);
  const lastRemoteUpdateAt = ref<number | null>(null);
  const guardAlert = ref<SelfHostedSyncGuardAlert | null>(null);
  const lastPushedServerTime = ref<number | null>(null);
  const lastPushedUpdatedAt = ref<number | null>(null);
  const customDeviceName = ref<string | null>(null);
  const devices = ref<SelfHostedSyncMetaDeviceInfo[]>([]);
  const onlineDeviceIds = ref<string[]>([]);
  const lastPresenceAt = ref<number | null>(null);

  let loadingPromise: Promise<void> | null = null;

  const isConfigured = computed(() => !!serverUrl.value.trim());
  const isAuthenticated = computed(() => !!accessToken.value && !!refreshToken.value);
  const hasGuardAlert = computed(() => guardAlert.value !== null);
  const onlineCount = computed(() => onlineDeviceIds.value.length);
  const isCurrentDeviceOnline = computed(
    () => !!deviceId.value && onlineDeviceIds.value.includes(deviceId.value),
  );

  /**
   * 同步 peer 清單：真實裝置 + 虛擬 @server。供 SettingsScreen 迭代顯示按鈕。
   * 依在線狀態 + lastPushAt 排序；排除本機裝置（不對自己同步）。
   */
  const peerList = computed(() => {
    const list: Array<{
      deviceId: string;
      isServer: boolean;
      isSelf: boolean;
      online: boolean;
      lastPushAt: number | null;
      lastSeenAt: number | null;
      model: string | null;
      customName: string | null;
    }> = [];

    if (isAuthenticated.value) {
      list.push({
        deviceId: "@server",
        isServer: true,
        isSelf: false,
        online: serverStatusOk.value !== false,
        lastPushAt: lastRemoteUpdateAt.value,
        lastSeenAt: lastServerTime.value,
        model: null,
        customName: null,
      });
    }

    for (const d of devices.value) {
      if (d.deviceId === deviceId.value) continue;
      list.push({
        deviceId: d.deviceId,
        isServer: false,
        isSelf: false,
        online: !!d.online,
        lastPushAt: d.lastPushAt ?? null,
        lastSeenAt: d.lastSeenAt ?? null,
        model: d.model ?? null,
        customName: d.customName ?? null,
      });
    }

    return list;
  });

  function isAuthRetryableError(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error);
    return (
      message.includes("(401)") ||
      message.includes("(403)") ||
      message.includes("access token is missing")
    );
  }

  async function loadSettings(): Promise<void> {
    if (isLoading.value && loadingPromise) {
      await loadingPromise;
      return;
    }

    isLoading.value = true;

    const doLoad = async () => {
      try {
        const saved = await db.get<PersistedSelfHostedSyncSettings>(
          DB_STORES.APP_SETTINGS,
          SETTINGS_KEY,
        );

        if (saved) {
          enabled.value = saved.enabled ?? false;
          serverUrl.value = saved.serverUrl ?? "";
          username.value = saved.username ?? "";
          accessToken.value = saved.accessToken ?? null;
          refreshToken.value = saved.refreshToken ?? null;
          userId.value = saved.userId ?? null;
          deviceId.value = saved.deviceId ?? "";
          lastSyncAt.value = saved.lastSyncAt ?? null;
          syncStatus.value = saved.syncStatus ?? "idle";
          syncError.value = saved.syncError ?? null;
          lastConnectionCheckAt.value = saved.lastConnectionCheckAt ?? null;
          serverStatusOk.value = saved.serverStatusOk ?? null;
          serverApiVersion.value = saved.serverApiVersion ?? null;
          lastServerTime.value = saved.lastServerTime ?? null;
          lastRemoteUpdateAt.value = saved.lastRemoteUpdateAt ?? null;
          guardAlert.value = saved.guardAlert ?? null;
          lastPushedServerTime.value = saved.lastPushedServerTime ?? null;
          lastPushedUpdatedAt.value = saved.lastPushedUpdatedAt ?? null;
          customDeviceName.value = saved.customDeviceName ?? null;
        } else {
          serverUrl.value = DEFAULT_SELF_HOSTED_SYNC_SERVER_URL;
        }

        if (!deviceId.value) {
          await ensureDeviceId();
          await saveSettings();
        }

        isLoaded.value = true;
      } catch (error) {
        console.error("[SelfHostedSyncStore] 載入設定失敗:", error);
      } finally {
        isLoading.value = false;
        loadingPromise = null;
      }
    };

    loadingPromise = doLoad();
    await loadingPromise;
  }

  async function saveSettings(): Promise<void> {
    try {
      const plainData = JSON.parse(
        JSON.stringify({
          id: SETTINGS_KEY,
          enabled: enabled.value,
          serverUrl: serverUrl.value.trim(),
          username: username.value.trim(),
          accessToken: accessToken.value,
          refreshToken: refreshToken.value,
          userId: userId.value,
          deviceId: deviceId.value,
          lastSyncAt: lastSyncAt.value,
          syncStatus: syncStatus.value,
          syncError: syncError.value,
          lastConnectionCheckAt: lastConnectionCheckAt.value,
          serverStatusOk: serverStatusOk.value,
          serverApiVersion: serverApiVersion.value,
          lastServerTime: lastServerTime.value,
          lastRemoteUpdateAt: lastRemoteUpdateAt.value,
          guardAlert: guardAlert.value,
          lastPushedServerTime: lastPushedServerTime.value,
          lastPushedUpdatedAt: lastPushedUpdatedAt.value,
          customDeviceName: customDeviceName.value,
        } satisfies PersistedSelfHostedSyncSettings),
      );
      await db.put(DB_STORES.APP_SETTINGS, plainData);
    } catch (error) {
      console.error("[SelfHostedSyncStore] 儲存設定失敗:", error);
      throw error;
    }
  }

  async function refreshStatus(): Promise<void> {
    syncStatus.value = "connecting";
    syncError.value = null;

    try {
      await ensureDeviceId();
      const result = await runSyncActionWithRetry(() => createClient().getStatus());
      serverStatusOk.value = result.ok;
      serverApiVersion.value = result.apiVersion ?? null;
      lastServerTime.value = result.serverTime ?? null;
      if (result.userId) {
        userId.value = result.userId;
      }
      lastConnectionCheckAt.value = Date.now();
      syncStatus.value = "success";
      await saveSettings();
    } catch (error) {
      syncStatus.value = "error";
      syncError.value = error instanceof Error ? error.message : String(error);
      lastConnectionCheckAt.value = Date.now();
      await saveSettings();
      throw error;
    }
  }

  async function ensureDeviceId(): Promise<string> {
    if (deviceId.value) return deviceId.value;
    const fingerprint = await DeviceFingerprintCollector.generate();
    deviceId.value = fingerprint.fingerprint;
    return deviceId.value;
  }

  function createClient(): SelfHostedSyncClient {
    if (!serverUrl.value.trim()) {
      throw new Error("請先設定自架同步伺服器 URL");
    }

    return new SelfHostedSyncClient({
      serverUrl: serverUrl.value,
      accessToken: accessToken.value,
    });
  }

  async function refreshMeta(): Promise<SelfHostedSyncMetaResponse> {
    await ensureDeviceId();
    const result = await runSyncActionWithRetry(() => createClient().getMeta());
    lastServerTime.value = result.serverTime ?? null;
    lastRemoteUpdateAt.value = result.latestUpdateAt ?? null;
    lastConnectionCheckAt.value = Date.now();
    if (result.userId) {
      userId.value = result.userId;
    }
    const onlineIds = Array.isArray(result.onlineDeviceIds)
      ? result.onlineDeviceIds
      : (result.devices ?? [])
          .filter((d) => d.online)
          .map((d) => d.deviceId);
    const onlineSet = new Set(onlineIds);
    devices.value = (result.devices ?? []).map((d) => ({
      ...d,
      online: d.online ?? onlineSet.has(d.deviceId),
    }));
    onlineDeviceIds.value = onlineIds;
    lastPresenceAt.value = result.serverTime ?? Date.now();
    await saveSettings();
    return result;
  }

  /**
   * 將本機裝置的 model（自動偵測）與 customName（使用者自訂）上傳到 server。
   * - 只有在已登入時才會呼叫
   * - 失敗不拋例外，只記 console（屬於 best-effort 的裝飾性功能）
   */
  async function publishDeviceInfo(options?: {
    model?: string | null;
    customName?: string | null;
  }): Promise<void> {
    if (!isAuthenticated.value) return;
    await ensureDeviceId();

    let modelToSend: string | null | undefined = options?.model;
    if (modelToSend === undefined) {
      try {
        const { detectDeviceModel } = await import("@/utils/deviceModel");
        modelToSend = await detectDeviceModel();
      } catch {
        modelToSend = undefined;
      }
    }

    const payload: { model?: string | null; customName?: string | null } = {};
    if (modelToSend !== undefined) payload.model = modelToSend;
    if (options && "customName" in options) {
      payload.customName = options.customName ?? null;
    } else {
      // 若呼叫端沒指定 customName，就把本機持久化的值一併送出，確保 server 與 client 一致
      payload.customName = customDeviceName.value;
    }

    if (Object.keys(payload).length === 0) return;

    try {
      const result = await runSyncActionWithRetry(() =>
        createClient().updateDeviceInfo(payload),
      );
      // 把結果寫回本機 devices 快取，讓 UI 立刻更新
      applyRemoteDeviceInfo({
        deviceId: result.device.deviceId,
        model: result.device.model ?? null,
        customName: result.device.customName ?? null,
        lastPushAt: result.device.lastPushAt ?? null,
        lastSeenAt: result.device.lastSeenAt ?? null,
      });
    } catch (error) {
      console.warn("[SelfHostedSyncStore] publishDeviceInfo 失敗:", error);
    }
  }

  /** 使用者在 UI 輸入新名稱時呼叫。null / 空字串表示清除自訂名稱。 */
  async function setCustomDeviceName(name: string | null): Promise<void> {
    const trimmed = typeof name === "string" ? name.trim() : "";
    const next = trimmed.length === 0 ? null : trimmed;
    customDeviceName.value = next;
    await saveSettings();
    await publishDeviceInfo({ customName: next });
  }

  /**
   * 套用從 server 收到的 device:info 廣播，或 updateDeviceInfo 的回覆。
   * 只更新現有條目的欄位，不改變 online 狀態。
   */
  function applyRemoteDeviceInfo(info: {
    deviceId: string;
    model?: string | null;
    customName?: string | null;
    lastPushAt?: number | null;
    lastSeenAt?: number | null;
  }): void {
    if (!info.deviceId) return;
    const idx = devices.value.findIndex((d) => d.deviceId === info.deviceId);
    if (idx >= 0) {
      const prev = devices.value[idx];
      devices.value[idx] = {
        ...prev,
        model: info.model ?? prev.model ?? null,
        customName: info.customName ?? prev.customName ?? null,
        lastPushAt: info.lastPushAt ?? prev.lastPushAt ?? null,
        lastSeenAt: info.lastSeenAt ?? prev.lastSeenAt ?? null,
      };
    } else {
      devices.value.push({
        deviceId: info.deviceId,
        model: info.model ?? null,
        customName: info.customName ?? null,
        lastPushAt: info.lastPushAt ?? null,
        lastSeenAt: info.lastSeenAt ?? null,
        online: onlineDeviceIds.value.includes(info.deviceId),
      });
    }
  }

  function updatePresence(payload: {
    onlineDeviceIds?: string[] | null;
    onlineCount?: number | null;
    serverTime?: number | null;
  }): void {
    if (!Array.isArray(payload.onlineDeviceIds)) return;
    const nextOnline = payload.onlineDeviceIds;
    onlineDeviceIds.value = nextOnline;
    lastPresenceAt.value = payload.serverTime ?? Date.now();
    const onlineSet = new Set(nextOnline);
    devices.value = devices.value.map((d) => ({
      ...d,
      online: onlineSet.has(d.deviceId),
    }));
    // Include any online deviceId we didn't know about yet (new device just connected).
    for (const id of nextOnline) {
      if (!devices.value.some((d) => d.deviceId === id)) {
        devices.value.push({
          deviceId: id,
          lastPushAt: null,
          lastSeenAt: payload.serverTime ?? Date.now(),
          online: true,
        });
      }
    }
  }

  async function testConnection(): Promise<void> {
    syncStatus.value = "connecting";
    syncError.value = null;

    try {
      await ensureDeviceId();
      const client = createClient();
      const result = await client.testConnection();
      lastConnectionCheckAt.value = Date.now();
      serverStatusOk.value = result.ok;
      serverApiVersion.value = result.version ?? null;
      lastServerTime.value = result.serverTime ?? null;
      syncStatus.value = "success";
      await saveSettings();
    } catch (error) {
      syncStatus.value = "error";
      syncError.value = error instanceof Error ? error.message : String(error);
      lastConnectionCheckAt.value = Date.now();
      await saveSettings();
      throw error;
    }
  }

  async function register(password: string): Promise<void> {
    syncStatus.value = "connecting";
    syncError.value = null;

    try {
      const normalizedUsername = username.value.trim();
      if (!normalizedUsername) {
        throw new Error("請先輸入同步帳號");
      }
      await ensureDeviceId();
      const client = createClient();
      const result = await client.register({
        username: normalizedUsername,
        password,
        deviceId: deviceId.value,
      });
      accessToken.value = result.accessToken;
      refreshToken.value = result.refreshToken;
      userId.value = result.userId;
      enabled.value = true;
      syncStatus.value = "success";
      syncError.value = null;
      await saveSettings();
    } catch (error) {
      syncStatus.value = "error";
      syncError.value = error instanceof Error ? error.message : String(error);
      await saveSettings();
      throw error;
    }
  }

  async function login(password: string): Promise<void> {
    syncStatus.value = "connecting";
    syncError.value = null;

    try {
      const normalizedUsername = username.value.trim();
      if (!normalizedUsername) {
        throw new Error("請先輸入同步帳號");
      }
      await ensureDeviceId();
      const client = createClient();
      const result = await client.login({
        username: normalizedUsername,
        password,
        deviceId: deviceId.value,
      });
      accessToken.value = result.accessToken;
      refreshToken.value = result.refreshToken;
      userId.value = result.userId;
      enabled.value = true;
      syncStatus.value = "success";
      syncError.value = null;
      await saveSettings();
    } catch (error) {
      syncStatus.value = "error";
      syncError.value = error instanceof Error ? error.message : String(error);
      await saveSettings();
      throw error;
    }
  }

  /**
   * 智慧登入：先嘗試 login，若帳號不存在（401）就自動 register。
   * 若 register 回 409（帳號已存在）代表第一次 login 的 401 是密碼錯誤。
   * @returns "login" 表示登入既有帳號；"register" 表示新建帳號
   */
  async function loginOrRegister(
    password: string,
  ): Promise<"login" | "register"> {
    syncStatus.value = "connecting";
    syncError.value = null;

    try {
      const normalizedUsername = username.value.trim();
      if (!normalizedUsername) {
        throw new Error("請先輸入同步帳號");
      }
      if (!password.trim()) {
        throw new Error("請先輸入同步密碼");
      }
      await ensureDeviceId();
      const client = createClient();

      // 1. 先試登入
      try {
        const result = await client.login({
          username: normalizedUsername,
          password,
          deviceId: deviceId.value,
        });
        accessToken.value = result.accessToken;
        refreshToken.value = result.refreshToken;
        userId.value = result.userId;
        enabled.value = true;
        syncStatus.value = "success";
        syncError.value = null;
        await saveSettings();
        return "login";
      } catch (loginError) {
        const msg = loginError instanceof Error ? loginError.message : String(loginError);
        // 不是 401 就直接丟出（例如網路錯誤、伺服器掛掉）
        if (!msg.includes("(401)")) {
          throw loginError;
        }

        // 2. 401 → 帳號不存在或密碼錯；嘗試 register
        try {
          const result = await client.register({
            username: normalizedUsername,
            password,
            deviceId: deviceId.value,
          });
          accessToken.value = result.accessToken;
          refreshToken.value = result.refreshToken;
          userId.value = result.userId;
          enabled.value = true;
          syncStatus.value = "success";
          syncError.value = null;
          await saveSettings();
          return "register";
        } catch (registerError) {
          const rMsg = registerError instanceof Error ? registerError.message : String(registerError);
          // 409 = 帳號已存在 → 代表剛剛 login 401 的原因是「密碼錯誤」
          if (rMsg.includes("(409)")) {
            throw new Error("密碼錯誤：此帳號已存在，請確認密碼");
          }
          throw registerError;
        }
      }
    } catch (error) {
      syncStatus.value = "error";
      syncError.value = error instanceof Error ? error.message : String(error);
      await saveSettings();
      throw error;
    }
  }

  async function refreshSession(): Promise<void> {
    syncStatus.value = "connecting";
    syncError.value = null;

    try {
      if (!refreshToken.value) {
        throw new Error("缺少 refresh token");
      }
      await ensureDeviceId();
      const client = createClient();
      const result = await client.refreshAccessToken({
        refreshToken: refreshToken.value,
        deviceId: deviceId.value,
      });
      accessToken.value = result.accessToken;
      refreshToken.value = result.refreshToken;
      userId.value = result.userId;
      syncStatus.value = "success";
      await saveSettings();
    } catch (error) {
      syncStatus.value = "error";
      syncError.value = error instanceof Error ? error.message : String(error);
      await saveSettings();
      throw error;
    }
  }

  async function logout(): Promise<void> {
    enabled.value = false;
    accessToken.value = null;
    refreshToken.value = null;
    userId.value = null;
    guardAlert.value = null;
    syncStatus.value = "idle";
    syncError.value = null;
    // 登出後下次登入可能是另一個帳號 / 伺服器，cutoff 已失去意義。
    lastPushedServerTime.value = null;
    lastPushedUpdatedAt.value = null;
    await saveSettings();
  }

  async function setGuardAlert(alert: SelfHostedSyncGuardAlert): Promise<void> {
    guardAlert.value = alert;
    syncStatus.value = "error";
    syncError.value = alert.message;
    await saveSettings();
  }

  async function clearGuardAlert(): Promise<void> {
    guardAlert.value = null;
    if (syncStatus.value === "error" && syncError.value) {
      syncStatus.value = isAuthenticated.value ? "idle" : "error";
      if (isAuthenticated.value) {
        syncError.value = null;
      }
    }
    await saveSettings();
  }

  async function runSyncActionWithRetry<T>(action: () => Promise<T>): Promise<T> {
    try {
      return await action();
    } catch (error) {
      if (!isAuthRetryableError(error) || !refreshToken.value) {
        throw error;
      }

      try {
        await refreshSession();
      } catch (refreshError) {
        // Refresh token 本身失效 → 直接登出，讓 UI 回到登入狀態
        const msg = refreshError instanceof Error ? refreshError.message : String(refreshError);
        if (msg.includes("401") || msg.toLowerCase().includes("invalid or expired")) {
          await logout();
        }
        throw refreshError;
      }
      return action();
    }
  }

  async function getSyncService() {
    const { getSelfHostedSyncService } = await import(
      "@/services/SelfHostedSyncService"
    );
    return getSelfHostedSyncService();
  }

  async function pushNow(options?: { forceFull?: boolean }) {
    await loadSettings();
    const syncService = await getSyncService();
    return runSyncActionWithRetry(() => syncService.pushAll(options));
  }

  async function pullNow(since?: number, options?: { forceOverwrite?: boolean }) {
    await loadSettings();
    const syncService = await getSyncService();
    // 預設不強制覆蓋：依 updatedAt 比較，保留本機較新的資料（避免 API profiles 被空/舊的 server 資料覆蓋）。
    // 只有在 Guard 警示「確認從遠端拉回」這類明確指令時才傳 forceOverwrite=true。
    return runSyncActionWithRetry(() =>
      syncService.pullAll(since, {
        forceOverwrite: options?.forceOverwrite === true,
      }),
    );
  }

  async function syncNow() {
    await loadSettings();
    const syncService = await getSyncService();
    return runSyncActionWithRetry(() => syncService.syncNow());
  }

  // ===== Peer-to-peer 同步（Phase 1） =====

  type PeerSyncOutcome = {
    direction: "push" | "pull";
    targetDeviceId: string;
    applied: number;
    conflictCount: number;
    conflictsAborted: boolean;
    rejectedByUser?: boolean;
  };

  async function peerSync(
    direction: "push" | "pull",
    targetDeviceId: string,
  ): Promise<PeerSyncOutcome> {
    const LOG_TAG = "[peerSync]";
    console.log(LOG_TAG, "開始", { direction, targetDeviceId });
    await loadSettings();
    const { getPeerSyncManager } = await import(
      "@/services/PeerSyncManager"
    );
    const manager = getPeerSyncManager();

    syncStatus.value = "syncing";
    syncError.value = null;
    try {
      // ===== Step A：先交換 bucket-level hash，判斷哪些 entityType 需要完整 manifest =====
      console.log(LOG_TAG, "1/4 並行交換 bucket hash");
      const [localHashInfo, remoteHashInfo] = await Promise.all([
        manager.collectLocalBucketHashes(),
        manager.requestRemoteBucketHashes(targetDeviceId),
      ]);
      console.log(LOG_TAG, "bucket hash 取得完成", {
        localRootHash: localHashInfo.rootHash,
        remoteRootHash: remoteHashInfo.rootHash,
        localTotal: localHashInfo.totalCount,
        remoteTotal: remoteHashInfo.totalCount,
        localBuckets: localHashInfo.buckets.length,
        remoteBuckets: remoteHashInfo.buckets.length,
      });

      // 完整一致 → 根本不需要傳 manifest
      if (localHashInfo.rootHash === remoteHashInfo.rootHash) {
        console.log(LOG_TAG, "rootHash 完全一致，兩端已同步，跳過");
        await markSyncSucceeded(Date.now());
        return {
          direction,
          targetDeviceId,
          applied: 0,
          conflictCount: 0,
          conflictsAborted: false,
        };
      }

      const { differingTypes, matchedTypes } = manager.diffBucketHashes(
        localHashInfo.buckets,
        remoteHashInfo.buckets,
      );
      console.log(LOG_TAG, "bucket diff 計算完成", {
        differingTypes,
        matchedCount: matchedTypes.length,
      });

      // ===== Step B：只對有差異的 entityType 交換完整 manifest =====
      console.log(LOG_TAG, "2/4 對差異類別請求 manifest", { differingTypes });
      // 本機的 entries 已在 collectLocalBucketHashes 取得，filter 一下即可
      const differingSet = new Set(differingTypes);
      const localManifest = localHashInfo.entries.filter((e) =>
        differingSet.has(e.entityType),
      );
      const remoteManifest = await manager.requestRemoteManifest(
        targetDeviceId,
        differingTypes,
      );
      console.log(LOG_TAG, "manifest 取得完成（僅差異類別）", {
        local: localManifest.length,
        remote: remoteManifest.length,
      });
      const diff = manager.computeDiff(localManifest, remoteManifest);
      console.log(LOG_TAG, "3/4 diff 計算完成", {
        onlyLocal: diff.onlyLocal.length,
        onlyRemote: diff.onlyRemote.length,
        conflicts: diff.conflicts.length,
        identical: diff.identicalCount,
      });

      // Phase 1：遇到衝突直接中止並回報
      if (diff.conflicts.length > 0) {
        syncStatus.value = "idle";
        return {
          direction,
          targetDeviceId,
          applied: 0,
          conflictCount: diff.conflicts.length,
          conflictsAborted: true,
        };
      }

      let applied = 0;
      if (direction === "push") {
        // 推送：把 onlyLocal 的完整 envelope 送給對方
        if (diff.onlyLocal.length > 0) {
          const wantRefs = diff.onlyLocal.map((e) => ({
            entityType: e.entityType,
            entityId: e.entityId,
          }));
          const allLocal = await (
            await import("@/services/SelfHostedSyncService")
          )
            .getSelfHostedSyncService()
            .collectAllEnvelopesForManifest();
          const byKey = new Map(
            allLocal.map((env) => [`${env.entityType}::${env.entityId}`, env]),
          );
          const envelopes = wantRefs
            .map((r) => byKey.get(`${r.entityType}::${r.entityId}`))
            .filter(
              (e): e is NonNullable<typeof e> => e !== undefined,
            );
          console.log(LOG_TAG, "4/4 推送 envelope", {
            count: envelopes.length,
          });
          const resp = await manager.requestApply(targetDeviceId, envelopes);
          applied = resp.applied;
          const rejectedByUser = resp.rejected?.some((r) => r.reason === "rejected-by-user") ?? false;
          console.log(LOG_TAG, "推送完成", { applied, rejected: resp.rejected });
          if (rejectedByUser) {
            await markSyncSucceeded(Date.now());
            return {
              direction,
              targetDeviceId,
              applied: 0,
              conflictCount: 0,
              conflictsAborted: false,
              rejectedByUser: true,
            };
          }
        } else {
          console.log(LOG_TAG, "無需推送（onlyLocal=0）");
        }
      } else {
        // 拉取：從對方取 onlyRemote 的完整 envelope，寫入本機
        if (diff.onlyRemote.length > 0) {
          const refs = diff.onlyRemote.map((e) => ({
            entityType: e.entityType,
            entityId: e.entityId,
          }));
          console.log(LOG_TAG, "4/4 發送 fetch-request", { refs: refs.length });
          const envelopes = await manager.requestFetch(targetDeviceId, refs);
          console.log(LOG_TAG, "fetch 完成，準備寫入本機", {
            envelopeCount: envelopes.length,
          });
          applied = await manager.applyEnvelopesLocally(envelopes);
          console.log(LOG_TAG, "本機寫入完成", { applied });
        } else {
          console.log(LOG_TAG, "無需拉取（onlyRemote=0）");
        }
      }

      await markSyncSucceeded(Date.now());
      console.log(LOG_TAG, "完成", { direction, targetDeviceId, applied });

      // P2P pull 成功後，順手把新拉進來的本機資料 push 到 server，
      // 保持 server 與其他裝置一致（best-effort，失敗不影響 peerSync 結果）。
      if (direction === "pull" && applied > 0) {
        void (async () => {
          try {
            console.log(LOG_TAG, "背景 push 到 server 以同步 server 快取");
            const syncService = await getSyncService();
            await runSyncActionWithRetry(() => syncService.pushAll());
          } catch (e) {
            console.warn(LOG_TAG, "背景 push 到 server 失敗（不影響本次 peerSync）", e);
          }
        })();
      }

      return {
        direction,
        targetDeviceId,
        applied,
        conflictCount: 0,
        conflictsAborted: false,
      };
    } catch (error) {
      await markSyncFailed(error);
      throw error;
    }
  }

  function setServerUrl(url: string): void {
    serverUrl.value = url;
  }

  function setUsername(value: string): void {
    username.value = value.trim();
  }

  function markSyncStarted(): void {
    syncStatus.value = "syncing";
    syncError.value = null;
  }

  async function markSyncSucceeded(timestamp: number = Date.now()): Promise<void> {
    lastSyncAt.value = timestamp;
    syncStatus.value = "success";
    syncError.value = null;
    await saveSettings();
  }

  async function markSyncFailed(error: unknown): Promise<void> {
    syncStatus.value = "error";
    syncError.value = error instanceof Error ? error.message : String(error);
    await saveSettings();
  }

  async function markPushCompleted(
    serverTime: number | null,
    maxUpdatedAt: number | null,
  ): Promise<void> {
    if (typeof serverTime === "number" && Number.isFinite(serverTime)) {
      lastPushedServerTime.value = serverTime;
    }
    if (typeof maxUpdatedAt === "number" && Number.isFinite(maxUpdatedAt)) {
      lastPushedUpdatedAt.value = Math.max(
        lastPushedUpdatedAt.value ?? 0,
        maxUpdatedAt,
      );
    }
    await saveSettings();
  }

  async function resetPushCutoff(): Promise<void> {
    lastPushedServerTime.value = null;
    lastPushedUpdatedAt.value = null;
    await saveSettings();
  }

  return {
    isLoaded,
    isLoading,
    enabled,
    serverUrl,
    username,
    accessToken,
    refreshToken,
    userId,
    deviceId,
    lastSyncAt,
    syncStatus,
    syncError,
    lastConnectionCheckAt,
    serverStatusOk,
    serverApiVersion,
    lastServerTime,
    lastRemoteUpdateAt,
    devices,
    onlineDeviceIds,
    onlineCount,
    isCurrentDeviceOnline,
    lastPresenceAt,
    peerList,
    isConfigured,
    isAuthenticated,
    hasGuardAlert,
    guardAlert,
    lastPushedServerTime,
    lastPushedUpdatedAt,
    updatePresence,
    customDeviceName,
    publishDeviceInfo,
    setCustomDeviceName,
    applyRemoteDeviceInfo,
    markPushCompleted,
    resetPushCutoff,
    peerSync,
    loadSettings,
    saveSettings,
    ensureDeviceId,
    createClient,
    refreshMeta,
    testConnection,
    refreshStatus,
    register,
    login,
    loginOrRegister,
    refreshSession,
    logout,
    pushNow,
    pullNow,
    syncNow,
    setServerUrl,
    setUsername,
    markSyncStarted,
    markSyncSucceeded,
    markSyncFailed,
    setGuardAlert,
    clearGuardAlert,
  };
});
