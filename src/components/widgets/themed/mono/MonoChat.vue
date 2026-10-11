<script setup lang="ts">
// 極簡黑白・引言：最新一則來信印成雜誌引言，上方一條黑線，開頭是大號襯線左引號。
// 引文最多三行（line-clamp），署名單行截斷，整塊點擊由宿主處理。
import { computed } from "vue";
import { useOnDemandFont } from "@/composables/useOnDemandFont";
import type { ThemedChatProps } from "../types";

const props = defineProps<ThemedChatProps>();

useOnDemandFont(
  "aguaphone-mono-font",
  "https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&display=swap",
  computed(() => true),
);

// 沒有文字只有貼圖時，引文位置改成灰字說明，不畫引號
const quoteText = computed(() => {
  if (props.previewText) return props.previewText;
  return props.stickerName ? "（傳來一張貼圖）" : "（尚無內容）";
});
</script>

<template>
  <div class="mono-chat" :style="color ? { color } : undefined">
    <div class="mono-chat__body">
      <template v-if="hasCharacter">
        <div class="mono-chat__label">
          最新來信
          <span v-if="unreadCount > 0" class="mono-chat__unread">・{{ unreadCount }} 則未讀</span>
        </div>

        <p class="mono-chat__quote" :class="{ 'mono-chat__quote--muted': !previewText }">
          <span v-if="previewText" class="mono-chat__mark">“</span>{{ quoteText }}
        </p>

        <div class="mono-chat__sign">
          <img v-if="stickerUrl" class="mono-chat__sticker" :src="stickerUrl" alt="" />
          <span class="mono-chat__sign-text">
            — {{ displayName }}，{{ timeText }}<template v-if="stickerName">・附貼圖〈{{ stickerName }}〉</template>
          </span>
        </div>
      </template>

      <div v-else class="mono-chat__empty">
        <span class="mono-chat__label">最新來信</span>
        <p class="mono-chat__empty-text">
          {{ isEditMode ? "點擊齒輪圖示綁定角色" : "還沒有聊天，去找角色聊聊吧" }}
        </p>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
// 沒有卡片底色、陰影、圓角；頂端黑線是唯一的框線。顏色繼承 color，沒設定就是油墨黑
.mono-chat {
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  container-type: size;
  padding: 0 12px 10px;
  color: #1c1c1a;
  font-family: "Noto Sans TC", sans-serif;

  &__body {
    height: 100%;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-height: 0;
    padding-top: 10px;
    border-top: 1px solid currentColor;
  }

  &__label {
    font-size: clamp(9px, 7.5cqh, 11px);
    letter-spacing: 0.3em;
    color: #5e5d58;
    line-height: 1.4;
    white-space: nowrap;
  }

  // 未讀數字改用墨色、不撐字距，讓它比「最新來信」醒目一點
  &__unread {
    color: currentColor;
    letter-spacing: 0.08em;
  }

  // 引文區吃掉剩餘高度，超過三行就用省略號截斷
  &__quote {
    flex: 1;
    min-height: 0;
    margin: 0;
    font-family: "Noto Serif TC", serif;
    font-size: clamp(12px, 12.5cqh, 18px);
    line-height: 1.6;
    text-indent: -0.5em;
    display: -webkit-box;
    -webkit-line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
    color: currentColor;

    &--muted {
      color: #5e5d58;
    }
  }

  // 開頭的大號左引號：Instrument Serif 的引號，撐大到約兩倍字高，垂直往下沉
  &__mark {
    font-family: "Instrument Serif", "Noto Serif TC", serif;
    font-size: 2.2em;
    line-height: 0;
    vertical-align: -0.32em;
    margin-right: 2px;
  }

  &__sign {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
    font-size: clamp(10px, 8.5cqh, 12px);
    color: #5e5d58;
    letter-spacing: 0.04em;
  }

  &__sticker {
    width: 20px;
    height: 20px;
    flex-shrink: 0;
    object-fit: contain;
  }

  &__sign-text {
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  &__empty {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-height: 0;
  }

  &__empty-text {
    margin: 0;
    font-family: "Noto Serif TC", serif;
    font-size: clamp(12px, 12cqh, 16px);
    line-height: 1.6;
    color: #5e5d58;
  }
}
</style>
