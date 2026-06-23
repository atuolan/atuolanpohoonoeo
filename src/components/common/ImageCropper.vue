<script setup lang="ts">
import { ref, computed, watch, onUnmounted, nextTick } from 'vue'

// Props
const props = defineProps<{
  visible: boolean
  imageSrc: string
  aspectRatio?: number // 寬高比 (width/height)，0 或 undefined 表示自由裁切；預設 9/16（手機直式桌布）
  outputWidth?: number  // 輸出寬度，默認 1080
  outputHeight?: number // 輸出高度（配合 aspectRatio 自動計算）
  outputQuality?: number
  title?: string
}>()

// Emits
const emit = defineEmits<{
  (e: 'close'): void
  (e: 'crop', dataUrl: string): void
}>()

// 預設值
const outWidth = computed(() => props.outputWidth ?? 1080)
const cropTitle = computed(() => props.title ?? '裁剪圖片')
const effectiveAspectRatio = computed(() => props.aspectRatio ?? 9 / 16)

// Canvas ref
const canvasRef = ref<HTMLCanvasElement | null>(null)
const containerRef = ref<HTMLDivElement | null>(null)

// 圖片狀態
const imageLoaded = ref(false)
const image = ref<HTMLImageElement | null>(null)

// 圖片變換狀態（拖曳 + 縮放）
const imageTransform = ref({
  x: 0,    // 圖片相對於 viewport 中心的偏移 x
  y: 0,    // 圖片相對於 viewport 中心的偏移 y
  scale: 1, // 圖片縮放倍率（相對於 cover 尺寸）
})

// 拖曳狀態
const isDragging = ref(false)
const dragStart = ref({ x: 0, y: 0 })
const transformStart = ref({ x: 0, y: 0 })

// 雙指縮放狀態
const isPinching = ref(false)
const initialPinchDistance = ref(0)
const initialPinchScale = ref(1)

// 顯示尺寸（圖片在 cover 模式下的尺寸）
const coverSize = ref({ width: 0, height: 0 })

// 視口（固定裁切區域）
const viewport = ref({ x: 0, y: 0, width: 0, height: 0 })

// 縮放範圍
const minScale = 1
const maxScale = 5

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
    nextTick(() => calculateLayout())
  }
  img.onerror = () => {
    alert('圖片載入失敗')
    emit('close')
  }
  img.src = src
}

// 計算佈局：視口位置 + 圖片 cover 尺寸
function calculateLayout() {
  if (!image.value || !containerRef.value) return

  const containerWidth = containerRef.value.clientWidth
  const containerHeight = containerRef.value.clientHeight

  if (containerWidth === 0 || containerHeight === 0) return

  const ratio = effectiveAspectRatio.value

  // 計算視口尺寸（在容器內置中，留一些邊距）
  const padding = 16
  const availW = containerWidth - padding * 2
  const availH = containerHeight - padding * 2

  let vpW: number, vpH: number
  if (ratio > availW / availH) {
    // 視口較寬，以寬度為準
    vpW = availW
    vpH = vpW / ratio
  } else {
    // 視口較高，以高度為準
    vpH = availH
    vpW = vpH * ratio
  }

  viewport.value = {
    x: (containerWidth - vpW) / 2,
    y: (containerHeight - vpH) / 2,
    width: vpW,
    height: vpH,
  }

  // 計算 cover 尺寸：圖片填滿視口的最小尺寸
  const imgRatio = image.value.width / image.value.height
  const vpRatio = vpW / vpH

  let coverW: number, coverH: number
  if (imgRatio > vpRatio) {
    // 圖片較寬，以高度為準
    coverH = vpH
    coverW = coverH * imgRatio
  } else {
    // 圖片較高，以寬度為準
    coverW = vpW
    coverH = coverW / imgRatio
  }

  coverSize.value = { width: coverW, height: coverH }

  // 重置變換
  resetTransform()
}

function resetTransform() {
  imageTransform.value = { x: 0, y: 0, scale: 1 }
}

// 計算圖片在容器中的實際位置和尺寸
const imageDisplayStyle = computed(() => {
  const vp = viewport.value
  const cs = coverSize.value
  const tf = imageTransform.value

  const scaledW = cs.width * tf.scale
  const scaledH = cs.height * tf.scale

  // 圖片中心對齊視口中心，再加上偏移
  const vpCenterX = vp.x + vp.width / 2
  const vpCenterY = vp.y + vp.height / 2

  const left = vpCenterX - scaledW / 2 + tf.x
  const top = vpCenterY - scaledH / 2 + tf.y

  return {
    width: `${scaledW}px`,
    height: `${scaledH}px`,
    left: `${left}px`,
    top: `${top}px`,
  }
})

