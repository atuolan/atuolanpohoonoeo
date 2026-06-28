<script setup lang="ts">
import { useCanvasStore } from "@/stores/canvas";
import { getShapeStyle } from "@/styles/shape-presets";
import type { WidgetCustomStyle } from "@/types";
import { computed } from "vue";

const props = defineProps<{
  widgetId: string;
  data?: {
    // 內建漸層預設 id（gradientId）或自訂 customStyle.backgroundGradient
    gradientId?: string;
    // 形狀 id（沿用 shapePresets）
    shapeId?: string;
    // 是否顯示細微噪點/光澤
    finish?: "flat" | "glossy" | "noise";
    customStyle?: WidgetCustomStyle;
  };
}>();

const canvasStore = useCanvasStore();

// 內建漸層調色盤（裝飾用，無互動）
const gradientPresets: Record<string, string> = {
  sunset: "linear-gradient(135deg, #ff9a9e 0%, #fad0c4 50%, #fbc2eb 100%)",
  ocean: "linear-gradient(135deg, #2193b0 0%, #6dd5ed 100%)",
  aurora: "linear-gradient(135deg, #a18cd1 0%, #fbc2eb 100%)",
  mint: "linear-gradient(135deg, #d4fc79 0%, #96e6a1 100%)",
  peach: "linear-gradient(135deg, #ffecd2 0%, #fcb69f 100%)",
  lavender: "linear-gradient(135deg, #e0c3fc 0%, #8ec5fc 100%)",
  flame: "linear-gradient(135deg, #f83600 0%, #f9d423 100%)",
  night: "linear-gradient(135deg, #232526 0%, #414345 100%)",
  candy: "linear-gradient(135deg, #ff6ec4 0%, #7873f5 100%)",
  cream: "linear-gradient(135deg, #fdfbfb 0%, #ebedee 100%)",
};

const finish = computed(() => props.data?.finish || "flat");

const blockStyle = computed(() => {
  const style: Record<string, string> = {};
  const customStyle = props.data?.customStyle;

  // 背景優先序：自訂漸層 > 自訂純色 > 內建漸層預設 > 預設
  if (customStyle?.backgroundGradient) {
    style.background = customStyle.backgroundGradient;
  } else if (customStyle?.backgroundColor) {
    style.background = customStyle.backgroundColor;
  } else if (props.data?.gradientId && gradientPresets[props.data.gradientId]) {
    style.background = gradientPresets[props.data.gradientId];
  } else {
    style.background = gradientPresets.sunset;
  }

  // 形狀
  const shapeId = props.data?.shapeId || customStyle?.shape;
  Object.assign(style, getShapeStyle(shapeId));

  // 邊框
  if (customStyle?.borderColor) {
    style.borderColor = customStyle.borderColor;
    style.borderWidth = `${customStyle.borderWidth || 2}px`;
    style.borderStyle = "solid";
  }

  return style;
});

// 持久化（保持資料完整，避免被其他更新覆蓋）
function persist() {
  canvasStore.updateWidgetData(props.widgetId, {
    gradientId: props.data?.gradientId,
    shapeId: props.data?.shapeId,
    finish: props.data?.finish,
    customStyle: props.data?.customStyle,
  });
}

// 暴露給設定面板可能的呼叫（目前僅作占位）
defineExpose({ persist });
</script>

<template>
  <div class="color-block-widget" :class="`finish-${finish}`" :style="blockStyle">
    <div v-if="finish === 'glossy'" class="gloss-overlay"></div>
    <div v-if="finish === 'noise'" class="noise-overlay"></div>
  </div>
</template>

<style lang="scss" scoped>
.color-block-widget {
  position: relative;
  width: 100%;
  height: 100%;
  border-radius: 18px;
  overflow: hidden;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);
}

// 光澤效果：右上角柔光
.gloss-overlay {
  position: absolute;
  inset: 0;
  background: radial-gradient(
    circle at 30% 20%,
    rgba(255, 255, 255, 0.45) 0%,
    rgba(255, 255, 255, 0) 55%
  );
  pointer-events: none;
}

// 噪點效果：細微顆粒質感
.noise-overlay {
  position: absolute;
  inset: 0;
  opacity: 0.12;
  pointer-events: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
}
</style>
