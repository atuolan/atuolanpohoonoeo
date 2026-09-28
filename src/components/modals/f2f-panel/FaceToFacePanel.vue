<!-- src/components/modals/f2f-panel/FaceToFacePanel.vue -->
<script setup lang="ts">
/**
 * 面對面設定面板：風格 / 模塊 / 條目 三頁
 * 作用於全域的面對面提示詞開關
 */
import { onMounted, onUnmounted, ref } from "vue";
import { X } from "lucide-vue-next";
import { useF2FPanel } from "@/composables/useF2FPanel";
import F2FEntriesTab from "./F2FEntriesTab.vue";
import F2FModulesTab from "./F2FModulesTab.vue";
import F2FStylesTab from "./F2FStylesTab.vue";

const emit = defineEmits<{ close: [] }>();

type Tab = "styles" | "modules" | "entries";
const TABS: { key: Tab; label: string }[] = [
  { key: "styles", label: "風格" },
  { key: "modules", label: "模塊" },
  { key: "entries", label: "條目" },
];

const tab = ref<Tab>("styles");
const { staleCount } = useF2FPanel();

const closeBtn = ref<HTMLButtonElement | null>(null);
/** 編輯器（新增/編輯模塊或風格）開啟時，忽略遮罩點擊與 Escape，避免誤觸丟失草稿 */
const editing = ref(false);

function onOverlayClick() {
  if (editing.value) return;
  emit("close");
}

function onCloseClick() {
  if (editing.value) {
    if (!confirm("放棄未儲存的變更？")) return;
  }
  emit("close");
}

function onKeydown(event: KeyboardEvent) {
  if (event.key !== "Escape" || editing.value) return;
  emit("close");
}

onMounted(() => {
  window.addEventListener("keydown", onKeydown);
  // 面板還在滑入動畫的畫面外位置，不阻止捲動的話瀏覽器會捲動頁面去找按鈕，造成背景閃動
  closeBtn.value?.focus({ preventScroll: true });
});

onUnmounted(() => {
  window.removeEventListener("keydown", onKeydown);
});
</script>

<template>
  <div class="f2f-panel-overlay" @click.self="onOverlayClick">
    <section class="f2f-panel" role="dialog" aria-modal="true" aria-labelledby="f2f-panel-title">
      <header class="f2f-panel-header">
        <h2 id="f2f-panel-title">面對面設定</h2>
        <button ref="closeBtn" type="button" class="f2f-icon-btn" aria-label="關閉" @click="onCloseClick">
          <X :size="20" />
        </button>
      </header>
      <nav v-if="!editing" class="f2f-tabs" role="tablist">
        <button
          v-for="item in TABS"
          :key="item.key"
          type="button"
          role="tab"
          :aria-selected="tab === item.key"
          :class="['f2f-tab-btn', { active: tab === item.key }]"
          @click="tab = item.key"
        >
          {{ item.label }}
        </button>
      </nav>
      <p v-if="staleCount > 0" class="f2f-notice">
        有 {{ staleCount }} 個模塊條目已不存在，已自動略過；下次儲存模塊時會一併清除。
      </p>
      <div class="f2f-panel-body">
        <F2FStylesTab v-if="tab === 'styles'" @editing="editing = $event" />
        <F2FModulesTab v-else-if="tab === 'modules'" @editing="editing = $event" />
        <F2FEntriesTab v-else />
      </div>
    </section>
  </div>
</template>

<style lang="scss">
// 不加 scoped：三個分頁與編輯器共用以下樣式，全部收在 .f2f-panel 之下避免外洩
.f2f-panel-overlay {
  position: fixed;
  inset: 0;
  z-index: 1050;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  background: rgba(0, 0, 0, 0.4);
}

// 開關動畫（<Transition name="f2f-sheet">）：遮罩原地淡入淡出，只有面板從下方滑動。
// Vue 只量根元素的 transition 時間，所以遮罩與面板必須用相同的時長
.f2f-sheet-enter-active,
.f2f-sheet-leave-active {
  transition: opacity 0.3s ease;

  .f2f-panel {
    transition: transform 0.3s cubic-bezier(0.22, 1, 0.36, 1);
  }
}

.f2f-sheet-enter-from,
.f2f-sheet-leave-to {
  opacity: 0;

  .f2f-panel {
    transform: translateY(100%);
  }
}

@media (prefers-reduced-motion: reduce) {
  .f2f-sheet-enter-active,
  .f2f-sheet-leave-active,
  .f2f-sheet-enter-active .f2f-panel,
  .f2f-sheet-leave-active .f2f-panel {
    transition: none;
  }
}

