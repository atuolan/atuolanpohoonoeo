<script setup lang="ts">
import { getIconSource, useWidgetStyle } from "@/composables/useWidgetStyle";
import { useCanvasStore, useThemeStore } from "@/stores";
import { getShapeStyle } from "@/styles/shape-presets";
import type { WidgetCustomStyle } from "@/types";
import { resolveWidgetIcon } from "@/utils/widgetIconMap";
import { computed } from "vue";

const props = defineProps<{
  data?: {
    type?: string;
    label?: string;
    customStyle?: WidgetCustomStyle;
  };
}>();

const emit = defineEmits<{
  navigate: [page: string];
}>();

const canvasStore = useCanvasStore();
const themeStore = useThemeStore();

// 處理點擊事件
function handleClick() {
  // 編輯模式下不觸發導航
  if (canvasStore.isEditMode) return;

  const label = props.data?.label;
  if (!label) return;

  // 根據標籤映射到對應的頁面
  const pageMap: Record<string, string> = {
    訊息: "message",
    設置: "settings",
    空間: "space",
    音樂: "music",
    購物: "shop",
    外賣: "外賣",
    世界書: "book",
    角色: "character",
    使用者: "user",
    頭盔TA: "peek-phone",
    偷窺TA: "peek-phone",
    閱讀: "media-log",
    書架: "bookshelf",
    行事曆: "calendar",
    占卜: "fate",
  };

  const page = pageMap[label] || label;
  emit("navigate", page);
}

// 使用自定義樣式 composable
const { containerStyle, contentStyle, hasCustomBackground, hasCustomIcon } =
  useWidgetStyle(props.data?.customStyle);

// 從主題 store 獲取桌布亮度判斷（根據實際桌布顏色而非僅時間）
const isDark = computed(() => themeStore.isWallpaperDark);

// 獲取圖標源
const iconSource = computed(() => getIconSource(props.data?.customStyle));

// 計算當前應該顯示的圖標組件（透過共用 widgetIconMap 解析）
const iconComponent = computed(() => {
  // 如果有自定義預設圖標
  if (iconSource.value.type === "preset" && iconSource.value.value) {
    return resolveWidgetIcon(iconSource.value.value);
  }
  // 使用標籤映射的預設圖標
  return resolveWidgetIcon(props.data?.label);
});

// 是否使用自定義圖片
const useCustomImage = computed(() => {
  return iconSource.value.type === "custom" && iconSource.value.value;
});

// 自定義圖片 URL
const customImageUrl = computed(() => iconSource.value.value);

// 根據 type 決定不規則形狀
const blobShape = computed(() => {
  // 如果有自定義形狀，使用形狀預設
  if (props.data?.customStyle?.shape) {
    return null; // 由 getShapeStyle 處理
  }
  const shapes = [
    "62% 38% 45% 55% / 52% 58% 42% 48%",
    "45% 55% 62% 38% / 38% 45% 55% 62%",
    "55% 45% 38% 62% / 62% 38% 55% 45%",
    "38% 62% 55% 45% / 45% 62% 38% 55%",
  ];
  const idx = parseInt(props.data?.type || "1") - 1;
  return shapes[idx % shapes.length];
});

// 計算 blob 樣式（合併自定義樣式）
const blobStyle = computed(() => {
  const style: Record<string, string> = {};

  // 形狀：優先使用自定義形狀，否則使用預設 blob
  const shapeId = props.data?.customStyle?.shape;
  if (shapeId) {
    const shapeStyles = getShapeStyle(shapeId);
    Object.assign(style, shapeStyles);
  } else if (blobShape.value) {
    style.borderRadius = blobShape.value;
  }

  // 應用圖標大小
  if (props.data?.customStyle?.iconSize) {
    style["--icon-size"] = `${props.data.customStyle.iconSize}%`;
  }

  // 應用圖標 X/Y 偏移（百分比）
  const offsetX = props.data?.customStyle?.iconOffsetX;
  if (typeof offsetX === "number" && offsetX !== 0) {
    style["--icon-offset-x"] = `${offsetX}%`;
  }
  const offsetY = props.data?.customStyle?.iconOffsetY;
  if (typeof offsetY === "number" && offsetY !== 0) {
    style["--icon-offset-y"] = `${offsetY}%`;
  }

  // 應用圖標縮放倍率
  const scale = props.data?.customStyle?.iconScale;
  if (typeof scale === "number" && scale > 0 && scale !== 1) {
    style["--icon-scale"] = `${scale}`;
  }

  // 應用自定義背景
  if (props.data?.customStyle?.backgroundGradient) {
    style.background = props.data.customStyle.backgroundGradient;
    style.border = "none";
  } else if (props.data?.customStyle?.backgroundColor) {
    style.backgroundColor = props.data.customStyle.backgroundColor;
    style.border = "none";
  }

  // 應用自定義邊框
  if (props.data?.customStyle?.borderColor) {
    style.borderColor = props.data.customStyle.borderColor;
    style.borderWidth = `${props.data.customStyle.borderWidth || 2}px`;
    style.borderStyle = "solid";
  } else if (isDark.value) {
    // 深色模式時使用白色邊框
    style.borderColor = "rgba(255, 255, 255, 0.3)";
  }

  return style;
});

