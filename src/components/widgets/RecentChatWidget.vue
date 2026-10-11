<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { Sticker } from "lucide-vue-next";
import { useCanvasStore } from "@/stores/canvas";
import { useStickerStore } from "@/stores/sticker";
import { useWidgetCharacter } from "@/composables/useWidgetCharacter";
import { useScrapbookFont } from "@/composables/useOnDemandFont";
import { themedChatLayouts } from "./themed/registry";
import type { WidgetCustomStyle } from "@/types";

const props = defineProps<{
  widgetId: string;
  data?: {
    characterId?: string;
    layout?: string; // "bubble" | "card" | "sticky"
    customStyle?: WidgetCustomStyle;
  };
}>();

const emit = defineEmits<{
  (e: "navigate", payload: { type: string; characterId?: string; chatId?: string }): void;
}>();

const canvasStore = useCanvasStore();
const dataRef = computed(() => props.data);
// 沒綁角色時顯示最近一次聊天，預設佈局放的組件才不會是一塊空白
const { character, displayName, avatar, preferredChat, chatId } =
  useWidgetCharacter(dataRef, { fallbackToRecent: true });

const stickerStore = useStickerStore();

const layout = computed(() => props.data?.layout || "bubble");
const isEditMode = computed(() => canvasStore.isEditMode);
useScrapbookFont(computed(() => layout.value === "sticky"));

// 主題版型：交給 themed/ 底下的元件渲染，點擊導航仍由這裡處理
const themedChat = computed(() => themedChatLayouts[layout.value] ?? null);
const userTextColor = computed(
  () =>
    props.data?.customStyle?.textColor ||
    props.data?.customStyle?.foregroundColor ||
    undefined,
);

const rawPreview = computed(() => {
  const chat = preferredChat.value;
  if (!chat) return "";
  return chat.lastMessagePreview || "尚無訊息";
});

// 預覽存的是訊息原文，[sticker:名稱] / [img:...] 標籤要拆出來，不能原樣顯示
const STICKER_TAG = /\[sticker:([^\]]+)\]/g;

const stickerName = computed(() => {
  const match = /\[sticker:([^\]]+)\]/.exec(rawPreview.value);
  if (!match) return "";
  // 格式可能是 [sticker:名稱|網址]
  return match[1].split("|")[0].trim();
});

const stickerUrl = computed(() => {
  const match = /\[sticker:([^\]]+)\]/.exec(rawPreview.value);
  if (!match) return "";
  const [name, providedUrl] = match[1].split("|");
  if (providedUrl?.trim()) return providedUrl.trim();
  const cleanName = name.trim();
  for (const category of stickerStore.allCategories) {
    const sticker = category.stickers.find((s) => s.name === cleanName && s.url);
    if (sticker) return sticker.url;
  }
  return "";
});

// 貼圖載入失敗時退回文字標籤
const stickerFailed = ref(false);
watch(stickerUrl, () => {
  stickerFailed.value = false;
});

const previewText = computed(() =>
  rawPreview.value
    .replace(STICKER_TAG, "")
    // 預覽被截斷在標籤中間時，殘留的半截標籤也要拿掉
    .replace(/\[sticker:[^\]]*$/, "")
    .replace(/\[img:[^\]]*\]?/g, "[圖片]")
    .trim(),
);

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
  // 預設奶油卡片只給 foregroundColor
  const color = cs?.textColor || cs?.foregroundColor;
  if (color) style.color = color;
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
  } else {
    // 還沒有任何聊天：帶去訊息 App 找角色
    emit("navigate", { type: "chat" });
  }
}
</script>

