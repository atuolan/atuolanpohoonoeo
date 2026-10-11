<script setup lang="ts">
// 線描版型拍立得：歪框長方形；無照片時畫山與太陽塗鴉，有照片時照片內縮 6px 並套同樣的歪圓角裁切
// 設計稿沒有標題欄位，所以不 emit update:caption、也不顯示 caption
import { X } from "lucide-vue-next";
import type { ThemedPolaroidProps } from "../types";

defineProps<ThemedPolaroidProps>();
defineEmits<{
  pick: [];
  clear: [];
  "update:caption": [value: string];
}>();
</script>

<template>
  <div class="sk-polaroid" :style="color ? { '--sk-fg': color } : undefined">
    <div class="sk-polaroid__art" :class="{ 'is-photo': !!imageUrl }">
      <img v-if="imageUrl" :src="imageUrl" alt="" class="sk-polaroid__photo" draggable="false" />
      <template v-else>
        <svg class="sk-polaroid__doodle" viewBox="0 0 80 50" aria-hidden="true">
          <circle cx="60" cy="13" r="7" />
          <path d="M2 46 L24 18 L36 32 L46 22 L70 46" />
          <path d="M2 47 C 26 45, 52 48, 78 46" />
        </svg>
        <span class="sk-polaroid__hint">點擊上傳照片</span>
      </template>
    </div>

    <!-- 整塊都是上傳按鈕；清除鈕疊在上面，所以用 sibling 而不是巢狀 -->
    <button
      type="button"
      class="sk-polaroid__hit"
      :aria-label="imageUrl ? '更換照片' : '點擊上傳照片'"
      @click="$emit('pick')"
    ></button>

    <button
      v-if="imageUrl"
      type="button"
      class="sk-polaroid__clear"
      aria-label="清除照片"
      @click.stop="$emit('clear')"
    >
      <X :size="14" :stroke-width="1.6" aria-hidden="true" />
    </button>
  </div>
</template>

<style lang="scss" scoped>
$ink: #1a1a1a;

// 歪框長方形的不規則圓角（設計稿 T5 的長方形）
$rect-radius: 255px 15px 225px 15px / 15px 225px 15px 255px;

.sk-polaroid {
  position: relative;
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  // 子元件的 cqw / cqh 以格子大小為準
  container-type: size;
  border: 1.6px solid $ink;
  border-radius: $rect-radius;
  background: #ffffff;
  font-family: "Huninn", "Noto Sans TC", sans-serif;
  color: var(--sk-fg, #{$ink});

  // 空白狀態：內容置中
  &__art {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    pointer-events: none;

    // 有照片：內縮 6px，同樣的歪圓角裁切
    &.is-photo {
      inset: 6px;
      overflow: hidden;
      border-radius: $rect-radius;
      background: #ffffff;
    }
  }

  &__doodle {
    display: block;
    width: 52cqw;
    max-width: 84px;
    height: auto;
    aspect-ratio: 80 / 50;
    fill: none;
    stroke: $ink;
    stroke-width: 1.6;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  &__hint {
    font-size: clamp(11px, 8cqw, 13px);
    line-height: 1.2;
    white-space: nowrap;
    color: var(--sk-fg, #{$ink});
  }

  &__photo {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
    user-select: none;
    pointer-events: none;
  }

  // 整塊的上傳按鈕（透明，蓋在圖上）
  &__hit {
    position: absolute;
    inset: 0;
    z-index: 1;
    padding: 0;
    margin: 0;
    border: 0;
    background: none;
    border-radius: inherit;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
  }

  // 小的歪圓清除鈕：觸控目標 32px 以上
  &__clear {
    position: absolute;
    top: 8px;
    right: 8px;
    z-index: 2;
    display: flex;
    align-items: center;
    justify-content: center;
    box-sizing: border-box;
    width: clamp(32px, 22cqw, 36px);
    height: clamp(32px, 22cqw, 36px);
    padding: 0;
    margin: 0;
    border: 1.6px solid $ink;
    border-radius: 50% 46% 52% 48% / 48% 52% 46% 50%;
    background: #ffffff;
    color: $ink;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
  }
}
</style>
