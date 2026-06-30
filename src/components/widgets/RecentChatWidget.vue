<script setup lang="ts">
import { computed } from "vue";
import { useCanvasStore } from "@/stores/canvas";
import { useWidgetCharacter } from "@/composables/useWidgetCharacter";
import type { WidgetCustomStyle } from "@/types";

const props = defineProps<{
  widgetId: string;
  data?: {
    characterId?: string;
    layout?: string; // "bubble" | "card"
    customStyle?: WidgetCustomStyle;
  };
}>();

const emit = defineEmits<{
  (e: "navigate", payload: { type: string; characterId?: string; chatId?: string }): void;
}>();

const canvasStore = useCanvasStore();
const dataRef = computed(() => props.data);
const { character, displayName, avatar, preferredChat, chatId } =
  useWidgetCharacter(dataRef);

const layout = computed(() => props.data?.layout || "bubble");
const isEditMode = computed(() => canvasStore.isEditMode);

const preview = computed(() => {
  const chat = preferredChat.value;
  if (!chat) return "";
  return chat.lastMessagePreview || "尚無訊息";
});

const unreadCount = computed(() => preferredChat.value?.unreadCount || 0);

const timeText = computed(() => {
  const ts = preferredChat.value?.updatedAt;
  if (!ts) return "";
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "剛剛";
  if (mins < 60) return `${mins} 分鐘前`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} 小時前`;
  const days = Math.floor(hours / 24);
  return `${days} 天前`;
});

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
    emit("navigate", {
      type: "chat",
      characterId: character.value.id,
      chatId: chatId.value || undefined,
    });
  }
}
</script>

<template>
  <div
    class="recent-chat-widget"
    :class="`layout-${layout}`"
    :style="containerStyle"
    @click="handleClick"
  >
    <div v-if="showCharacterBg" class="bg-image" :style="bgImageStyle"></div>

    <template v-if="!character">
      <div class="empty-hint">
        <span class="emoji">💬</span>
        <span class="hint-text" v-if="!isEditMode">長按進入編輯模式</span>
        <span class="hint-text" v-else>點擊齒輪圖示綁定角色</span>
      </div>
    </template>

    <template v-else>
      <div class="header">
        <div class="avatar-wrap">
          <img v-if="avatar" :src="avatar" :alt="displayName" class="avatar" />
          <div v-else class="avatar avatar-fallback">{{ displayName.charAt(0) }}</div>
          <span v-if="unreadCount > 0" class="badge">{{ unreadCount > 99 ? "99+" : unreadCount }}</span>
        </div>
        <div class="name-row">
          <span class="name">{{ displayName }}</span>
          <span class="time" v-if="timeText">{{ timeText }}</span>
        </div>
      </div>
      <div class="bubble">
        <p class="preview">{{ preview || "點開聊聊吧～" }}</p>
      </div>
    </template>
  </div>
</template>

<style lang="scss" scoped>
.recent-chat-widget {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 8px;
  border-radius: 18px;
  background: linear-gradient(135deg, #667eea, #764ba2);
  color: #fff;
  padding: 12px;
  box-sizing: border-box;
  cursor: pointer;
  overflow: hidden;
  position: relative;
}

/* 角色卡面背景層：透明度可調 + 漸層遮罩，文字仍可讀 */
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
.recent-chat-widget > *:not(.bg-image) {
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
  opacity: 0.85;

  .emoji {
    font-size: 26px;
  }

  .hint-text {
    font-size: 12px;
  }
}

.header {
  display: flex;
  align-items: center;
  gap: 8px;
}

.avatar-wrap {
  position: relative;
  flex-shrink: 0;
}

.avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  object-fit: cover;
}

.avatar-fallback {
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.25);
  font-size: 16px;
  font-weight: 700;
}

.badge {
  position: absolute;
  top: -4px;
  right: -4px;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  border-radius: 8px;
  background: #ff453a;
  color: #fff;
  font-size: 10px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
}

.name-row {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;

  .name {
    font-size: 14px;
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .time {
    font-size: 11px;
    opacity: 0.7;
  }
}

.bubble {
  flex: 1;
  background: rgba(255, 255, 255, 0.15);
  border-radius: 12px;
  border-top-left-radius: 2px;
  padding: 8px 10px;
  min-height: 0;
  display: flex;
  align-items: flex-start;
}

.preview {
  margin: 0;
  font-size: 12px;
  line-height: 1.4;
  opacity: 0.92;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
</style>
