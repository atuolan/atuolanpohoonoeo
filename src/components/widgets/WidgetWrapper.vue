<script setup lang="ts">
import WidgetSettingsPanel from "@/components/panels/WidgetSettingsPanel.vue";
import { useCanvasStore } from "@/stores";
import type { WidgetInstance } from "@/types";
import { Maximize2, Settings, X } from "lucide-vue-next";
import { computed, onMounted, onUnmounted, ref } from "vue";

const props = defineProps<{
  widget: WidgetInstance;
}>();

const canvasStore = useCanvasStore();

// ===== 設定面板狀態 =====
const showSettings = ref(false);

// ===== 多選狀態 =====
const isSelected = computed(() =>
  canvasStore.isWidgetSelected(props.widget.id),
);

// ===== 拖拽狀態 =====
const isDragging = ref(false);
const isResizing = ref(false);
const wasDragged = ref(false);
const dragOffset = ref({ x: 0, y: 0 });
const tempPosition = ref({ x: 0, y: 0 });
const tempSize = ref({ width: 0, height: 0 });
const resizeStart = ref({ x: 0, y: 0, width: 0, height: 0 });

// ===== 計算組件樣式 =====
const widgetStyle = computed(() => {
  // 調整大小中
  if (isResizing.value) {
    return {
      left: `${props.widget.x * canvasStore.gridSize}px`,
      top: `${props.widget.y * canvasStore.gridSize}px`,
      width: `${tempSize.value.width}px`,
      height: `${tempSize.value.height}px`,
      zIndex: 9999,
      transition: "none",
    };
  }

  // 拖拽中使用臨時位置
  if (isDragging.value) {
    return {
      left: `${tempPosition.value.x}px`,
      top: `${tempPosition.value.y}px`,
      width: `${props.widget.width * canvasStore.gridSize}px`,
      height: `${props.widget.height * canvasStore.gridSize}px`,
      zIndex: 9999,
      transition: "none",
    };
  }

  return {
    left: `${props.widget.x * canvasStore.gridSize}px`,
    top: `${props.widget.y * canvasStore.gridSize}px`,
    width: `${props.widget.width * canvasStore.gridSize}px`,
    height: `${props.widget.height * canvasStore.gridSize}px`,
    zIndex: props.widget.zIndex,
    transition:
      "left 0.2s ease, top 0.2s ease, width 0.2s ease, height 0.2s ease",
  };
});

// ===== 拖拽事件 =====
// 記錄批量移動的初始位置
const batchMoveStartPositions = ref<Map<string, { x: number; y: number }>>(
  new Map(),
);

function onDragStart(e: MouseEvent | TouchEvent) {
  // 只有編輯模式才能拖拽
  if (!canvasStore.isEditMode) return;

  // 如果點擊的是調整大小手柄，則不處理拖拽
  if ((e.target as HTMLElement).closest(".resize-handle")) return;

  e.preventDefault();
  e.stopPropagation();

  wasDragged.value = false;

  // 檢查是否按住 Ctrl/Cmd（用於追加選取）
  const addToSelection =
    "touches" in e
      ? false
      : (e as MouseEvent).ctrlKey || (e as MouseEvent).metaKey;

  // 如果當前組件未被選取
  if (!isSelected.value) {
    // 選取當前組件
    canvasStore.selectWidget(props.widget.id, addToSelection);
  }

  isDragging.value = true;
  canvasStore.bringToFront(props.widget.id);

  const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
  const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;

  // 將螢幕座標轉換為畫布座標（考慮縮放）
  const canvasX = clientX / canvasStore.canvasScale;
  const canvasY = clientY / canvasStore.canvasScale;

  const currentLeft = props.widget.x * canvasStore.gridSize;
  const currentTop = props.widget.y * canvasStore.gridSize;

  dragOffset.value = {
    x: canvasX + canvasStore.scrollX - currentLeft,
    y: canvasY - currentTop,
  };

  tempPosition.value = {
    x: currentLeft,
    y: currentTop,
  };

  // 記錄所有選取組件的初始位置（用於批量移動）
  batchMoveStartPositions.value.clear();
  for (const id of canvasStore.selectedWidgetIds) {
    const widget = canvasStore.getWidget(id);
    if (widget) {
      batchMoveStartPositions.value.set(id, { x: widget.x, y: widget.y });
    }
  }

  if (navigator.vibrate) {
    navigator.vibrate(30);
  }
}

