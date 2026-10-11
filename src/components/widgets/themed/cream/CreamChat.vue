<script setup lang="ts">
// 奶油風最近聊天：對話泡泡卡（左下角尖），標頭是頭像與名字，貼圖用草莓色膠囊標籤
import { computed } from "vue";
import { Cat } from "lucide-vue-next";
import { useOnDemandFont } from "@/composables/useOnDemandFont";
import type { ThemedChatProps } from "../types";

const props = defineProps<ThemedChatProps>();

useOnDemandFont(
  "aguaphone-cream-font",
  "https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600&display=swap",
  computed(() => true),
);

// 頭像沒圖時取名字第一個字（用 Array.from 避免切壞代理字元）
const initial = computed(() => Array.from(props.displayName || "")[0] ?? "");

const hasSticker = computed(() => !!(props.stickerUrl || props.stickerName));

// 有貼圖標籤時卡片高度不夠，訊息文字就只留一行
const emptyText = computed(() => (props.isEditMode ? "點擊齒輪圖示綁定角色" : "還沒有聊天，去找角色聊聊吧"));

const vars = computed(() => ({
  "--cream-ink": props.color || "#4A3528",
  "--cream-soft": props.color || "#7E6250",
}));
</script>

<template>
  <div class="cream-chat" :style="vars">
    <div class="cream-chat__card">
      <p v-if="!hasCharacter" class="cream-chat__empty">{{ emptyText }}</p>

      <template v-else>
        <div class="cream-chat__head">
          <span class="cream-chat__avatar">
            <img v-if="avatar" :src="avatar" alt="" class="cream-chat__avatar-img" />
            <span v-else>{{ initial }}</span>
          </span>
          <span class="cream-chat__name">{{ displayName }}</span>
          <span
            v-if="unreadCount > 0"
            class="cream-chat__dot"
            role="img"
            :aria-label="`${unreadCount} 則未讀`"
          ></span>
          <span class="cream-chat__time">{{ timeText }}</span>
        </div>

        <p
          v-if="previewText"
          class="cream-chat__text"
          :class="{ 'is-clamp-1': hasSticker }"
        >{{ previewText }}</p>

        <span v-if="hasSticker" class="cream-chat__sticker">
          <img v-if="stickerUrl" :src="stickerUrl" alt="" class="cream-chat__sticker-img" />
          <Cat v-else :size="14" :stroke-width="1.8" aria-hidden="true" />
          <span v-if="stickerName" class="cream-chat__sticker-name">貼圖・{{ stickerName }}</span>
        </span>
      </template>
    </div>
  </div>
</template>

<style lang="scss" scoped>
$paper: #fffcf6;
$brown: #4a3528;
$strawberry: #f6d9c9;
$caramel: #c98a55;
$soft-default: #7e6250;

// 根元素填滿格子並作為 cq 容器；頭像與文字以高度（cqh）縮放
.cream-chat {
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  container-type: size;
  font-family: "Huninn", "Noto Sans TC", sans-serif;
  color: var(--cream-ink, #{$brown});

  // 泡泡：圓角 28，左下角 8 做出尖角
  &__card {
    box-sizing: border-box;
    width: 100%;
    height: 100%;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 14px 18px 16px;
    border-radius: 28px 28px 28px 8px;
    background: $paper;
    box-shadow: 0 16px 30px -20px rgba(150, 100, 60, 0.55);
    overflow: hidden;
  }

  &__head {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
  }

  // 深咖啡圓形頭像
  &__avatar {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    width: clamp(26px, 22cqh, 36px);
    height: clamp(26px, 22cqh, 36px);
    border-radius: 50%;
    overflow: hidden;
    background: $brown;
    color: $paper;
    font-family: "Fraunces", "Noto Serif TC", serif;
    font-size: clamp(12px, 11.5cqh, 15px);
  }

  &__avatar-img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  &__name {
    flex: 1 1 auto;
    min-width: 0;
    font-size: clamp(13px, 11.5cqh, 15px);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  // 未讀小圓點
  &__dot {
    flex-shrink: 0;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: $caramel;
  }

  &__time {
    flex-shrink: 0;
    font-size: clamp(10px, 9.4cqh, 12px);
    color: var(--cream-soft, #{$soft-default});
    white-space: nowrap;
  }

  // 訊息文字，超過行數用 line-clamp 截斷
  &__text {
    flex: 1 1 auto;
    min-height: 0;
    margin: 0;
    font-size: clamp(12px, 11.5cqh, 15px);
    line-height: 1.65;
    color: var(--cream-ink, #{$brown});
    overflow: hidden;
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;

    &.is-clamp-1 {
      -webkit-line-clamp: 1;
      line-clamp: 1;
    }
  }

  // 草莓色膠囊貼圖標籤
  &__sticker {
    flex-shrink: 0;
    align-self: flex-start;
    display: flex;
    align-items: center;
    gap: 6px;
    max-width: 100%;
    padding: 4px 12px 4px 9px;
    border-radius: 999px;
    background: $strawberry;
    color: var(--cream-ink, #{$brown});
    font-size: clamp(11px, 9.4cqh, 12px);
    line-height: 1.4;
  }

  &__sticker-img {
    flex-shrink: 0;
    width: 18px;
    height: 18px;
    object-fit: contain;
  }

  &__sticker-name {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__empty {
    margin: auto;
    text-align: center;
    font-size: 13px;
    line-height: 1.6;
    color: var(--cream-soft, #{$soft-default});
  }
}
</style>