// 計算圖標樣式
const iconStyle = computed(() => {
  const style: Record<string, string> = {};

  if (props.data?.customStyle?.foregroundColor) {
    // 有自定義顏色時使用自定義顏色
    style.color = props.data.customStyle.foregroundColor;
  } else if (isDark.value) {
    // 深色模式（晚上/深夜）時使用白色
    style.color = "#ffffff";
  }

  return style;
});

// 顯示名稱映射（向後兼容舊數據）
const displayLabelMap: Record<string, string> = {
  偷窺TA: "頭盔TA",
};

const displayLabel = computed(() => {
  const label = props.data?.label || "";
  return displayLabelMap[label] || label;
});
const labelStyle = computed(() => {
  const style: Record<string, string> = {};

  if (props.data?.customStyle?.textColor) {
    style.color = props.data.customStyle.textColor;
  } else if (props.data?.customStyle?.foregroundColor) {
    style.color = props.data.customStyle.foregroundColor;
  } else if (isDark.value) {
    // 深色模式（晚上/深夜）時使用白色
    style.color = "#ffffff";
  }

  return style;
});
</script>

<template>
  <div class="fluid-button" @click="handleClick">
    <div
      class="blob-shape"
      :class="{ 'has-background': hasCustomBackground }"
      :style="blobStyle"
    >
      <!-- 自定義圖片 -->
      <img
        v-if="useCustomImage"
        :src="customImageUrl!"
        alt="自定義圖標"
        class="custom-icon-image"
      />
      <!-- 預設圖標 -->
      <component v-else :is="iconComponent" class="icon" :style="iconStyle" />
    </div>
    <span class="label" v-if="data?.label" :style="labelStyle">{{
      displayLabel
    }}</span>
  </div>
</template>

<style lang="scss" scoped>
.fluid-button {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  padding: 4px;
  box-sizing: border-box;
}

.blob-shape {
  // 自適應大小 - 填滿可用空間
  flex: 1;
  width: 100%;
  min-width: 40px;
  min-height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: 1.5px solid rgba(0, 0, 0, 0.25);
  transition: all 0.2s ease;
  overflow: hidden;

  &.has-background {
    border: none;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  }

  .icon {
    // 圖標大小隨容器自適應
    width: var(--icon-size, 40%);
    height: var(--icon-size, 40%);
    min-width: 20px;
    min-height: 20px;
    max-width: 64px;
    max-height: 64px;
    color: #1f2937;
    opacity: 0.7;
    transform: translate(var(--icon-offset-x, 0%), var(--icon-offset-y, 0%))
      scale(var(--icon-scale, 1));
    transition:
      opacity 0.2s,
      color 0.2s,
      transform 0.2s;
  }

  .custom-icon-image {
    width: var(--icon-size, 50%);
    height: var(--icon-size, 50%);
    min-width: 24px;
    min-height: 24px;
    max-width: 72px;
    max-height: 72px;
    object-fit: contain;
    transform: translate(var(--icon-offset-x, 0%), var(--icon-offset-y, 0%))
      scale(var(--icon-scale, 1));
    transition: transform 0.2s;
  }
}

.fluid-button:hover .blob-shape {
  border-color: rgba(0, 0, 0, 0.4);
  background: rgba(255, 255, 255, 0.15);

  &.has-background {
    transform: scale(1.02);
    box-shadow: 0 6px 16px rgba(0, 0, 0, 0.15);
  }

  .icon {
    opacity: 1;
  }

  .custom-icon-image {
    transform: translate(var(--icon-offset-x, 0%), var(--icon-offset-y, 0%))
      scale(calc(var(--icon-scale, 1) * 1.05));
  }
}

.label {
  font-size: 10px;
  font-weight: 500;
  color: #374151;
  text-align: center;
  letter-spacing: 0.2px;
  margin-top: 2px;
  flex-shrink: 0;
  transition: color 0.2s;
}
</style>