function onDragMove(e: MouseEvent | TouchEvent) {
  if (!isDragging.value) return;

  wasDragged.value = true;

  const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
  const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;

  // 將螢幕座標轉換為畫布座標（考慮縮放）
  const canvasX = clientX / canvasStore.canvasScale;
  const canvasY = clientY / canvasStore.canvasScale;

  tempPosition.value = {
    x: canvasX + canvasStore.scrollX - dragOffset.value.x,
    y: canvasY - dragOffset.value.y,
  };
}

function onDragEnd() {
  if (!isDragging.value) return;

  isDragging.value = false;

  const newX = Math.round(tempPosition.value.x / canvasStore.gridSize);
  const newY = Math.round(tempPosition.value.y / canvasStore.gridSize);

  const maxX =
    Math.floor(canvasStore.canvasWidth / canvasStore.gridSize) -
    props.widget.width;
  // 使用最大格數計算最大 Y（35 格）
  const MAX_GRID_ROWS = 35;
  const maxY = MAX_GRID_ROWS - props.widget.height;

  const clampedX = Math.max(0, Math.min(newX, maxX));
  const clampedY = Math.max(0, Math.min(newY, maxY));

  // 計算移動差值
  const startPos = batchMoveStartPositions.value.get(props.widget.id);
  if (startPos) {
    const deltaX = clampedX - startPos.x;
    const deltaY = clampedY - startPos.y;

    // 如果有多個選取的組件，批量移動
    if (canvasStore.selectedWidgetIds.size > 1) {
      for (const id of canvasStore.selectedWidgetIds) {
        const widgetStartPos = batchMoveStartPositions.value.get(id);
        if (widgetStartPos) {
          const widget = canvasStore.getWidget(id);
          if (widget) {
            const widgetMaxX =
              Math.floor(canvasStore.canvasWidth / canvasStore.gridSize) -
              widget.width;
            const widgetMaxY = MAX_GRID_ROWS - widget.height;
            const newWidgetX = Math.max(
              0,
              Math.min(widgetStartPos.x + deltaX, widgetMaxX),
            );
            const newWidgetY = Math.max(
              0,
              Math.min(widgetStartPos.y + deltaY, widgetMaxY),
            );
            canvasStore.updateWidgetPosition(id, newWidgetX, newWidgetY);
          }
        }
      }
    } else {
      // 單個組件移動
      canvasStore.updateWidgetPosition(props.widget.id, clampedX, clampedY);
    }
  } else {
    canvasStore.updateWidgetPosition(props.widget.id, clampedX, clampedY);
  }

  batchMoveStartPositions.value.clear();
}

// ===== 調整大小事件 =====
function onResizeStart(e: MouseEvent | TouchEvent) {
  if (!canvasStore.isEditMode) return;

  e.preventDefault();
  e.stopPropagation();

  isResizing.value = true;
  canvasStore.bringToFront(props.widget.id);

  const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
  const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;

  // 將螢幕座標轉換為畫布座標（考慮縮放）
  const canvasX = clientX / canvasStore.canvasScale;
  const canvasY = clientY / canvasStore.canvasScale;

  resizeStart.value = {
    x: canvasX,
    y: canvasY,
    width: props.widget.width * canvasStore.gridSize,
    height: props.widget.height * canvasStore.gridSize,
  };

  tempSize.value = {
    width: resizeStart.value.width,
    height: resizeStart.value.height,
  };

  if (navigator.vibrate) {
    navigator.vibrate(30);
  }
}

