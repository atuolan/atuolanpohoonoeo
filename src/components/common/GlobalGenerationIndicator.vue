<script setup lang="ts">
/**
 * 全局 AI 生成提示（合併了原本的串流視窗縮小膠囊）
 * 只提示目前畫面上看不到的任務；平常貼在螢幕左右邊緣，拖曳後吸到最近的一邊。
 * 點一下展開任務清單（可中止），串流視窗有內容時可以從這裡打開。
 */
import { useStreamingWindow } from "@/composables/useStreamingWindow";
import { useAIGenerationStore } from "@/stores";
import { usePhoneCallStore } from "@/stores/phoneCall";
import { resolveGenerationIndicator } from "@/utils/generationIndicator";
import { computed, onMounted, onUnmounted, ref, watch } from "vue";

const props = defineProps<{
  /** 目前開著的聊天：它自己的回覆已經有頂欄狀態和停止鍵 */
  coveredChatId: string | null;
}>();

const emit = defineEmits<{
  (e: "open-stream"): void;
}>();

const aiGenerationStore = useAIGenerationStore();
const phoneCallStore = usePhoneCallStore();
const streamingWindow = useStreamingWindow();

const callTaskId = computed(() => {
  const call = phoneCallStore.activeCall;
  if (!phoneCallStore.isActive || !call) return null;
  return call.chatId || `phone_${call.characterId}`;
});

const view = computed(() =>
  resolveGenerationIndicator({
    activeTasks: aiGenerationStore.activeTasks,
    coveredChatId: props.coveredChatId,
    callTaskId: callTaskId.value,
    overlayOpen: (phoneCallStore.isActive && phoneCallStore.isExpanded) || streamingWindow.isVisible.value,
    streamingInProgress: streamingWindow.isStreaming.value,
    streamingCovered: streamingWindow.isOwnerCovered.value,
  }),
);

/** 串流視窗有內容（縮小中）時，清單裡多一列可以打開它 */
const canOpenStream = computed(() => streamingWindow.isMinimized.value);
const itemCount = computed(() => view.value.tasks.length + (view.value.tasks.length === 0 ? 1 : 0));

const TASK_TYPE_LABELS: Record<string, string> = {
  chat: "回覆",
  continue: "繼續",
  diary: "日記",
  summary: "總結",
  "meta-summary": "總結",
  events: "整理事件",
  "qzone-comments": "評論",
  theater: "小劇場",
};

function taskTypeLabel(type: string): string {
  return TASK_TYPE_LABELS[type] || type;
}

const now = ref(Date.now());
let tickTimer: ReturnType<typeof setInterval> | null = null;

