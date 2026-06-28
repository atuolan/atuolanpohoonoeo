<script setup lang="ts">
import { computed } from "vue";
import { useCanvasStore } from "@/stores/canvas";
import { useWidgetCharacter } from "@/composables/useWidgetCharacter";
import type { WidgetCustomStyle } from "@/types";

const props = defineProps<{
  widgetId: string;
  data?: {
    characterId?: string;
    metricId?: string; // 指定顯示的指標 ID，不設則用第一個數值指標
    layout?: string; // "ring" | "heart" | "bar"
    customStyle?: WidgetCustomStyle;
  };
}>();

const emit = defineEmits<{
  (e: "navigate", payload: { type: string; characterId?: string }): void;
}>();

const canvasStore = useCanvasStore();
const dataRef = computed(() => props.data);
const { character, displayName, metrics, chatId } = useWidgetCharacter(dataRef);

const layout = computed(() => props.data?.layout || "ring");
const isEditMode = computed(() => canvasStore.isEditMode);

// 選定要顯示的指標：優先指定 metricId，否則取第一個數值型指標
const activeMetric = computed(() => {
  const list = metrics.value;
  if (list.length === 0) return null;
  if (props.data?.metricId) {
    const found = list.find((m) => m.id === props.data?.metricId);
    if (found) return found;
  }
  const numeric = list.find((m) => m.type === "number");
  return numeric || list[0];
});

const percent = computed(() => {
  const m = activeMetric.value;
  if (!m) return 0;
  return Math.round((m.percentage ?? 0) * 100);
});

const metricName = computed(() => activeMetric.value?.name || "好感度");
const stage = computed(() => activeMetric.value?.stage || "");
const valueText = computed(() => {
  const m = activeMetric.value;
  if (!m) return "";
  return String(m.value);
});

const meterColor = computed(() => {
  if (props.data?.customStyle?.foregroundColor)
    return props.data.customStyle.foregroundColor;
  return "#ff6b9d";
});

// SVG 環幾何
const SIZE = 100;
const CENTER = 50;
const RADIUS = 42;
const STROKE = 9;
const circumference = 2 * Math.PI * RADIUS;
const dashOffset = computed(() => circumference * (1 - percent.value / 100));

const containerStyle = computed(() => {
  const style: Record<string, string> = {};
  const cs = props.data?.customStyle;
  if (cs?.backgroundGradient) style.background = cs.backgroundGradient;
  else if (cs?.backgroundColor) style.background = cs.backgroundColor;
  if (cs?.textColor) style.color = cs.textColor;
  return style;
});

function handleClick() {
  if (isEditMode.value) return;
  if (character.value) {
    emit("navigate", { type: "character", characterId: character.value.id });
  }
}
</script>

<template>
  <div
    class="affinity-meter-widget"
    :class="`layout-${layout}`"
    :style="containerStyle"
    @click="handleClick"
  >
    <template v-if="!character">
      <div class="empty-hint">
        <span class="emoji">💗</span>
        <span class="hint-text">點擊設定綁定角色</span>
      </div>
    </template>

    <template v-else-if="!chatId || !activeMetric">
      <div class="empty-hint">
        <span class="emoji">💗</span>
        <span class="hint-text">{{ displayName }}</span>
        <span class="hint-sub">尚無好感度資料</span>
      </div>
    </template>

    <!-- 環形 -->
    <template v-else-if="layout === 'ring'">
      <div class="ring-wrap">
        <svg :viewBox="`0 0 ${SIZE} ${SIZE}`" class="ring-svg">
          <circle
            :cx="CENTER"
            :cy="CENTER"
            :r="RADIUS"
            fill="none"
            stroke="rgba(255,255,255,0.2)"
            :stroke-width="STROKE"
          />
          <circle
            :cx="CENTER"
            :cy="CENTER"
            :r="RADIUS"
            fill="none"
            :stroke="meterColor"
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
          <span class="stage" v-if="stage">{{ stage }}</span>
        </div>
      </div>
      <span class="metric-name">{{ metricName }}</span>
    </template>

    <!-- 愛心 -->
    <template v-else-if="layout === 'heart'">
      <div class="heart-wrap">
        <div class="heart-bg">♡</div>
        <div class="heart-fill" :style="{ height: `${percent}%`, color: meterColor }">♥</div>
      </div>
      <span class="percent-sm">{{ percent }}%</span>
      <span class="metric-name">{{ metricName }}</span>
    </template>

    <!-- 進度條 -->
    <template v-else>
      <div class="bar-layout">
        <div class="bar-top">
          <span class="metric-name">{{ metricName }}</span>
          <span class="value-text" :style="{ color: meterColor }">{{ valueText }}</span>
        </div>
        <div class="bar-track">
          <div
            class="bar-fill"
            :style="{ width: `${percent}%`, background: meterColor }"
          ></div>
        </div>
        <span class="stage" v-if="stage">{{ stage }}</span>
      </div>
    </template>
  </div>
</template>

<style lang="scss" scoped>
.affinity-meter-widget {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  border-radius: 18px;
  background: linear-gradient(135deg, #2c1338, #4a1f4f);
  color: #fff;
  padding: 10px;
  box-sizing: border-box;
  cursor: pointer;
  overflow: hidden;
}

.empty-hint {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  opacity: 0.85;

  .emoji {
    font-size: 26px;
  }

  .hint-text {
    font-size: 13px;
    font-weight: 600;
  }

  .hint-sub {
    font-size: 11px;
    opacity: 0.7;
  }
}

/* 環形 */
.ring-wrap {
  position: relative;
  flex: 1;
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 0;
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

  .percent {
    font-size: 20px;
    font-weight: 700;
  }

  .stage {
    font-size: 10px;
    opacity: 0.8;
  }
}

.metric-name {
  font-size: 12px;
  opacity: 0.8;
}

/* 愛心 */
.heart-wrap {
  position: relative;
  font-size: 54px;
  line-height: 1;
  width: 1em;
  height: 1em;

  .heart-bg {
    color: rgba(255, 255, 255, 0.25);
  }

  .heart-fill {
    position: absolute;
    left: 0;
    bottom: 0;
    width: 100%;
    overflow: hidden;
    display: flex;
    align-items: flex-end;
    justify-content: center;
    transition: height 0.5s ease;
  }
}

.percent-sm {
  font-size: 16px;
  font-weight: 700;
}

/* 進度條 */
.bar-layout {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.bar-top {
  display: flex;
  justify-content: space-between;
  align-items: baseline;

  .value-text {
    font-size: 18px;
    font-weight: 700;
  }
}

.bar-track {
  width: 100%;
  height: 12px;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.18);
  overflow: hidden;
}

.bar-fill {
  height: 100%;
  border-radius: 6px;
  transition: width 0.5s ease;
}

.stage {
  font-size: 11px;
  opacity: 0.85;
}
</style>
