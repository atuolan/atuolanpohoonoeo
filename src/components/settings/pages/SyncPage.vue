<script setup lang="ts">
/**
 * 跨裝置同步：同步帳號、裝置清單與直連傳輸、連線資訊。
 * 伺服器只負責登入、找裝置和加密中繼，不保存同步內容。
 */
import { useNotificationStore } from "@/stores";
import { isDebugOverlayActive } from "@/utils/debugOverlay";
import { ArrowLeft, ArrowRight, Pencil, RefreshCw } from "lucide-vue-next";
import { computed, onActivated, ref } from "vue";
import { useSyncAccount } from "../composables/useSyncAccount";
import { formatDateTime } from "../settingsHelpers";
import SettingsGroup from "../ui/SettingsGroup.vue";
import SettingsRow from "../ui/SettingsRow.vue";
import SettingsSwitchRow from "../ui/SettingsSwitchRow.vue";

const notificationStore = useNotificationStore();
const {
  syncStore,
  password,
  actionStatus,
  busy,
  canLogin,
  quickConnect,
  useDefaultServer,
  logout,
  testConnection,
  refreshStatus,
} = useSyncAccount();

// 開了 Debug Overlay 才顯示伺服器網址等除錯欄位
const debugActive = ref(isDebugOverlayActive());
onActivated(() => {
  debugActive.value = isDebugOverlayActive();
});

const showHelp = ref(false);
const showInfo = ref(false);

const serverStatusText = computed(() => {
  if (syncStore.serverStatusOk === null) return "尚未取得";
  return syncStore.serverStatusOk ? "正常" : "異常";
});

const statusText = computed(() => {
  switch (syncStore.syncStatus) {
    case "connecting":
      return "連線中";
    case "syncing":
      return "同步中";
    case "success":
      return "已連線";
    case "error":
      return syncStore.syncError || "同步失敗";
    default:
      return syncStore.lastSyncAt ? "待命中" : "已登入";
  }
});

function shortDeviceId(id: string | null | undefined): string {
  if (!id) return "—";
  if (id.length <= 12) return id;
  return `${id.slice(0, 6)}…${id.slice(-4)}`;
}

function formatPeerSyncError(error: unknown): string {
  if (error && typeof error === "object") {
    const peerReason = (error as { peerReason?: string }).peerReason;
    switch (peerReason) {
      case "peer-offline":
        return "目標裝置已離線";
      case "rejected-by-user":
        return "對方已拒絕此次同步";
      case "responder-session-failed":
        return "對方無法建立加密連線";
      case "responder-fetch-decrypt-failed":
      case "responder-apply-decrypt-failed":
        return "對方無法解密同步資料";
      case "responder-fetch-failed":
        return "對方在提供資料時發生錯誤";
      case "responder-apply-failed":
        return "對方在套用資料時發生錯誤";
      default:
        break;
    }
  }
  return error instanceof Error ? error.message : String(error);
}

const deviceList = computed(() => {
  const currentId = syncStore.deviceId;
  const items: Array<{
    deviceId: string;
    online: boolean;
    isCurrent: boolean;
    canPeerSync: boolean;
    shortId: string;
    lastSeenText: string;
    model: string | null;
    displayName: string;
  }> = [];

  const selfDevice = syncStore.devices.find((d) => d.deviceId === currentId);
  if (selfDevice) {
    const customName = syncStore.customDeviceName ?? selfDevice.customName ?? null;
    const model = selfDevice.model ?? null;
    items.push({
      deviceId: selfDevice.deviceId,
      online: !!selfDevice.online,
      isCurrent: true,
      canPeerSync: false,
      shortId: shortDeviceId(selfDevice.deviceId),
      lastSeenText: selfDevice.lastSeenAt ? formatDateTime(selfDevice.lastSeenAt) : "—",
      model,
      displayName: customName ?? model ?? "本機裝置",
    });
  }

  for (const p of syncStore.peerList) {
    const model = p.model ?? null;
    items.push({
      deviceId: p.deviceId,
      online: p.online,
      isCurrent: false,
      canPeerSync: p.online,
      shortId: shortDeviceId(p.deviceId),
      lastSeenText: p.lastSeenAt ? formatDateTime(p.lastSeenAt) : "—",
      model: p.isServer ? null : model,
      displayName: p.customName ?? model ?? "其他裝置",
    });
  }
  return items;
});

