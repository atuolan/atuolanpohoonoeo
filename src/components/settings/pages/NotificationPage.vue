<script setup lang="ts">
/** 通知：系統推播（權限、測試）、雲端推送鬧鐘（Discord / 瀏覽器推送）。 */
import { useNotificationStore } from "@/stores";
import { useCloudPushStore } from "@/stores/cloudPush";
import { onActivated, onMounted, ref } from "vue";
import { formatClock } from "../settingsHelpers";
import SettingsGroup from "../ui/SettingsGroup.vue";
import SettingsRow from "../ui/SettingsRow.vue";
import SettingsSwitchRow from "../ui/SettingsSwitchRow.vue";

const notificationStore = useNotificationStore();
const cloudPushStore = useCloudPushStore();

// ===== 系統推播 =====
const permission = ref<NotificationPermission>("default");
const showDeniedGuide = ref(false);

function readPermission() {
  if ("Notification" in window) permission.value = Notification.permission;
}

async function showNotification(title: string, options: NotificationOptions) {
  if ("serviceWorker" in navigator) {
    const reg = await navigator.serviceWorker.getRegistration();
    if (reg) {
      await reg.showNotification(title, options);
      return;
    }
  }
  new Notification(title, options);
}

async function requestPermission() {
  if (!("Notification" in window)) {
    alert("此瀏覽器不支援系統通知。\niOS 需「加入主畫面」作為 PWA 運行才支援。");
    return;
  }
  const result = await notificationStore.requestPushPermission();
  permission.value = result;
  if (result === "granted") {
    try {
      await showNotification("Aguaphone", { body: "通知權限已開啟 ✓" });
    } catch {
      /* ignore */
    }
  }
}

async function testNotification() {
  try {
    await showNotification("Aguaphone 測試", {
      body: "如果你看到這條通知，代表系統推播正常運作！",
      silent: false,
    });
  } catch (e) {
    alert(`通知發送失敗：${e instanceof Error ? e.message : String(e)}`);
  }
}

function savePush() {
  void notificationStore.saveSettings();
}

// ===== 雲端推送鬧鐘 =====
function saveCloudPush() {
  void cloudPushStore.saveSettings();
}

async function toggleChannel(channel: "discord" | "webpush", enabled: boolean) {
  const next = new Set(cloudPushStore.enabledChannels);
  if (enabled) next.add(channel);
  else next.delete(channel);
  cloudPushStore.enabledChannels = Array.from(next) as Array<"discord" | "webpush">;
  await cloudPushStore.saveSettings();
}

async function testWebPush() {
  const result = await cloudPushStore.testWebPushNotification();
  if (result?.error) alert(`Web Push 測試失敗：${result.error}`);
}

onMounted(readPermission);
onActivated(readPermission);
</script>

