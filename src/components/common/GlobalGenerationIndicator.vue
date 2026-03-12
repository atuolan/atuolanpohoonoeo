<script setup lang="ts">
/**
 * 全局生成狀態指示器（可拖曳迷你版）
 * 在角落顯示正在進行的 AI 生成任務，可拖曳到任意位置
 */
import { useAIGenerationStore } from "@/stores";
import { computed, onMounted, onUnmounted, ref } from "vue";

const aiGenerationStore = useAIGenerationStore();

// 是否展開詳情
const isExpanded = ref(false);

// 拖曳相關狀態
const isDragging = ref(false);
const position = ref({ x: 0, y: 0 }); // 使用 x, y 而非 top, right
const dragStart = ref({ x: 0, y: 0 });
const indicatorRef = ref<HTMLElement | null>(null);

// 是否有活動的生成任務
const hasActiveTasks = computed(() => aiGenerationStore.hasActiveGeneration);

// 活動任務列表
const activeTasks = computed(() => aiGenerationStore.activeTasks);

// 任務數量
const taskCount = computed(() => activeTasks.value.length);

// 格式化任務類型
function formatTaskType(type: string): string {
  const typeMap: Record<string, string> = {
    chat: "聊天",
    diary: "日記",
    summary: "總結",
    "meta-summary": "元總結",
    continue: "繼續",
    "qzone-comments": "評論",
    theater: "小劇場",
  };
  return typeMap[type] || type;
}

