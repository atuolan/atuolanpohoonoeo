<script setup lang="ts">
import type { ChatBubbleEffects } from "@/types/chat";
import { toPickerHex } from "@/utils/simpleGradient";

// 氣泡質感：不透明度、毛玻璃、陰影、邊框（「版面」分頁與預覽點擊面板共用）
defineProps<{
  /** 邊框顏色留空時，色盤顯示的顏色 */
  fallbackBorderColor: string;
}>();

const model = defineModel<ChatBubbleEffects>({ required: true });

const SHADOWS = [
  { id: "theme", name: "主題預設" },
  { id: "none", name: "無" },
  { id: "soft", name: "柔和" },
  { id: "strong", name: "明顯" },
] as const satisfies readonly { id: ChatBubbleEffects["shadow"]; name: string }[];

function update(patch: Partial<ChatBubbleEffects>) {
  model.value = { ...model.value, ...patch };
}

const numberOf = (event: Event) => Number((event.target as HTMLInputElement).value);
</script>

<template>
  <div class="slider-control">
    <span class="slider-label">不透明度</span>
    <input
      type="range"
      min="0"
      max="100"
      step="5"
      :value="model.opacity"
      aria-label="氣泡不透明度"
      @input="update({ opacity: numberOf($event) })"
    />
    <span class="slider-value">{{ model.opacity }}%</span>
  </div>
  <div class="slider-control">
    <span class="slider-label">毛玻璃</span>
    <input
      type="range"
      min="0"
      max="20"
      step="1"
      :value="model.blur"
      aria-label="氣泡毛玻璃"
      @input="update({ blur: numberOf($event) })"
    />
    <span class="slider-value">{{ model.blur }}px</span>
  </div>
  <p v-if="model.blur > 0 && model.opacity >= 100" class="fields-hint">氣泡不透明度調低後，才看得到毛玻璃效果</p>

  <div class="field-row">
    <span class="slider-label">陰影</span>
    <div class="chip-row">
      <button
        v-for="shadow in SHADOWS"
        :key="shadow.id"
        class="chip"
        :class="{ active: model.shadow === shadow.id }"
        @click="update({ shadow: shadow.id })"
      >
        {{ shadow.name }}
      </button>
    </div>
  </div>

  <div class="slider-control">
    <span class="slider-label">邊框</span>
    <input
      type="range"
      min="0"
      max="3"
      step="0.5"
      :value="model.borderWidth"
      aria-label="氣泡邊框粗細"
      @input="update({ borderWidth: numberOf($event) })"
    />
    <span class="slider-value">{{ model.borderWidth ? `${model.borderWidth}px` : "無" }}</span>
  </div>
  <div v-if="model.borderWidth > 0" class="color-item border-color">
    <input
      type="color"
      aria-label="氣泡邊框顏色"
      :value="toPickerHex(model.borderColor, toPickerHex(fallbackBorderColor, '#e5e5e5'))"
      @input="update({ borderColor: ($event.target as HTMLInputElement).value })"
    />
    <span>邊框顏色</span>
  </div>
</template>

<style lang="scss" scoped>
@use "../../../styles/theme-settings-shared";

// 選項換行時，標籤對齊第一列
.field-row {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 4px 2px;

  .slider-label {
    flex-shrink: 0;
    min-width: 48px;
    font-size: 12px;
    line-height: 30px;
    color: var(--color-text-secondary);
  }
}

.fields-hint {
  margin: -4px 0 0;
  font-size: 12px;
  color: var(--color-text-muted);
}

.border-color {
  align-self: flex-start;
}
</style>
