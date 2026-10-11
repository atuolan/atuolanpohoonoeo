<script setup lang="ts">
// 線描版型最近聊天：歪框對話泡泡，左下手繪尾巴（尾巴在泡泡外，根元素底部留空）
// 標頭歪圓頭像、名字、時間；訊息兩行截斷；貼圖有圖畫圖，沒圖畫 Cat 線條圖示 + 名稱
import { computed } from "vue";
import { Cat } from "lucide-vue-next";
import type { ThemedChatProps } from "../types";

const props = defineProps<ThemedChatProps>();

const initial = computed(() => props.displayName.charAt(0));
</script>

<template>
  <div class="sk-chat" :style="color ? { '--sk-fg': color } : undefined">
    <div class="sk-chat__bubble">
      <template v-if="hasCharacter">
        <div class="sk-chat__head">
          <span class="sk-chat__avatar">
            <img v-if="avatar" :src="avatar" alt="" class="sk-chat__avatar-img" />
            <span v-else class="sk-chat__initial">{{ initial }}</span>
          </span>
          <span class="sk-chat__name">{{ displayName }}</span>
          <span v-if="unreadCount > 0" class="sk-chat__dot" aria-hidden="true"></span>
          <span class="sk-chat__time">{{ timeText }}</span>
        </div>

        <p v-if="previewText" class="sk-chat__msg">{{ previewText }}</p>

        <span v-if="stickerUrl || stickerName" class="sk-chat__sticker">
          <img v-if="stickerUrl" :src="stickerUrl" :alt="stickerName" class="sk-chat__sticker-img" />
          <template v-else>
            <Cat :size="16" :stroke-width="1.6" class="sk-chat__cat" aria-hidden="true" />
            <span>（{{ stickerName }}）</span>
          </template>
        </span>
      </template>

      <p v-else class="sk-chat__empty">
        {{ isEditMode ? "點擊齒輪圖示綁定角色" : "還沒有聊天，去找角色聊聊吧" }}
      </p>

      <!-- 手繪尾巴：白色三角蓋住泡泡框線，再畫兩條曲線當尾巴外緣 -->
      <svg class="sk-chat__tail" viewBox="0 0 24 16" aria-hidden="true">
        <polygon points="3,0 21,0 2,15" fill="#FFFFFF" />
        <path d="M3 1 C 5 7, 4 11, 2 15 C 9 11, 15 6, 21 1" />
      </svg>
    </div>
  </div>
</template>

<style lang="scss" scoped>
$ink: #1a1a1a;
$sub: #555555;

// 歪框泡泡的不規則圓角（設計稿 T5 的對話泡泡）
$bubble-radius: 255px 15px 225px 15px / 15px 225px 15px 255px;
// 歪圓頭像的圓形變體（與設計稿一致）
$circle-radius: 50% 46% 52% 48% / 48% 52% 46% 50%;

.sk-chat {
  position: relative;
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  // 子元件的 cqh / cqw 以格子大小為準
  container-type: size;
  // 底部留給尾巴（尾巴在泡泡外側，不能被裁掉）
  padding-bottom: 16px;
  font-family: "Huninn", "Noto Sans TC", sans-serif;
  color: var(--sk-fg, #{$ink});

  &__bubble {
    position: relative;
    box-sizing: border-box;
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: clamp(8px, 8cqh, 14px) clamp(12px, 5cqw, 18px) clamp(10px, 9cqh, 16px) 12px;
    border: 1.6px solid $ink;
    border-radius: $bubble-radius;
    background: #ffffff;
  }

  &__head {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }

  &__avatar {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    box-sizing: border-box;
    width: clamp(24px, 24cqh, 32px);
    height: clamp(24px, 24cqh, 32px);
    border: 1.6px solid $ink;
    border-radius: $circle-radius;
    overflow: hidden;
    background: #ffffff;
  }

  &__avatar-img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  &__initial {
    font-size: clamp(11px, 10cqh, 14px);
    color: var(--sk-fg, #{$ink});
  }

  &__name {
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    font-size: clamp(12px, 11cqh, 15px);
    color: var(--sk-fg, #{$ink});
  }

  // 未讀提示：名字旁的實心小黑點
  &__dot {
    flex-shrink: 0;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: $ink;
  }

  &__time {
    flex-shrink: 0;
    white-space: nowrap;
    font-size: clamp(10px, 9cqh, 12px);
    color: $sub;
  }

  // 訊息：最多兩行，超出截斷；彈性高度，格子矮時自動收縮
  &__msg {
    flex: 1 1 0;
    min-height: 0;
    margin: 0;
    overflow: hidden;
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    word-break: break-word;
    font-size: clamp(11px, 10.5cqh, 14.5px);
    line-height: 1.6;
    color: var(--sk-fg, #{$ink});
  }

  &__sticker {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;
    min-width: 0;
    font-size: clamp(10px, 9cqh, 12px);
    color: $sub;
  }

  &__sticker-img {
    flex-shrink: 0;
    width: clamp(20px, 18cqh, 24px);
    height: clamp(20px, 18cqh, 24px);
    object-fit: contain;
  }

  &__cat {
    flex-shrink: 0;
    color: $ink;
  }

  &__empty {
    margin: auto;
    text-align: center;
    font-size: clamp(12px, 11cqh, 14px);
    line-height: 1.6;
    color: $sub;
  }

  // 尾巴：左下，框外約 14.6px；只有框線、不填色（填色的白三角只在 polygon 上）
  &__tail {
    position: absolute;
    left: 30px;
    bottom: -14.6px;
    width: 24px;
    height: 16px;
    overflow: visible;
    fill: none;
    stroke: $ink;
    stroke-width: 1.6;
    stroke-linecap: round;
    stroke-linejoin: round;

    polygon {
      stroke: none;
    }
  }
}
</style>
