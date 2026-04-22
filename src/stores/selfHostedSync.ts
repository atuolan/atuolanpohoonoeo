import { db, DB_STORES } from "@/db/database";
import { SelfHostedSyncClient } from "@/services/SelfHostedSyncClient";
import type {
  SelfHostedSyncGuardAlert,
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

  let loadingPromise: Promise<void> | null = null;

  const isConfigured = computed(() => !!serverUrl.value.trim());
  const isAuthenticated = computed(() => !!accessToken.value && !!refreshToken.value);
  const hasGuardAlert = computed(() => guardAlert.value !== null);

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
    await saveSettings();
    return result;
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

      await refreshSession();
      return action();
    }
  }

  async function getSyncService() {
    const { getSelfHostedSyncService } = await import(
      "@/services/SelfHostedSyncService"
    );
    return getSelfHostedSyncService();
  }

  async function pushNow() {
    await loadSettings();
    const syncService = await getSyncService();
    return runSyncActionWithRetry(() => syncService.pushAll());
  }

  async function pullNow(since?: number) {
    await loadSettings();
    const syncService = await getSyncService();
    return runSyncActionWithRetry(() =>
      syncService.pullAll(since, {
        forceOverwrite: typeof since !== "number",
      }),
    );
  }

  async function syncNow() {
    await loadSettings();
    const syncService = await getSyncService();
    return runSyncActionWithRetry(() => syncService.syncNow());
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
    isConfigured,
    isAuthenticated,
    hasGuardAlert,
    guardAlert,
    loadSettings,
    saveSettings,
    ensureDeviceId,
    createClient,
    refreshMeta,
    testConnection,
    refreshStatus,
    register,
    login,
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
