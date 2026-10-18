<script setup lang="ts">
import { ChevronDown, ChevronUp, Minus, Plus, RotateCcw, X } from "lucide-vue-next";
import { computed, ref, watch } from "vue";
import {
  DEFAULT_DOCK_APP_IDS,
  DOCK_APP_CATALOG,
  resolveDockApps,
} from "./dockApps";

const props = defineProps<{
  visible: boolean;
  modelValue: string[];
}>();

const emit = defineEmits<{
  (e: "update:modelValue", ids: string[]): void;
  (e: "close"): void;
}>();

// 編輯中的草稿，按「完成」才寫回
const draft = ref<string[]>([]);

watch(
  () => props.visible,
  (visible) => {
    if (visible) draft.value = [...props.modelValue];
  },
  { immediate: true },
);

const selectedApps = computed(() => resolveDockApps(draft.value));
const unselectedApps = computed(() =>
  DOCK_APP_CATALOG.filter((app) => !draft.value.includes(app.id)),
);

function move(index: number, delta: number) {
  const target = index + delta;
  if (target < 0 || target >= draft.value.length) return;
  const next = [...draft.value];
  [next[index], next[target]] = [next[target], next[index]];
  draft.value = next;
}

function remove(id: string) {
  // 至少留一個，轉盤才有東西
  if (draft.value.length <= 1) return;
  draft.value = draft.value.filter((x) => x !== id);
}

function add(id: string) {
  draft.value = [...draft.value, id];
}

function resetToDefault() {
  draft.value = [...DEFAULT_DOCK_APP_IDS];
}

function save() {
  emit("update:modelValue", [...draft.value]);
  emit("close");
}
</script>

<template>
  <Teleport to="body">
    <Transition name="dock-editor-fade">
      <div v-if="visible" class="dock-editor-overlay" @click.self="emit('close')">
        <div class="dock-editor-sheet">
          <div class="sheet-header">
            <button class="icon-btn" aria-label="關閉" @click="emit('close')">
              <X :size="20" />
            </button>
            <h2 class="sheet-title">自訂轉盤</h2>
            <button class="done-btn" @click="save">完成</button>
          </div>

          <div class="sheet-body">
            <div class="section-head">
              <span class="section-title">轉盤裡的 App（{{ selectedApps.length }}）</span>
              <button class="reset-btn" @click="resetToDefault">
                <RotateCcw :size="14" />
                恢復預設
              </button>
            </div>
            <p class="section-hint">由上到下＝轉盤由左到右，打開轉盤時停在中間。</p>

            <ul class="app-list">
              <li v-for="(app, index) in selectedApps" :key="app.id" class="app-row">
                <span class="app-icon">
                  <component :is="app.icon" :size="18" :stroke-width="1.5" />
                </span>
                <span class="app-label">{{ app.label }}</span>
                <button
                  class="icon-btn"
                  :disabled="index === 0"
                  aria-label="往前移"
                  @click="move(index, -1)"
                >
                  <ChevronUp :size="18" />
                </button>
                <button
                  class="icon-btn"
                  :disabled="index === selectedApps.length - 1"
                  aria-label="往後移"
                  @click="move(index, 1)"
                >
                  <ChevronDown :size="18" />
                </button>
                <button
                  class="icon-btn remove"
                  :disabled="selectedApps.length <= 1"
                  aria-label="移出轉盤"
                  @click="remove(app.id)"
                >
                  <Minus :size="18" />
                </button>
              </li>
            </ul>

            <template v-if="unselectedApps.length > 0">
              <div class="section-head">
                <span class="section-title">可以加入的 App</span>
              </div>
              <ul class="app-list">
                <li v-for="app in unselectedApps" :key="app.id" class="app-row">
                  <span class="app-icon">
                    <component :is="app.icon" :size="18" :stroke-width="1.5" />
                  </span>
                  <span class="app-label">{{ app.label }}</span>
                  <button class="icon-btn add" aria-label="加入轉盤" @click="add(app.id)">
                    <Plus :size="18" />
                  </button>
                </li>
              </ul>
            </template>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style lang="scss" scoped>
.dock-editor-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.35);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: flex-end;
  justify-content: center;
  z-index: 2000;
}

.dock-editor-sheet {
  width: 100%;
  max-width: 480px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  background: #fff;
  color: #1f2937;
  border-radius: 20px 20px 0 0;
  padding-bottom: env(safe-area-inset-bottom, 0px);
  box-shadow: 0 -8px 30px rgba(0, 0, 0, 0.15);
}

.sheet-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.06);
}

.sheet-title {
  font-size: 16px;
  font-weight: 600;
  margin: 0;
}

.done-btn {
  padding: 6px 14px;
  border-radius: 999px;
  background: #1f2937;
  color: #fff;
  font-size: 14px;
  font-weight: 500;
}

.sheet-body {
  overflow-y: auto;
  padding: 8px 16px 16px;
  -webkit-overflow-scrolling: touch;
}

.section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 12px;
}

.section-title {
  font-size: 13px;
  font-weight: 600;
  color: #6b7280;
}

.section-hint {
  margin: 4px 0 0;
  font-size: 12px;
  color: #9ca3af;
}

.reset-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: #6b7280;
  padding: 4px 8px;
  border-radius: 8px;

  &:active {
    background: rgba(0, 0, 0, 0.05);
  }
}

.app-list {
  list-style: none;
  margin: 8px 0 0;
  padding: 0;
}

.app-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 4px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.04);
}

.app-icon {
  width: 34px;
  height: 34px;
  border-radius: 10px;
  background: rgba(30, 41, 59, 0.85);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.app-label {
  flex: 1;
  font-size: 14px;
}

.icon-btn {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #4b5563;

  &:active:not(:disabled) {
    background: rgba(0, 0, 0, 0.06);
  }

  &:disabled {
    opacity: 0.25;
  }

  &.remove {
    color: #ef4444;
  }

  &.add {
    color: #10b981;
  }
}

.dock-editor-fade-enter-active,
.dock-editor-fade-leave-active {
  transition: opacity 0.2s ease;

  .dock-editor-sheet {
    transition: transform 0.25s ease;
  }
}

.dock-editor-fade-enter-from,
.dock-editor-fade-leave-to {
  opacity: 0;

  .dock-editor-sheet {
    transform: translateY(100%);
  }
}
</style>
