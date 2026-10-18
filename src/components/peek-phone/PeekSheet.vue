<script setup lang="ts">
/**
 * 窺視選單：從頂部膠囊叫出來的底部面板
 * 放玩家的操作（重新生成、離開），不屬於角色手機本身
 */
import type { GroupStatus } from "@/stores/peekPhone";
import { Calendar, Camera, ChevronRight, Loader2, MessageCircle, RefreshCw, X } from "lucide-vue-next";
import { computed } from "vue";
import { initialOf } from "./peekPhoneView";

type Phase = "A" | "BC" | "D";

const props = defineProps<{
  open: boolean;
  name: string;
  avatar?: string;
  groupStatus: Record<"A" | "B" | "C" | "D", GroupStatus>;
}>();

const emit = defineEmits<{
  close: [];
  regenerate: [phase: Phase];
  regenerateAll: [];
  leave: [];
}>();

const phases: { key: Phase; label: string; icon: typeof MessageCircle }[] = [
  { key: "A", label: "聊天紀錄", icon: MessageCircle },
  { key: "BC", label: "行程、日記、錢包", icon: Calendar },
  { key: "D", label: "相簿、瀏覽紀錄", icon: Camera },
];

function isPhaseLoading(phase: Phase): boolean {
  const s = props.groupStatus;
  if (phase === "A") return s.A === "loading";
  if (phase === "BC") return s.B === "loading" || s.C === "loading";
  return s.D === "loading";
}

const isBusy = computed(() => Object.values(props.groupStatus).some((s) => s === "loading"));
const hasError = computed(() => Object.values(props.groupStatus).some((s) => s === "error"));

const subtitle = computed(() => {
  if (isBusy.value) return "正在讀取手機內容…";
  if (hasError.value) return "有部分內容沒讀到，可以在下面重新生成";
  return "想換一批內容，就在這裡重新生成";
});
</script>

<template>
  <Transition name="peek-sheet">
    <div v-if="props.open" class="peek-sheet-layer">
      <div class="peek-sheet-scrim" @click="emit('close')" />
      <div class="peek-sheet" role="dialog" aria-modal="true" :aria-label="`${props.name}的手機 · 窺視選單`">
        <span class="peek-sheet-handle" aria-hidden="true" />

        <div class="peek-sheet-head">
          <span class="peek-sheet-avatar">
            <img v-if="props.avatar" :src="props.avatar" alt="" />
            <template v-else>{{ initialOf(props.name) }}</template>
          </span>
          <div class="peek-sheet-title">
            <span class="peek-sheet-name">{{ props.name }}的手機</span>
            <span class="peek-sheet-sub">{{ subtitle }}</span>
          </div>
          <button type="button" class="peek-sheet-close" aria-label="關閉" @click="emit('close')">
            <X :size="20" />
          </button>
        </div>

        <div class="peek-sheet-section">
          <div class="peek-sheet-section-label">重新生成</div>
          <div class="peek-sheet-card">
            <button
              v-for="p in phases"
              :key="p.key"
              type="button"
              class="peek-sheet-row"
              :disabled="isBusy"
              @click="emit('regenerate', p.key)"
            >
              <component :is="p.icon" :size="18" class="peek-sheet-row-icon" aria-hidden="true" />
              <span class="peek-sheet-row-label">{{ p.label }}</span>
              <Loader2 v-if="isPhaseLoading(p.key)" :size="16" class="peek-sheet-spin" aria-hidden="true" />
              <span v-else class="peek-sheet-row-meta">×1</span>
              <ChevronRight :size="16" class="peek-sheet-row-chev" aria-hidden="true" />
            </button>
            <button
              type="button"
              class="peek-sheet-row is-danger"
              :disabled="isBusy"
              @click="emit('regenerateAll')"
            >
              <RefreshCw :size="18" class="peek-sheet-row-icon" aria-hidden="true" />
              <span class="peek-sheet-row-label">全部重新生成</span>
              <span class="peek-sheet-row-meta">×3</span>
              <ChevronRight :size="16" class="peek-sheet-row-chev" aria-hidden="true" />
            </button>
          </div>
          <p class="peek-sheet-note">×N 是會呼叫幾次 AI</p>
        </div>

        <button type="button" class="peek-sheet-leave" @click="emit('leave')">放下手機，換一個人</button>
      </div>
    </div>
  </Transition>