const presenceSummary = computed(() => {
  const total = syncStore.devices.length;
  const online = syncStore.onlineCount;
  if (total === 0 && online === 0) return "尚未取得";
  return `${online} 在線 / 共 ${total} 台`;
});

// ===== 本機改名 =====
const renameActive = ref(false);
const renameInput = ref("");
const renameLoading = ref(false);

function startRename() {
  renameInput.value = syncStore.customDeviceName ?? "";
  renameActive.value = true;
}

async function submitRename() {
  renameLoading.value = true;
  try {
    await syncStore.setCustomDeviceName(renameInput.value || null);
    renameActive.value = false;
  } catch (error) {
    alert(`命名失敗：${error instanceof Error ? error.message : String(error)}`);
  } finally {
    renameLoading.value = false;
  }
}

// ===== 直連傳輸 =====
async function peerSync(direction: "push" | "pull", targetDeviceId: string) {
  actionStatus.value = "running";
  try {
    const target = deviceList.value.find((d) => d.deviceId === targetDeviceId);
    const label = target?.displayName ?? shortDeviceId(targetDeviceId);
    const outcome = await syncStore.peerSync(direction, targetDeviceId);
    if (outcome.rejectedByUser) {
      notificationStore.notifySystem(
        "裝置同步已取消",
        `${label} 已拒絕這次${direction === "push" ? "接收" : "提供"}資料。`,
      );
      return;
    }
    if (outcome.conflictsAborted) {
      notificationStore.notifySystem(
        "裝置同步已中止",
        `${label} 與本機仍有 ${outcome.conflictCount} 筆差異需要先處理，已停止傳輸。`,
      );
      return;
    }
    notificationStore.notifySystem(
      "裝置同步完成",
      `${direction === "push" ? "已傳送" : "已拉取"} ${outcome.applied} 筆資料${direction === "push" ? "到" : "自"} ${label}。`,
    );
  } catch (error) {
    console.error("[SyncPage] Peer sync 失敗:", error);
    notificationStore.notifySystem(
      "裝置同步失敗",
      `${direction === "push" ? "傳送到" : "從"} ${shortDeviceId(targetDeviceId)} 同步失敗：${formatPeerSyncError(error)}`,
    );
  } finally {
    actionStatus.value = "idle";
  }
}
</script>