<template>
  <div
    class="recent-chat-widget"
    :class="[`layout-${layout}`, { themed: !!themedChat }]"
    :style="themedChat ? {} : containerStyle"
    @click="handleClick"
  >
    <div v-if="showCharacterBg" class="bg-image" :style="bgImageStyle"></div>

    <!-- 主題版型 -->
    <component
      v-if="themedChat"
      :is="themedChat"
      :has-character="!!character"
      :is-edit-mode="isEditMode"
      :display-name="displayName"
      :avatar="avatar || ''"
      :time-text="timeText"
      :unread-count="unreadCount"
      :preview-text="previewText"
      :sticker-name="stickerName"
      :sticker-url="stickerFailed ? '' : stickerUrl"
      :color="userTextColor"
    />

    <template v-else-if="!character">
      <div class="empty-hint">
        <span class="emoji">💬</span>
        <span class="hint-text" v-if="!isEditMode">還沒有聊天，去找角色聊聊吧</span>
        <span class="hint-text" v-else>點擊齒輪圖示綁定角色</span>
      </div>
    </template>

    <!-- 手帳拼貼：便條紙 + 紙膠帶，貼圖變成印章 -->
    <template v-else-if="layout === 'sticky'">
      <span class="sticky-tape" aria-hidden="true"></span>
      <div class="sticky-header">
        <span class="name">{{ displayName }}</span>
        <span v-if="unreadCount > 0" class="unread-dot" :aria-label="`${unreadCount} 則未讀`"></span>
        <span class="time" v-if="timeText">{{ timeText }}</span>
      </div>
      <p class="sticky-text" :class="{ 'has-sticker': !!stickerName }">
        {{ previewText || (stickerName ? "" : "點開聊聊吧～") }}
      </p>
      <img
        v-if="stickerName && stickerUrl && !stickerFailed"
        :src="stickerUrl"
        :alt="stickerName"
        class="sticky-sticker"
        @error="stickerFailed = true"
      />
      <div v-else-if="stickerName" class="sticky-stamp">
        <Sticker :size="18" :stroke-width="1.8" />
        <span>{{ stickerName }}</span>
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
        <p v-if="previewText || !stickerName" class="preview">{{ previewText || "點開聊聊吧～" }}</p>
        <span v-if="stickerName" class="sticker-chip">
          <img
            v-if="stickerUrl && !stickerFailed"
            :src="stickerUrl"
            alt=""
            class="sticker-chip-img"
            @error="stickerFailed = true"
          />
          <Sticker v-else :size="13" :stroke-width="1.8" />
          <span>{{ stickerName }}</span>
        </span>
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
  background: color-mix(in srgb, currentColor 18%, transparent);
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
  // 跟著文字色調整，深色漸層與奶油卡片底都看得到
  background: color-mix(in srgb, currentColor 10%, transparent);
  border-radius: 12px;
  border-top-left-radius: 2px;
  padding: 8px 10px;
  min-height: 0;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
  overflow: hidden;
}

.sticker-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  max-width: 100%;
  padding: 2px 9px 2px 6px;
  border-radius: 999px;
  background: color-mix(in srgb, currentColor 12%, transparent);
  font-size: 11px;
  opacity: 0.9;
  flex-shrink: 0;

  span {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
}

.sticker-chip-img {
  width: 18px;
  height: 18px;
  object-fit: contain;
}

/* 主題版型自己畫外框與底色，宿主只提供尺寸與點擊 */
.recent-chat-widget.themed {
  padding: 0;
  border-radius: 0;
  background: transparent;
  overflow: visible;
}

/* ===== 手帳拼貼：便條紙 ===== */
.recent-chat-widget.layout-sticky {
  gap: 6px;
  padding: 16px 14px 12px;
  border-radius: 2px;
  background: #f4e2a0;
  color: #3a302a;
  transform: rotate(3deg);
  box-shadow: 0 12px 20px -12px rgba(70, 50, 30, 0.5);
  // 紙膠帶要超出便條紙邊緣
  overflow: visible;
  font-family: "LXGW WenKai TC", "Huninn", "Noto Sans TC", sans-serif;
}

.recent-chat-widget.layout-sticky .sticky-tape {
  position: absolute;
  top: -8px;
  left: -14px;
  width: 64px;
  height: 22px;
  background: rgba(168, 190, 148, 0.8);
  transform: rotate(-30deg);
  pointer-events: none;
}

.sticky-header {
  display: flex;
  align-items: baseline;
  gap: 6px;

  .name {
    font-size: 17px;
    font-weight: 700;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .unread-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: #b5604a;
    flex-shrink: 0;
    align-self: center;
  }

  .time {
    margin-left: auto;
    font-size: 11px;
    opacity: 0.72;
    white-space: nowrap;
  }
}

.sticky-text {
  margin: 0;
  font-size: 13.5px;
  line-height: 1.6;
  display: -webkit-box;
  -webkit-line-clamp: 6;
  line-clamp: 6;
  -webkit-box-orient: vertical;
  overflow: hidden;

  // 右下角留給印章 / 貼圖
  &.has-sticker {
    -webkit-line-clamp: 4;
    line-clamp: 4;
  }
}

.recent-chat-widget.layout-sticky .sticky-sticker {
  position: absolute;
  right: 8px;
  bottom: 8px;
  width: 56px;
  height: 56px;
  object-fit: contain;
  transform: rotate(-8deg);
  filter: drop-shadow(0 2px 3px rgba(70, 50, 30, 0.3));
}

.recent-chat-widget.layout-sticky .sticky-stamp {
  position: absolute;
  right: 10px;
  bottom: 10px;
  width: 54px;
  height: 54px;
  box-sizing: border-box;
  padding: 0 4px;
  border-radius: 50%;
  border: 1.5px dashed #b5604a;
  color: #b5604a;
  transform: rotate(-12deg);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;

  span {
    max-width: 100%;
    font-size: 9px;
    line-height: 12px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
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
