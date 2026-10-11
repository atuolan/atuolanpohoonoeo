<script setup lang="ts">
// 珍珠畫廊的 App 圖標：一顆金線環繞的珍珠，下方為 App 名稱
import type { ThemedAppProps } from "../types";

defineProps<ThemedAppProps>();
</script>

<template>
  <div class="pearl-app">
    <span class="pearl-app__pearl">
      <img
        v-if="customImageUrl"
        :src="customImageUrl"
        alt=""
        class="pearl-app__image"
        draggable="false"
      />
      <component
        :is="icon"
        v-else
        class="pearl-app__icon"
        :size="22"
        :stroke-width="1.6"
        aria-hidden="true"
      />
    </span>
    <span class="pearl-app__label" :style="{ color: color || '#F3EEE2' }">{{ label }}</span>
  </div>
</template>

<style lang="scss" scoped>
// 根元素填滿格子，珍珠大小依格子寬高取較小者（80px 格子時約 52px）
.pearl-app {
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  container-type: size;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  font-family: "Noto Serif TC", serif;

  // 珍珠：白到米灰的徑向漸層，金線外環（outline 不佔版面）
  &__pearl {
    width: min(65cqw, 62cqh);
    height: min(65cqw, 62cqh);
    flex-shrink: 0;
    box-sizing: border-box;
    border-radius: 50%;
    background: radial-gradient(
      circle at 35% 30%,
      #ffffff 0%,
      #f4f0e6 30%,
      #d6cfbf 75%,
      #b9b09c 100%
    );
    outline: 1.5px solid #c9a45c;
    outline-offset: 3px;
    box-shadow: 0 8px 14px -6px #000000cc;
    color: #2b2840;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
  }

  // 自訂圖片裁成圓形
  &__image {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }

  &__icon {
    flex-shrink: 0;
  }

  &__label {
    max-width: 100%;
    font-size: 12px;
    letter-spacing: 0.1em;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
}
</style>