function elapsed(startTime: number): string {
  const seconds = Math.max(0, Math.floor((now.value - startTime) / 1000));
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function abortTask(chatId: string, taskType: string) {
  aiGenerationStore.abortGeneration(chatId, taskType as never);
}

// ===== 展開清單 =====
const expanded = ref(false);
const rootRef = ref<HTMLElement | null>(null);

function closeOnOutside(e: PointerEvent) {
  if (rootRef.value && !rootRef.value.contains(e.target as Node)) expanded.value = false;
}

watch(expanded, (open) => {
  if (open) {
    now.value = Date.now();
    tickTimer = setInterval(() => (now.value = Date.now()), 1000);
    document.addEventListener("pointerdown", closeOnOutside, true);
  } else {
    if (tickTimer) clearInterval(tickTimer);
    tickTimer = null;
    document.removeEventListener("pointerdown", closeOnOutside, true);
  }
});

watch(
  () => view.value.visible,
  (visible) => {
    if (!visible) expanded.value = false;
  },
);

function openStream() {
  expanded.value = false;
  emit("open-stream");
}

// ===== 貼邊與拖曳 =====
const TAB_HEIGHT = 42;
const EDGE_MARGIN = 12;
const STORAGE_KEY = "ai-indicator-dock";

type Side = "left" | "right";
const side = ref<Side>("right");
/** 垂直位置，用視窗高度的比例存，轉向或縮放時不會跑出畫面 */
const topRatio = ref(0.38);
const viewportHeight = ref(window.innerHeight);

const dockedTop = computed(() => {
  const max = viewportHeight.value - TAB_HEIGHT - EDGE_MARGIN;
  return Math.min(max, Math.max(EDGE_MARGIN, topRatio.value * viewportHeight.value));
});

const dragging = ref(false);
const dragPos = ref({ x: 0, y: 0 });
let pointerStart: { x: number; y: number; id: number } | null = null;
let suppressClick = false;

function onPointerDown(e: PointerEvent) {
  pointerStart = { x: e.clientX, y: e.clientY, id: e.pointerId };
}

function onPointerMove(e: PointerEvent) {
  if (!pointerStart || e.pointerId !== pointerStart.id) return;
  if (!dragging.value) {
    if (Math.hypot(e.clientX - pointerStart.x, e.clientY - pointerStart.y) < 6) return;
    dragging.value = true;
    expanded.value = false;
    try {
      // 手指移出按鈕也要繼續跟著拖
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      // 指標已經結束時抓不到，不影響拖曳
    }
  }
  dragPos.value = { x: e.clientX - TAB_HEIGHT / 2, y: e.clientY - TAB_HEIGHT / 2 };
}

function onPointerUp(e: PointerEvent) {
  if (!pointerStart || e.pointerId !== pointerStart.id) return;
  pointerStart = null;
  if (!dragging.value) return;
  dragging.value = false;
  // 拖完放開時瀏覽器可能再補一個 click，不要把它當成點擊；沒補也不能吃掉下一次點擊
  suppressClick = true;
  setTimeout(() => (suppressClick = false), 300);
  side.value = e.clientX < window.innerWidth / 2 ? "left" : "right";
  topRatio.value = (e.clientY - TAB_HEIGHT / 2) / viewportHeight.value;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ side: side.value, topRatio: topRatio.value }));
  } catch {
    // 存不了就只記在這次
  }
}

function onTabClick() {
  if (suppressClick) {
    suppressClick = false;
    return;
  }
  expanded.value = !expanded.value;
}

const tabStyle = computed(() =>
  dragging.value
    ? { left: `${dragPos.value.x}px`, top: `${dragPos.value.y}px` }
    : { [side.value]: "0px", top: `${dockedTop.value}px` },
);

/** 清單開在按鈕旁邊；按鈕在下半部時往上長 */
const panelStyle = computed(() => {
  const style: Record<string, string> = { [side.value]: "40px" };
  if (dockedTop.value > viewportHeight.value / 2) {
    style.bottom = `${viewportHeight.value - dockedTop.value - TAB_HEIGHT}px`;
  } else {
    style.top = `${dockedTop.value}px`;
  }
  return style;
});

function onResize() {
  viewportHeight.value = window.innerHeight;
}

onMounted(() => {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (saved && (saved.side === "left" || saved.side === "right") && typeof saved.topRatio === "number") {
      side.value = saved.side;
      topRatio.value = saved.topRatio;
    }
  } catch {
    // 用預設位置
  }
  window.addEventListener("resize", onResize);
});

onUnmounted(() => {
  window.removeEventListener("resize", onResize);
  document.removeEventListener("pointerdown", closeOnOutside, true);
  if (tickTimer) clearInterval(tickTimer);
});
</script>

<template>
  <Teleport to="body">
    <Transition name="gen-fade">
      <div v-if="view.visible" ref="rootRef" class="gen-indicator">
        <button
          type="button"
          class="gen-tab"
          :class="[`side-${side}`, { dragging, expanded }]"
          :style="tabStyle"
          :aria-expanded="expanded"
          aria-label="AI 處理中，點一下查看"
          @pointerdown="onPointerDown"
          @pointermove="onPointerMove"
          @pointerup="onPointerUp"
          @pointercancel="onPointerUp"
          @click="onTabClick"
        >
          <svg class="gen-spinner" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6">
            <circle cx="12" cy="12" r="9" stroke-dasharray="28 28" stroke-linecap="round" />
          </svg>
          <span v-if="itemCount > 1" class="gen-count">{{ itemCount }}</span>
        </button>

        <Transition name="gen-pop">
          <div v-if="expanded" class="gen-panel" :class="`side-${side}`" :style="panelStyle">
            <div class="gen-panel-title">AI 處理中</div>
            <div v-for="task in view.tasks" :key="task.id" class="gen-row">
              <span class="gen-name">{{ task.characterName || "角色" }}</span>
              <span class="gen-type">{{ taskTypeLabel(task.taskType) }}</span>
              <span class="gen-time">{{ elapsed(task.startTime) }}</span>
              <button
                type="button"
                class="gen-abort"
                title="中止"
                aria-label="中止"
                @click="abortTask(task.chatId, task.taskType)"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round">
                  <path d="M6 6l12 12M18 6 6 18" />
                </svg>
              </button>
            </div>
            <div v-if="view.tasks.length === 0" class="gen-row gen-row-muted">串流輸出中</div>
            <button v-if="canOpenStream" type="button" class="gen-stream-btn" @click="openStream">
              <span>查看串流輸出</span>
              <span v-if="streamingWindow.isStreaming.value" class="gen-tokens">{{ streamingWindow.tokenCount.value }}</span>
            </button>
          </div>
        </Transition>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped lang="scss">
