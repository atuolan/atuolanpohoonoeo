<script setup lang="ts">
import { useCanvasStore } from "@/stores/canvas";
import type { WidgetCustomStyle } from "@/types";
import { computed } from "vue";

const props = defineProps<{
  widgetId: string;
  data?: {
    percent?: number;
    label?: string;
    color?: string;
    layout?: string; // "ring" | "bar" | "battery"
    customStyle?: WidgetCustomStyle;
  };
}>();

const canvasStore = useCanvasStore();

const percent = computed(() => {
  const p = props.data?.percent ?? 72;
  return Math.max(0, Math.min(100, p));
});
const label = computed(() => props.data?.label || "電量");
const layout = computed(() => props.data?.layout || "ring");
const isEditMode = computed(() => canvasStore.isEditMode);

// 依電量決定顏色（低電量轉紅）
const ringColor = computed(() => {
  if (props.data?.color) return props.data.color;
  if (props.data?.customStyle?.foregroundColor)
    return props.data.customStyle.foregroundColor;
  if (percent.value <= 20) return "#ff453a";
  if (percent.value <= 50) return "#ffd60a";
  return "#30d158";
});

// SVG 環幾何
const SIZE = 100;
const CENTER = 50;
const RADIUS = 42;
const STROKE = 10;
const circumference = 2 * Math.PI * RADIUS;
const dashOffset = computed(
  () => circumference * (1 - percent.value / 100),
);

function bumpPercent(delta: number) {
  if (!isEditMode.value) return;
  const next = Math.max(0, Math.min(100, percent.value + delta));
  canvasStore.updateWidgetData(props.widgetId, {
    ...props.data,
    percent: next,
  });
}

const containerStyle = computed(() => {
  const style: Record<string, string> = {};
  const cs = props.data?.customStyle;
  if (cs?.backgroundGradient) style.background = cs.backgroundGradient;
  else if (cs?.backgroundColor) style.background = cs.backgroundColor;
  return style;
});
</script>

<template>
  <div class="battery-ring-widget" :style="containerStyle">
    <!-- 環形 -->
    <template v-if="layout === 'ring'">
      <div class="ring-wrap">
        <svg :viewBox="`0 0 ${SIZE} ${SIZE}`" class="ring-svg">
          <circle
            :cx="CENTER"
            :cy="CENTER"
            :r="RADIUS"
            fill="none"
            stroke="rgba(255,255,255,0.18)"
            :stroke-width="STROKE"
          />
          <circle
            :cx="CENTER"
            :cy="CENTER"
            :r="RADIUS"
            fill="none"
            :stroke="ringColor"
            :stroke-width="STROKE"
            stroke-linecap="round"
            :stroke-dasharray="circumference"
            :stroke-dashoffset="dashOffset"
            :transform="`rotate(-90 ${CENTER} ${CENTER})`"
            class="ring-progress"
          />
        </svg>
        <div class="ring-center">
          <span class="percent">{{ percent }}%</span>
          <span class="label">{{ label }}</span>
        </div>
      </div>
    </template>

    <!-- 進度條 -->
    <template v-else-if="layout === 'bar'">
      <div class="bar-layout">
        <div class="bar-top">
          <span class="label">{{ label }}</span>
          <span class="percent" :style="{ color: ringColor }">{{ percent }}%</span>
        </div>
        <div class="bar-track">
          <div
            class="bar-fill"
            :style="{ width: `${percent}%`, background: ringColor }"
          ></div>
        </div>
      </div>
    </template>

    <!-- 電池外型 -->
    <template v-else>
      <div class="battery-layout">
        <div class="battery-shell">
          <div
            class="battery-fill"
            :style="{ width: `${percent}%`, background: ringColor }"
          ></div>
          <span class="battery-text">{{ percent }}%</span>
        </div>
        <span class="battery-cap"></span>
      </div>
      <span class="label battery-label">{{ label }}</span>
    </template>

    <!-- 編輯模式 +/- -->
    <div v-if="isEditMode" class="adjust">
      <button @click.stop="bumpPercent(-10)">−</button>
      <button @click.stop="bumpPercent(10)">+</button>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.battery-ring-widget {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  position: relative;
  border-radius: 18px;
  background: linear-gradient(135deg, #1c1c1e, #2c2c2e);
  color: #fff;
  padding: 8px;
  box-sizing: border-box;
}

.ring-wrap {
  position: relative;
  width: 100%;
  height: 100%;
  max-width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.ring-svg {
  width: 100%;
  height: 100%;
  max-height: 100%;
}

.ring-progress {
  transition: stroke-dashoffset 0.5s ease;
}

.ring-center {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;

  .percent {
    font-size: 22px;
    font-weight: 700;
  }

  .label {
    font-size: 11px;
    opacity: 0.7;
  }
}

/* 進度條 */
.bar-layout {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.bar-top {
  display: flex;
  justify-content: space-between;
  align-items: baseline;

  .label {
    font-size: 13px;
    opacity: 0.8;
  }

  .percent {
    font-size: 18px;
    font-weight: 700;
  }
}

.bar-track {
  width: 100%;
  height: 12px;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.15);
  overflow: hidden;
}

.bar-fill {
  height: 100%;
  border-radius: 6px;
  transition: width 0.5s ease;
}

/* 電池外型 */
.battery-layout {
  display: flex;
  align-items: center;
  gap: 3px;
  width: 80%;
  height: 38%;
}

.battery-shell {
  flex: 1;
  height: 100%;
  border: 3px solid rgba(255, 255, 255, 0.8);
  border-radius: 8px;
  position: relative;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
}

.battery-fill {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  border-radius: 4px 0 0 4px;
  transition: width 0.5s ease;
}

.battery-text {
  position: relative;
  font-size: 14px;
  font-weight: 700;
  z-index: 1;
  mix-blend-mode: difference;
  color: #fff;
}

.battery-cap {
  width: 5px;
  height: 40%;
  background: rgba(255, 255, 255, 0.8);
  border-radius: 0 3px 3px 0;
}

.battery-label {
  margin-top: 8px;
  font-size: 12px;
  opacity: 0.7;
}

.adjust {
  position: absolute;
  bottom: 6px;
  right: 6px;
  display: flex;
  gap: 4px;

  button {
    width: 22px;
    height: 22px;
    border-radius: 50%;
    border: none;
    background: rgba(255, 255, 255, 0.2);
    color: #fff;
    font-size: 14px;
    line-height: 1;
    cursor: pointer;

    &:hover {
      background: rgba(255, 255, 255, 0.35);
    }
  }
}
</style>