function onResizeMove(e: MouseEvent | TouchEvent) {
  if (!isResizing.value) return;

  const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
  const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;

  // 將螢幕座標轉換為畫布座標（考慮縮放）
  const canvasX = clientX / canvasStore.canvasScale;
  const canvasY = clientY / canvasStore.canvasScale;

  const deltaX = canvasX - resizeStart.value.x;
  const deltaY = canvasY - resizeStart.value.y;

  // 最小尺寸 (4 格)
  const minSize = canvasStore.gridSize * 4;

  tempSize.value = {
    width: Math.max(minSize, resizeStart.value.width + deltaX),
    height: Math.max(minSize, resizeStart.value.height + deltaY),
  };
}

function onResizeEnd() {
  if (!isResizing.value) return;

  isResizing.value = false;

  // 吸附到網格
  const newWidth = Math.round(tempSize.value.width / canvasStore.gridSize);
  const newHeight = Math.round(tempSize.value.height / canvasStore.gridSize);

  // 最小 4 格
  const clampedWidth = Math.max(4, newWidth);
  const clampedHeight = Math.max(4, newHeight);

  canvasStore.updateWidgetSize(props.widget.id, clampedWidth, clampedHeight);
}

// 全局事件監聽
function onPointerMove(e: MouseEvent | TouchEvent) {
  onDragMove(e);
  onResizeMove(e);
}

function onPointerEnd() {
  onDragEnd();
  onResizeEnd();
}

onMounted(() => {
  window.addEventListener("mousemove", onPointerMove);
  window.addEventListener("mouseup", onPointerEnd);
  window.addEventListener("touchmove", onPointerMove, { passive: true });
  window.addEventListener("touchend", onPointerEnd);
});

onUnmounted(() => {
  window.removeEventListener("mousemove", onPointerMove);
  window.removeEventListener("mouseup", onPointerEnd);
  window.removeEventListener("touchmove", onPointerMove);
  window.removeEventListener("touchend", onPointerEnd);
});

// 刪除組件
function onDelete(e: Event) {
  e.stopPropagation();
  canvasStore.removeWidget(props.widget.id);
}

// 打開設定面板
function openSettings(e: Event) {
  e.stopPropagation();
  e.preventDefault();
  showSettings.value = true;
}

// 關閉設定面板
function closeSettings() {
  showSettings.value = false;
}

// 攔截拖曳後的 click 事件，防止打開 app
function onWrapperClick(e: MouseEvent) {
  if (wasDragged.value) {
    e.stopPropagation();
    e.preventDefault();
    wasDragged.value = false;
  }
}
</script>

<template>
  <div
    class="widget-wrapper"
    :class="{
      'edit-mode': canvasStore.isEditMode,
      'is-dragging': isDragging,
      'is-resizing': isResizing,
      'is-selected': isSelected,
    }"
    :style="widgetStyle"
    @mousedown="onDragStart"
    @touchstart="onDragStart"
    @click.capture="onWrapperClick"
  >
    <!-- 組件內容 -->
    <div class="widget-content">
      <slot></slot>
    </div>

    <!-- 編輯模式下的刪除按鈕 -->
    <button
      v-if="canvasStore.isEditMode"
      class="delete-btn"
      @click="onDelete"
      @touchend.prevent="onDelete"
    >
      <X :size="14" :stroke-width="2.5" />
    </button>

    <!-- 編輯模式下的設定按鈕 -->
    <button
      v-if="canvasStore.isEditMode"
      class="settings-btn"
      @click="openSettings"
      @touchend.prevent="openSettings"
    >
      <Settings :size="14" :stroke-width="2.5" />
    </button>

    <!-- 編輯模式下的調整大小手柄 -->
    <div
      v-if="canvasStore.isEditMode"
      class="resize-handle"
      @mousedown="onResizeStart"
      @touchstart="onResizeStart"
    >
      <Maximize2 :size="12" :stroke-width="2.5" />
    </div>

    <!-- 設定面板 -->
    <Teleport to="body">
      <WidgetSettingsPanel
        v-if="showSettings"
        :widget="widget"
        @close="closeSettings"
      />
    </Teleport>
  </div>
