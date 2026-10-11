<script setup lang="ts">
// 線描版型 App 圖標：歪圓框 + 黑色線條圖示 + 下方 13px 標籤
// 歪圓框依 label 算固定雜湊，從 4 組圓形挑一組：每個圖標歪得不一樣，但每次都一樣
import { computed } from "vue";
import type { ThemedAppProps } from "../types";

const props = defineProps<ThemedAppProps>();

const SHAPES = [
  "50% 46% 52% 48% / 48% 52% 46% 50%",
  "47% 53% 49% 51% / 52% 47% 53% 48%",
  "52% 48% 46% 54% / 49% 53% 47% 51%",
  "49% 51% 53% 47% / 46% 50% 50% 54%",
];

const shape = computed(() => {
  let h = 5381;
  for (const ch of props.label) h = (Math.imul(h, 33) ^ ch.charCodeAt(0)) >>> 0;
  return SHAPES[h % SHAPES.length];
});
</script>

<template>
  <div class="sk-app" :style="color ? { '--sk-fg': color } : undefined">
    <span class="sk-app__frame" :style="{ borderRadius: shape }">
      <img v-if="customImageUrl" :src="customImageUrl" alt="" class="sk-app__img" />
      <component :is="icon" v-else :size="22" :stroke-width="1.6" class="sk-app__icon" aria-hidden="true" />
    </span>
    <span class="sk-app__label">{{ label }}</span>
  </div>
</template>

<style lang="scss" scoped>
$ink: #1a1a1a;

.sk-app {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  // 子元件的 cqw / cqh 以格子大小為準
  container-type: size;
  font-family: "Huninn", "Noto Sans TC", sans-serif;

  // 歪圓框：邊長隨格子縮放，留出下方標籤的高度
  &__frame {
    --s: min(72cqw, calc(100cqh - 24px));
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    box-sizing: border-box;
    width: var(--s);
    height: var(--s);
    border: 1.6px solid $ink;
    background: #ffffff;
    overflow: hidden;
  }

  &__icon {
    color: $ink;
  }

  &__img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  &__label {
    max-width: 100%;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    font-size: clamp(10px, 16cqw, 13px);
    line-height: 1.3;
    color: var(--sk-fg, #{$ink});
  }
}
</style>