// 限制偏移：確保視口不會超出圖片邊界
function clampOffset(x: number, y: number, scale: number) {
  const cs = coverSize.value
  const vp = viewport.value

  const scaledW = cs.width * scale
  const scaledH = cs.height * scale

  // 圖片中心相對於視口中心的偏移
  // 視口邊緣不能超出圖片
  const maxOffsetX = Math.max(0, (scaledW - vp.width) / 2)
  const maxOffsetY = Math.max(0, (scaledH - vp.height) / 2)

  return {
    x: Math.max(-maxOffsetX, Math.min(maxOffsetX, x)),
    y: Math.max(-maxOffsetY, Math.min(maxOffsetY, y)),
  }
}

// 取得滑鼠/觸控座標
function getClientPos(e: MouseEvent | TouchEvent): { x: number; y: number } {
  if ('touches' in e && e.touches.length > 0) {
    return { x: e.touches[0].clientX, y: e.touches[0].clientY }
  }
  if ('clientX' in e) {
    return { x: e.clientX, y: e.clientY }
  }
  return { x: 0, y: 0 }
}

// 雙指距離
function getPinchDistance(e: TouchEvent): number {
  if (e.touches.length < 2) return 0
  const dx = e.touches[0].clientX - e.touches[1].clientX
  const dy = e.touches[0].clientY - e.touches[1].clientY
  return Math.sqrt(dx * dx + dy * dy)
}

let moveListenersBound = false
let moveRafId = 0
let latestMoveEvent: MouseEvent | TouchEvent | null = null

function bindMoveListeners() {
  if (moveListenersBound) return
  moveListenersBound = true
  window.addEventListener('mousemove', onMove)
  window.addEventListener('mouseup', onEnd)
  window.addEventListener('touchmove', onMove, { passive: false })
  window.addEventListener('touchend', onEnd)
  window.addEventListener('touchcancel', onEnd)
}

function unbindMoveListeners() {
  if (!moveListenersBound) return
  moveListenersBound = false
  window.removeEventListener('mousemove', onMove)
  window.removeEventListener('mouseup', onEnd)
  window.removeEventListener('touchmove', onMove)
  window.removeEventListener('touchend', onEnd)
  window.removeEventListener('touchcancel', onEnd)
}

// 拖曳開始
function onDragStart(e: MouseEvent | TouchEvent) {
  e.preventDefault()
  bindMoveListeners()

  // 雙指時直接進入縮放，避免常駐 touchmove 監聽
  if ('touches' in e && e.touches.length >= 2) {
    isPinching.value = true
    isDragging.value = false
    initialPinchDistance.value = getPinchDistance(e)
    initialPinchScale.value = imageTransform.value.scale
    return
  }

  isDragging.value = true
  const pos = getClientPos(e)
  dragStart.value = pos
  transformStart.value = { x: imageTransform.value.x, y: imageTransform.value.y }
}

// 移動
function runMove(e: MouseEvent | TouchEvent) {
  if (isPinching.value) return

  // 雙指縮放
  if ('touches' in e && e.touches.length === 2) {
    e.preventDefault()
    if (!isPinching.value) {
      isPinching.value = true
      isDragging.value = false
      initialPinchDistance.value = getPinchDistance(e)
      initialPinchScale.value = imageTransform.value.scale
      return
    }

    const currentDist = getPinchDistance(e)
    const scaleRatio = currentDist / initialPinchDistance.value
    const newScale = Math.max(minScale, Math.min(maxScale, initialPinchScale.value * scaleRatio))
    const clamped = clampOffset(imageTransform.value.x, imageTransform.value.y, newScale)
    imageTransform.value = { x: clamped.x, y: clamped.y, scale: newScale }
    return
  }

  if (!isDragging.value) return
  e.preventDefault()

  const pos = getClientPos(e)
  const deltaX = pos.x - dragStart.value.x
  const deltaY = pos.y - dragStart.value.y

  const newX = transformStart.value.x + deltaX
  const newY = transformStart.value.y + deltaY
  const clamped = clampOffset(newX, newY, imageTransform.value.scale)

  imageTransform.value = {
    x: clamped.x,
    y: clamped.y,
    scale: imageTransform.value.scale,
  }
}

