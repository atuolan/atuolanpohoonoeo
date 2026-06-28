<script setup lang="ts">
import { useCanvasStore } from "@/stores/canvas";
import type { WidgetCustomStyle } from "@/types";
import { computed } from "vue";

const props = defineProps<{
  widgetId: string;
  data?: {
    pattern?: string;
    color?: string;
    rotation?: number;
    opacity?: number;
    customStyle?: WidgetCustomStyle;
  };
}>();

const canvasStore = useCanvasStore();

// 預設花色：用 CSS 漸層 / 重複漸層模擬紙膠帶花紋
interface WashiPattern {
  id: string;
  name: string;
  base: string;
  overlay: string;
}

const washiPatterns: Record<string, WashiPattern> = {
  stripe: {
    id: "stripe",
    name: "斜紋",
    base: "#ffd6e0",
    overlay:
      "repeating-linear-gradient(45deg, rgba(255,255,255,0.55) 0 8px, transparent 8px 16px)",
  },
  dot: {
    id: "dot",
    name: "波點",
    base: "#bfe3ff",
    overlay:
      "radial-gradient(rgba(255,255,255,0.7) 22%, transparent 24%) 0 0 / 14px 14px",
  },
  grid: {
    id: "grid",
    name: "格紋",
    base: "#d7f0d0",
    overlay:
      "repeating-linear-gradient(0deg, rgba(255,255,255,0.5) 0 1px, transparent 1px 12px), repeating-linear-gradient(90deg, rgba(255,255,255,0.5) 0 1px, transparent 1px 12px)",
  },
  wave: {
    id: "wave",
    name: "波浪",
    base: "#ffe6b3",
    overlay:
      "repeating-radial-gradient(circle at 0 50%, transparent 0 6px, rgba(255,255,255,0.5) 6px 8px)",
  },
  star: {
    id: "star",
    name: "星星",
    base: "#e6d6ff",
    overlay:
      "radial-gradient(rgba(255,255,255,0.85) 18%, transparent 20%) 0 0 / 18px 18px",
  },
  solid: {
    id: "solid",
    name: "純色",
    base: "#ffc8a2",
    overlay: "none",
  },
  gradient: {
    id: "gradient",
    name: "漸層",
    base: "linear-gradient(135deg, #ff9a9e, #fad0c4)",
    overlay: "none",
  },
  kraft: {
    id: "kraft",
    name: "牛皮紙",
    base: "#d2a679",
    overlay:
      "repeating-linear-gradient(90deg, rgba(0,0,0,0.04) 0 2px, transparent 2px 5px)",
  },
};

const currentPattern = computed(() => {
  const id = props.data?.pattern || "stripe";
  return washiPatterns[id] || washiPatterns.stripe;
});

const tapeStyle = computed(() => {
  const style: Record<string, string> = {};
  const customStyle = props.data?.customStyle;
  const pattern = currentPattern.value;

  // 底色：自訂 > 花色預設
  const base =
    customStyle?.backgroundGradient ||
    customStyle?.backgroundColor ||
    props.data?.color ||
    pattern.base;

  if (pattern.overlay && pattern.overlay !== "none") {
    style.backgroundImage = `${pattern.overlay}, ${base.includes("gradient") ? base : `linear-gradient(${base}, ${base})`}`;
  } else {
    style.background = base;
  }

  const rotation = props.data?.rotation ?? -4;
  style.transform = `rotate(${rotation}deg)`;

  const opacity = props.data?.opacity ?? 0.9;
  style.opacity = String(opacity);

  return style;
});

const PATTERN_OPTIONS = Object.values(washiPatterns);

function setPattern(id: string) {
  canvasStore.updateWidgetData(props.widgetId, {
    ...props.data,
    pattern: id,
  });
}

const isEditMode = computed(() => canvasStore.isEditMode);
</script>

<template>
  <div class="washi-tape-widget">
    <div class="tape-strip" :style="tapeStyle">
      <span class="edge edge-left"></span>
      <span class="edge edge-right"></span>
    </div>

    <!-- 編輯模式下的快速花色切換 -->
    <div v-if="isEditMode" class="pattern-picker">
      <button
        v-for="p in PATTERN_OPTIONS"
        :key="p.id"
        class="pattern-chip"
        :class="{ active: p.id === currentPattern.id }"
        :title="p.name"
        @click.stop="setPattern(p.id)"
      >
        {{ p.name }}
      </button>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.washi-tape-widget {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
}

.tape-strip {
  width: 108%;
  height: 70%;
  border-radius: 2px;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.12);
  position: relative;
  transition: transform 0.2s ease;
}

// 撕邊效果（左右鋸齒）
.edge {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 6px;
  background: inherit;
}

.edge-left {
  left: -5px;
  -webkit-mask: repeating-linear-gradient(
    0deg,
    #000 0 3px,
    transparent 3px 6px
  );
  mask: repeating-linear-gradient(0deg, #000 0 3px, transparent 3px 6px);
}

.edge-right {
  right: -5px;
  -webkit-mask: repeating-linear-gradient(
    0deg,
    #000 0 3px,
    transparent 3px 6px
  );
  mask: repeating-linear-gradient(0deg, #000 0 3px, transparent 3px 6px);
}

.pattern-picker {
  position: absolute;
  bottom: -34px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  justify-content: center;
  background: rgba(0, 0, 0, 0.65);
  padding: 4px 6px;
  border-radius: 8px;
  z-index: 5;
}

.pattern-chip {
  font-size: 10px;
  color: #fff;
  background: rgba(255, 255, 255, 0.15);
  border: none;
  border-radius: 6px;
  padding: 2px 6px;
  cursor: pointer;
  white-space: nowrap;

  &.active {
    background: rgba(255, 255, 255, 0.85);
    color: #222;
  }
}
</style>
