<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'

// Props
const props = defineProps<{
  visible: boolean
  imageSrc: string
  aspectRatio?: number // 寬高比 (width/height)，0 或 undefined 表示自由裁切
  outputWidth?: number  // 輸出寬度，默認 512
  outputHeight?: number // 輸出高度（配合 aspectRatio 自動計算）
  title?: string
}>()

// Emits
const emit = defineEmits<{
  (e: 'close'): void
  (e: 'crop', dataUrl: string): void
}>()

// 預設值
const outWidth = computed(() => props.outputWidth ?? 512)
const cropTitle = computed(() => props.title ?? '裁剪圖片')

// Canvas refs
const canvasRef = ref<HTMLCanvasElement | null>(null)
const containerRef = ref<HTMLDivElement | null>(null)

// 圖片狀態
const imageLoaded = ref(false)
const image = ref<HTMLImageElement | null>(null)

// 裁剪框狀態 (x, y, width, height 相對於顯示圖片)
const cropBox = ref({
  x: 0,
  y: 0,
  width: 200,
  height: 200
})

// 拖拽狀態
const isDragging = ref(false)
const isResizing = ref(false)
const resizeHandle = ref('')
const dragStart = ref({ x: 0, y: 0 })
const cropStart = ref({ x: 0, y: 0, width: 0, height: 0 })

// 圖片顯示狀態
const displaySize = ref({ width: 0, height: 0 })
const imageOffset = ref({ x: 0, y: 0 })

// 載入圖片
watch(() => [props.imageSrc, props.visible], ([src, vis]) => {
  if (src && vis) {
    imageLoaded.value = false
    loadImage(src as string)
  }
}, { immediate: true })

function loadImage(src: string) {
  const img = new Image()
  img.onload = () => {
    image.value = img
    imageLoaded.value = true
    nextTick(() => calculateDisplaySize())
  }
  img.onerror = () => {
    alert('圖片載入失敗')
    emit('close')
  }
  img.src = src
}

// 計算顯示尺寸
function calculateDisplaySize() {
  if (!image.value || !containerRef.value) return
  
  const containerWidth = containerRef.value.clientWidth - 40
  const containerHeight = containerRef.value.clientHeight - 40
  
  const imgRatio = image.value.width / image.value.height
  
  let width, height
  if (imgRatio > containerWidth / containerHeight) {
    width = containerWidth
    height = width / imgRatio
  } else {
    height = containerHeight
    width = height * imgRatio
  }
  
  displaySize.value = { width, height }
  imageOffset.value = {
    x: (containerWidth - width) / 2 + 20,
    y: (containerHeight - height) / 2 + 20
  }
  
  // 初始化裁剪框
  initCropBox(width, height)
}

function initCropBox(imgW: number, imgH: number) {
  const ratio = props.aspectRatio
  if (ratio && ratio > 0) {
    // 固定比例
    let cw: number, ch: number
    if (ratio > imgW / imgH) {
      cw = imgW * 0.85
      ch = cw / ratio
    } else {
      ch = imgH * 0.85
      cw = ch * ratio
    }
    cropBox.value = {
      x: (imgW - cw) / 2,
      y: (imgH - ch) / 2,
      width: cw,
      height: ch
    }
  } else {
    // 自由裁切：預設用圖片 80%
    const cw = imgW * 0.85
    const ch = imgH * 0.85
    cropBox.value = {
      x: (imgW - cw) / 2,
      y: (imgH - ch) / 2,
      width: cw,
      height: ch
    }
  }
}

function getClientPos(e: MouseEvent | TouchEvent) {
  if ('touches' in e && e.touches.length > 0) {
    return { x: e.touches[0].clientX, y: e.touches[0].clientY }
  }
  if ('clientX' in e) {
    return { x: e.clientX, y: e.clientY }
  }
  return { x: 0, y: 0 }
}

// 處理拖拽開始
function onDragStart(e: MouseEvent | TouchEvent) {
  e.preventDefault()
  isDragging.value = true
  const pos = getClientPos(e)
  dragStart.value = pos
  cropStart.value = { ...cropBox.value }
}

