<script setup lang="ts">
/**
 * 浮動氣泡組件
 * CompanionChatPanel 縮小後顯示的角色頭像圓形圖示
 * 支援點擊展開、長按拖曳、未讀紅點通知
 * Requirements: 4.2, 4.3, 4.4, 4.5
 */

import { computed, onMounted, onUnmounted, ref } from "vue";

interface Props {
  /** 角色頭像（Base64 或 URL） */
  avatarSrc: string;
  /** 是否有未讀訊息 */
  hasUnread: boolean;
  /** 初始位置 */
  position: { x: number; y: number };
}

const props = defineProps<Props>();

const emit = defineEmits<{
  (e: "expand"): void;
  (e: "update:position", pos: { x: number; y: number }): void;
}>();

// ===== 拖曳狀態 =====
const isDragging = ref(false);
const currentPos = ref({ x: 0, y: 0 });
const dragStart = ref({ x: 0, y: 0 });

const BUBBLE_SIZE = 52;
const DRAG_DELAY = 500; // 長按 500ms 進入拖曳模式
let dragDelayTimer: ReturnType<typeof setTimeout> | null = null;
let pendingDragEvent: { x: number; y: number } | null = null;
let dragMoved = false;

function getClient(e: MouseEvent | TouchEvent) {
  if ("touches" in e && e.touches.length > 0) {
    return { x: e.touches[0].clientX, y: e.touches[0].clientY };
  }
  if ("clientX" in e) {
    return { x: (e as MouseEvent).clientX, y: (e as MouseEvent).clientY };
  }
  return { x: 0, y: 0 };
}

function clampPosition(x: number, y: number): { x: number; y: number } {
  const padding = 4;
  return {
    x: Math.max(
      padding,
      Math.min(window.innerWidth - BUBBLE_SIZE - padding, x),
    ),
    y: Math.max(
      padding,
      Math.min(window.innerHeight - BUBBLE_SIZE - padding, y),
    ),
  };
}

function startDrag(e: MouseEvent | TouchEvent) {
  const { x, y } = getClient(e);
  pendingDragEvent = { x, y };
  dragMoved = false;

  dragDelayTimer = setTimeout(() => {
    if (pendingDragEvent) {
      isDragging.value = true;
      dragStart.value = {
        x: pendingDragEvent.x - currentPos.value.x,
        y: pendingDragEvent.y - currentPos.value.y,
      };
    }
  }, DRAG_DELAY);

  document.addEventListener("mousemove", onDrag);
  document.addEventListener("mouseup", endDrag);
  document.addEventListener("touchmove", onDrag, { passive: false });
  document.addEventListener("touchend", endDrag);
}

function onDrag(e: MouseEvent | TouchEvent) {
  const { x: clientX, y: clientY } = getClient(e);

  if (!isDragging.value && pendingDragEvent) {
    const dx = Math.abs(clientX - pendingDragEvent.x);
    const dy = Math.abs(clientY - pendingDragEvent.y);
    if (dx > 5 || dy > 5) {
      dragMoved = true;
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

  const raw = {
    x: clientX - dragStart.value.x,
    y: clientY - dragStart.value.y,
  };
  currentPos.value = clampPosition(raw.x, raw.y);
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
    emit("update:position", { ...currentPos.value });
  }

  setTimeout(() => {
    isDragging.value = false;
  }, 50);
}

function handleClick() {
  if (!isDragging.value && !dragMoved) {
    emit("expand");
  }
}

const bubbleStyle = computed(() => ({
  left: `${currentPos.value.x}px`,
  top: `${currentPos.value.y}px`,
}));

// 初始化位置
onMounted(() => {
  currentPos.value = clampPosition(props.position.x, props.position.y);
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
    <Transition name="bubble-pop">
      <button
        class="floating-bubble"
        :class="{ dragging: isDragging }"
        :style="bubbleStyle"
        :aria-label="hasUnread ? '伴讀聊天（有未讀訊息）' : '伴讀聊天'"
        @mousedown="startDrag"
        @touchstart="startDrag"
        @click="handleClick"
      >
        <img
          v-if="avatarSrc"
          :src="avatarSrc"
          alt="角色頭像"
          class="bubble-avatar"
          draggable="false"
        />
        <span v-else class="bubble-avatar bubble-avatar--placeholder">📖</span>

        <!-- 未讀紅點 (Requirement 4.5) -->
        <span v-if="hasUnread" class="red-dot" aria-hidden="true" />
      </button>
    </Transition>
  </Teleport>
</template>

<style lang="scss" scoped>
.floating-bubble {
  position: fixed;
  z-index: 9998;
  width: 52px;
  height: 52px;
  padding: 0;
  border: 2px solid var(--color-primary, #7dd3a8);
  border-radius: 50%;
  background: var(--color-surface, #1a1a2e);
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.3);
  cursor: grab;
  touch-action: none;
  user-select: none;
  overflow: visible;
  transition:
    box-shadow 0.15s ease,
    transform 0.1s ease;

  &.dragging {
    cursor: grabbing;
    box-shadow: 0 6px 20px rgba(0, 0, 0, 0.4);
  }

  &:hover {
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.35);
  }

  &:active:not(.dragging) {
    transform: scale(0.95);
  }
}

.bubble-avatar {
  width: 100%;
  height: 100%;
  border-radius: 50%;
  object-fit: cover;
  pointer-events: none;

  &--placeholder {
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 22px;
    background: var(--color-surface-variant, #2a2a3e);
  }
}

.red-dot {
  position: absolute;
  top: 0;
  right: 0;
  width: 14px;
  height: 14px;
  background: #ef4444;
  border: 2px solid var(--color-surface, #1a1a2e);
  border-radius: 50%;
  pointer-events: none;
}

// 進出動畫
.bubble-pop-enter-active {
  animation: bubble-enter 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.bubble-pop-leave-active {
  animation: bubble-leave 0.2s ease-out forwards;
}

@keyframes bubble-enter {
  0% {
    opacity: 0;
    transform: scale(0.3);
  }
  100% {
    opacity: 1;
    transform: scale(1);
  }
}

@keyframes bubble-leave {
  0% {
    opacity: 1;
    transform: scale(1);
  }
  100% {
    opacity: 0;
    transform: scale(0.3);
  }
}
</style>
