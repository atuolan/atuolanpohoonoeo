<script setup lang="ts">
/** 開發者選項：Debug Overlay */
import { destroyDebugOverlay, initDebugOverlay, isDebugOverlayActive } from "@/utils/debugOverlay";
import { onActivated, ref } from "vue";
import SettingsGroup from "../ui/SettingsGroup.vue";
import SettingsSwitchRow from "../ui/SettingsSwitchRow.vue";

const active = ref(isDebugOverlayActive());

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
  </div>
</template>
