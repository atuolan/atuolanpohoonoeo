<script setup lang="ts">
import { computed } from "vue";
import { useCanvasStore } from "@/stores/canvas";
import { useWidgetCharacter } from "@/composables/useWidgetCharacter";
import {
  getNextMilestone,
  useLatestPromise,
} from "@/composables/useRelationshipMilestone";
import type { WidgetCustomStyle } from "@/types";

const props = defineProps<{
  widgetId: string;
  data?: {
    characterId?: string;
    title?: string;
    layout?: string; // "days" | "card" | "milestone"
    customStyle?: WidgetCustomStyle;
  };
}>();

const emit = defineEmits<{
  (e: "navigate", payload: { type: string; characterId?: string }): void;
}>();

const canvasStore = useCanvasStore();
const dataRef = computed(() => props.data);
// 沒綁角色時跟最近聊天的角色，預設佈局放的組件才不會是一塊空白
const { character, characterId, chatId, displayName, avatar, knownDays } =
  useWidgetCharacter(dataRef, { fallbackToRecent: true });

const layout = computed(() => props.data?.layout || "days");
const title = computed(() => props.data?.title || "我們認識了");
const isEditMode = computed(() => canvasStore.isEditMode);

const milestone = computed(() => getNextMilestone(knownDays.value));
// 只有紀念日佈局需要讀約定
const promiseCharacterId = computed(() =>
  layout.value === "milestone" ? characterId.value : null,
);
const { promise } = useLatestPromise(promiseCharacterId, chatId);

// 預設奶油卡片只給 foregroundColor
const textColor = computed(
  () =>
    props.data?.customStyle?.textColor ||
    props.data?.customStyle?.foregroundColor ||
    "#fff",
);

const containerStyle = computed(() => {
  const style: Record<string, string> = {};
  const cs = props.data?.customStyle;
  if (cs?.backgroundGradient) style.background = cs.backgroundGradient;
  else if (cs?.backgroundColor) style.background = cs.backgroundColor;
  style.color = textColor.value;
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
    class="relationship-counter-widget"
    :class="`layout-${layout}`"
    :style="containerStyle"
    @click="handleClick"
  >
    <div v-if="showCharacterBg" class="bg-image" :style="bgImageStyle"></div>

    <template v-if="!character">
      <div class="empty-hint">
        <span class="emoji">💞</span>
        <span class="hint-text" v-if="!isEditMode">長按進入編輯模式</span>
        <span class="hint-text" v-else>點擊齒輪圖示綁定角色</span>
      </div>
    </template>

    <template v-else-if="layout === 'milestone'">
      <div class="milestone-layout">
        <div class="known">
          <span class="with">和 {{ displayName }}</span>
          <div class="days-row">
            <span class="days-prefix">認識</span>
            <span class="days-num">{{ knownDays }}</span>
            <span class="days-unit">天</span>
          </div>
        </div>
        <div class="next">
          <template v-if="milestone.daysLeft === 0">
            <span class="next-label">今天是</span>
            <span class="next-value">{{ milestone.label }} 🎉</span>
          </template>
          <template v-else>
            <span class="next-label">距離{{ milestone.label }}</span>
            <span class="next-value">還有 <b>{{ milestone.daysLeft }}</b> 天</span>
          </template>
        </div>
      </div>
      <p v-if="promise" class="promise">
        <span class="promise-tag">約定</span>{{ promise.content }}
      </p>
    </template>

    <template v-else-if="layout === 'card'">
      <div class="card-layout">
        <div class="avatar-wrap">
          <img v-if="avatar" :src="avatar" :alt="displayName" class="avatar" />
          <div v-else class="avatar avatar-fallback">{{ displayName.charAt(0) }}</div>
        </div>
        <div class="card-info">
          <span class="title">{{ title }}</span>
          <div class="days-row">
            <span class="days-num">{{ knownDays }}</span>
            <span class="days-unit">天</span>
          </div>
          <span class="name">與 {{ displayName }}</span>
        </div>
      </div>
    </template>

    <template v-else>
      <span class="title">{{ title }}</span>
      <div class="days-row">
        <span class="days-num">{{ knownDays }}</span>
        <span class="days-unit">天</span>
      </div>
      <span class="name">與 {{ displayName }} 相識</span>
    </template>
  </div>
</template>

<style lang="scss" scoped>
.relationship-counter-widget {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  border-radius: 18px;
  background: linear-gradient(135deg, #ff9a9e, #fecfef);
  color: #fff;
  padding: 12px;
  box-sizing: border-box;
  text-align: center;
  cursor: pointer;
  overflow: hidden;
  position: relative;
}

/* 角色卡面背景層：50% 透明 + 漸層遮罩，文字仍可讀 */
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
.relationship-counter-widget > *:not(.bg-image) {
  position: relative;
  z-index: 1;
}

.empty-hint {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  opacity: 0.85;

  .emoji {
    font-size: 26px;
  }

  .hint-text {
    font-size: 12px;
  }
}

.title {
  font-size: 13px;
  opacity: 0.85;
}

.days-row {
  display: flex;
  align-items: baseline;
  gap: 3px;
  margin: 2px 0;

  .days-num {
    font-size: 38px;
    font-weight: 800;
    line-height: 1;
  }

  .days-unit {
    font-size: 15px;
    opacity: 0.9;
  }
}

.name {
  font-size: 12px;
  opacity: 0.8;
}

/* 紀念日佈局：左邊認識天數、右邊下一個里程碑，底下一行最近的約定 */
.layout-milestone {
  align-items: stretch;
  justify-content: center;
  gap: 8px;
  padding: 12px 16px;
  text-align: left;
}

.milestone-layout {
  display: flex;
  align-items: center;
  gap: 12px;

  .known {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }

  .with {
    font-size: 12px;
    opacity: 0.7;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .days-row {
    margin: 0;

    .days-prefix {
      font-size: 13px;
      opacity: 0.75;
      margin-right: 2px;
    }

    .days-num {
      font-size: 34px;
      font-variant-numeric: tabular-nums;
    }
  }

  .next {
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 2px;
    padding-left: 12px;
    border-left: 1px dashed color-mix(in srgb, currentColor 25%, transparent);

    .next-label {
      font-size: 11px;
      opacity: 0.65;
    }

    .next-value {
      font-size: 13px;

      b {
        font-size: 18px;
        font-weight: 800;
      }
    }
  }
}

.promise {
  margin: 0;
  font-size: 12px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  opacity: 0.85;

  .promise-tag {
    display: inline-block;
    margin-right: 6px;
    padding: 0 6px;
    border-radius: 8px;
    font-size: 10.5px;
    line-height: 17px;
    background: color-mix(in srgb, currentColor 10%, transparent);
  }
}

/* 卡片佈局 */
.card-layout {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;

  .avatar-wrap {
    flex-shrink: 0;
  }

  .avatar {
    width: 52px;
    height: 52px;
    border-radius: 50%;
    object-fit: cover;
    border: 2px solid rgba(255, 255, 255, 0.6);
  }

  .avatar-fallback {
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(255, 255, 255, 0.25);
    font-size: 22px;
    font-weight: 700;
  }

  .card-info {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    text-align: left;

    .days-row {
      margin: 0;
      .days-num {
        font-size: 30px;
      }
    }
  }
}
</style>