function onMove(e: MouseEvent | TouchEvent) {
  latestMoveEvent = e
  if (moveRafId) return
  moveRafId = requestAnimationFrame(() => {
    moveRafId = 0
    if (!latestMoveEvent) return
    const event = latestMoveEvent
    latestMoveEvent = null
    runMove(event)
  })
}

function flushMove() {
  if (!latestMoveEvent) return
  const event = latestMoveEvent
  latestMoveEvent = null
  if (moveRafId) {
    cancelAnimationFrame(moveRafId)
    moveRafId = 0
  }
  runMove(event)
}

// 結束
function onEnd(e: MouseEvent | TouchEvent) {
  flushMove()
  isDragging.value = false
  // 雙指結束
  if ('touches' in e) {
    if (e.touches.length === 0) {
      isPinching.value = false
      unbindMoveListeners()
    }
  } else {
    isPinching.value = false
    unbindMoveListeners()
  }
}

// 滾輪縮放
function onWheel(e: WheelEvent) {
  e.preventDefault()
  const delta = e.deltaY > 0 ? -0.05 : 0.05
  const newScale = Math.max(minScale, Math.min(maxScale, imageTransform.value.scale + delta))
  const clamped = clampOffset(imageTransform.value.x, imageTransform.value.y, newScale)
  imageTransform.value = { x: clamped.x, y: clamped.y, scale: newScale }
}

// 縮放滑桿
function onZoomSliderInput(e: Event) {
  const val = Number((e.target as HTMLInputElement).value)
  const newScale = Math.max(minScale, Math.min(maxScale, val))
  const clamped = clampOffset(imageTransform.value.x, imageTransform.value.y, newScale)
  imageTransform.value = { x: clamped.x, y: clamped.y, scale: newScale }
}

// 執行裁剪
function doCrop() {
  if (!image.value || !canvasRef.value) return

  const canvas = canvasRef.value
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  const vp = viewport.value
  const cs = coverSize.value
  const tf = imageTransform.value
  const img = image.value

  // 計算視口在「cover 尺寸 + 偏移 + 縮放」座標系中的位置
  // 視口中心
  const vpCenterX = vp.x + vp.width / 2
  const vpCenterY = vp.y + vp.height / 2

  // 圖片左上角在容器中的位置
  const scaledW = cs.width * tf.scale
  const scaledH = cs.height * tf.scale
  const imgLeft = vpCenterX - scaledW / 2 + tf.x
  const imgTop = vpCenterY - scaledH / 2 + tf.y

  // 視口在圖片顯示座標中的區域
  const cropDisplayX = vp.x - imgLeft
  const cropDisplayY = vp.y - imgTop
  const cropDisplayW = vp.width
  const cropDisplayH = vp.height

  // 映射到原圖座標
  const scaleX = img.width / scaledW
  const scaleY = img.height / scaledH

  const sourceX = cropDisplayX * scaleX
  const sourceY = cropDisplayY * scaleY
  const sourceW = cropDisplayW * scaleX
  const sourceH = cropDisplayH * scaleY

  // 輸出尺寸
  const outW = outWidth.value
  const outH = props.outputHeight
    ? props.outputHeight
    : Math.round(outW / effectiveAspectRatio.value)

  canvas.width = outW
  canvas.height = outH

  ctx.drawImage(
    img,
    Math.max(0, sourceX), Math.max(0, sourceY),
    Math.min(sourceW, img.width - Math.max(0, sourceX)),
    Math.min(sourceH, img.height - Math.max(0, sourceY)),
    0, 0, outW, outH
  )

  const dataUrl = canvas.toDataURL('image/jpeg', props.outputQuality ?? 0.92)
  emit('crop', dataUrl)
}

function handleClose() {
  emit('close')
}

// 遮罩路徑（視口外部半透明遮罩）
const maskPath = computed(() => {
  const vp = viewport.value
  if (!vp.width) return ''

  const cw = containerRef.value?.clientWidth ?? 0
  const ch = containerRef.value?.clientHeight ?? 0
  if (!cw || !ch) return ''

  return `
    M 0,0
    L ${cw},0
    L ${cw},${ch}
    L 0,${ch}
    Z
    M ${vp.x},${vp.y}
    L ${vp.x + vp.width},${vp.y}
    L ${vp.x + vp.width},${vp.y + vp.height}
    L ${vp.x},${vp.y + vp.height}
    Z
  `
})

// 縮放百分比顯示
const zoomPercent = computed(() => Math.round(imageTransform.value.scale * 100))