// 處理調整大小開始
function onResizeStart(handle: string, e: MouseEvent | TouchEvent) {
  e.preventDefault()
  e.stopPropagation()
  isResizing.value = true
  resizeHandle.value = handle
  const pos = getClientPos(e)
  dragStart.value = pos
  cropStart.value = { ...cropBox.value }
}

// 處理移動
function onMove(e: MouseEvent | TouchEvent) {
  if (!isDragging.value && !isResizing.value) return
  
  const pos = getClientPos(e)
  const deltaX = pos.x - dragStart.value.x
  const deltaY = pos.y - dragStart.value.y
  
  if (isDragging.value) {
    let newX = cropStart.value.x + deltaX
    let newY = cropStart.value.y + deltaY
    newX = Math.max(0, Math.min(newX, displaySize.value.width - cropBox.value.width))
    newY = Math.max(0, Math.min(newY, displaySize.value.height - cropBox.value.height))
    cropBox.value.x = newX
    cropBox.value.y = newY
  } else if (isResizing.value) {
    handleResize(deltaX, deltaY)
  }
}

function handleResize(dx: number, dy: number) {
  const ratio = props.aspectRatio
  const minW = 60
  const minH = 60
  const s = cropStart.value
  const imgW = displaySize.value.width
  const imgH = displaySize.value.height
  
  let newX = s.x, newY = s.y, newW = s.width, newH = s.height
  const handle = resizeHandle.value
  
  // 根據 handle 方向調整
  if (handle.includes('r')) {
    newW = Math.max(minW, Math.min(s.width + dx, imgW - s.x))
  }
  if (handle.includes('l')) {
    const maxDx = s.width - minW
    const clampedDx = Math.max(-s.x, Math.min(dx, maxDx))
    newX = s.x + clampedDx
    newW = s.width - clampedDx
  }
  if (handle.includes('b')) {
    newH = Math.max(minH, Math.min(s.height + dy, imgH - s.y))
  }
  if (handle.includes('t')) {
    const maxDy = s.height - minH
    const clampedDy = Math.max(-s.y, Math.min(dy, maxDy))
    newY = s.y + clampedDy
    newH = s.height - clampedDy
  }
  
  // 固定比例時，用寬度驅動高度
  if (ratio && ratio > 0) {
    if (handle.includes('l') || handle.includes('r')) {
      newH = newW / ratio
    } else {
      newW = newH * ratio
    }
    // 邊界修正
    if (newX + newW > imgW) newW = imgW - newX
    if (newY + newH > imgH) newH = imgH - newY
    if (newW / newH !== ratio) {
      if (newW / ratio < newH) newH = newW / ratio
      else newW = newH * ratio
    }
  }
  
  cropBox.value = { x: newX, y: newY, width: newW, height: newH }
}

// 處理結束
function onEnd() {
  isDragging.value = false
  isResizing.value = false
  resizeHandle.value = ''
}

// 執行裁剪
function doCrop() {
  if (!image.value || !canvasRef.value) return
  
  const canvas = canvasRef.value
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  
  // 計算原圖上的裁剪區域
  const scaleX = image.value.width / displaySize.value.width
  const scaleY = image.value.height / displaySize.value.height
  
  const sourceX = cropBox.value.x * scaleX
  const sourceY = cropBox.value.y * scaleY
  const sourceW = cropBox.value.width * scaleX
  const sourceH = cropBox.value.height * scaleY
  
  // 輸出尺寸
  const outW = outWidth.value
  const outH = props.outputHeight
    ? props.outputHeight
    : Math.round(outW * (sourceH / sourceW))
  
  canvas.width = outW
  canvas.height = outH
  
  ctx.drawImage(
    image.value,
    sourceX, sourceY, sourceW, sourceH,
    0, 0, outW, outH
  )
  
  const dataUrl = canvas.toDataURL('image/jpeg', 0.92)
  emit('crop', dataUrl)
}