.f2f-panel {
  width: 100%;
  max-width: 520px;
  max-height: 90vh;
  max-height: min(90vh, calc(100dvh - env(safe-area-inset-top, 0px) - 24px));
  display: flex;
  flex-direction: column;
  background: var(--color-surface, #fff);
  color: var(--color-text, #333);
  border-radius: 20px 20px 0 0;
  box-shadow: 0 -8px 30px rgba(0, 0, 0, 0.18);
  padding-bottom: env(safe-area-inset-bottom);

  .f2f-panel-header {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 18px 8px;

    h2 {
      margin: 0;
      font-size: 17px;
      font-weight: 700;
    }
  }

  .f2f-icon-btn {
    background: none;
    border: none;
    color: inherit;
    padding: 4px;
    cursor: pointer;
    display: inline-flex;
  }

  .f2f-tabs {
    flex-shrink: 0;
    display: flex;
    gap: 6px;
    padding: 0 18px 10px;
    border-bottom: 1px solid var(--color-border, #eee);
  }

  .f2f-tab-btn,
  .f2f-chip,
  .f2f-btn {
    border: 1px solid var(--color-border, #ddd);
    background: transparent;
    color: var(--color-text-secondary, #666);
    border-radius: 999px;
    padding: 6px 14px;
    font-size: 13px;
    cursor: pointer;

    &.active {
      background: color-mix(in srgb, var(--color-primary, #ff7eb3) 14%, transparent);
      border-color: color-mix(in srgb, var(--color-primary, #ff7eb3) 50%, transparent);
      color: var(--color-primary, #ff7eb3);
      font-weight: 600;
    }

    &:disabled {
      opacity: 0.5;
      cursor: default;
    }
  }

  .f2f-tab-btn {
    flex: 1;
  }

  .f2f-btn {
    border-radius: 10px;

    &.primary {
      background: var(--color-primary, #ff7eb3);
      border-color: var(--color-primary, #ff7eb3);
      color: #fff;
    }

    &.danger {
      color: #ef4444;
      border-color: rgba(239, 68, 68, 0.4);
    }
  }

  .f2f-notice {
    margin: 10px 18px 0;
    padding: 8px 12px;
    border-radius: 10px;
    font-size: 12px;
    background: rgba(245, 158, 11, 0.12);
    border: 1px solid rgba(245, 158, 11, 0.4);
  }

  .f2f-panel-body {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 12px 18px 18px;
  }

  .f2f-tab {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .f2f-toolbar,
  .f2f-row {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }

  .f2f-row.spread {
    justify-content: space-between;
  }

  .f2f-input {
    flex: 1;
    min-width: 0;
    padding: 8px 10px;
    border-radius: 10px;
    border: 1px solid var(--color-border, #ddd);
    background: transparent;
    color: inherit;
    font-size: 14px;
  }

  .f2f-check {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 13px;
    color: var(--color-text-secondary, #666);
  }

  .f2f-card {
    border: 1px solid var(--color-border, #eee);
    border-radius: 14px;
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 8px;

    &.active {
      border-color: var(--color-primary, #ff7eb3);
    }
  }

  .f2f-card-title {
    font-weight: 600;
    font-size: 14px;
  }

  .f2f-card-desc {
    font-size: 12px;
    color: var(--color-text-secondary, #666);
    margin: 0;
  }

  .f2f-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .f2f-badge {
    font-size: 11px;
    padding: 1px 8px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--color-primary, #ff7eb3) 12%, transparent);
    color: var(--color-primary, #ff7eb3);
    white-space: nowrap;

    &.muted {
      background: rgba(0, 0, 0, 0.06);
      color: var(--color-text-secondary, #666);
    }

    &.warn {
      background: rgba(245, 158, 11, 0.15);
      color: #b45309;
    }
  }

  .f2f-entry-list {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .f2f-entry {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 8px 0;
    border-bottom: 1px solid var(--color-border, #f0f0f0);

    &.structural {
      opacity: 0.55;
      font-style: italic;
    }
  }

  .f2f-entry-main {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
    flex-wrap: wrap;
  }

  .f2f-entry-name {
    font-size: 14px;
    word-break: break-all;
  }

  .f2f-switch {
    position: relative;
    flex-shrink: 0;
    width: 40px;
    height: 22px;

    input {
      opacity: 0;
      width: 0;
      height: 0;
    }
  }

  .f2f-switch-slider {
    position: absolute;
    inset: 0;
    border-radius: 999px;
    background: rgba(0, 0, 0, 0.18);
    transition: 0.2s;
    cursor: pointer;

    &::before {
      content: "";
      position: absolute;
      width: 18px;
      height: 18px;
      left: 2px;
      top: 2px;
      border-radius: 50%;
      background: #fff;
      transition: 0.2s;
    }
  }

  .f2f-switch input:checked + .f2f-switch-slider {
    background: var(--color-primary, #ff7eb3);

    &::before {
      transform: translateX(18px);
    }
  }

  .f2f-empty {
    text-align: center;
    font-size: 13px;
    color: var(--color-text-secondary, #888);
    padding: 16px 0;
  }

  .f2f-field-label {
    font-size: 12px;
    color: var(--color-text-secondary, #666);
  }

  .f2f-editor-head {
    display: flex;
    align-items: center;
    gap: 4px;

    span {
      font-weight: 700;
      font-size: 15px;
    }
  }

  .f2f-editor-footer {
    position: sticky;
    bottom: -18px;
    margin: 0 -18px -18px;
    padding: 12px 18px calc(12px + env(safe-area-inset-bottom, 0px));
    background: var(--color-surface, #fff);
    border-top: 1px solid var(--color-border, #eee);
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }

  .f2f-check input {
    accent-color: var(--color-primary, #ff7eb3);
  }
}
</style>
