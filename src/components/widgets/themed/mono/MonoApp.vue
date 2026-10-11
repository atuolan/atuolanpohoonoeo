<script setup lang="ts">
// 極簡黑白目錄列：寬的時候是一列純文字目錄（斜體編號・標籤・斜箭頭，底下一條淡線）。
// 格子被縮成接近正方形（寬高比 < 1.6）時改成直式：細線圖示在上、標籤在下，避免擠壞。
// 點擊由宿主處理，這裡不攔截。
import { ArrowUpRight } from "lucide-vue-next";
import type { ThemedAppProps } from "../types";

defineProps<ThemedAppProps>();
</script>

<template>
  <div class="mono-app" :style="color ? { color } : undefined">
    <div class="mono-app__inner">
      <!-- 目錄列（寬版） -->
      <span v-if="indexNo" class="mono-app__index mono-app__wide">{{ indexNo }}</span>
      <span class="mono-app__label mono-app__wide">{{ label }}</span>
      <ArrowUpRight class="mono-app__arrow mono-app__wide" :size="14" :stroke-width="1.5" aria-hidden="true" />

      <!-- 直式（接近正方形時才顯示） -->
      <span class="mono-app__tall">
        <img v-if="customImageUrl" class="mono-app__img" :src="customImageUrl" alt="" />
        <component :is="icon" v-else class="mono-app__icon" :size="22" :stroke-width="1" aria-hidden="true" />
        <span class="mono-app__tall-label">{{ label }}</span>
      </span>
    </div>
  </div>
</template>

<style lang="scss" scoped>
// 沒有卡片底色、陰影、圓角；只有底部一條淡線當分隔
.mono-app {
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  container-type: size;
  color: #1c1c1a;
  font-family: "Noto Sans TC", sans-serif;

  &__inner {
    width: 100%;
    height: 100%;
    box-sizing: border-box;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 0 2px;
    border-bottom: 1px solid #1c1c1a26;
  }

  &__index {
    width: 20px;
    flex-shrink: 0;
    font-family: "Instrument Serif", "Noto Serif TC", serif;
    font-style: italic;
    font-size: clamp(13px, 36cqh, 17px);
    line-height: 1;
    color: #5e5d58;
  }

  &__label {
    flex: 1;
    min-width: 0;
    font-size: clamp(12px, 32cqh, 15px);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  &__arrow {
    flex-shrink: 0;
  }

  // 直式內容預設隱藏，只在窄格時打開
  &__tall {
    display: none;
  }

  &__icon,
  &__img {
    width: 22px;
    height: 22px;
    object-fit: contain;
  }

  &__tall-label {
    max-width: 100%;
    font-size: clamp(10px, 14cqh, 12px);
    letter-spacing: 0.04em;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
}

// 接近正方形：寬版內容收起，改成圖示在上、標籤在下
@container (aspect-ratio < 1.6) {
  .mono-app__inner {
    justify-content: center;
    padding: 4px 2px;
    // 方格裡的分隔線看起來像表格殘線，直式時拿掉
    border-bottom: none;
  }

  .mono-app__wide {
    display: none;
  }

  .mono-app__tall {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 5px;
    width: 100%;
    min-width: 0;
  }
}
</style>
