<script setup lang="ts">
import { useCanvasStore } from "@/stores/canvas";
import type { WidgetCustomStyle } from "@/types";
import { computed } from "vue";

interface RingItem {
  label?: string;
  value: number; // 0-100
  color?: string;
}

const props = defineProps<{
  widgetId: string;
  data?: {
    // 風格：activity（多環活動）/ single（單環大數字）/ minimal（細環）
    layout?: "activity" | "single" | "minimal";
    rings?: RingItem[];
    // 單環模式的中心文字
    centerLabel?: string;
    customStyle?: WidgetCustomStyle;
  };
}>();

const canvasStore = useCanvasStore();

const currentLayout = computed(() => props.data?.layout || "activity");

const defaultPalette = ["#ff375f", "#a3e635", "#22d3ee", "#fbbf24"];

const rings = computed<RingItem[]>(() => {
  if (props.data?.rings && props.data.rings.length > 0) {
    return props.data.rings;
  }
  if (currentLayout.value === "single" || currentLayout.value === "minimal") {
    return [{ label: "進度", value: 72, color: defaultPalette[0] }];
  }
  return [
    { label: "活動", value: 80, color: defaultPalette[0] },
    { label: "運動", value: 55, color: defaultPalette[1] },
    { label: "站立", value: 92, color: defaultPalette[2] },
  ];
});

// SVG 幾何：viewBox 100x100，中心 50,50
const SIZE = 100;
const CENTER = 50;

function ringGeometry(index: number) {
  // 外環半徑最大，依序內縮
  const maxRadius = 44;
  const gap = currentLayout.value === "minimal" ? 6 : 13;
  const radius = maxRadius - index * gap;
  const circumference = 2 * Math.PI * radius;
  return { radius, circumference };
}

function strokeWidth() {
  switch (currentLayout.value) {
    case "minimal":
      return 5;
    case "single":
      return 12;
    default:
      return 9;
  }
}

function dashOffset(value: number, circumference: number) {
  const clamped = Math.max(0, Math.min(100, value));
  return circumference * (1 - clamped / 100);
}

const centerText = computed(() => {
  if (currentLayout.value === "single" || currentLayout.value === "minimal") {
    return `${Math.round(rings.value[0]?.value ?? 0)}%`;
  }
  return "";
});

const containerStyle = computed(() => {
  const style: Record<string, string> = {};
  const cs = props.data?.customStyle;
  if (cs?.backgroundGradient) {
    style.background = cs.backgroundGradient;
  } else if (cs?.backgroundColor) {
    style.background = cs.backgroundColor;
  }
  return style;
});

// 占位持久化
function persist() {
  canvasStore.updateWidgetData(props.widgetId, {
    layout: props.data?.layout,
    rings: props.data?.rings,
    centerLabel: props.data?.centerLabel,
    customStyle: props.data?.customStyle,
  });
}
defineExpose({ persist });
</script>

<template>
  <div
    class="progress-ring-widget"
    :class="[`layout-${currentLayout}`]"
    :style="containerStyle"
  >
    <div class="ring-wrap">
      <svg :viewBox="`0 0 ${SIZE} ${SIZE}`" class="ring-svg">
        <template v-for="(ring, i) in rings" :key="i">
          <!-- 背景軌道 -->
          <circle
            :cx="CENTER"
            :cy="CENTER"
            :r="ringGeometry(i).radius"
            fill="none"
            :stroke="ring.color || defaultPalette[i % defaultPalette.length]"
            :stroke-width="strokeWidth()"
            stroke-opacity="0.18"
          />
          <!-- 進度弧 -->
          <circle
            :cx="CENTER"
            :cy="CENTER"
            :r="ringGeometry(i).radius"
            fill="none"
            :stroke="ring.color || defaultPalette[i % defaultPalette.length]"
            :stroke-width="strokeWidth()"
            stroke-linecap="round"
            :stroke-dasharray="ringGeometry(i).circumference"
            :stroke-dashoffset="
              dashOffset(ring.value, ringGeometry(i).circumference)
            "
            :transform="`rotate(-90 ${CENTER} ${CENTER})`"
            class="progress-arc"
          />
        </template>
      </svg>
      <div v-if="centerText" class="ring-center">
        <span class="center-value">{{ centerText }}</span>
        <span v-if="data?.centerLabel" class="center-label">{{
          data.centerLabel
        }}</span>
      </div>
    </div>

    <div v-if="currentLayout === 'activity'" class="ring-legend">
      <div
        v-for="(ring, i) in rings"
        :key="i"
        class="legend-item"
      >
        <span
          class="legend-dot"
          :style="{
            background: ring.color || defaultPalette[i % defaultPalette.length],
          }"
        ></span>
        <span class="legend-label">{{ ring.label || "—" }}</span>
        <span class="legend-value">{{ Math.round(ring.value) }}%</span>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.progress-ring-widget {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 10px;
  box-sizing: border-box;
  border-radius: 18px;
  background: #1c1c1e;
  overflow: hidden;
}

.ring-wrap {
  position: relative;
  flex: 0 0 auto;
  height: 100%;
  aspect-ratio: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

.ring-svg {
  width: 100%;
  height: 100%;
  max-width: 100%;
  max-height: 100%;
}

.progress-arc {
  transition: stroke-dashoffset 0.6s ease;
}

.ring-center {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  pointer-events: none;
}

.center-value {
  font-size: clamp(16px, 7cqw, 32px);
  font-weight: 800;
  color: #fff;
  line-height: 1;
}

.center-label {
  margin-top: 2px;
  font-size: clamp(9px, 3cqw, 13px);
  color: rgba(255, 255, 255, 0.6);
}

.ring-legend {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: clamp(10px, 3cqw, 14px);
  color: rgba(255, 255, 255, 0.85);
}

.legend-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex: 0 0 auto;
}

.legend-label {
  flex: 1 1 auto;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.legend-value {
  font-weight: 700;
  color: #fff;
}

// 極簡：淺底細環
.layout-minimal {
  background: #f5f5f7;
  .center-value {
    color: #1c1c1e;
  }
  .center-label {
    color: rgba(0, 0, 0, 0.5);
  }
}

// 單環大數字：置中
.layout-single {
  justify-content: center;
}
</style>
