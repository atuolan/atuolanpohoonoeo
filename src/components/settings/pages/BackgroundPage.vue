<script setup lang="ts">
/** 背景執行：背景運行模式、HF 後台生成（需要同步帳號）。改了就保存。 */
import { useSettingsStore } from "@/stores";
import { KEEP_ALIVE_IDLE_STOP_SEC_OPTIONS, type KeepAliveTrigger } from "@/stores/settings";
import { computed } from "vue";
import { useSyncAccount } from "../composables/useSyncAccount";
import SettingsGroup from "../ui/SettingsGroup.vue";
import SettingsSelectRow from "../ui/SettingsSelectRow.vue";
import SettingsSwitchRow from "../ui/SettingsSwitchRow.vue";

const TRIGGER_OPTIONS: { value: KeepAliveTrigger; label: string }[] = [
  { value: "always", label: "一直保活" },
  { value: "generation", label: "只在生成時" },
];
const IDLE_STOP_OPTIONS = KEEP_ALIVE_IDLE_STOP_SEC_OPTIONS.map((sec) => ({ value: sec, label: `${sec} 秒` }));

const settingsStore = useSettingsStore();

const triggerDescription = computed(() =>
  settingsStore.keepAliveTrigger === "generation"
    ? "按送出後開始，生成完就停，平常不佔音樂欄、不搶別的 App；每次生成會暫停你正在聽的音樂，主動訊息不會在背景跑"
    : "開著就一直保活，主動訊息在背景也能跑；會一直佔著音樂欄",
);
const { syncStore, password, busy, canLogin, quickConnect } = useSyncAccount();

function save() {
  void settingsStore.saveSettings();
}

function toggleBackgroundGeneration(value: boolean) {
  // 還沒連上同步伺服器時不能開
  if (value && !syncStore.isAuthenticated) {
    alert("還沒連線到 HF Space 伺服器。請先在下方建立或登入同步帳號，連線成功後再開啟。");
    return;
  }
  settingsStore.backgroundGenerationEnabled = value;
  save();
}
</script>

<template>
  <div class="st-page">
    <SettingsGroup>
      <SettingsSwitchRow
        v-model="settingsStore.backgroundAudioEnabled"
        label="背景運行模式"
        description="防止瀏覽器把網頁暫停在後台"
        @change="save"
      />
      <template v-if="settingsStore.backgroundAudioEnabled">
        <SettingsSelectRow
          v-model="settingsStore.keepAliveTrigger"
          label="保活時機"
          :description="triggerDescription"
          :options="TRIGGER_OPTIONS"
          indent
          @change="save"
        />
        <SettingsSelectRow
          v-if="settingsStore.keepAliveTrigger === 'generation'"
          v-model="settingsStore.keepAliveIdleStopSec"
          label="生成結束後停止"
          description="太短的話，生成後的收尾（總結、變數更新）可能在背景被凍結，遇到再調長"
          :options="IDLE_STOP_OPTIONS"
          indent
          @change="save"
        />
        <SettingsSwitchRow
          v-model="settingsStore.keepAlivePauseForcesPlay"
          label="暫停鍵也繼續播"
          description="測試用：音樂欄按暫停不會停，要停只能關掉背景運行模式"
          indent
          @change="save"
        />
      </template>
    </SettingsGroup>

    <SettingsGroup
      title="HF 後台生成"
      footer="這組帳號和「跨裝置同步」是同一個，在哪裡登入都可以。關閉時維持原本的本地生成與串流。"
    >
      <SettingsSwitchRow
        :model-value="settingsStore.backgroundGenerationEnabled"
        label="HF 後台生成"
        description="回覆交給 HF Space 生成，離開、鎖屏或關掉瀏覽器後仍能取回"
        :disabled="!syncStore.isAuthenticated && !settingsStore.backgroundGenerationEnabled"
        @update:model-value="toggleBackgroundGeneration"
      />
      <div v-if="syncStore.isAuthenticated" class="st-row">
        <span class="st-row__main">
          <span class="st-status st-status--ok">已連線同步帳號</span>
        </span>
        <span class="st-row__value">{{ syncStore.username }}</span>
      </div>
      <div v-else class="st-inset bg-login">
        <span class="bg-login__title">先連線同步帳號才能開啟</span>
        <label for="bg-user" class="st-sr-only">帳號</label>
        <input
          id="bg-user"
          :value="syncStore.username"
          type="text"
          class="st-input"
          placeholder="帳號（任意代號，第一次會自動建立）"
          autocomplete="username"
          @input="syncStore.setUsername(($event.target as HTMLInputElement).value)"
          @change="syncStore.saveSettings()"
        />
        <label for="bg-pass" class="st-sr-only">密碼</label>
        <input
          id="bg-pass"
          v-model="password"
          type="password"
          class="st-input"
          placeholder="密碼（其他裝置要用同一組）"
          autocomplete="current-password"
          @keydown.enter="quickConnect"
        />
        <button type="button" class="st-btn st-btn--primary st-btn--block" :disabled="!canLogin" @click="quickConnect">
          {{ busy ? "處理中…" : "連線／建立帳號" }}
        </button>
        <p v-if="syncStore.syncStatus === 'error' && syncStore.syncError" class="st-hint st-hint--error">
          {{ syncStore.syncError }}
        </p>
      </div>
    </SettingsGroup>
  </div>
</template>

<style scoped lang="scss">
.bg-login {
  margin-top: 0;

  .st-input {
    background: var(--st-card);
  }
}

.bg-login__title {
  font-size: 14px;
  font-weight: 500;
}
</style>
