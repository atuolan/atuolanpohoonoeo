<script setup lang="ts">
import type { ChatBarStyle } from "@/types/chat";

// 頂欄／輸入欄的樣式、不透明度與毛玻璃（「頂底欄」分頁與預覽點擊面板共用）
const props = defineProps<{
  /** 用於 aria-label，例如「頂欄」 */
  name: string;
}>();

const model = defineModel<ChatBarStyle>({ required: true });

function update(patch: Partial<ChatBarStyle>) {
  model.value = { ...model.value, ...patch };
}
</script>

<template>
  <div class="chip-row">
    <button class="chip" :class="{ active: !model.docked }" @click="update({ docked: false })">浮動卡片</button>
    <button class="chip" :class="{ active: model.docked }" @click="update({ docked: true })">貼齊邊緣</button>
  </div>
  <div class="slider-control">
    <span class="slider-label">不透明度</span>
    <input
      type="range"
      min="0"
      max="100"
      step="5"
      :value="model.opacity"
      :aria-label="`${props.name}不透明度`"
      @input="update({ opacity: Number(($event.target as HTMLInputElement).value) })"
    />
    <span class="slider-value">{{ model.opacity }}%</span>
  </div>
  <div class="slider-control">
    <span class="slider-label">毛玻璃</span>
    <input
      type="range"
      min="0"
      max="40"
      step="2"
      :value="model.blur"
      :aria-label="`${props.name}毛玻璃`"
      @input="update({ blur: Number(($event.target as HTMLInputElement).value) })"
    />
    <span class="slider-value">{{ model.blur }}px</span>
  </div>
</template>

<style lang="scss" scoped>
@use "../../../styles/theme-settings-shared";
</style>
