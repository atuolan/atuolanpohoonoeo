<script setup lang="ts">
import { computed } from "vue";
import { useCanvasStore } from "@/stores/canvas";
import { useWidgetCharacter } from "@/composables/useWidgetCharacter";
import type { WidgetCustomStyle } from "@/types";

const props = defineProps<{
  widgetId: string;
  data?: {
    characterId?: string;
    petEmoji?: string; // 寵物 emoji
    petName?: string;
    layout?: string; // "pet" | "aquarium"
    customStyle?: WidgetCustomStyle;
  };
}>();

const emit = defineEmits<{
  (e: "navigate", payload: { type: string; characterId?: string }): void;
}>();

const canvasStore = useCanvasStore();
const dataRef = computed(() => props.data);
const { character, displayName, avatar, metrics, knownDays } =
  useWidgetCharacter(dataRef);

const layout = computed(() => props.data?.layout || "pet");
const isEditMode = computed(() => canvasStore.isEditMode);
const petEmoji = computed(() => props.data?.petEmoji || "🐣");
const petName = computed(() => props.data?.petName || "小寶");

// 親密度：取第一個數值指標的百分比，沒有則用認識天數推估
const intimacy = computed(() => {
  const numeric = metrics.value.find((m) => m.type === "number");
  if (numeric) return Math.round((numeric.percentage ?? 0) * 100);
  return Math.min(100, knownDays.value * 2);
});

// 成長階段（依親密度）
const growthStage = computed(() => {
  const v = intimacy.value;
  if (v >= 80) return { label: "親密無間", scale: 1.4 };
  if (v >= 50) return { label: "感情漸增", scale: 1.2 };
  if (v >= 20) return { label: "逐漸熟悉", scale: 1.05 };
  return { label: "初次相遇", scale: 0.9 };
});

const petStyle = computed(() => ({
  transform: `scale(${growthStage.value.scale})`,
}));

const containerStyle = computed(() => {
  const style: Record<string, string> = {};
  const cs = props.data?.customStyle;
  if (cs?.backgroundGradient) style.background = cs.backgroundGradient;
  else if (cs?.backgroundColor) style.background = cs.backgroundColor;
  if (cs?.textColor) style.color = cs.textColor;
  return style;
});

// 角色卡面作為背景：需在設定中勾選「角色卡面背景」才顯示
const showCharacterBg = computed(
  () => !!props.data?.customStyle?.useCharacterBg && !!avatar.value,
);