function handleClose() {
  emit('close')
}

// 事件監聽
onMounted(() => {
  window.addEventListener('mousemove', onMove)
  window.addEventListener('mouseup', onEnd)
  window.addEventListener('touchmove', onMove, { passive: false })
  window.addEventListener('touchend', onEnd)
})

onUnmounted(() => {
  window.removeEventListener('mousemove', onMove)
  window.removeEventListener('mouseup', onEnd)
  window.removeEventListener('touchmove', onMove)
  window.removeEventListener('touchend', onEnd)
})

// 裁剪框樣式
const cropBoxStyle = computed(() => ({
  left: `${cropBox.value.x + imageOffset.value.x}px`,
  top: `${cropBox.value.y + imageOffset.value.y}px`,
  width: `${cropBox.value.width}px`,
  height: `${cropBox.value.height}px`
}))

// 遮罩路徑
const maskPath = computed(() => {
  if (!displaySize.value.width) return ''
  
  const ox = imageOffset.value.x
  const oy = imageOffset.value.y
  const w = displaySize.value.width
  const h = displaySize.value.height
  const cx = cropBox.value.x + ox
  const cy = cropBox.value.y + oy
  const cw = cropBox.value.width
  const ch = cropBox.value.height
  
  return `
    M ${ox},${oy}
    L ${ox + w},${oy}
    L ${ox + w},${oy + h}
    L ${ox},${oy + h}
    Z
    M ${cx},${cy}
    L ${cx},${cy + ch}
    L ${cx + cw},${cy + ch}
    L ${cx + cw},${cy}
    Z
  `
})
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="visible" class="cropper-overlay">
        <div class="cropper-container" ref="containerRef">
          <!-- 標題欄 -->
          <div class="cropper-header">
            <button class="cropper-btn cancel" @click="handleClose">
              取消
            </button>
            <h3 class="cropper-title">{{ cropTitle }}</h3>
            <button class="cropper-btn confirm" @click="doCrop">
              完成
            </button>
          </div>
          
          <!-- 圖片區域 -->
          <div class="cropper-content">
            <template v-if="imageLoaded">
              <!-- 圖片 -->
              <img 
                :src="imageSrc"
                class="cropper-image"
                :style="{
                  width: `${displaySize.width}px`,
                  height: `${displaySize.height}px`,
                  left: `${imageOffset.x}px`,
                  top: `${imageOffset.y}px`
                }"
              />
              
              <!-- 遮罩 -->
              <svg class="cropper-mask">
                <path :d="maskPath" fill="rgba(0,0,0,0.6)" fill-rule="evenodd" />
              </svg>
              
              <!-- 裁剪框 -->
              <div 
                class="crop-box"
                :style="cropBoxStyle"
                @mousedown="onDragStart"
                @touchstart="onDragStart"
              >
                <!-- 網格線 -->
                <div class="grid-lines">
                  <div class="grid-line h" style="top: 33.33%"></div>
                  <div class="grid-line h" style="top: 66.66%"></div>
                  <div class="grid-line v" style="left: 33.33%"></div>
                  <div class="grid-line v" style="left: 66.66%"></div>
                </div>
                
                <!-- 四角 + 四邊 resize handles -->
                <div class="corner tl" @mousedown.stop="onResizeStart('tl', $event)" @touchstart.stop="onResizeStart('tl', $event)"></div>
                <div class="corner tr" @mousedown.stop="onResizeStart('tr', $event)" @touchstart.stop="onResizeStart('tr', $event)"></div>
                <div class="corner bl" @mousedown.stop="onResizeStart('bl', $event)" @touchstart.stop="onResizeStart('bl', $event)"></div>
                <div class="corner br" @mousedown.stop="onResizeStart('br', $event)" @touchstart.stop="onResizeStart('br', $event)"></div>
                <div class="edge edge-t" @mousedown.stop="onResizeStart('t', $event)" @touchstart.stop="onResizeStart('t', $event)"></div>
                <div class="edge edge-b" @mousedown.stop="onResizeStart('b', $event)" @touchstart.stop="onResizeStart('b', $event)"></div>
                <div class="edge edge-l" @mousedown.stop="onResizeStart('l', $event)" @touchstart.stop="onResizeStart('l', $event)"></div>
                <div class="edge edge-r" @mousedown.stop="onResizeStart('r', $event)" @touchstart.stop="onResizeStart('r', $event)"></div>
              </div>
            </template>
            
            <!-- 載入中 -->
            <div v-else class="cropper-loading">
              <div class="spinner"></div>
              <p>載入中...</p>
            </div>
          </div>
          
          <!-- 隱藏的 canvas -->
          <canvas ref="canvasRef" class="hidden-canvas"></canvas>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style lang="scss" scoped>
