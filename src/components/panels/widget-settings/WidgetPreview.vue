<script setup lang="ts">
import { widgetComponents } from "@/components/widgets/widgetComponents";
import { useCanvasStore } from "@/stores";
import type { WidgetCustomStyle, WidgetData, WidgetInstance } from "@/types";
import {
  computed,
  onMounted,
  onUnmounted,
  ref,
  type Component,
  type StyleValue,
} from "vue";

const props = defineProps<{
  showIconSettings: boolean;
  widget: WidgetInstance;
  previewData: WidgetData;
  localStyle: WidgetCustomStyle;
  label?: string;
  iconPreviewBlobStyle: StyleValue;
  iconPreviewIconStyle: StyleValue;
  previewUsesCustomImage: boolean;
  previewIconComponent: Component | null;
  previewStyle: StyleValue;
  previewContentStyle: StyleValue;
}>();

const canvasStore = useCanvasStore();

// 真實組件預覽：用目前設定渲染同一個組件，等比縮小塞進預覽框
const PREVIEW_MAX_HEIGHT = 180;
const STAGE_PADDING = 12;
const liveComponent = computed(() => widgetComponents[props.widget.type]);
const widgetPxWidth = computed(() => props.widget.width * canvasStore.gridSize);
const widgetPxHeight = computed(() => props.widget.height * canvasStore.gridSize);

const stageRef = ref<HTMLElement | null>(null);
const stageWidth = ref(0);
let resizeObserver: ResizeObserver | null = null;

onMounted(() => {
  if (!stageRef.value) return;
  stageWidth.value = stageRef.value.clientWidth;
  resizeObserver = new ResizeObserver(([entry]) => {
    stageWidth.value = entry.contentRect.width;
  });
  resizeObserver.observe(stageRef.value);
});

onUnmounted(() => resizeObserver?.disconnect());

const previewScale = computed(() => {
  if (!stageWidth.value) return 1;
  return Math.min(
    1,
    (stageWidth.value - STAGE_PADDING * 2) / widgetPxWidth.value,
    (PREVIEW_MAX_HEIGHT - STAGE_PADDING * 2) / widgetPxHeight.value,
  );
});

const stageStyle = computed(() => ({
  height: `${Math.round(widgetPxHeight.value * previewScale.value) + STAGE_PADDING * 2}px`,
}));

// 外框佔縮放後的大小，內層用原尺寸渲染再 scale，組件內的 container query 才會跟畫布上一致
const frameStyle = computed(() => ({
  width: `${widgetPxWidth.value * previewScale.value}px`,
  height: `${widgetPxHeight.value * previewScale.value}px`,
}));

const innerStyle = computed(() => ({
  width: `${widgetPxWidth.value}px`,
  height: `${widgetPxHeight.value}px`,
  transform: `scale(${previewScale.value})`,
}));
</script>

<template>
  <div class="preview-section">
    <div class="preview-label">預覽效果</div>
    <!-- fluid-button：模擬實際 widget（流體形狀 + 圖標 + 標籤），即時反映色彩/形狀/圖標/大小/X/Y -->
    <div v-if="showIconSettings" class="preview-box fluid-preview-box">
      <div class="fluid-preview-mock">
        <div class="fluid-preview-blob" :style="iconPreviewBlobStyle">
          <img
            v-if="previewUsesCustomImage"
            :src="localStyle.customIconUrl"
            alt="圖標預覽"
            class="preview-icon-img"
            :style="iconPreviewIconStyle"
          />
          <component
            :is="previewIconComponent"
            v-else
            class="preview-icon-svg"
            :style="iconPreviewIconStyle"
            :stroke-width="1.5"
          />
        </div>
        <span
          v-if="label"
          class="fluid-preview-label"
          :style="previewContentStyle"
        >
          {{ label }}
        </span>
      </div>
    </div>
    <!-- 其他 widget：直接渲染真實組件，改什麼就即時看到什麼 -->
    <div v-else-if="liveComponent" ref="stageRef" class="preview-stage" :style="stageStyle">
      <div class="preview-frame" :style="frameStyle">
        <div class="preview-inner" :style="innerStyle" inert>
          <component :is="liveComponent" :widget-id="widget.id" :data="previewData" />
        </div>
      </div>
    </div>
    <!-- 找不到對應組件時的後備色塊預覽 -->
    <div v-else class="preview-box" :style="previewStyle">
      <span class="preview-text" :style="previewContentStyle">
        {{ label || "預覽" }}
      </span>
    </div>
  </div>
</template>

<style lang="scss" scoped>
// 預覽區域
.preview-section {
  margin-bottom: 16px;
  flex-shrink: 0;
}

.preview-label {
  font-size: 13px;
  font-weight: 600;
  color: #6b7280;
  margin-bottom: 8px;
}

.preview-box {
  height: 64px;
  border-radius: 16px;
  background: #f8fafc;
  border: 2px solid #e5e7eb;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.3s;
}

// 真實組件預覽舞台：鋪上目前的桌布，看起來和畫布上一樣
.preview-stage {
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 16px;
  border: 2px solid #e5e7eb;
  background: var(--wallpaper-value, var(--color-background, #f8fafc));
  background-size: cover;
  background-position: center;
  overflow: hidden;
}

.preview-frame {
  position: relative;
  flex-shrink: 0;
}

.preview-inner {
  position: absolute;
  top: 0;
  left: 0;
  transform-origin: top left;
  pointer-events: none;
}

.preview-text {
  font-size: 16px;
  font-weight: 600;
  color: #374151;
}

// fluid-button 真實預覽（模擬畫布上的實際 widget）
.preview-box.fluid-preview-box {
  height: 160px;
  background-color: #f8fafc;
  background-image:
    linear-gradient(45deg, #e5e7eb 25%, transparent 25%),
    linear-gradient(-45deg, #e5e7eb 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, #e5e7eb 75%),
    linear-gradient(-45deg, transparent 75%, #e5e7eb 75%);
  background-size: 14px 14px;
  background-position:
    0 0,
    0 7px,
    7px -7px,
    -7px 0;
  border: 2px solid #e5e7eb;
  padding: 8px;
}

.fluid-preview-mock {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
}

.fluid-preview-blob {
  width: 110px;
  height: 110px;
  aspect-ratio: 1 / 1;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: 1.5px solid rgba(0, 0, 0, 0.25);
  overflow: hidden;
  transition: border-radius 0.2s;
  flex-shrink: 0;

  .preview-icon-svg {
    color: #1f2937;
    opacity: 0.85;
    min-width: 16px;
    min-height: 16px;
    transition: transform 0.15s ease-out;
  }

  .preview-icon-img {
    object-fit: contain;
    min-width: 18px;
    min-height: 18px;
    transition: transform 0.15s ease-out;
  }
}

.fluid-preview-label {
  font-size: 11px;
  font-weight: 500;
  color: #374151;
  text-align: center;
  letter-spacing: 0.2px;
  flex-shrink: 0;
  line-height: 1.2;
  max-width: 100%;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