.gen-tab {
  position: fixed;
  z-index: 9999;
  width: 30px;
  height: 42px;
  padding: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1px;
  border: none;
  color: #fff;
  background: rgba(24, 24, 28, 0.62);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.18);
  cursor: pointer;
  touch-action: none;
  user-select: none;
  -webkit-tap-highlight-color: transparent;
  transition:
    border-radius 0.2s ease,
    width 0.2s ease;

  &.side-right {
    border-radius: 21px 0 0 21px;
  }

  &.side-left {
    border-radius: 0 21px 21px 0;
  }

  &.expanded {
    width: 36px;
  }

  &.dragging {
    width: 42px;
    border-radius: 50%;
    cursor: grabbing;
    transition: none;
  }
}

.gen-spinner {
  width: 17px;
  height: 17px;
  color: var(--color-primary, #7dd3a8);
  animation: gen-spin 1s linear infinite;
}

.gen-count {
  font-size: 10px;
  font-weight: 600;
  line-height: 1;
  font-variant-numeric: tabular-nums;
  color: var(--color-primary, #7dd3a8);
}

@keyframes gen-spin {
  to {
    transform: rotate(360deg);
  }
}

.gen-panel {
  position: fixed;
  z-index: 9999;
  width: min(240px, calc(100vw - 56px));
  padding: 6px;
  border-radius: 14px;
  color: #fff;
  background: rgba(24, 24, 28, 0.88);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.28);

  &.side-right {
    transform-origin: right center;
  }

  &.side-left {
    transform-origin: left center;
  }
}

.gen-panel-title {
  padding: 6px 8px 4px;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.6);
}

.gen-row {
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 34px;
  padding: 0 4px 0 8px;
  font-size: 13px;
}

.gen-row-muted {
  color: rgba(255, 255, 255, 0.7);
}

.gen-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.gen-type {
  flex-shrink: 0;
  padding: 1px 6px;
  border-radius: 6px;
  font-size: 11px;
  color: var(--color-primary, #7dd3a8);
  background: rgba(255, 255, 255, 0.1);
}

.gen-time {
  flex-shrink: 0;
  min-width: 30px;
  text-align: right;
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  color: rgba(255, 255, 255, 0.5);
}

.gen-abort {
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 8px;
  color: #fca5a5;
  background: rgba(239, 68, 68, 0.16);
  cursor: pointer;

  svg {
    width: 14px;
    height: 14px;
  }
}

.gen-stream-btn {
  width: 100%;
  min-height: 36px;
  margin-top: 4px;
  padding: 0 10px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border: none;
  border-radius: 10px;
  font: inherit;
  font-size: 13px;
  color: #fff;
  background: rgba(255, 255, 255, 0.1);
  cursor: pointer;
}

.gen-tokens {
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  color: rgba(255, 255, 255, 0.55);
}

.gen-fade-enter-active,
.gen-fade-leave-active {
  transition: opacity 0.2s ease;
}

.gen-fade-enter-from,
.gen-fade-leave-to {
  opacity: 0;
}

.gen-pop-enter-active,
.gen-pop-leave-active {
  transition:
    opacity 0.16s ease,
    transform 0.16s ease;
}

.gen-pop-enter-from,
.gen-pop-leave-to {
  opacity: 0;
  transform: scale(0.94);
}
</style>
