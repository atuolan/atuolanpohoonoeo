<script setup lang="ts">
/**
 * 子頁載入失敗時顯示。最常見的原因是網頁開著的時候部署了新版：
 * 舊頁面要的分塊檔已經不在伺服器上，只能重新載入換成新版。
 */
import { recordReloadReason } from "@/utils/runtimeDiagnostics";
import { RefreshCw } from "lucide-vue-next";

function reload() {
  recordReloadReason("SettingsPageLoadError", "Settings sub-page chunk failed to load; user reloaded");
  window.location.reload();
}
</script>

<template>
  <div class="st-page">
    <section class="st-group">
      <div class="st-card load-error">
        <p class="load-error__text">這一頁打不開，可能是網頁剛更新過，重新載入就好。</p>
        <p class="st-hint">重新載入會中斷正在生成的回覆。</p>
        <button type="button" class="st-btn st-btn--primary st-btn--block" @click="reload">
          <RefreshCw aria-hidden="true" />重新載入
        </button>
      </div>
    </section>
  </div>
</template>

<style scoped lang="scss">
.load-error {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 20px;
  text-align: center;

  > * + *::before {
    display: none;
  }
}

.load-error__text {
  margin: 0;
  font-size: 15px;
  line-height: 1.6;
}
</style>
