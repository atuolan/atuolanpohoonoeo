<script setup lang="ts">
/** 儲存空間：用量、明細、強制刷新、刪除本機所有數據。 */
import { clearAllData } from "@/db/database";
import { useCharactersStore, useLorebooksStore } from "@/stores";
import { RefreshCw } from "lucide-vue-next";
import { onActivated, onMounted, reactive, ref } from "vue";
import { formatSize } from "../settingsHelpers";
import SettingsGroup from "../ui/SettingsGroup.vue";
import SettingsRow from "../ui/SettingsRow.vue";

const charactersStore = useCharactersStore();
const lorebooksStore = useLorebooksStore();

const storage = reactive({
  used: 0,
  limit: 50 * 1024 * 1024,
  percentage: 0,
  status: "safe" as "safe" | "warning" | "critical",
});
const refreshing = ref(false);

async function refreshStorageStatus() {
  refreshing.value = true;
  try {
    if ("storage" in navigator && "estimate" in navigator.storage) {
      const estimate = await navigator.storage.estimate();
      storage.used = estimate.usage || 0;
      storage.limit = estimate.quota || 50 * 1024 * 1024;
    }
    storage.percentage = Math.round((storage.used / storage.limit) * 100);
    storage.status =
      storage.percentage >= 90 ? "critical" : storage.percentage >= 70 ? "warning" : "safe";
    await charactersStore.loadCharacters();
    await lorebooksStore.loadLorebooks();
  } catch (e) {
    console.error("Failed to get storage estimate:", e);
  } finally {
    refreshing.value = false;
  }
}

// 強制刷新：清除 SW 快取 + 重新載入
async function hardRefresh() {
  if (!confirm("將清除所有快取並重新載入頁面，確定嗎？")) return;
  try {
    // 清除所有 CacheStorage（但保留 SW 註冊，避免 PWA 無法啟動）
    if ("caches" in window) {
      const names = await caches.keys();
      await Promise.all(names.map((n) => caches.delete(n)));
    }
    // 讓 SW 更新而非註銷（避免 PWA 離線時打不開）
    if ("serviceWorker" in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.update()));
    }
  } catch (e) {
    console.error("[HardRefresh]", e);
  }
  // 強制重新載入（加時間戳繞過快取）
  window.location.href = window.location.origin + window.location.pathname + "?t=" + Date.now();
}

async function deleteAllData() {
  if (!confirm("確定要刪除所有本機數據嗎？\n\n此操作無法撤銷！")) return;
  if (!confirm("再次確認：所有角色、世界書、聊天記錄都會被永久刪除！")) return;
  try {
    await clearAllData();
    alert("所有數據已刪除");
    location.reload();
  } catch (e) {
    console.error("刪除失敗:", e);
    alert("刪除失敗：" + (e instanceof Error ? e.message : String(e)));
  }
}

onMounted(refreshStorageStatus);
onActivated(refreshStorageStatus);
</script>

<template>
  <div class="st-page">
    <section class="st-group">
      <h2 class="st-group__title">
        <span>用量</span>
        <button type="button" class="st-link-btn" :disabled="refreshing" @click="refreshStorageStatus">
          <RefreshCw aria-hidden="true" />重新整理
        </button>
      </h2>
      <div class="st-card storage-card">
        <div class="storage-card__head">
          <span class="storage-card__pct">{{ storage.percentage }}%</span>
          <span class="st-row__desc">已使用</span>
          <span class="storage-card__total">{{ formatSize(storage.used) }} / {{ formatSize(storage.limit) }}</span>
        </div>
        <div
          class="storage-bar"
          role="progressbar"
          aria-label="儲存空間使用量"
          :aria-valuenow="storage.percentage"
          aria-valuemin="0"
          aria-valuemax="100"
        >
          <div
            class="storage-bar__fill"
            :class="`storage-bar__fill--${storage.status}`"
            :style="{ width: Math.min(100, storage.percentage) + '%' }"
          />
        </div>
        <span
          class="st-status"
          :class="{
            'st-status--ok': storage.status === 'safe',
            'st-status--warn': storage.status === 'warning',
            'st-status--error': storage.status === 'critical',
          }"
        >
          {{
            storage.status === "safe"
              ? "存儲空間充足"
              : storage.status === "warning"
                ? "存儲空間即將用完"
                : "存儲空間不足！"
          }}
        </span>
      </div>
    </section>

    <SettingsGroup title="明細">
      <SettingsRow label="角色" :value="`${charactersStore.characters.length} 個`" />
      <SettingsRow label="世界書" :value="`${lorebooksStore.lorebooks.length} 個`" />
    </SettingsGroup>

    <SettingsGroup title="維護" footer="更新後畫面怪怪的時候用；只清快取，不會刪掉聊天和角色。">
      <SettingsRow clickable tone="accent" label="強制刷新（清除快取）" @click="hardRefresh" />
    </SettingsGroup>

    <SettingsGroup footer="會永久刪除這台裝置上的所有數據，無法恢復。刪除前會再確認兩次。">
      <SettingsRow clickable tone="danger" label="刪除本機所有數據" @click="deleteAllData" />
    </SettingsGroup>
  </div>
</template>

<style scoped lang="scss">
.storage-card {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 18px 16px;

  // 卡片內不需要分隔線
  > * + *::before {
    display: none;
  }
}

.storage-card__head {
  display: flex;
  align-items: baseline;
  gap: 6px;
}

.storage-card__pct {
  font-size: 30px;
  line-height: 1.1;
  font-weight: 700;
}

.storage-card__total {
  margin-left: auto;
  font-size: 14px;
  color: var(--st-sub);
}

.storage-bar {
  height: 12px;
  border-radius: 999px;
  overflow: hidden;
  background: color-mix(in srgb, var(--st-text) 10%, var(--st-card));
}

.storage-bar__fill {
  height: 100%;
  border-radius: 999px;
  background: var(--st-accent-strong);

  &--warning {
    background: var(--color-warning, #d69e2e);
  }

  &--critical {
    background: var(--st-danger);
  }
}
</style>
