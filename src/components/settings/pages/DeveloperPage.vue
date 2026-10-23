<script setup lang="ts">
/** 開發者選項：Debug Overlay、目前網頁版本、App 熱更新狀態 */
import type { LiveUpdateStatus } from "@/native/liveUpdate";
import { isNativeApp } from "@/native/platform";
import { readWebVersion } from "@/native/webVersion";
import { destroyDebugOverlay, initDebugOverlay, isDebugOverlayActive } from "@/utils/debugOverlay";
import { showFloatingToast } from "@/utils/floatingToast";
import { computed, onActivated, ref, shallowRef } from "vue";
import SettingsGroup from "../ui/SettingsGroup.vue";
import SettingsRow from "../ui/SettingsRow.vue";
import SettingsSwitchRow from "../ui/SettingsSwitchRow.vue";

const active = ref(isDebugOverlayActive());
// App 熱更新換上新版後這裡會變，用來確認更新有沒有成功
const webVersion = ref("讀取中…");
readWebVersion().then((v) => (webVersion.value = v ?? "讀不到"));

function toggle() {
  if (active.value) destroyDebugOverlay();
  else initDebugOverlay();
  active.value = isDebugOverlayActive();
}

// ── App 熱更新狀態（網頁版不載入更新套件） ──
const native = isNativeApp();
type LiveUpdateModule = typeof import("@/native/liveUpdate");
const liveUpdate = shallowRef<LiveUpdateModule | null>(null);
const status = ref<LiveUpdateStatus | null>(null);

async function refreshStatus() {
  if (!liveUpdate.value) return;
  status.value = await liveUpdate.value.readLiveUpdateStatus().catch(() => null);
}

if (native) {
  import("@/native/liveUpdate")
    .then((m) => {
      liveUpdate.value = m;
      return refreshStatus();
    })
    .catch(() => {});
}

const lastCheck = computed(() => liveUpdate.value?.liveUpdateState.lastCheck ?? null);
const originHost = computed(() => lastCheck.value?.origin?.replace(/^https?:\/\//, "") ?? "");
const checking = computed(() => liveUpdate.value?.liveUpdateState.checking ?? false);

function formatTime(at: number): string {
  const d = new Date(at);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

const resultLabel = computed(() => {
  const check = lastCheck.value;
  if (!check) return "還沒檢查過";
  const state = liveUpdate.value?.liveUpdateState;
  // 記錄停在檢查中／下載中，但這次開 App 沒在跑：上次做到一半 App 被關掉了
  if ((check.result === "checking" || check.result === "downloading") && !state?.checking) {
    return check.result === "downloading" ? "上次下載到一半就中斷了" : "上次檢查到一半就中斷了";
  }
  switch (check.result) {
    case "checking":
      return "檢查中…";
    case "downloading":
      return state?.downloadPercent != null ? `下載中 ${state.downloadPercent}%` : "下載中…";
    case "up-to-date":
      return "已經是最新版";
    case "downloaded":
      return "新版已下載，等換上";
    case "needs-newer-app":
      return "新版需要重裝 APK";
    case "failed-before":
      return "這版換上後開不起來，已跳過";
    case "error":
      return "失敗";
    default:
      return check.result;
  }
});

async function checkNow() {
  if (!liveUpdate.value || checking.value) return;
  await liveUpdate.value.checkForLiveUpdate();
  await refreshStatus();
}

async function applyNow() {
  if (!liveUpdate.value) return;
  const ok = await liveUpdate.value.applyDownloadedUpdate().catch((err) => {
    showFloatingToast(`換上失敗：${err instanceof Error ? err.message : String(err)}`);
    return true;
  });
  if (!ok) {
    showFloatingToast("沒有下載好的新版");
    await refreshStatus();
  }
}

onActivated(() => {
  active.value = isDebugOverlayActive();
  void refreshStatus();
});
</script>

<template>
  <div class="st-page">
    <SettingsGroup footer="開啟後，「跨裝置同步」的登入畫面會多出伺服器網址和清除已存密碼。">
      <SettingsSwitchRow
        :model-value="active"
        label="Debug Overlay"
        description="顯示浮動除錯視窗，看 console 輸出和視口數據"
        @update:model-value="toggle"
      />
    </SettingsGroup>
    <SettingsGroup footer="App 熱更新換上新版後，這個編號會跟著變。">
      <SettingsRow label="網頁版本" :value="webVersion" />
    </SettingsGroup>
    <SettingsGroup
      v-if="native"
      title="熱更新"
      footer="熱更新沒成功時，把這一區截圖給開發者，就看得出卡在哪一步。"
    >
      <SettingsRow label="App 版本" :value="status?.appVersion ?? '讀取中…'" />
      <SettingsRow
        label="目前網頁來源"
        :value="status ? (status.runningBuiltin ? 'APK 內建' : '熱更新下載') : '讀取中…'"
      />
      <SettingsRow label="伺服器最新版" :value="lastCheck?.remoteVersion ?? '—'" />
      <SettingsRow label="上次檢查" :value="lastCheck ? formatTime(lastCheck.at) : '—'" />
      <SettingsRow
        label="結果"
        :value="resultLabel"
        :description="lastCheck?.error"
        :tone="lastCheck?.result === 'error' ? 'danger' : 'default'"
      />
      <SettingsRow v-if="originHost" label="更新來源" :value="originHost" />
      <SettingsRow label="等著換上" :value="status?.pendingVersion ?? '沒有'" />
      <SettingsRow
        label="手機裡的下載"
        :value="status?.downloads.length ? '' : '沒有'"
        :description="status?.downloads.join('、') || undefined"
      />
      <SettingsRow
        label="被退回的版本"
        :value="status?.failedVersions.length ? '' : '沒有'"
        :description="status?.failedVersions.join('、') || undefined"
        :tone="status?.failedVersions.length ? 'warn' : 'default'"
      />
      <SettingsRow
        label="立即檢查更新"
        :value="checking ? resultLabel : ''"
        clickable
        tone="accent"
        :disabled="!liveUpdate || checking"
        @click="checkNow"
      />
      <SettingsRow
        v-if="status?.pendingVersion"
        label="換上新版（會重新載入）"
        clickable
        tone="accent"
        @click="applyNow"
      />
    </SettingsGroup>
  </div>
</template>