<template>
  <div class="st-page">
    <SettingsGroup>
      <SettingsSwitchRow
        v-model="syncStore.enabled"
        label="加密跨裝置同步"
        description="伺服器只負責登入、找裝置和加密中繼，不保存同步內容"
        @change="syncStore.saveSettings()"
      />
      <SettingsRow
        clickable
        label="使用說明"
        :chevron="showHelp ? 'up' : 'down'"
        :aria-expanded="showHelp ? 'true' : 'false'"
        @click="showHelp = !showHelp"
      />
      <div v-if="showHelp" class="st-pad sync-help">
        <p>感謝 膝蓋中了一箭 幫助完善這個功能。現在你可以在電腦和手機之間快速傳輸新內容，傳完後資料都會留在各自本機。</p>
        <p>建議雙端資料不要差異過大，另一端最好不要完全空白，這樣比較不容易出問題。實測像 30MB 左右內容也能完整傳過去。</p>
        <p>如果傳輸失敗，因為目前保存邏輯有調整，建議先把現有資料匯出，再重新匯入到本機後再使用同步功能。</p>
        <p>帳號密碼可以自行設定，按「連線／建立帳號」後，另一個網頁使用相同帳號密碼登入即可連線。</p>
        <p>為了安全，拉取前需要雙端都同意。訊息不會互通，也不會保存到我的伺服器；我這裡只作為中轉，不保存你的資料。</p>
      </div>
    </SettingsGroup>

    <!-- 尚未登入 -->
    <template v-if="!syncStore.isAuthenticated">
      <SettingsGroup
        title="同步帳號"
        footer="第一次使用會自動建立帳號，已有帳號就直接登入。這個帳號只用來找到你的其他裝置。"
      >
        <div class="st-fields">
          <div v-if="debugActive" class="st-field">
            <div class="st-field__head">
              <label for="sync-server" class="st-field__label">伺服器 URL</label>
              <button type="button" class="st-link-btn" @click="useDefaultServer">使用預設伺服器</button>
            </div>
            <input
              id="sync-server"
              :value="syncStore.serverUrl"
              type="url"
              class="st-input"
              placeholder="https://your-sync-server.example.com"
              @input="
                syncStore.setServerUrl(($event.target as HTMLInputElement).value);
                void syncStore.saveSettings();
              "
            />
          </div>
          <div class="st-field">
            <label for="sync-user" class="st-field__label">同步帳號</label>
            <input
              id="sync-user"
              :value="syncStore.username"
              type="text"
              class="st-input"
              placeholder="輸入任意代號，第一次會自動建立"
              autocomplete="username"
              @input="syncStore.setUsername(($event.target as HTMLInputElement).value)"
              @change="syncStore.saveSettings()"
            />
          </div>
          <div class="st-field">
            <label for="sync-pass" class="st-field__label">同步密碼</label>
            <input
              id="sync-pass"
              v-model="password"
              type="password"
              class="st-input"
              placeholder="請記住，其他裝置要用同一組密碼"
              autocomplete="current-password"
              @keydown.enter="quickConnect"
            />
            <p class="st-hint">
              密碼會自動記住，登入過期時會自動重新登入。
              <template v-if="syncStore.savedPassword">（已儲存）</template>
              <button
                v-if="debugActive && syncStore.savedPassword"
                type="button"
                class="st-link-btn"
                @click="syncStore.clearSavedPassword()"
              >
                清除
              </button>
            </p>
          </div>
          <button type="button" class="st-btn st-btn--primary st-btn--block" :disabled="!canLogin" @click="quickConnect">
            {{ busy ? "處理中…" : "連線／建立帳號" }}
          </button>
          <p v-if="syncStore.syncStatus === 'error' && syncStore.syncError" class="st-hint st-hint--error">
            {{ syncStore.syncError }}
          </p>
        </div>
        <SettingsRow
          clickable
          tone="accent"
          label="測試伺服器連線"
          :value="syncStore.lastConnectionCheckAt ? `伺服器${serverStatusText}` : undefined"
          :disabled="busy || !syncStore.serverUrl"
          @click="testConnection"
        />
      </SettingsGroup>
    </template>

    <!-- 已登入 -->
    <template v-else>
      <SettingsGroup title="帳號">
        <SettingsRow :label="syncStore.username">
          <template #description>
            <span
              class="st-status"
              :class="{
                'st-status--ok':
                  syncStore.syncStatus === 'success' || (syncStore.syncStatus === 'idle' && !!syncStore.lastSyncAt),
                'st-status--error': syncStore.syncStatus === 'error',
              }"
            >
              {{ statusText }}
            </span>
          </template>
          <template #control>
            <button type="button" class="st-btn st-btn--sm" style="color: var(--st-danger)" :disabled="busy" @click="logout">
              登出
            </button>
          </template>
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup
        footer="資料加密後由伺服器中繼，只有兩端裝置能解開；拉取前雙方都要同意。兩邊資料差太多時，建議先導出一份備份。"
      >
        <template #title>
          <span>裝置 · {{ presenceSummary }}</span>
          <button type="button" class="st-link-btn" :disabled="busy" @click="refreshStatus">
            <RefreshCw aria-hidden="true" />刷新
          </button>
        </template>
        <div v-if="deviceList.length === 0" class="st-row">
          <span class="st-row__desc">還沒取得裝置清單，按右上的「刷新」。</span>
        </div>
        <div v-for="device in deviceList" :key="device.deviceId" class="sync-device" style="--st-inset: 34px">
          <div class="sync-device__head">
            <span class="sync-dot" :class="{ 'sync-dot--on': device.online }" :aria-label="device.online ? '在線' : '離線'" role="img" />
            <span class="sync-device__info">
              <span class="sync-device__name">
                {{ device.displayName }}
                <span v-if="device.isCurrent" class="st-chip">本機</span>
              </span>
              <span class="st-hint">
                <template v-if="device.model">{{ device.model }} · </template>{{ device.shortId }} ·
                {{ device.online ? "在線" : `最近在線 ${device.lastSeenText}` }}
              </span>
            </span>
            <button
              v-if="device.isCurrent && !renameActive"
              type="button"
              class="st-icon-btn"
              aria-label="幫這台裝置改名"
              @click="startRename"
            >
              <Pencil />
            </button>
          </div>
          <div v-if="device.isCurrent && renameActive" class="sync-rename">
            <input
              v-model="renameInput"
              type="text"
              class="st-input"
              aria-label="裝置名稱"
              placeholder="輸入裝置名稱，例如：客廳手機"
              maxlength="60"
              @keydown.enter="submitRename"
              @keydown.esc="renameActive = false"
            />
            <div class="st-btn-grid">
              <button type="button" class="st-btn st-btn--sm" :disabled="renameLoading" @click="renameActive = false">取消</button>
              <button type="button" class="st-btn st-btn--primary st-btn--sm" :disabled="renameLoading" @click="submitRename">
                確認
              </button>
            </div>
          </div>
          <div v-if="device.canPeerSync" class="st-btn-grid sync-actions">
            <button type="button" class="st-btn st-btn--soft st-btn--sm" :disabled="busy" @click="peerSync('push', device.deviceId)">
              <ArrowRight aria-hidden="true" />傳到這台
            </button>
            <button type="button" class="st-btn st-btn--sm" :disabled="busy" @click="peerSync('pull', device.deviceId)">
              <ArrowLeft aria-hidden="true" />從這台下載
            </button>
          </div>
          <p v-else-if="!device.isCurrent && !device.online" class="st-hint sync-offline">離線，暫時無法同步</p>
        </div>
      </SettingsGroup>

      <SettingsGroup title="連線">
        <SettingsRow
          clickable
          label="連線資訊"
          :value="syncStore.serverApiVersion ? `API v${syncStore.serverApiVersion}` : undefined"
          :chevron="showInfo ? 'up' : 'down'"
          :aria-expanded="showInfo ? 'true' : 'false'"
          @click="showInfo = !showInfo"
        />
        <div v-if="showInfo" class="st-pad sync-info">
          <span>伺服器：{{ syncStore.serverUrl }}</span>
          <span>伺服器狀態：{{ serverStatusText }}</span>
          <span v-if="syncStore.serverApiVersion">API 版本：{{ syncStore.serverApiVersion }}</span>
          <span v-if="syncStore.lastServerTime">伺服器時間：{{ formatDateTime(syncStore.lastServerTime) }}</span>
          <span v-if="syncStore.lastConnectionCheckAt">最近檢查：{{ formatDateTime(syncStore.lastConnectionCheckAt) }}</span>
          <span>Device ID：{{ syncStore.deviceId || "尚未建立" }}</span>
          <span v-if="syncStore.userId">User ID：{{ syncStore.userId }}</span>
        </div>
      </SettingsGroup>
    </template>
  </div>
</template>

<style scoped lang="scss">
.sync-help p {
  margin: 0;
  font-size: 13px;
  line-height: 1.7;
  color: var(--st-text);
}

.sync-device {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px 8px 12px 16px;
}

.sync-device__head {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 44px;
}

.sync-device__info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.sync-device__name {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 16px;
  font-weight: 500;
  overflow-wrap: anywhere;
}

.sync-dot {
  flex: none;
  width: 8px;
  height: 8px;
  box-sizing: border-box;
  border-radius: 50%;
  border: 1.5px solid var(--st-muted);

  &--on {
    border: 0;
    background: var(--st-accent-strong);
  }
}

.sync-rename,
.sync-actions,
.sync-offline {
  margin-left: 18px;
  margin-right: 8px;
}

.sync-rename {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.sync-info span {
  font-size: 13px;
  line-height: 1.5;
  color: var(--st-sub);
  overflow-wrap: anywhere;
}
</style>
