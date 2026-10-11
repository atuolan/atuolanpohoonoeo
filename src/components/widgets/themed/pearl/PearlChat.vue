<script setup lang="ts">
// 珍珠畫廊的最近聊天：窄而高的展品說明牌。訊息依格子高度決定顯示幾行
import { computed, ref, watch } from "vue";
import type { ThemedChatProps } from "../types";

const props = defineProps<ThemedChatProps>();

const messageRef = ref<HTMLElement | null>(null);
// 訊息區能放幾行，由實際高度換算
const lineCount = ref(3);

function measure() {
  const el = messageRef.value;
  if (!el) return;
  const lineHeight = parseFloat(getComputedStyle(el).lineHeight) || 20.6;
  lineCount.value = Math.max(1, Math.floor(el.clientHeight / lineHeight));
}

// 訊息區出現時（含空狀態切換回來）開始量高度，離開時停止觀察
watch(
  messageRef,
  (el, _prev, onCleanup) => {
    if (!el) return;
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    onCleanup(() => observer.disconnect());
  },
  { flush: "post" },
);

const metaLabel = computed(() =>
  props.unreadCount > 0 ? "新留言" : "留言",
);

const badgeText = computed(() =>
  props.unreadCount > 99 ? "99+" : String(props.unreadCount),
);

const avatarInitial = computed(() => props.displayName.charAt(0));
</script>

<template>
  <div class="pearl-chat">
    <!-- 沒有聊天的空狀態 -->
    <div v-if="!props.hasCharacter" class="pearl-chat__empty">
      <span class="pearl-chat__empty-text">
        {{ props.isEditMode ? "點擊齒輪圖示綁定角色" : "還沒有聊天，去找角色聊聊吧" }}
      </span>
    </div>

    <template v-else>
      <header class="pearl-chat__head">
        <span class="pearl-chat__avatar">
          <img v-if="props.avatar" :src="props.avatar" alt="" class="pearl-chat__avatar-img" />
          <span v-else class="pearl-chat__avatar-fallback">{{ avatarInitial }}</span>
        </span>
        <span class="pearl-chat__name" :style="props.color ? { color: props.color } : undefined">
          {{ props.displayName }}
        </span>
        <span v-if="props.unreadCount > 0" class="pearl-chat__badge" :aria-label="`${props.unreadCount} 則未讀`">
          {{ badgeText }}
        </span>
      </header>

      <!-- 名字下方的小字與細分隔線 -->
      <div class="pearl-chat__meta">{{ metaLabel }}・{{ props.timeText }}</div>

      <p
        ref="messageRef"
        class="pearl-chat__message"
        :style="{ '--pearl-chat-lines': lineCount, color: props.color || undefined }"
      >
        {{ props.previewText || (props.stickerName ? "" : "……") }}
      </p>

      <div v-if="props.stickerName" class="pearl-chat__foot">
        <img
          v-if="props.stickerUrl"
          :src="props.stickerUrl"
          alt=""
          class="pearl-chat__sticker"
          draggable="false"
        />
        <span class="pearl-chat__foot-text">附：貼圖〈{{ props.stickerName }}〉</span>
      </div>
    </template>
  </div>
</template>

<style lang="scss" scoped>
// 根元素填滿格子，展品牌底色為米白卡紙
.pearl-chat {
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  container-type: size;
  // cq 單位不能用在宣告 container-type 的元素自己身上（會退回視窗單位），這裡用固定值
  padding: 12px 11px 11px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  background: #f3eee2;
  color: #2b2840;
  font-family: "Noto Serif TC", serif;
  box-shadow: 0 10px 18px -10px #000000cc;
  overflow: hidden;

  // 空狀態：置中的細字
  &__empty {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    text-align: center;
  }

  &__empty-text {
    font-size: 12px;
    line-height: 1.6;
    color: #5e5872;
  }

  // 頭列：頭像 + 名字 + 未讀數
  &__head {
    display: flex;
    align-items: center;
    gap: 7px;
    min-width: 0;
  }

  &__avatar {
    width: 26px;
    height: 26px;
    flex-shrink: 0;
    border-radius: 13px;
    overflow: hidden;
    outline: 1px solid #c9a45c;
    outline-offset: 2px;
    background: #e9e3d4;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  &__avatar-img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }

  &__avatar-fallback {
    font-size: 12px;
    font-weight: 600;
    color: #2b2840;
  }

  &__name {
    flex: 1;
    min-width: 0;
    font-size: min(15cqh, 14cqw);
    font-weight: 700;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  // 未讀數：維梅爾藍小圓標
  &__badge {
    flex-shrink: 0;
    min-width: 18px;
    height: 18px;
    padding: 0 5px;
    box-sizing: border-box;
    border-radius: 9px;
    background: #3e6fb8;
    color: #f3eee2;
    font-size: 10px;
    line-height: 18px;
    text-align: center;
  }

  // 小字與細分隔線
  &__meta {
    flex-shrink: 0;
    font-size: 10px;
    color: #5e5872;
    letter-spacing: 0.06em;
    padding-bottom: 6px;
    border-bottom: 1px solid #2b284033;
  }

  // 訊息：行數由 JS 依高度算出的 --pearl-chat-lines 決定
  &__message {
    flex: 1;
    min-height: 0;
    margin: 0;
    font-size: 12.5px;
    line-height: 1.65;
    overflow: hidden;
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: var(--pearl-chat-lines, 3);
    line-clamp: var(--pearl-chat-lines, 3);
    word-break: break-word;
  }

  &__foot {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
  }

  &__sticker {
    width: 34px;
    height: 34px;
    flex-shrink: 0;
    object-fit: contain;
  }

  &__foot-text {
    min-width: 0;
    font-size: 10px;
    line-height: 1.4;
    color: #5e5872;
    overflow: hidden;
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
  }
}
</style>
