<script setup lang="ts">
// 奶油風拍立得：圓形照片，奶白圓環外框；沒照片時顯示上傳提示
import { computed } from "vue";
import { ImagePlus, RotateCcw } from "lucide-vue-next";
import type { ThemedPolaroidProps } from "../types";

const props = defineProps<ThemedPolaroidProps>();
const emit = defineEmits<{
  pick: [];
  clear: [];
  "update:caption": [value: string];
}>();

// 文字色有值才覆蓋預設提示色
const vars = computed(() => ({
  "--cream-hint": props.color || "#9C7A60",
}));
</script>

<template>
  <div class="cream-polaroid" :style="vars">
    <div class="cream-polaroid__ring">
      <button
        type="button"
        class="cream-polaroid__photo"
        :aria-label="imageUrl ? '更換照片' : '上傳照片'"
        @click="emit('pick')"
      >
        <img v-if="imageUrl" :src="imageUrl" alt="" class="cream-polaroid__img" />
        <span v-else class="cream-polaroid__empty">
          <ImagePlus class="cream-polaroid__icon" :stroke-width="1.8" aria-hidden="true" />
          <span class="cream-polaroid__hint">點擊上傳照片</span>
        </span>
      </button>

      <button
        v-if="imageUrl"
        type="button"
        class="cream-polaroid__clear"
        aria-label="清除照片"
        @click.stop="emit('clear')"
      >
        <RotateCcw :size="16" :stroke-width="2" aria-hidden="true" />
      </button>
    </div>
  </div>
</template>

<style lang="scss" scoped>
$paper: #fffcf6;
$dial: #f5e6cf;
$soft-default: #7e6250;

// 根元素填滿格子並作為 cq 容器；圓形以較短邊（cqmin）為直徑，置中
.cream-polaroid {
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  container-type: size;
  display: flex;
  align-items: center;
  justify-content: center;

  // 奶白圓環外框，環寬約為直徑的 4.85%（設計稿 8px / 165px）
  &__ring {
    position: relative;
    box-sizing: border-box;
    width: 100cqmin;
    height: 100cqmin;
    padding: 4.85%;
    border-radius: 50%;
    background: $paper;
    box-shadow: 0 16px 30px -20px rgba(150, 100, 60, 0.55), inset 0 1px 0 #ffffff;
  }

  // 內圓照片區，本身就是按鈕（點擊 emit pick）
  &__photo {
    appearance: none;
    display: block;
    width: 100%;
    height: 100%;
    margin: 0;
    padding: 0;
    border: 0;
    border-radius: 50%;
    overflow: hidden;
    background: $dial;
    box-shadow: inset 0 2px 6px rgba(150, 100, 60, 0.18);
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;

    &:focus-visible {
      outline: 2px solid #c98a55;
      outline-offset: 2px;
    }
  }

  &__img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  &__empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    width: 100%;
    height: 100%;
    color: var(--cream-hint, #{$soft-default});
  }

  // 圖示與提示字都跟著圓形直徑縮放
  &__icon {
    width: clamp(22px, 17cqmin, 32px);
    height: clamp(22px, 17cqmin, 32px);
  }

  &__hint {
    font-family: "Huninn", "Noto Sans TC", sans-serif;
    font-size: clamp(10px, 8cqmin, 14px);
    line-height: 1.4;
    white-space: nowrap;
  }

  // 清除鈕浮在圓環右上，觸控目標 32px
  &__clear {
    appearance: none;
    position: absolute;
    top: 10%;
    right: 10%;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    margin: 0;
    padding: 0;
    border: 0;
    border-radius: 50%;
    background: $paper;
    color: $soft-default;
    box-shadow: 0 4px 10px -4px rgba(150, 100, 60, 0.5);
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
    // 手機上不常駐（會擋住照片），點照片就能換；有滑鼠的裝置滑過照片才出現
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.2s;

    @media (hover: hover) and (pointer: fine) {
      .cream-polaroid__ring:hover & {
        opacity: 1;
        pointer-events: auto;
      }
    }

    &:focus-visible {
      opacity: 1;
      pointer-events: auto;
      outline: 2px solid #c98a55;
      outline-offset: 2px;
    }
  }
}
</style>
