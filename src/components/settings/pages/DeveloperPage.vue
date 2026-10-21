<script setup lang="ts">
/** 開發者選項：Debug Overlay、目前網頁版本 */
import { readWebVersion } from "@/native/webVersion";
import { destroyDebugOverlay, initDebugOverlay, isDebugOverlayActive } from "@/utils/debugOverlay";
import { onActivated, ref } from "vue";
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

onActivated(() => {
  active.value = isDebugOverlayActive();
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
  </div>
</template>
