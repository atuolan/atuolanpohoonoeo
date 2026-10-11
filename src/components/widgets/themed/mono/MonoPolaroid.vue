<script setup lang="ts">
// 極簡黑白拍立得：素面方形。沒照片是 #E6E4DE 的空框加細線圖示；有照片就直角滿版，不加框不加陰影。
import { ImagePlus, X } from "lucide-vue-next";
import type { ThemedPolaroidProps } from "../types";

defineProps<ThemedPolaroidProps>();
const emit = defineEmits<{
  pick: [];
  clear: [];
  "update:caption": [value: string];
}>();
</script>

<template>
  <div class="mono-polaroid" :style="color ? { color } : undefined">
    <img v-if="imageUrl" class="mono-polaroid__img" :src="imageUrl" alt="" />
    <div v-else class="mono-polaroid__empty" aria-hidden="true">
      <ImagePlus class="mono-polaroid__icon" :size="22" :stroke-width="1.5" />
      <span class="mono-polaroid__hint">點擊上傳照片</span>
    </div>

    <!-- 整塊都是上傳區；清除鈕蓋在上面，所以點清除不會觸發上傳 -->
    <button
      type="button"
      class="mono-polaroid__pick"
      :aria-label="imageUrl ? '更換照片' : '上傳照片'"
      @click="emit('pick')"
    />
    <button
      v-if="imageUrl"
      type="button"
      class="mono-polaroid__clear"
      aria-label="清除照片"
      @click.stop="emit('clear')"
    >
      <X :size="14" :stroke-width="1.5" aria-hidden="true" />
    </button>
  </div>
</template>

<style lang="scss" scoped>
.mono-polaroid {
  position: relative;
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  container-type: size;
  overflow: hidden;
  background: #e6e4de;
  color: #1c1c1a;
  font-family: "Noto Sans TC", sans-serif;

  &__img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  &__empty {
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;
    color: #5e5d58;
  }

  &__hint {
    font-size: clamp(9px, 8.5cqh, 11px);
    letter-spacing: 0.1em;
    white-space: nowrap;
  }

  // 整塊透明的上傳鈕，鋪滿整個格子
  &__pick {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    margin: 0;
    padding: 0;
    border: 0;
    background: none;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
  }

  // 清除鈕：紙色底加 1px 黑框，在照片上也看得清楚；觸控範圍 32px
  &__clear {
    position: absolute;
    top: 6px;
    right: 6px;
    z-index: 1;
    width: 32px;
    height: 32px;
    box-sizing: border-box;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    border: 1px solid #1c1c1a;
    background: #f6f5f1;
    color: #1c1c1a;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
  }
}
</style>
