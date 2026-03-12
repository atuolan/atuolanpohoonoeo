<script setup lang="ts">
import { Check, Eraser, Palette, RotateCcw, X } from "lucide-vue-next";
import { onMounted, onUnmounted, ref } from "vue";

const emit = defineEmits<{
  save: [imageUrl: string];
  close: [];
}>();

// Canvas 相關
const canvasRef = ref<HTMLCanvasElement | null>(null);
const isDrawing = ref(false);
const lastX = ref(0);
const lastY = ref(0);

// 繪圖設定
const brushSize = ref(8);
const brushColor = ref("#374151");
const isEraser = ref(false);

// 預設顏色
const colorPalette = [
  "#374151", // 深灰
  "#ef4444", // 紅
  "#f97316", // 橙
  "#eab308", // 黃
  "#22c55e", // 綠
  "#06b6d4", // 青
  "#3b82f6", // 藍
  "#8b5cf6", // 紫
  "#ec4899", // 粉
  "#ffffff", // 白
];

// 筆刷大小選項
const brushSizes = [4, 8, 12, 16];

// 獲取 Canvas 上下文
function getContext(): CanvasRenderingContext2D | null {
  return canvasRef.value?.getContext("2d") || null;
}

// 初始化 Canvas
function initCanvas() {
  const canvas = canvasRef.value;
  const ctx = getContext();
  if (!canvas || !ctx) return;

  // 設定 Canvas 大小（高解析度支援）
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);

  // 填充白色背景
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, rect.width, rect.height);

  // 設定繪圖樣式
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
}

// 獲取觸控/滑鼠位置
function getPosition(e: MouseEvent | TouchEvent): { x: number; y: number } {
  const canvas = canvasRef.value;
  if (!canvas) return { x: 0, y: 0 };

  const rect = canvas.getBoundingClientRect();
  let clientX: number, clientY: number;

  if ("touches" in e) {
    clientX = e.touches[0].clientX;
    clientY = e.touches[0].clientY;
  } else {
    clientX = e.clientX;
    clientY = e.clientY;
  }

  return {
    x: clientX - rect.left,
    y: clientY - rect.top,
  };
}

// 開始繪製
function startDrawing(e: MouseEvent | TouchEvent) {
  e.preventDefault();
  isDrawing.value = true;
  const pos = getPosition(e);
  lastX.value = pos.x;
  lastY.value = pos.y;

  // 畫一個點（處理單擊）
  const ctx = getContext();
  if (ctx) {
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, brushSize.value / 2, 0, Math.PI * 2);
    ctx.fillStyle = isEraser.value ? "#ffffff" : brushColor.value;
    ctx.fill();
  }
}

// 繪製中
function draw(e: MouseEvent | TouchEvent) {
  if (!isDrawing.value) return;
  e.preventDefault();

  const ctx = getContext();
  if (!ctx) return;

  const pos = getPosition(e);

  ctx.beginPath();
  ctx.moveTo(lastX.value, lastY.value);
  ctx.lineTo(pos.x, pos.y);
  ctx.strokeStyle = isEraser.value ? "#ffffff" : brushColor.value;
  ctx.lineWidth = brushSize.value;
  ctx.stroke();

  lastX.value = pos.x;
  lastY.value = pos.y;
}

// 結束繪製
function stopDrawing() {
  isDrawing.value = false;
}

// 清除畫布
function clearCanvas() {
  const canvas = canvasRef.value;
  const ctx = getContext();
  if (!canvas || !ctx) return;

  const rect = canvas.getBoundingClientRect();
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, rect.width, rect.height);
}

// 切換橡皮擦
function toggleEraser() {
  isEraser.value = !isEraser.value;
}

// 選擇顏色
function selectColor(color: string) {
  brushColor.value = color;
  isEraser.value = false;
}

// 選擇筆刷大小
function selectBrushSize(size: number) {
  brushSize.value = size;
}

// 保存圖標
function saveIcon() {
  const canvas = canvasRef.value;
  if (!canvas) return;

  // 導出為 PNG
  const dataUrl = canvas.toDataURL("image/png");
  emit("save", dataUrl);
}

// 生命週期
onMounted(() => {
  document.body.style.overflow = "hidden";
  // 延遲初始化確保 DOM 已渲染
  setTimeout(initCanvas, 50);
});

onUnmounted(() => {
  document.body.style.overflow = "";
});
</script>