// 計算生成時間
function getElapsedTime(startTime: number): string {
  const elapsed = Math.floor((Date.now() - startTime) / 1000);
  if (elapsed < 60) return `${elapsed}s`;
  const minutes = Math.floor(elapsed / 60);
  const seconds = elapsed % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

// 中止特定任務
function abortTask(chatId: string, taskType: string) {
  aiGenerationStore.abortGeneration(chatId, taskType as any);
}

// 切換展開（只在非拖曳時觸發）
function handleClick() {
  if (!isDragging.value) {
    isExpanded.value = !isExpanded.value;
  }
}

// ===== 拖曳功能 =====
let dragMoved = false;
let dragDelayTimer: ReturnType<typeof setTimeout> | null = null;
let pendingDragEvent: { x: number; y: number } | null = null;
const DRAG_DELAY = 500; // 500ms 延遲才開始拖動

function startDrag(e: MouseEvent | TouchEvent) {
  const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
  const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;

  // 記錄起始位置
  pendingDragEvent = { x: clientX, y: clientY };
  dragMoved = false;

  // 設置延遲計時器
  dragDelayTimer = setTimeout(() => {
    if (pendingDragEvent) {
      // 延遲後才真正進入拖動模式
      isDragging.value = true;
      dragStart.value = {
        x: pendingDragEvent.x - position.value.x,
        y: pendingDragEvent.y - position.value.y,
      };
    }
  }, DRAG_DELAY);

  document.addEventListener("mousemove", onDrag);
  document.addEventListener("mouseup", endDrag);
  document.addEventListener("touchmove", onDrag, { passive: false });
  document.addEventListener("touchend", endDrag);
}

function onDrag(e: MouseEvent | TouchEvent) {
  const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
  const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;

  // 如果還沒進入拖動模式，檢查是否移動了足夠距離來取消點擊
  if (!isDragging.value && pendingDragEvent) {
    const dx = Math.abs(clientX - pendingDragEvent.x);
    const dy = Math.abs(clientY - pendingDragEvent.y);
    if (dx > 5 || dy > 5) {
      // 移動超過 5px，標記為已移動（但還沒進入拖動模式）
      dragMoved = true;
    }
    return;
  }

  if (!isDragging.value) return;
  e.preventDefault();
  dragMoved = true;

  // 計算新位置
  let newX = clientX - dragStart.value.x;
  let newY = clientY - dragStart.value.y;

  // 限制在視窗範圍內
  const size = 36;
  const padding = 8;
  newX = Math.max(padding, Math.min(window.innerWidth - size - padding, newX));
  newY = Math.max(padding, Math.min(window.innerHeight - size - padding, newY));

  position.value = { x: newX, y: newY };
}

function endDrag() {
  // 清除延遲計時器
  if (dragDelayTimer) {
    clearTimeout(dragDelayTimer);
    dragDelayTimer = null;
  }
  pendingDragEvent = null;

  document.removeEventListener("mousemove", onDrag);
  document.removeEventListener("mouseup", endDrag);
  document.removeEventListener("touchmove", onDrag);
  document.removeEventListener("touchend", endDrag);

  // 如果有拖動，保存位置
  if (isDragging.value && dragMoved) {
    localStorage.setItem(
      "ai-indicator-position",
      JSON.stringify(position.value),
    );
  }

  // 延遲重置拖曳狀態，避免觸發點擊
  setTimeout(() => {
    isDragging.value = false;
  }, 50);
}

// 初始化位置
onMounted(() => {
  // 從 localStorage 讀取保存的位置
  const saved = localStorage.getItem("ai-indicator-position");
  if (saved) {
    try {
      const pos = JSON.parse(saved);
      position.value = pos;
    } catch {
      // 使用默認位置（右上角）
      position.value = { x: window.innerWidth - 48, y: 12 };
    }
  } else {
    // 默認位置：右上角
    position.value = { x: window.innerWidth - 48, y: 12 };
  }
});

onUnmounted(() => {
  document.removeEventListener("mousemove", onDrag);
  document.removeEventListener("mouseup", endDrag);
  document.removeEventListener("touchmove", onDrag);
  document.removeEventListener("touchend", endDrag);
});

// 計算樣式
const indicatorStyle = computed(() => ({
  left: `${position.value.x}px`,
  top: `${position.value.y}px`,
}));
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div
        v-if="hasActiveTasks"
        ref="indicatorRef"
        class="mini-indicator"
        :class="{ expanded: isExpanded, dragging: isDragging }"
        :style="indicatorStyle"
        @mousedown="startDrag"
        @touchstart="startDrag"
        @click="handleClick"
      >
        <!-- 迷你模式：只顯示圖標和數量 -->
        <div class="mini-badge">
          <svg
            class="spinning"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2.5"
          >
            <circle
              cx="12"
              cy="12"
              r="10"
              stroke-dasharray="31.4 31.4"
              stroke-linecap="round"
            />
          </svg>
          <span class="count">{{ taskCount }}</span>
        </div>

        <!-- 展開模式：顯示任務列表 -->
        <Transition name="expand">
          <div
            v-if="isExpanded"
            class="task-popup"
            @click.stop
            @mousedown.stop
            @touchstart.stop
          >
            <div class="popup-header">
              <span>AI 生成中</span>
              <button class="close-btn" @click="isExpanded = false">×</button>
            </div>
            <div class="task-list">
              <div v-for="task in activeTasks" :key="task.id" class="task-item">
                <span class="task-name">{{
                  task.characterName || "角色"
                }}</span>
                <span class="task-type">{{
                  formatTaskType(task.taskType)
                }}</span>
                <span class="task-time">{{
                  getElapsedTime(task.startTime)
                }}</span>
                <button
                  class="abort-btn"
                  @click.stop="abortTask(task.chatId, task.taskType)"
                  title="中止"
                >
                  ×
                </button>
              </div>
            </div>
          </div>
        </Transition>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped lang="scss">
.mini-indicator {
  position: fixed;
  z-index: 9999;
  cursor: grab;
  touch-action: none;
  user-select: none;

  &.dragging {
    cursor: grabbing;
  }
}

.mini-badge {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  background: rgba(0, 0, 0, 0.7);
  backdrop-filter: blur(8px);
  border-radius: 50%;
  position: relative;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
  transition: transform 0.15s ease;

  &:active {
    transform: scale(0.95);
  }

  svg {
    width: 20px;
    height: 20px;
    color: var(--color-primary, #7dd3a8);
  }

  .count {
    position: absolute;
    top: -4px;
    right: -4px;
    min-width: 16px;
    height: 16px;
    padding: 0 4px;
    background: #ef4444;
    color: #fff;
    font-size: 10px;
    font-weight: 600;
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
  }
}

.spinning {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

.task-popup {
  position: absolute;
  top: 44px;
  right: 0;
  min-width: 180px;
  background: rgba(0, 0, 0, 0.85);
  backdrop-filter: blur(10px);
  border-radius: 10px;
  overflow: hidden;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
  cursor: default;
}

.popup-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  background: rgba(255, 255, 255, 0.05);
  color: #fff;
  font-size: 12px;
  font-weight: 500;

  .close-btn {
    width: 18px;
    height: 18px;
    background: none;
    border: none;
    color: rgba(255, 255, 255, 0.5);
    font-size: 16px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;

    &:hover {
      color: #fff;
    }
  }
}

.task-list {
  padding: 6px;
}

.task-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  border-radius: 6px;

  &:hover {
    background: rgba(255, 255, 255, 0.08);
  }
}

.task-name {
  flex: 1;
  font-size: 11px;
  color: #fff;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 70px;
}

.task-type {
  font-size: 9px;
  color: var(--color-primary, #7dd3a8);
  background: rgba(125, 211, 168, 0.15);
  padding: 1px 4px;
  border-radius: 3px;
}

.task-time {
  font-size: 9px;
  color: rgba(255, 255, 255, 0.4);
  font-family: monospace;
}

.abort-btn {
  width: 16px;
  height: 16px;
  background: rgba(239, 68, 68, 0.2);
  border: none;
  border-radius: 4px;
  color: #ef4444;
  font-size: 12px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;

  &:hover {
    background: rgba(239, 68, 68, 0.4);
  }
}

// 動畫
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.expand-enter-active,
.expand-leave-active {
  transition: all 0.2s ease;
  transform-origin: top right;
}

.expand-enter-from,
.expand-leave-to {
  opacity: 0;
  transform: scale(0.9);
}
</style>
