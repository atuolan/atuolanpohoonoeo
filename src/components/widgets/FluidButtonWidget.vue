<script setup lang="ts">
import { getIconSource, useWidgetStyle } from "@/composables/useWidgetStyle";
import { useCanvasStore, useThemeStore } from "@/stores";
import { getShapeStyle } from "@/styles/shape-presets";
import { getSkin } from "@/styles/skin-presets";
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
// 解析「當前生效的形狀 id」：
// 1. 元件層級自定義形狀（customStyle.shape）最優先
// 2. 否則跟隨當前皮（skin）的預設圖標形狀，讓切換皮膚時形狀即時改變
const effectiveShapeId = computed(() => {
  if (props.data?.customStyle?.shape) {
    return props.data.customStyle.shape;
  }
  return getSkin(themeStore.currentSkin).icon.shape;
});

const blobShape = computed(() => {
  // 「流體」形狀採用依 type 變化的不規則 blob，視覺更活潑
  if (effectiveShapeId.value !== "blob") {
    return null; // 其餘形狀交給 getShapeStyle 處理
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

  // 形狀：blob 用不規則圓角；其餘形狀走 getShapeStyle（含 clipPath）
  if (blobShape.value) {
    style.borderRadius = blobShape.value;
  } else {
    const shapeStyles = getShapeStyle(effectiveShapeId.value);
    Object.assign(style, shapeStyles);
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
  gap: 4px;
  cursor: pointer;
  padding: 4px;
  box-sizing: border-box;
}

.blob-shape {
  // 正方形容器：大小由「剩餘高度」決定（扣掉 label 後），
  // 再以 aspect-ratio 推得等寬，避免撐滿寬度後高度過大壓到文字
  flex: 0 1 auto;
  min-height: 0;
  height: 100%;
  aspect-ratio: 1 / 1;
  max-width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  // 預設：白底半透明 + 深色邊框陰影（避免透明底造成破圖）
  background: rgba(255, 255, 255, 0.55);
  border: none;
  box-shadow:
    0 0 0 1px rgba(0, 0, 0, 0.08),
    0 2px 8px rgba(0, 0, 0, 0.06);
  transition: all 0.2s ease;
  overflow: visible;
  position: relative;

  // 玻璃皮：iOS Liquid Glass 風格（明亮霧面玻璃）
  [data-skin="glass"] & {
    // 淺色半透明霧面底，配合高飽和背景模糊
    background: linear-gradient(135deg, rgba(255, 255, 255, 0.5) 0%, rgba(255, 255, 255, 0.18) 100%);
    backdrop-filter: blur(16px) saturate(180%);
    -webkit-backdrop-filter: blur(16px) saturate(180%);
    border: 1px solid rgba(255, 255, 255, 0.6);
    // 內側頂部亮邊 + 底部柔光 + 外部投影
    box-shadow:
      inset 0 1px 1px rgba(255, 255, 255, 0.9),
      inset 0 -6px 14px rgba(255, 255, 255, 0.3),
      0 6px 16px rgba(31, 38, 135, 0.14);

    // 偽元素：高光與內霧邊
    &::before,
    &::after {
      content: '';
      position: absolute;
      border-radius: inherit;
      pointer-events: none;
    }

    // 頂部鏡面高光
    &::before {
      inset: 0;
      background: linear-gradient(180deg, rgba(255, 255, 255, 0.55) 0%, rgba(255, 255, 255, 0) 48%);
      opacity: 0.85;
    }

    // 內側白色霧邊光暈
    &::after {
      inset: 0;
      box-shadow: inset 0 0 18px 5px rgba(255, 255, 255, 0.5);
    }
  }

  &.has-background {
    border: none;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
    
    [data-skin="glass"] & {
      box-shadow: none;
    }
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
    position: relative;
    z-index: 1;
    
    // 玻璃皮下圖標：顏色跟隨背景（深底白字 / 淺底黑字，由 iconStyle 控制），
    // 僅補一層柔和投影增加玻璃立體感，不覆蓋顏色。
    [data-skin="glass"] & {
      opacity: 0.95;
      filter: drop-shadow(0 1px 1.5px rgba(0, 0, 0, 0.18));
    }
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
    position: relative;
    z-index: 1;
  }
}

.fluid-button:hover .blob-shape {
  // hover 時略微增強陰影（不改背景，避免覆蓋皮膚特定樣式）
  box-shadow:
    0 0 0 1px rgba(0, 0, 0, 0.12),
    0 4px 12px rgba(0, 0, 0, 0.1);
  
  // 玻璃皮 hover 效果：略增亮度與投影
  [data-skin="glass"] & {
    background: linear-gradient(135deg, rgba(255, 255, 255, 0.62) 0%, rgba(255, 255, 255, 0.28) 100%);
    box-shadow:
      inset 0 1px 1px rgba(255, 255, 255, 0.95),
      inset 0 -6px 14px rgba(255, 255, 255, 0.35),
      0 8px 20px rgba(31, 38, 135, 0.18);
  }

  &.has-background {
    transform: scale(1.02);
    box-shadow: 0 6px 16px rgba(0, 0, 0, 0.15);
    
    [data-skin="glass"] & {
      box-shadow: none;
    }
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
  line-height: 1.2;
  color: #374151;
  text-align: center;
  letter-spacing: 0.2px;
  flex-shrink: 0;
  // 不換行、超出以省略號顯示，避免占用過多高度而與圖標重疊
  max-width: 100%;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  transition: color 0.2s;
}
</style>