// 事件監聽
onUnmounted(() => {
  latestMoveEvent = null
  if (moveRafId) {
    cancelAnimationFrame(moveRafId)
    moveRafId = 0
  }
  unbindMoveListeners()
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
          <div
            class="cropper-content"
            @wheel.prevent="onWheel"
          >
            <template v-if="imageLoaded">
              <!-- 圖片（可拖曳、可縮放） -->
              <img
                :src="imageSrc"
                class="cropper-image"
                :style="imageDisplayStyle"
                @mousedown="onDragStart"
                @touchstart="onDragStart"
              />

              <!-- 遮罩（視口外部變暗） -->
              <svg class="cropper-mask">
                <path :d="maskPath" fill="rgba(0,0,0,0.6)" fill-rule="evenodd" />
              </svg>

              <!-- 視口邊框 -->
              <div
                class="crop-viewport"
                :style="{
                  left: `${viewport.x}px`,
                  top: `${viewport.y}px`,
                  width: `${viewport.width}px`,
                  height: `${viewport.height}px`,
                }"
              >
                <!-- 網格線 -->
                <div class="grid-lines">
                  <div class="grid-line h" style="top: 33.33%"></div>
                  <div class="grid-line h" style="top: 66.66%"></div>
                  <div class="grid-line v" style="left: 33.33%"></div>
                  <div class="grid-line v" style="left: 66.66%"></div>
                </div>

                <!-- 四角裝飾 -->
                <div class="corner tl"></div>
                <div class="corner tr"></div>
                <div class="corner bl"></div>
                <div class="corner br"></div>
              </div>
            </template>

            <!-- 載入中 -->
            <div v-else class="cropper-loading">
              <div class="spinner"></div>
              <p>載入中...</p>
            </div>
          </div>

          <!-- 底部控制列 -->
          <div class="cropper-footer">
            <button class="cropper-btn reset" @click="resetTransform">
              重置
            </button>
            <div class="zoom-control">
              <span class="zoom-label">縮放</span>
              <input
                type="range"
                :min="minScale"
                :max="maxScale"
                step="0.01"
                :value="imageTransform.scale"
                @input="onZoomSliderInput"
                class="zoom-slider"
              />
              <span class="zoom-value">{{ zoomPercent }}%</span>
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
  height: 100dvh;
  height: 100vh; // fallback
}

.cropper-container {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: #1a1a1a;
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

  &.reset {
    background: rgba(255, 255, 255, 0.1);
    color: #ccc;
    padding: 6px 12px;
    font-size: 13px;
    border-radius: 6px;
    &:hover { background: rgba(255, 255, 255, 0.2); }
  }
}

.cropper-content {
  flex: 1;
  position: relative;
  overflow: hidden;
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
}

.cropper-image {
  position: absolute;
  object-fit: fill;
  pointer-events: auto;
  cursor: grab;
  will-change: transform;

  &:active {
    cursor: grabbing;
  }
}

.cropper-mask {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}

.crop-viewport {
  position: absolute;
  border: 2px solid rgba(255, 255, 255, 0.8);
  pointer-events: none;
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.3);
}

.grid-lines {
  position: absolute;
  inset: 0;
  pointer-events: none;

  .grid-line {
    position: absolute;
    background: rgba(255, 255, 255, 0.2);
    &.h { left: 0; right: 0; height: 1px; }
    &.v { top: 0; bottom: 0; width: 1px; }
  }
}

.corner {
  position: absolute;
  width: 20px;
  height: 20px;
  border: 3px solid white;

  &.tl { top: -2px; left: -2px; border-right: none; border-bottom: none; }
  &.tr { top: -2px; right: -2px; border-left: none; border-bottom: none; }
  &.bl { bottom: -2px; left: -2px; border-right: none; border-top: none; }
  &.br { bottom: -2px; right: -2px; border-left: none; border-top: none; }
}

.cropper-footer {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  background: #1a1a1a;
  flex-shrink: 0;
}

.zoom-control {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 8px;
}

.zoom-label {
  font-size: 12px;
  color: #888;
  white-space: nowrap;
}

.zoom-slider {
  flex: 1;
  -webkit-appearance: none;
  appearance: none;
  height: 4px;
  background: rgba(255, 255, 255, 0.2);
  border-radius: 2px;
  outline: none;

  &::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: var(--color-primary, #7DD3A8);
    cursor: pointer;
  }

  &::-moz-range-thumb {
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: var(--color-primary, #7DD3A8);
    cursor: pointer;
    border: none;
  }
}

.zoom-value {
  font-size: 12px;
  color: #ccc;
  min-width: 40px;
  text-align: right;
  font-variant-numeric: tabular-nums;
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
