/**
 * 同步帳號（HF Space 伺服器）的登入 / 登出 / 刷新。
 * 「背景執行」的 HF 後台生成和「跨裝置同步」都用同一組帳號。
 */
import { useSelfHostedSyncStore } from "@/stores/selfHostedSync";
import { computed, ref } from "vue";
import { DEFAULT_SYNC_SERVER_URL } from "../settingsOptions";

export function useSyncAccount() {
  const syncStore = useSelfHostedSyncStore();
  const password = ref("");
  const actionStatus = ref<"idle" | "running">("idle");
  const busy = computed(() => actionStatus.value === "running");

  async function login() {
    if (!syncStore.serverUrl.trim()) {
      alert("請先輸入伺服器 URL");
      return;
    }
    if (!syncStore.username.trim()) {
      alert("請先輸入同步帳號");
      return;
    }
    if (!password.value.trim()) {
      alert("請先輸入同步密碼");
      return;
    }

    actionStatus.value = "running";
    try {
      const pwd = password.value;
      const outcome = await syncStore.loginOrRegister(pwd);
      await syncStore.savePassword(pwd);
      password.value = "";
      try {
        await syncStore.refreshStatus();
      } catch (metaError) {
        console.warn("[Settings] loginOrRegister 後 refreshMeta 失敗:", metaError);
      }
      if (outcome === "register") {
        alert("已為你建立同步帳號並登入。此帳號密碼請記好，其他裝置需用同樣的帳號密碼才能同步。");
      }
    } catch (error) {
      console.error("[Settings] 同步帳號登入失敗:", error);
      alert(`登入失敗：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      actionStatus.value = "idle";
    }
  }

  /** 沒填伺服器 URL 時自動帶入預設 HF Space，再建立 / 登入帳號 */
  async function quickConnect() {
    if (!syncStore.serverUrl.trim()) {
      syncStore.setServerUrl(DEFAULT_SYNC_SERVER_URL);
      await syncStore.saveSettings();
    }
    await login();
  }

  async function useDefaultServer() {
    syncStore.setServerUrl(DEFAULT_SYNC_SERVER_URL);
    await syncStore.saveSettings();
  }

  async function logout() {
    actionStatus.value = "running";
    try {
      await syncStore.logout();
      password.value = "";
    } catch (error) {
      console.error("[Settings] 同步帳號登出失敗:", error);
    } finally {
      actionStatus.value = "idle";
    }
  }

  async function testConnection() {
    actionStatus.value = "running";
    try {
      await syncStore.refreshStatus();
    } catch (error) {
      console.error("[Settings] 同步伺服器測試連線失敗:", error);
      alert(`連線失敗：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      actionStatus.value = "idle";
    }
  }

  async function refreshStatus() {
    actionStatus.value = "running";
    try {
      await syncStore.refreshStatus();
      if (syncStore.isAuthenticated) {
        try {
          await syncStore.refreshMeta();
        } catch (metaError) {
          console.warn("[Settings] 同步 refreshMeta 失敗:", metaError);
        }
      }
    } catch (error) {
      console.error("[Settings] 同步狀態刷新失敗:", error);
    } finally {
      actionStatus.value = "idle";
    }
  }

  const canLogin = computed(
    () =>
      !busy.value &&
      !!syncStore.username &&
      !!password.value.trim(),
  );

  return {
    syncStore,
    password,
    actionStatus,
    busy,
    canLogin,
    login,
    quickConnect,
    useDefaultServer,
    logout,
    testConnection,
    refreshStatus,
  };
}
