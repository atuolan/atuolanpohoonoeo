<script setup lang="ts">
/**
 * 最小化指示器組件
 * 當流式輸出窗口最小化時顯示的浮動指示器
 * 支持長按拖曳移動位置（類似 GlobalGenerationIndicator）
 * Requirements: 2.3, 2.4, 5.4, 6.2
 */

import { computed, onMounted, onUnmounted, ref } from "vue";

// Props
interface Props {
  visible: boolean;
  tokenCount: number;
  isStreaming: boolean;
}

const props = defineProps<Props>();

// Emits
const emit = defineEmits<{
  (e: "restore"): void;
}>();

// 計算顯示文字
const statusText = computed(() => {
  if (props.isStreaming) {
    return `生成中... ${props.tokenCount} tokens`;
  }
  return `已完成 ${props.tokenCount} tokens`;
});

// ===== 拖曳相關狀態 =====
const isDragging = ref(false);
const position = ref({ x: 0, y: 0 });
const dragStart = ref({ x: 0, y: 0 });

const DRAG_DELAY = 500; // 長按 500ms 才開始拖動
let dragDelayTimer: ReturnType<typeof setTimeout> | null = null;
let pendingDragEvent: { x: number; y: number } | null = null;
let dragMoved = false;

function startDrag(e: MouseEvent | TouchEvent) {
  const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
  const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;

  pendingDragEvent = { x: clientX, y: clientY };
  dragMoved = false;

  dragDelayTimer = setTimeout(() => {
    if (pendingDragEvent) {
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

  if (!isDragging.value && pendingDragEvent) {
    const dx = Math.abs(clientX - pendingDragEvent.x);
    const dy = Math.abs(clientY - pendingDragEvent.y);
    if (dx > 5 || dy > 5) {
      dragMoved = true;
      // 移動超過閾值，取消長按計時器
      if (dragDelayTimer) {
        clearTimeout(dragDelayTimer);
        dragDelayTimer = null;
      }
    }
    return;
  }

  if (!isDragging.value) return;
  e.preventDefault();
  dragMoved = true;

  let newX = clientX - dragStart.value.x;
  let newY = clientY - dragStart.value.y;

  // 限制在視窗範圍內
  const padding = 8;
  const elWidth = 100; // 大約寬度
  const elHeight = 40;
  newX = Math.max(
    padding,
    Math.min(window.innerWidth - elWidth - padding, newX),
  );
  newY = Math.max(
    padding,
    Math.min(window.innerHeight - elHeight - padding, newY),
  );

  position.value = { x: newX, y: newY };
}

function endDrag() {
  if (dragDelayTimer) {
    clearTimeout(dragDelayTimer);
    dragDelayTimer = null;
  }
  pendingDragEvent = null;

  document.removeEventListener("mousemove", onDrag);
  document.removeEventListener("mouseup", endDrag);
  document.removeEventListener("touchmove", onDrag);
  document.removeEventListener("touchend", endDrag);

  if (isDragging.value && dragMoved) {
    localStorage.setItem(
      "streaming-indicator-position",
      JSON.stringify(position.value),
    );
  }

  setTimeout(() => {
    isDragging.value = false;
  }, 50);
}

// 處理點擊恢復（只在非拖曳時觸發）
function handleClick() {
  if (!isDragging.value && !dragMoved) {
    emit("restore");
  }
}

// 計算樣式
const indicatorStyle = computed(() => ({
  left: `${position.value.x}px`,
  top: `${position.value.y}px`,
}));

// 初始化位置
onMounted(() => {
  const saved = localStorage.getItem("streaming-indicator-position");
  if (saved) {
    try {
      position.value = JSON.parse(saved);
    } catch {
      position.value = {
        x: window.innerWidth - 130,
        y: window.innerHeight - 120,
      };
    }
  } else {
    position.value = {
      x: window.innerWidth - 130,
      y: window.innerHeight - 120,
    };
  }
});

onUnmounted(() => {
  document.removeEventListener("mousemove", onDrag);
  document.removeEventListener("mouseup", endDrag);
  document.removeEventListener("touchmove", onDrag);
  document.removeEventListener("touchend", endDrag);
});
</script>

<template>
  <Teleport to="body">
    <Transition name="indicator-pop">
      <button
        v-if="visible"
        class="minimized-indicator"
        :class="{ dragging: isDragging }"
        :style="indicatorStyle"
        :title="statusText"
        @mousedown="startDrag"
        @touchstart="startDrag"
        @click="handleClick"
      >
        <!-- 流式動畫指示器 -->
        <span v-if="isStreaming" class="streaming-dots">
          <span class="dot"></span>
          <span class="dot"></span>
          <span class="dot"></span>
        </span>
        <!-- 完成圖標 -->
        <svg v-else class="check-icon" viewBox="0 0 24 24" fill="currentColor">
          <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
        </svg>
        <!-- Token 計數 -->
        <span class="token-count">{{ tokenCount }}</span>
      </button>
    </Transition>
  </Teleport>
</template>

<style lang="scss" scoped>
// ===== 最小化指示器 (Requirements: 2.3, 2.4, 5.4) =====
.minimized-indicator {
  position: fixed;
  z-index: 9999;
  opacity: 0.5;

  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;

  // 主題整合 (Requirements: 5.4)
  background: var(--color-primary);
  color: white;
  border: none;
  border-radius: var(--radius-full);
  box-shadow: var(--shadow-lg);

  font-size: 14px;
  font-weight: 500;
  cursor: grab;
  touch-action: none;
  user-select: none;

  // 過渡效果
  transition: box-shadow var(--transition-fast);

  &.dragging {
    cursor: grabbing;
    box-shadow: 0 8px 24px var(--color-shadow);
  }

  &:hover {
    box-shadow: 0 8px 24px var(--color-shadow);
  }

  &:active:not(.dragging) {
    transform: scale(0.98);
  }
}

// ===== 流式動畫點 =====
.streaming-dots {
  display: flex;
  align-items: center;
  gap: 3px;
}

.dot {
  width: 6px;
  height: 6px;
  background: currentColor;
  border-radius: 50%;
  animation: dot-pulse 1.4s infinite ease-in-out both;

  &:nth-child(1) {
    animation-delay: -0.32s;
  }

  &:nth-child(2) {
    animation-delay: -0.16s;
  }

  &:nth-child(3) {
    animation-delay: 0s;
  }
}

@keyframes dot-pulse {
  0%,
  80%,
  100% {
    transform: scale(0.6);
    opacity: 0.5;
  }
  40% {
    transform: scale(1);
    opacity: 1;
  }
}

// ===== 完成圖標 =====
.check-icon {
  width: 18px;
  height: 18px;
}

// ===== Token 計數 =====
.token-count {
  font-variant-numeric: tabular-nums;
}

// ===== 動畫 (Requirements: 6.2) =====
.indicator-pop-enter-active {
  animation: indicator-enter 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.indicator-pop-leave-active {
  animation: indicator-leave 0.25s ease-out forwards;
}

@keyframes indicator-enter {
  0% {
    opacity: 0;
    transform: scale(0.3) translateY(20px);
  }
  100% {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

@keyframes indicator-leave {
  0% {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
  100% {
    opacity: 0;
    transform: scale(0.3) translateY(20px);
  }
}
</style>
