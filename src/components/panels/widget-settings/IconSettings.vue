<script setup lang="ts">
import type { WidgetCustomStyle } from "@/types";
import { Crosshair, Image as ImageIcon, RotateCcw } from "lucide-vue-next";

defineProps<{ localStyle: WidgetCustomStyle }>();

const emit = defineEmits<{
  "show-picker": [];
  "reset-icon-scale": [];
  "center-icon-offset": [];
}>();
</script>

<template>
  <div class="setting-group">
    <div class="group-label">當前圖標</div>
    <div class="current-icon">
      <div v-if="localStyle.customIconUrl" class="icon-preview custom">
        <img :src="localStyle.customIconUrl" alt="自定義圖標" />
      </div>
      <div v-else-if="localStyle.iconName" class="icon-preview preset">
        {{ localStyle.iconName }}
      </div>
      <div v-else class="icon-preview default">使用預設</div>
    </div>
    <button class="change-icon-btn" @click="emit('show-picker')">
      <ImageIcon :size="16" />
      更換圖標
    </button>
  </div>

  <!-- 圖標大小調整 -->
  <div class="setting-group">
    <div class="group-label">
      圖標大小
      <span class="size-value">{{ localStyle.iconSize || 50 }}%</span>
    </div>
    <input
      type="range"
      class="size-slider"
      :value="localStyle.iconSize || 50"
      min="20"
      max="110"
      step="5"
      @input="
        localStyle.iconSize = Number(
          ($event.target as HTMLInputElement).value,
        )
      "
    />
    <div class="slider-labels">
      <span>小</span>
      <span>大</span>
    </div>
  </div>

  <!-- 圖標縮放比例 -->
  <div class="setting-group">
    <div class="group-label">
      縮放比例
      <span class="size-value"
        >{{ (localStyle.iconScale ?? 1).toFixed(2) }}x</span
      >
    </div>
    <input
      type="range"
      class="size-slider"
      :value="localStyle.iconScale ?? 1"
      min="0.5"
      max="2"
      step="0.05"
      @input="
        localStyle.iconScale = Number(
          ($event.target as HTMLInputElement).value,
        )
      "
    />
    <div class="slider-labels">
      <span>0.5x</span>
      <span>2x</span>
    </div>
    <button class="center-btn" type="button" @click="emit('reset-icon-scale')">
      <RotateCcw :size="14" />
      還原 1x
    </button>
  </div>

  <!-- 圖標水平位置 X -->
  <div class="setting-group">
    <div class="group-label">
      水平位置 X
      <span class="size-value">{{ localStyle.iconOffsetX ?? 0 }}%</span>
    </div>
    <input
      type="range"
      class="size-slider"
      :value="localStyle.iconOffsetX ?? 0"
      min="-100"
      max="100"
      step="5"
      @input="
        localStyle.iconOffsetX = Number(
          ($event.target as HTMLInputElement).value,
        )
      "
    />
    <div class="slider-labels">
      <span>左</span>
      <span>右</span>
    </div>
  </div>

  <!-- 圖標垂直位置 Y -->
  <div class="setting-group">
    <div class="group-label">
      垂直位置 Y
      <span class="size-value">{{ localStyle.iconOffsetY ?? 0 }}%</span>
    </div>
    <input
      type="range"
      class="size-slider"
      :value="localStyle.iconOffsetY ?? 0"
      min="-100"
      max="100"
      step="5"
      @input="
        localStyle.iconOffsetY = Number(
          ($event.target as HTMLInputElement).value,
        )
      "
    />
    <div class="slider-labels">
      <span>上</span>
      <span>下</span>
    </div>
    <button class="center-btn" type="button" @click="emit('center-icon-offset')">
      <Crosshair :size="14" />
      置中（X / Y 歸零）
    </button>
  </div>
</template>

<style lang="scss" scoped>
@use "../../../styles/widget-settings-shared";

// 圖標設定
.current-icon {
  margin-bottom: 12px;
}

.icon-preview {
  width: 80px;
  height: 80px;
  border-radius: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  font-weight: 500;

  &.custom img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    border-radius: 16px;
  }

  &.preset {
    background: linear-gradient(135deg, #e0e7ff 0%, #ddd6fe 100%);
    color: #4f46e5;
  }

  &.default {
    background: #f3f4f6;
    color: #9ca3af;
  }
}

.change-icon-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 20px;
  border-radius: 12px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  font-size: 14px;
  font-weight: 600;
  transition: all 0.2s;

  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 6px 16px rgba(102, 126, 234, 0.4);
  }
}

// 圖標大小滑桿
.size-value {
  float: right;
  font-weight: 400;
  color: #6b7280;
  font-size: 12px;
}

.size-slider {
  width: 100%;
  height: 6px;
  appearance: none;
  background: #e5e7eb;
  border-radius: 3px;
  outline: none;

  &::-webkit-slider-thumb {
    appearance: none;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: #6366f1;
    cursor: pointer;
    box-shadow: 0 2px 6px rgba(99, 102, 241, 0.3);
  }
}

.slider-labels {
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  color: #9ca3af;
  margin-top: 4px;
}

.center-btn {
  margin-top: 10px;
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 8px 12px;
  border-radius: 10px;
  background: #f3f4f6;
  font-size: 13px;
  font-weight: 500;
  color: #374151;
  transition: background 0.2s;

  &:hover {
    background: #e5e7eb;
  }
}
</style>
