<script setup lang="ts">
// 奶油風 App 圖標：馬卡龍圓形底色 + 墨色圖示 + 下方標籤
import { computed } from "vue";
import type { ThemedAppProps } from "../types";

const props = defineProps<ThemedAppProps>();

// 文字色有值才覆蓋預設墨色
const vars = computed(() => ({
  "--cream-ink": props.color || "#4A3528",
}));
</script>

<template>
  <div class="cream-app" :style="vars">
    <div class="cream-app__macaron" :style="{ background: accent || '#F6D9C9' }">
      <img v-if="customImageUrl" :src="customImageUrl" alt="" class="cream-app__img" />
      <component
        :is="icon"
        v-else
        class="cream-app__icon"
        :size="25"
        :stroke-width="1.8"
        aria-hidden="true"
      />
    </div>
    <span class="cream-app__label">{{ label }}</span>
  </div>
</template>

<style lang="scss" scoped>
// 根元素填滿格子並作為 cq 容器；馬卡龍直徑 = 高度扣掉標籤列
.cream-app {
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  container-type: size;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  font-family: "Huninn", "Noto Sans TC", sans-serif;
  color: var(--cream-ink, #4a3528);

  // 馬卡龍：圓形，內底陰影 + 外柔影
  &__macaron {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    width: min(100cqw, calc(100cqh - 24px));
    height: min(100cqw, calc(100cqh - 24px));
    border-radius: 50%;
    overflow: hidden;
    box-shadow: inset 0 -4px 0 rgba(150, 100, 60, 0.12), 0 8px 14px -10px rgba(150, 100, 60, 0.6);
  }

  // 圖示約為馬卡龍直徑的 42%
  &__icon {
    width: 42%;
    height: 42%;
    color: var(--cream-ink, #4a3528);
  }

  // 自訂圖片填滿圓形
  &__img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  &__label {
    max-width: 100%;
    font-size: clamp(11px, 16cqh, 13px);
    line-height: 18px;
    color: var(--cream-ink, #4a3528);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
}
</style>