// 透明度：預設 50%，可在設定中調整 (0-100)
const bgImageStyle = computed(() => {
  if (!showCharacterBg.value) return {};
  const opacity = (props.data?.customStyle?.characterBgOpacity ?? 50) / 100;
  return {
    backgroundImage: `url("${avatar.value}")`,
    opacity: String(opacity),
  } as Record<string, string>;
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
    class="companion-pet-widget"
    :class="`layout-${layout}`"
    :style="containerStyle"
    @click="handleClick"
  >
    <div v-if="showCharacterBg" class="bg-image" :style="bgImageStyle"></div>

    <template v-if="!character">
      <div class="empty-hint">
        <span class="emoji">🐾</span>
        <span class="hint-text" v-if="!isEditMode">長按進入編輯模式</span>
        <span class="hint-text" v-else>點擊齒輪圖示綁定角色</span>
      </div>
    </template>

    <!-- 水族箱 -->
    <template v-else-if="layout === 'aquarium'">
      <div class="aquarium">
        <div class="bubbles">
          <span v-for="n in 4" :key="n" class="bubble" :style="{ '--i': n }"></span>
        </div>
        <div class="fish" :style="petStyle">{{ petEmoji }}</div>
        <div class="sand"></div>
      </div>
      <div class="footer">
        <span class="pet-name">{{ petName }}</span>
        <span class="stage">{{ growthStage.label }}</span>
      </div>
    </template>

    <!-- 養成寵物 -->
    <template v-else>
      <div class="pet-stage">
        <div class="pet" :style="petStyle">{{ petEmoji }}</div>
      </div>
      <div class="pet-info">
        <span class="pet-name">{{ petName }}</span>
        <div class="intimacy-bar">
          <div class="intimacy-fill" :style="{ width: `${intimacy}%` }"></div>
        </div>
        <span class="stage">{{ growthStage.label }} · 與{{ displayName }}的羈絆 {{ intimacy }}%</span>
      </div>
    </template>
  </div>
</template>

<style lang="scss" scoped>
.companion-pet-widget {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  border-radius: 18px;
  background: linear-gradient(135deg, #a8edea, #fed6e3);
  color: #444;
  padding: 10px;
  box-sizing: border-box;
  cursor: pointer;
  overflow: hidden;
  gap: 6px;
  position: relative;
}

/* 角色卡面背景層：依設定透明度 + 漸層遮罩，文字仍可讀 */
.bg-image {
  position: absolute;
  inset: 0;
  background-size: cover;
  background-position: center;
  background-repeat: no-repeat;
  z-index: 0;
  pointer-events: none;
  -webkit-mask-image: linear-gradient(
    180deg,
    rgba(0, 0, 0, 0.9) 0%,
    rgba(0, 0, 0, 0.35) 100%
  );
  mask-image: linear-gradient(
    180deg,
    rgba(0, 0, 0, 0.9) 0%,
    rgba(0, 0, 0, 0.35) 100%
  );
}

/* 內容置於背景層之上 */
.companion-pet-widget > *:not(.bg-image) {
  position: relative;
  z-index: 1;
}

.empty-hint {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  opacity: 0.7;

  .emoji {
    font-size: 26px;
  }

  .hint-text {
    font-size: 12px;
  }
}

/* 養成寵物 */
.pet-stage {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 0;
}

.pet {
  font-size: 48px;
  line-height: 1;
  transition: transform 0.6s ease;
  animation: bob 2.4s ease-in-out infinite;
}

@keyframes bob {
  0%, 100% { transform: translateY(0) scale(var(--s, 1)); }
  50% { transform: translateY(-6px); }
}

.pet-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
  align-items: center;
  text-align: center;
}

.pet-name {
  font-size: 14px;
  font-weight: 700;
}

.intimacy-bar {
  width: 90%;
  height: 8px;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.55);
  overflow: hidden;
}

.intimacy-fill {
  height: 100%;
  border-radius: 4px;
  background: linear-gradient(90deg, #ff9a9e, #ff6b9d);
  transition: width 0.6s ease;
}

.stage {
  font-size: 10px;
  opacity: 0.75;
}

/* 水族箱 */
.layout-aquarium {
  background: linear-gradient(180deg, #48c6ef, #6f86d6);
  color: #fff;
  padding: 0;
}

.aquarium {
  position: relative;
  flex: 1;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
}

.fish {
  font-size: 44px;
  z-index: 2;
  animation: swim 5s ease-in-out infinite;
}

@keyframes swim {
  0% { transform: translateX(-30%) scaleX(1); }
  49% { transform: translateX(30%) scaleX(1); }
  50% { transform: translateX(30%) scaleX(-1); }
  99% { transform: translateX(-30%) scaleX(-1); }
  100% { transform: translateX(-30%) scaleX(1); }
}

.bubbles {
  position: absolute;
  inset: 0;
  pointer-events: none;

  .bubble {
    position: absolute;
    bottom: 0;
    left: calc(var(--i) * 22%);
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.5);
    animation: rise 4s linear infinite;
    animation-delay: calc(var(--i) * 0.7s);
  }
}

@keyframes rise {
  0% { transform: translateY(0); opacity: 0; }
  20% { opacity: 1; }
  100% { transform: translateY(-100px); opacity: 0; }
}

.sand {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 14px;
  background: rgba(255, 230, 150, 0.6);
  border-radius: 50% 50% 0 0 / 100% 100% 0 0;
}

.footer {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 6px;
  background: rgba(0, 0, 0, 0.18);
}
</style>
