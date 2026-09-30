<!-- src/components/modals/chat-preset/ChatPresetPanel.vue -->
<script setup lang="ts">
/**
 * 專屬預設面板：開關調整 / 專屬條目 兩頁
 * 只作用於目前這個聊天，不影響同角色的其他聊天
 */
import { computed, onMounted, onUnmounted, ref } from "vue";
import { X } from "lucide-vue-next";
import { useChatPresetToggles } from "@/composables/useChatPreset";
import { useChatVariablesStore } from "@/stores/chatVariables";
import ChatPresetEntriesTab from "./ChatPresetEntriesTab.vue";
import ChatPresetTogglesTab from "./ChatPresetTogglesTab.vue";

const props = defineProps<{
  chatId: string;
  chatName: string;
  characterId: string;
  isGroupChat: boolean;
  faceToFaceMode: boolean;
}>();

const emit = defineEmits<{ close: [] }>();

const chatVariablesStore = useChatVariablesStore();
// 面板可能在 store 還綁著別的聊天時被打開，先確保讀寫的是這個聊天
if (!chatVariablesStore.isBoundTo(props.chatId)) {
  chatVariablesStore.initForChat(props.chatId);
}

const { adjustedTotal } = useChatPresetToggles({
  characterId: () => props.characterId,
  isGroupChat: () => props.isGroupChat,
});

type Tab = "toggles" | "entries";
const tab = ref<Tab>("toggles");
const tabs = computed<{ key: Tab; label: string; count: number }[]>(() => [
  { key: "toggles", label: "開關調整", count: adjustedTotal.value },
  { key: "entries", label: "專屬條目", count: chatVariablesStore.chatPrompts.length },
]);

const scopeText = computed(() => {
  const target = props.isGroupChat ? "這個群聊" : "這個聊天";
  return props.chatName ? `只對「${props.chatName}」${target}生效` : `只對${target}生效`;
});

const closeBtn = ref<HTMLButtonElement | null>(null);
/** 條目編輯器開啟時，忽略遮罩點擊與 Escape，避免誤觸丟失草稿 */
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
  <div class="preset-panel-overlay" @click.self="onOverlayClick">
    <section class="preset-panel" role="dialog" aria-modal="true" aria-labelledby="preset-panel-title">
      <header class="preset-panel-header">
        <div class="preset-panel-heading">
          <h2 id="preset-panel-title">專屬預設</h2>
          <p>{{ scopeText }}</p>
        </div>
        <button ref="closeBtn" type="button" class="preset-icon-btn" aria-label="關閉" @click="onCloseClick">
          <X :size="20" />
        </button>
      </header>
      <nav v-if="!editing" class="preset-tabs" role="tablist">
        <button
          v-for="item in tabs"
          :key="item.key"
          type="button"
          role="tab"
          :aria-selected="tab === item.key"
          :class="['preset-tab-btn', { active: tab === item.key }]"
          @click="tab = item.key"
        >
          {{ item.label }}
          <span v-if="item.count > 0" class="preset-count">{{ item.count }}</span>
        </button>
      </nav>
      <p v-if="!chatId" class="preset-notice">
        這個聊天還沒送出過訊息。現在的調整會先記著，送出第一則訊息後一起保存。
      </p>
      <div class="preset-panel-body">
        <ChatPresetTogglesTab
          v-if="tab === 'toggles'"
          :character-id="characterId"
          :is-group-chat="isGroupChat"
          :face-to-face-mode="faceToFaceMode"
        />
        <ChatPresetEntriesTab v-else :is-group-chat="isGroupChat" @editing="editing = $event" />
      </div>
    </section>
  </div>
</template>

<style lang="scss">
// 不加 scoped：兩個分頁與編輯器共用以下樣式，全部收在 .preset-panel 之下避免外洩
.preset-panel-overlay {
  position: fixed;
  inset: 0;
  // 要蓋過聊天詳情頁（1000）
  z-index: 1050;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  background: rgba(0, 0, 0, 0.4);
}

// 開關動畫（<Transition name="preset-sheet">）：遮罩原地淡入淡出，只有面板從下方滑動。
// Vue 只量根元素的 transition 時間，所以遮罩與面板必須用相同的時長
.preset-sheet-enter-active,
.preset-sheet-leave-active {
  transition: opacity 0.3s ease;

  .preset-panel {
    transition: transform 0.3s cubic-bezier(0.22, 1, 0.36, 1);
  }
}

.preset-sheet-enter-from,
.preset-sheet-leave-to {
  opacity: 0;

  .preset-panel {
    transform: translateY(100%);
  }
}

@media (prefers-reduced-motion: reduce) {
  .preset-sheet-enter-active,
  .preset-sheet-leave-active,
  .preset-sheet-enter-active .preset-panel,
  .preset-sheet-leave-active .preset-panel {
    transition: none;
  }
}

