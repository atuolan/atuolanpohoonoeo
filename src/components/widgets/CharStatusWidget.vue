<script setup lang="ts">
import { computed } from "vue";
import { useCanvasStore } from "@/stores/canvas";
import { useWidgetCharacter } from "@/composables/useWidgetCharacter";
import type { WidgetCustomStyle } from "@/types";

const props = defineProps<{
  widgetId: string;
  data?: {
    characterId?: string;
    statusText?: string; // 自訂狀態文字（如「線上」「睡覺中」）
    layout?: string; // "card" | "compact"
    customStyle?: WidgetCustomStyle;
  };
}>();

const emit = defineEmits<{
  (e: "navigate", payload: { type: string; characterId?: string }): void;
}>();

const canvasStore = useCanvasStore();
const dataRef = computed(() => props.data);
const { character, displayName, avatar, description, tags, metrics } =
  useWidgetCharacter(dataRef);

const layout = computed(() => props.data?.layout || "card");
const isEditMode = computed(() => canvasStore.isEditMode);
const statusText = computed(() => props.data?.statusText || "在線");

// 取前兩個指標做迷你顯示
const miniMetrics = computed(() => metrics.value.slice(0, 2));

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
    class="char-status-widget"
    :class="`layout-${layout}`"
    :style="containerStyle"
    @click="handleClick"
  >
    <template v-if="!character">
      <div class="empty-hint">
        <span class="emoji">🪪</span>
        <span class="hint-text">點擊設定綁定角色</span>
      </div>
    </template>

    <template v-else-if="layout === 'compact'">
      <div class="avatar-wrap">
        <img v-if="avatar" :src="avatar" :alt="displayName" class="avatar" />
        <div v-else class="avatar avatar-fallback">{{ displayName.charAt(0) }}</div>
        <span class="status-dot"></span>
      </div>
      <span class="name">{{ displayName }}</span>
      <span class="status">{{ statusText }}</span>
    </template>

    <template v-else>
      <div class="card-header">
        <div class="avatar-wrap">
          <img v-if="avatar" :src="avatar" :alt="displayName" class="avatar lg" />
          <div v-else class="avatar lg avatar-fallback">{{ displayName.charAt(0) }}</div>
          <span class="status-dot"></span>
        </div>
        <div class="head-info">
          <span class="name">{{ displayName }}</span>
          <span class="status">{{ statusText }}</span>
        </div>
      </div>

      <p class="desc" v-if="description">{{ description }}</p>

      <div class="tags" v-if="tags.length">
        <span v-for="t in tags.slice(0, 3)" :key="t" class="tag">{{ t }}</span>
      </div>

      <div class="metrics" v-if="miniMetrics.length">
        <div v-for="m in miniMetrics" :key="m.id" class="metric">
          <span class="m-name">{{ m.name }}</span>
          <div class="m-track">
            <div class="m-fill" :style="{ width: `${Math.round((m.percentage ?? 0) * 100)}%` }"></div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<style lang="scss" scoped>
.char-status-widget {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  border-radius: 18px;
  background: linear-gradient(135deg, #3a3a52, #5d5d81);
  color: #fff;
  padding: 12px;
  box-sizing: border-box;
  cursor: pointer;
  overflow: hidden;
  gap: 8px;
}

.empty-hint {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  opacity: 0.85;

  .emoji {
    font-size: 26px;
  }

  .hint-text {
    font-size: 12px;
  }
}

.avatar-wrap {
  position: relative;
  flex-shrink: 0;
}

.avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  object-fit: cover;

  &.lg {
    width: 48px;
    height: 48px;
  }
}

.avatar-fallback {
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.25);
  font-size: 18px;
  font-weight: 700;
}

.status-dot {
  position: absolute;
  bottom: 0;
  right: 0;
  width: 11px;
  height: 11px;
  border-radius: 50%;
  background: #30d158;
  border: 2px solid rgba(0, 0, 0, 0.2);
}

.name {
  font-size: 15px;
  font-weight: 700;
}

.status {
  font-size: 11px;
  opacity: 0.8;
}

/* compact */
.layout-compact {
  align-items: center;
  justify-content: center;
  text-align: center;
}

/* card */
.card-header {
  display: flex;
  align-items: center;
  gap: 10px;

  .head-info {
    display: flex;
    flex-direction: column;
  }
}

.desc {
  margin: 0;
  font-size: 11px;
  line-height: 1.4;
  opacity: 0.78;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;

  .tag {
    font-size: 10px;
    padding: 2px 7px;
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.18);
  }
}

.metrics {
  margin-top: auto;
  display: flex;
  flex-direction: column;
  gap: 5px;

  .metric {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .m-name {
    font-size: 10px;
    opacity: 0.75;
  }

  .m-track {
    height: 5px;
    border-radius: 3px;
    background: rgba(255, 255, 255, 0.18);
    overflow: hidden;
  }

  .m-fill {
    height: 100%;
    border-radius: 3px;
    background: #ff6b9d;
    transition: width 0.5s ease;
  }
}
</style>