.cropper-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.9);
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  // 使用 dvh 適配手機地址欄收合
  height: 100dvh;
  height: 100vh; // fallback
}

.cropper-container {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: #1a1a1a;
  // 安全區域 padding，避開瀏海和底部橫條
  padding-top: var(--safe-top, env(safe-area-inset-top, 0px));
  padding-bottom: var(--safe-bottom, env(safe-area-inset-bottom, 0px));
  padding-left: var(--safe-left, env(safe-area-inset-left, 0px));
  padding-right: var(--safe-right, env(safe-area-inset-right, 0px));
}

.cropper-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: #1a1a1a;
  flex-shrink: 0;
}

.cropper-title {
  font-size: 17px;
  font-weight: 600;
  color: white;
  margin: 0;
}

.cropper-btn {
  padding: 8px 16px;
  border: none;
  border-radius: 8px;
  font-size: 15px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  
  &.cancel {
    background: transparent;
    color: #888;
    &:hover { color: white; }
  }
  
  &.confirm {
    background: var(--color-primary, #7DD3A8);
    color: white;
    &:hover { transform: scale(1.02); }
  }
}

.cropper-content {
  flex: 1;
  position: relative;
  overflow: hidden;
}

.cropper-image {
  position: absolute;
  object-fit: contain;
  pointer-events: none;
}

.cropper-mask {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}

.crop-box {
  position: absolute;
  border: 2px solid white;
  cursor: move;
}

.grid-lines {
  position: absolute;
  inset: 0;
  pointer-events: none;
  
  .grid-line {
    position: absolute;
    background: rgba(255, 255, 255, 0.3);
    &.h { left: 0; right: 0; height: 1px; }
    &.v { top: 0; bottom: 0; width: 1px; }
  }
}

.corner {
  position: absolute;
  width: 20px;
  height: 20px;
  border: 3px solid white;
  
  &.tl { top: -2px; left: -2px; border-right: none; border-bottom: none; cursor: nw-resize; }
  &.tr { top: -2px; right: -2px; border-left: none; border-bottom: none; cursor: ne-resize; }
  &.bl { bottom: -2px; left: -2px; border-right: none; border-top: none; cursor: sw-resize; }
  &.br { bottom: -2px; right: -2px; border-left: none; border-top: none; cursor: se-resize; }
}

.edge {
  position: absolute;
  
  &.edge-t { top: -4px; left: 20px; right: 20px; height: 8px; cursor: n-resize; }
  &.edge-b { bottom: -4px; left: 20px; right: 20px; height: 8px; cursor: s-resize; }
  &.edge-l { left: -4px; top: 20px; bottom: 20px; width: 8px; cursor: w-resize; }
  &.edge-r { right: -4px; top: 20px; bottom: 20px; width: 8px; cursor: e-resize; }
}

.cropper-loading {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: white;
  gap: 16px;
  
  .spinner {
    width: 40px;
    height: 40px;
    border: 3px solid rgba(255, 255, 255, 0.2);
    border-top-color: white;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }
  
  p { font-size: 14px; color: #888; }
}

.hidden-canvas {
  position: absolute;
  left: -9999px;
  visibility: hidden;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>