.preset-panel {
  width: 100%;
  max-width: 520px;
  // 固定高度：切換分頁或篩選時面板不會忽高忽低
  height: 88vh;
  height: min(88dvh, calc(100dvh - env(safe-area-inset-top, 0px) - 24px));
  display: flex;
  flex-direction: column;
  background: var(--color-surface, #fff);
  color: var(--color-text, #333);
  border-radius: 20px 20px 0 0;
  box-shadow: 0 -8px 30px rgba(0, 0, 0, 0.18);

  .preset-panel-header {
    flex-shrink: 0;
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    padding: 16px 18px 10px;
  }

  .preset-panel-heading {
    min-width: 0;

    h2 {
      margin: 0;
      font-size: 17px;
      font-weight: 700;
    }

    p {
      margin: 2px 0 0;
      font-size: 12px;
      color: var(--color-text-secondary, #666);
      overflow-wrap: anywhere;
    }
  }

  .preset-icon-btn {
    flex-shrink: 0;
    background: none;
    border: none;
    color: inherit;
    padding: 4px;
    cursor: pointer;
    display: inline-flex;
  }

  .preset-tabs {
    flex-shrink: 0;
    display: flex;
    gap: 6px;
    padding: 0 18px 10px;
    border-bottom: 1px solid var(--color-border, #eee);
  }

  .preset-tab-btn,
  .preset-chip,
  .preset-btn {
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

  .preset-tab-btn {
    flex: 1;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
  }

  .preset-chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    white-space: nowrap;
  }

  .preset-btn {
    border-radius: 10px;

    &.primary {
      background: var(--color-primary, #ff7eb3);
      border-color: var(--color-primary, #ff7eb3);
      color: var(--color-on-primary, #fff);
    }

    &.danger {
      color: var(--color-error, #ef4444);
      border-color: color-mix(in srgb, var(--color-error, #ef4444) 40%, transparent);
    }

    &.block {
      width: 100%;
      padding: 10px 14px;
    }
  }

  .preset-link {
    background: none;
    border: none;
    padding: 0;
    font-size: 12px;
    color: var(--color-primary, #ff7eb3);
    cursor: pointer;
    text-decoration: underline;
    text-underline-offset: 2px;

    // 在直向排列的容器裡靠左，不要被拉成整列寬
    &.start {
      align-self: flex-start;
    }
  }

  // 已調整的項數
  .preset-count {
    min-width: 18px;
    height: 18px;
    padding: 0 5px;
    box-sizing: border-box;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 999px;
    background: var(--color-primary, #ff7eb3);
    color: var(--color-on-primary, #fff);
    font-size: 11px;
    font-weight: 700;
    line-height: 1;
  }

  .preset-notice {
    flex-shrink: 0;
    margin: 10px 18px 0;
    padding: 8px 12px;
    border-radius: 10px;
    font-size: 12px;
    background: rgba(245, 158, 11, 0.12);
    border: 1px solid rgba(245, 158, 11, 0.4);

    &.inline {
      margin: 0;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
    }
  }

  .preset-panel-body {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    // 底部安全區只留在這裡一次；.preset-editor-footer 的負邊距要和這個值對應
    padding: 12px 18px calc(18px + env(safe-area-inset-bottom, 0px));
  }

  .preset-tab {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .preset-toolbar,
  .preset-row-line {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .preset-row-line.spread {
    justify-content: space-between;
  }

  .preset-input {
    flex: 1;
    min-width: 0;
    padding: 8px 10px;
    border-radius: 10px;
    border: 1px solid var(--color-border, #ddd);
    background: transparent;
    color: inherit;
    font: inherit;
    font-size: 14px;

    &:focus-visible {
      outline: 2px solid color-mix(in srgb, var(--color-primary, #ff7eb3) 55%, transparent);
      outline-offset: 1px;
    }
  }

  textarea.preset-input {
    flex: none;
    width: 100%;
    box-sizing: border-box;
    min-height: 160px;
    line-height: 1.55;
    resize: vertical;
  }

  .preset-hint {
    margin: 0;
    font-size: 12px;
    line-height: 1.6;
    color: var(--color-text-secondary, #666);
  }

  .preset-empty {
    margin: 0;
    text-align: center;
    font-size: 13px;
    line-height: 1.7;
    color: var(--color-text-secondary, #888);
    padding: 20px 0;
  }

  .preset-field-label {
    font-size: 12px;
    font-weight: 600;
    color: var(--color-text-secondary, #666);
  }

  .preset-badges {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .preset-badge {
    font-size: 11px;
    padding: 1px 8px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--color-primary, #ff7eb3) 12%, transparent);
    color: var(--color-primary, #ff7eb3);
    white-space: nowrap;

    &.muted {
      background: color-mix(in srgb, var(--color-text, #000) 7%, transparent);
      color: var(--color-text-secondary, #666);
    }
  }

  // ── 開關調整 ──
  .preset-list {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .preset-entry {
    border-bottom: 1px solid var(--color-border, #f0f0f0);

    // 在這個聊天實際是關閉的
    &.off .preset-entry-name {
      color: var(--color-text-secondary, #888);
    }

    &.structural .preset-entry-name {
      font-style: italic;
      opacity: 0.7;
    }
  }

  .preset-entry-row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 0;
  }

  .preset-entry-main {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 3px;
    padding: 0;
    background: none;
    border: none;
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;
  }

  .preset-entry-name {
    font-size: 14px;
    overflow-wrap: anywhere;
  }

  .preset-entry-meta {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 6px;
    font-size: 11px;
    color: var(--color-text-secondary, #888);
  }

  // 三態：跟隨預設 / 強制開 / 強制關
  .preset-tri {
    flex-shrink: 0;
    display: inline-flex;
    gap: 2px;
    padding: 2px;
    border: 1px solid var(--color-border, #ddd);
    border-radius: 999px;

    button {
      min-width: 34px;
      min-height: 30px;
      padding: 0 9px;
      border: none;
      border-radius: 999px;
      background: transparent;
      color: var(--color-text-secondary, #666);
      font-size: 12px;
      cursor: pointer;

      &[aria-pressed="true"] {
        background: color-mix(in srgb, var(--color-text, #000) 10%, transparent);
        color: var(--color-text, #333);
        font-weight: 600;
      }

      &.on[aria-pressed="true"] {
        background: var(--color-primary, #ff7eb3);
        color: var(--color-on-primary, #fff);
      }

      &.off[aria-pressed="true"] {
        background: var(--color-text-secondary, #666);
        color: var(--color-surface, #fff);
      }
    }
  }

  .preset-entry-content {
    margin: 0 0 10px;
    padding: 10px 12px;
    border-radius: 10px;
    background: color-mix(in srgb, var(--color-text, #000) 4%, transparent);
    font-size: 12px;

    pre {
      margin: 6px 0 0;
      max-height: 240px;
      overflow: auto;
      font-family: inherit;
      line-height: 1.55;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }
  }

  // ── 專屬條目 ──
  .preset-card {
    display: flex;
    align-items: center;
    gap: 10px;
    border: 1px solid var(--color-border, #eee);
    border-radius: 14px;
    padding: 12px;

    &.off .preset-card-main {
      opacity: 0.55;
    }
  }

  .preset-card-main {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 6px;
    padding: 0;
    background: none;
    border: none;
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;
  }

  .preset-card-title {
    font-weight: 600;
    font-size: 14px;
    overflow-wrap: anywhere;
  }

  .preset-card-excerpt {
    max-width: 100%;
    font-size: 12px;
    color: var(--color-text-secondary, #666);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .preset-switch {
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

  .preset-switch-slider {
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

  .preset-switch input:checked + .preset-switch-slider {
    background: var(--color-primary, #ff7eb3);

    &::before {
      transform: translateX(18px);
    }
  }

  .preset-switch input:focus-visible + .preset-switch-slider {
    outline: 2px solid color-mix(in srgb, var(--color-primary, #ff7eb3) 55%, transparent);
    outline-offset: 2px;
  }

  // ── 條目編輯器 ──
  .preset-editor-head {
    display: flex;
    align-items: center;
    gap: 4px;

    span {
      font-weight: 700;
      font-size: 15px;
    }
  }

  .preset-field {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .preset-options {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .preset-option {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 10px 12px;
    border: 1px solid var(--color-border, #ddd);
    border-radius: 12px;
    background: transparent;
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;

    strong {
      font-size: 14px;
      font-weight: 600;
    }

    small {
      font-size: 12px;
      color: var(--color-text-secondary, #666);
    }

    &[aria-pressed="true"] {
      border-color: var(--color-primary, #ff7eb3);
      background: color-mix(in srgb, var(--color-primary, #ff7eb3) 10%, transparent);
    }
  }

  .preset-depth {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;

    .preset-input {
      flex: none;
      width: 72px;
    }
  }

  .preset-editor-footer {
    position: sticky;
    // 抵銷 .preset-panel-body 的底部內距（含安全區），讓按鈕列貼齊面板底部
    bottom: calc(-18px - env(safe-area-inset-bottom, 0px));
    margin: 0 -18px calc(-18px - env(safe-area-inset-bottom, 0px));
    padding: 12px 18px calc(12px + env(safe-area-inset-bottom, 0px));
    background: var(--color-surface, #fff);
    border-top: 1px solid var(--color-border, #eee);
    display: flex;
    align-items: center;
    gap: 8px;

    .spacer {
      flex: 1;
    }
  }
}
</style>