</template>

<style scoped lang="scss">
.peek-sheet-layer {
  position: absolute;
  inset: 0;
  z-index: 30;
}

.peek-sheet-scrim {
  position: absolute;
  inset: 0;
  background: var(--p-scrim);
}

.peek-sheet {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  max-height: calc(100% - var(--safe-top, 0px) - 64px);
  overflow-y: auto;
  background: var(--p-sheet);
  color: var(--p-ink);
  border-radius: 28px 28px 0 0;
  padding: 10px 20px calc(var(--safe-bottom, 0px) + 28px);
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.peek-sheet-handle {
  align-self: center;
  width: 36px;
  height: 5px;
  border-radius: 3px;
  background: #c9c8c3;
}

.peek-sheet-head {
  display: flex;
  align-items: center;
  gap: 12px;
}

.peek-sheet-avatar {
  width: 44px;
  height: 44px;
  border-radius: 22px;
  flex-shrink: 0;
  overflow: hidden;
  background: var(--p-owner);
  color: #ffffff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 17px;
  font-weight: 700;

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
}

.peek-sheet-title {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.peek-sheet-name {
  font-size: 17px;
  font-weight: 700;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.peek-sheet-sub {
  font-size: 12px;
  color: var(--p-sheet-ink-2);
}

.peek-sheet-close {
  width: 44px;
  height: 44px;
  border-radius: 22px;
  flex-shrink: 0;
  border: none;
  background: var(--p-sheet-btn);
  color: var(--p-ink);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  padding: 0;
}

.peek-sheet-section-label {
  font-size: 13px;
  font-weight: 700;
  margin-bottom: 8px;
}

.peek-sheet-card {
  background: #ffffff;
  border-radius: 18px;
  padding: 0 14px;
}

.peek-sheet-row {
  width: 100%;
  min-height: 52px;
  display: flex;
  align-items: center;
  gap: 10px;
  border: none;
  border-bottom: 1px solid var(--p-sheet-line);
  background: none;
  color: var(--p-ink);
  font-family: inherit;
  font-size: 14px;
  text-align: left;
  cursor: pointer;
  padding: 0;

  &:last-child {
    border-bottom: none;
  }

  &:disabled {
    cursor: default;
    opacity: 0.5;
  }

  &.is-danger {
    color: var(--p-danger);
  }
}

.peek-sheet-row-icon {
  flex-shrink: 0;
}

.peek-sheet-row-label {
  flex: 1;
}

.peek-sheet-row-meta {
  font-family: var(--p-num);
  font-size: 12px;
  color: var(--p-sheet-ink-2);
}

.peek-sheet-row-chev {
  color: #a8a7a2;
}

.peek-sheet-spin {
  color: var(--p-sheet-ink-2);
  animation: peek-sheet-spin 1s linear infinite;
}

.peek-sheet-note {
  margin: 8px 4px 0;
  font-size: 12px;
  color: var(--p-sheet-ink-2);
}

.peek-sheet-leave {
  margin-top: 4px;
  height: 52px;
  border-radius: 26px;
  border: none;
  background: var(--p-ink);
  color: #ffffff;
  font-family: inherit;
  font-size: 15px;
  font-weight: 700;
  cursor: pointer;
  flex-shrink: 0;
}

.peek-sheet-enter-active,
.peek-sheet-leave-active {
  transition: opacity 0.22s ease;

  .peek-sheet {
    transition: transform 0.26s cubic-bezier(0.2, 0.8, 0.2, 1);
  }
}

.peek-sheet-enter-from,
.peek-sheet-leave-to {
  opacity: 0;

  .peek-sheet {
    transform: translateY(100%);
  }
}

@keyframes peek-sheet-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