</template>

<style lang="scss" scoped>
.widget-wrapper {
  position: absolute;
  // 非編輯模式：允許垂直觸控穿透，避免吃掉滑動手勢
  touch-action: pan-y;

  &.edit-mode {
    cursor: grab;
    touch-action: none; // 編輯模式下禁用瀏覽器預設觸控行為

    &:active {
      cursor: grabbing;
    }
  }

  &.is-selected {
    .widget-content {
      outline: 3px solid rgba(99, 179, 237, 0.8);
      outline-offset: 2px;
    }

    // 選取指示器
    &::before {
      content: "";
      position: absolute;
      inset: -6px;
      border: 2px dashed rgba(99, 179, 237, 0.6);
      border-radius: calc(var(--radius-lg) + 6px);
      pointer-events: none;
      animation: selectedPulse 1.5s ease-in-out infinite;
    }
  }

  &.is-dragging {
    opacity: 0.9;

    .widget-content {
      box-shadow: 0 20px 40px rgba(0, 0, 0, 0.2);
      transform: scale(1.02);
    }
  }

  &.is-resizing {
    .widget-content {
      box-shadow: 0 10px 30px rgba(99, 102, 241, 0.3);
    }

    .resize-handle {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      transform: scale(1.1);
    }
  }
}

@keyframes selectedPulse {
  0%,
  100% {
    opacity: 0.6;
  }
  50% {
    opacity: 1;
  }
}

.widget-content {
  width: 100%;
  height: 100%;
  border-radius: var(--radius-lg);
  overflow: hidden;
  transition:
    transform 0.2s,
    box-shadow 0.2s;
}

.delete-btn {
  position: absolute;
  top: -10px;
  right: -10px;
  width: 26px;
  height: 26px;
  border-radius: 50%;
  background: linear-gradient(135deg, #ff6b6b 0%, #ee5a5a 100%);
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 3px 10px rgba(238, 90, 90, 0.4);
  z-index: 10;
  transition: all 0.2s;

  &:hover {
    transform: scale(1.15);
    box-shadow: 0 4px 14px rgba(238, 90, 90, 0.5);
  }

  &:active {
    transform: scale(1);
  }
}

.settings-btn {
  position: absolute;
  top: -8px;
  left: -8px;
  width: 28px;
  height: 28px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(10px);
  color: #6b7280;
  border: 1.5px solid rgba(0, 0, 0, 0.08);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow:
    0 2px 8px rgba(0, 0, 0, 0.08),
    0 1px 2px rgba(0, 0, 0, 0.04);
  z-index: 10;
  transition: all 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);

  svg {
    transition: transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
  }

  &:hover {
    transform: scale(1.1);
    background: white;
    border-color: rgba(99, 102, 241, 0.3);
    color: #4f46e5;
    box-shadow:
      0 4px 16px rgba(99, 102, 241, 0.15),
      0 2px 4px rgba(0, 0, 0, 0.05);

    svg {
      transform: rotate(90deg);
    }
  }

  &:active {
    transform: scale(0.95);
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.1);
  }
}

.resize-handle {
  position: absolute;
  bottom: -10px;
  right: -10px;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: white;
  border: 2px solid #a5b4fc;
  color: #6366f1;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 12px rgba(99, 102, 241, 0.2);
  cursor: se-resize;
  z-index: 100;
  transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);

  // 旋轉圖標使其指向右下角
  svg {
    transform: rotate(90deg);
    transition: transform 0.3s;
  }

  &:hover {
    transform: scale(1.15);
    background: #6366f1;
    border-color: #6366f1;
    color: white;
    box-shadow: 0 8px 20px rgba(99, 102, 241, 0.4);

    svg {
      transform: rotate(90deg) scale(1.1);
    }
  }

  &:active {
    transform: scale(0.95);
    box-shadow: 0 2px 8px rgba(99, 102, 241, 0.3);
  }
}
</style>