<template>
  <div class="draw-icon-panel" @touchmove.prevent>
    <div class="panel-backdrop" @click="emit('close')"></div>

    <div class="panel-content">
      <!-- 標題 -->
      <div class="panel-header">
        <h3>繪製圖標</h3>
        <button class="close-btn" @click="emit('close')">
          <X :size="20" :stroke-width="2" />
        </button>
      </div>

      <!-- 畫布區域 -->
      <div class="canvas-container">
        <canvas
          ref="canvasRef"
          class="draw-canvas"
          @mousedown="startDrawing"
          @mousemove="draw"
          @mouseup="stopDrawing"
          @mouseleave="stopDrawing"
          @touchstart="startDrawing"
          @touchmove="draw"
          @touchend="stopDrawing"
        ></canvas>
      </div>

      <!-- 工具列 -->
      <div class="toolbar">
        <!-- 顏色選擇 -->
        <div class="tool-section">
          <div class="tool-label">
            <Palette :size="14" />
            顏色
          </div>
          <div class="color-palette">
            <button
              v-for="color in colorPalette"
              :key="color"
              :class="[
                'color-btn',
                { active: brushColor === color && !isEraser },
              ]"
              :style="{ backgroundColor: color }"
              @click="selectColor(color)"
            >
              <span v-if="color === '#ffffff'" class="white-indicator"></span>
            </button>
          </div>
        </div>

        <!-- 筆刷大小 -->
        <div class="tool-section">
          <div class="tool-label">筆刷大小</div>
          <div class="brush-sizes">
            <button
              v-for="size in brushSizes"
              :key="size"
              :class="['size-btn', { active: brushSize === size }]"
              @click="selectBrushSize(size)"
            >
              <span
                class="size-dot"
                :style="{ width: `${size}px`, height: `${size}px` }"
              ></span>
            </button>
          </div>
        </div>

        <!-- 工具按鈕 -->
        <div class="tool-section">
          <div class="tool-label">工具</div>
          <div class="tool-buttons">
            <button
              :class="['tool-btn', { active: isEraser }]"
              @click="toggleEraser"
            >
              <Eraser :size="18" />
              橡皮擦
            </button>
            <button class="tool-btn" @click="clearCanvas">
              <RotateCcw :size="18" />
              清除
            </button>
          </div>
        </div>
      </div>

      <!-- 底部按鈕 -->
      <div class="panel-footer">
        <button class="footer-btn cancel" @click="emit('close')">取消</button>
        <button class="footer-btn save" @click="saveIcon">
          <Check :size="16" />
          使用此圖標
        </button>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.draw-icon-panel {
  position: fixed;
  inset: 0;
  z-index: 260;
  display: flex;
  align-items: center;
  justify-content: center;
}

.panel-backdrop {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(4px);
  animation: fadeIn 0.2s ease;
}

@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

.panel-content {
  position: relative;
  width: 90%;
  max-width: 400px;
  background: #ffffff;
  border-radius: 24px;
  padding: 20px;
  animation: scaleIn 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
  max-height: 90vh;
  overflow-y: auto;
}

@keyframes scaleIn {
  from {
    opacity: 0;
    transform: scale(0.9);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;

  h3 {
    font-size: 18px;
    font-weight: 700;
    color: #1f2937;
  }

  .close-btn {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    background: #f3f4f6;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #6b7280;
    transition: all 0.2s;

    &:hover {
      background: #e5e7eb;
      color: #374151;
    }
  }
}

// 畫布容器
.canvas-container {
  width: 100%;
  aspect-ratio: 1;
  background: #f8fafc;
  border-radius: 16px;
  border: 2px solid #e5e7eb;
  overflow: hidden;
  margin-bottom: 16px;
  touch-action: none;
}

.draw-canvas {
  width: 100%;
  height: 100%;
  cursor: crosshair;
  touch-action: none;
}

// 工具列
.toolbar {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 16px;
}

.tool-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.tool-label {
  font-size: 12px;
  font-weight: 600;
  color: #6b7280;
  display: flex;
  align-items: center;
  gap: 4px;
}

// 顏色選擇
.color-palette {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.color-btn {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: 2px solid transparent;
  transition: all 0.2s;
  position: relative;

  &:hover {
    transform: scale(1.1);
  }

  &.active {
    border-color: #4f46e5;
    box-shadow:
      0 0 0 2px white,
      0 0 0 4px #4f46e5;
  }

  .white-indicator {
    position: absolute;
    inset: 2px;
    border: 1px solid #d1d5db;
    border-radius: 50%;
  }
}

// 筆刷大小
.brush-sizes {
  display: flex;
  gap: 8px;
}

.size-btn {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  background: #f3f4f6;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;

  &:hover {
    background: #e5e7eb;
  }

  &.active {
    background: #e0e7ff;
    box-shadow: 0 0 0 2px #4f46e5;
  }

  .size-dot {
    background: #374151;
    border-radius: 50%;
  }
}

// 工具按鈕
.tool-buttons {
  display: flex;
  gap: 8px;
}

.tool-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  border-radius: 10px;
  background: #f3f4f6;
  font-size: 13px;
  font-weight: 500;
  color: #374151;
  transition: all 0.2s;

  &:hover {
    background: #e5e7eb;
  }

  &.active {
    background: #fef3c7;
    color: #92400e;
  }
}

// 底部按鈕
.panel-footer {
  display: flex;
  gap: 12px;
}

.footer-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 14px 20px;
  border-radius: 14px;
  font-size: 15px;
  font-weight: 600;
  transition: all 0.2s;

  &.cancel {
    background: #f3f4f6;
    color: #6b7280;

    &:hover {
      background: #e5e7eb;
      color: #374151;
    }
  }

  &.save {
    background: linear-gradient(135deg, #84fab0 0%, #8fd3f4 100%);
    color: #065f46;

    &:hover {
      transform: translateY(-2px);
      box-shadow: 0 6px 16px rgba(132, 250, 176, 0.4);
    }
  }
}
</style>