<template>
  <div class="st-page">
    <SettingsGroup title="系統推播">
      <SettingsSwitchRow
        v-model="notificationStore.settings.pushEnabled"
        label="系統推播通知"
        description="在背景時用系統通知提醒角色訊息、噗浪等"
        @change="savePush"
      />
      <SettingsRow label="通知權限">
        <template #value>
          <span
            class="st-chip"
            :class="{ 'st-chip--accent': permission === 'granted', 'st-chip--warn': permission === 'denied' }"
          >
            {{ permission === "granted" ? "已授權" : permission === "denied" ? "已拒絕" : "未請求" }}
          </span>
        </template>
        <template #control>
          <button v-if="permission === 'granted'" type="button" class="st-btn st-btn--soft st-btn--sm" @click="testNotification">
            測試通知
          </button>
          <button
            v-else-if="permission === 'denied'"
            type="button"
            class="st-btn st-btn--sm"
            :aria-expanded="showDeniedGuide ? 'true' : 'false'"
            @click="showDeniedGuide = !showDeniedGuide"
          >
            解決方法
          </button>
          <button v-else type="button" class="st-btn st-btn--soft st-btn--sm" @click="requestPermission">
            請求權限
          </button>
        </template>
      </SettingsRow>
      <div v-if="permission === 'denied' && showDeniedGuide" class="st-pad">
        <p class="st-hint">通知權限已被拒絕，要手動重新開啟：</p>
        <ul class="notify-guide">
          <li>iOS Safari：先「加入主畫面」以 PWA 執行，再到 設定 → 通知 → 找到本 App 開啟</li>
          <li>Android Chrome：點網址列左側鎖頭 → 通知 → 允許</li>
          <li>電腦瀏覽器：點網址列左側圖示 → 網站設定 → 通知 → 重置為「詢問」</li>
        </ul>
      </div>
    </SettingsGroup>

    <SettingsGroup
      title="雲端推送鬧鐘"
      :footer="
        cloudPushStore.enabled
          ? 'Chrome 的瀏覽器推送靠 Google FCM，在中國大陸要開全局代理；Safari、Firefox 可以直接用。'
          : undefined
      "
    >
      <SettingsSwitchRow
        v-model="cloudPushStore.enabled"
        label="雲端推送鬧鐘"
        description="關掉瀏覽器後，雲端仍會定時生成角色訊息並推送給你"
        @change="saveCloudPush"
      />
      <template v-if="cloudPushStore.enabled">
        <SettingsSwitchRow
          :model-value="cloudPushStore.enabledChannels.includes('discord')"
          label="Discord 私訊"
          description="由 Discord Bot 傳訊息提醒你"
          @update:model-value="toggleChannel('discord', $event)"
        />
        <div v-if="cloudPushStore.enabledChannels.includes('discord')" style="--st-inset: 16px">
          <div v-if="cloudPushStore.isDiscordLinked" class="st-inset notify-linked">
            <span class="notify-linked__who">
              <span class="st-hint">已連結</span>
              <span class="notify-linked__name">
                {{ cloudPushStore.discordDisplayName || cloudPushStore.discordUsername || cloudPushStore.discordUserId }}
              </span>
            </span>
            <button type="button" class="st-link-btn" @click="cloudPushStore.openDiscordOAuth()">重新連結</button>
            <button type="button" class="st-link-btn" style="color: var(--st-danger)" @click="cloudPushStore.unlinkDiscord()">
              解除
            </button>
          </div>
          <div v-else class="st-inset">
            <button type="button" class="st-btn st-btn--primary st-btn--block" @click="cloudPushStore.openDiscordOAuth()">
              連結 Discord 帳號
            </button>
            <p class="st-hint">會跳到 Discord 授權，自動綁定帳號並加入伺服器。</p>
          </div>
        </div>
        <SettingsSwitchRow
          :model-value="cloudPushStore.enabledChannels.includes('webpush')"
          label="瀏覽器推送"
          description="直接由瀏覽器跳出通知"
          @update:model-value="toggleChannel('webpush', $event)"
        />
      </template>
    </SettingsGroup>

    <SettingsGroup v-if="cloudPushStore.enabled" title="同步與測試">
      <div class="st-pad notify-status">
        <span
          class="st-status"
          :class="{
            'st-status--ok': cloudPushStore.syncStatus === 'success',
            'st-status--error': cloudPushStore.syncStatus === 'error',
          }"
          role="status"
        >
          <template v-if="cloudPushStore.syncStatus === 'syncing'">同步中…</template>
          <template v-else-if="cloudPushStore.syncStatus === 'success'">
            已同步<template v-if="cloudPushStore.nextAlarm"> · 下次推送 {{ formatClock(cloudPushStore.nextAlarm) }}</template>
          </template>
          <template v-else-if="cloudPushStore.syncStatus === 'error'">同步失敗：{{ cloudPushStore.syncError }}</template>
          <template v-else>尚未同步</template>
        </span>
        <span v-if="cloudPushStore.pendingMessageCount > 0" class="st-hint">
          離線訊息 {{ cloudPushStore.pendingMessageCount }} 條待拉取
        </span>
      </div>
      <SettingsRow
        clickable
        tone="accent"
        label="手動同步"
        :disabled="cloudPushStore.syncStatus === 'syncing'"
        @click="cloudPushStore.syncToCloud()"
      />
      <SettingsRow
        v-if="cloudPushStore.enabledChannels.includes('discord')"
        clickable
        tone="accent"
        label="測試推送（含 AI）"
        @click="cloudPushStore.testPushNotification()"
      />
      <SettingsRow
        v-if="cloudPushStore.enabledChannels.includes('webpush')"
        clickable
        tone="accent"
        label="測試 Web Push"
        @click="testWebPush"
      />
    </SettingsGroup>
  </div>
</template>

<style scoped lang="scss">
.notify-guide {
  margin: 0;
  padding-left: 18px;
  font-size: 13px;
  line-height: 1.7;
  color: var(--st-text);
}

.notify-linked {
  flex-direction: row;
  align-items: center;
  gap: 4px;
}

.notify-linked__who {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.notify-linked__name {
  font-size: 14px;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.notify-status {
  gap: 4px;
}
</style>
