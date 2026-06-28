<script setup lang="ts">
import {
  backgroundColors,
  borderColors,
  colorThemes,
  foregroundColors,
  gradientPresets,
} from "@/styles/color-presets";
import type { WidgetCustomStyle } from "@/types";
import { Palette } from "lucide-vue-next";

type ColorTheme = (typeof colorThemes)[number];

defineProps<{ localStyle: WidgetCustomStyle }>();

const emit = defineEmits<{
  "apply-theme": [theme: ColorTheme];
  "select-background-color": [color: string];
  "select-gradient": [gradient: string];
  "select-foreground-color": [color: string];
  "select-text-color": [color: string];
  "select-border-color": [color: string];
}>();

const backgroundType = defineModel<"solid" | "gradient">("backgroundType", {
  required: true,
});

function toHexColor(color: string | undefined, fallback: string): string {
  if (!color) return fallback;
  if (/^#[0-9a-fA-F]{6}$/.test(color)) return color;
  if (/^#[0-9a-fA-F]{3}$/.test(color)) {
    return (
      "#" +
      color
        .slice(1)
        .split("")
        .map((c) => c + c)
        .join("")
    );
  }
  return fallback;
}
</script>

<template>
  <!-- 快速主題 -->
  <div class="setting-group">
    <div class="group-label">快速主題</div>
    <div class="themes-grid">
      <button
        v-for="theme in colorThemes"
        :key="theme.id"
        class="theme-item"
        :style="{
          background: theme.backgroundGradient || theme.backgroundColor,
          color: theme.foregroundColor,
        }"
        @click="emit('apply-theme', theme)"
      >
        {{ theme.name }}
      </button>
    </div>
  </div>

  <!-- 背景色 -->
  <div class="setting-group">
    <div class="group-label">背景色</div>
    <div class="color-type-tabs">
      <button
        :class="['type-tab', { active: backgroundType === 'solid' }]"
        @click="backgroundType = 'solid'"
      >
        純色
      </button>
      <button
        :class="['type-tab', { active: backgroundType === 'gradient' }]"
        @click="backgroundType = 'gradient'"
      >
        漸變
      </button>
    </div>

    <!-- 純色選擇 -->
    <div v-if="backgroundType === 'solid'" class="colors-grid">
      <button
        v-for="color in backgroundColors"
        :key="color"
        :class="[
          'color-item',
          { active: localStyle.backgroundColor === color },
        ]"
        :style="{
          backgroundColor: color === 'transparent' ? '#fff' : color,
        }"
        @click="emit('select-background-color', color)"
      >
        <span v-if="color === 'transparent'" class="no-border">✕</span>
      </button>
      <!-- 自訂顏色 -->
      <label
        :class="[
          'color-item custom-color-picker',
          {
            active:
              localStyle.backgroundColor &&
              localStyle.backgroundColor !== 'transparent' &&
              !backgroundColors.includes(localStyle.backgroundColor),
          },
        ]"
        :style="{
          backgroundColor:
            localStyle.backgroundColor &&
            localStyle.backgroundColor !== 'transparent' &&
            !backgroundColors.includes(localStyle.backgroundColor)
              ? localStyle.backgroundColor
              : undefined,
        }"
      >
        <Palette :size="16" />
        <input
          type="color"
          class="hidden-color-input"
          :value="toHexColor(localStyle.backgroundColor, '#ffffff')"
          @input="
            emit(
              'select-background-color',
              ($event.target as HTMLInputElement).value,
            )
          "
        />
      </label>
    </div>

    <!-- 漸變選擇 -->
    <div v-else class="gradients-grid">
      <button
        v-for="gradient in gradientPresets"
        :key="gradient.id"
        :class="[
          'gradient-item',
          { active: localStyle.backgroundGradient === gradient.value },
        ]"
        :style="{ background: gradient.value }"
        @click="emit('select-gradient', gradient.value)"
      >
        <span class="gradient-name">{{ gradient.name }}</span>
      </button>
    </div>
  </div>

  <!-- 圖標顏色 -->
  <div class="setting-group">
    <div class="group-label">圖標顏色</div>
    <div class="colors-grid">
      <button
        v-for="color in foregroundColors"
        :key="color"
        :class="[
          'color-item',
          { active: localStyle.foregroundColor === color },
        ]"
        :style="{ backgroundColor: color }"
        @click="emit('select-foreground-color', color)"
      />
      <!-- 自訂顏色 -->
      <label
        :class="[
          'color-item custom-color-picker',
          {
            active:
              localStyle.foregroundColor &&
              !foregroundColors.includes(localStyle.foregroundColor),
          },
        ]"
        :style="{
          backgroundColor:
            localStyle.foregroundColor &&
            !foregroundColors.includes(localStyle.foregroundColor)
              ? localStyle.foregroundColor
              : undefined,
        }"
      >
        <Palette :size="16" />
        <input
          type="color"
          class="hidden-color-input"
          :value="toHexColor(localStyle.foregroundColor, '#000000')"
          @input="
            emit(
              'select-foreground-color',
              ($event.target as HTMLInputElement).value,
            )
          "
        />
      </label>
    </div>
  </div>

  <!-- 文字顏色 -->
  <div class="setting-group">
    <div class="group-label">文字顏色</div>
    <div class="colors-grid">
      <button
        v-for="color in foregroundColors"
        :key="'text-' + color"
        :class="['color-item', { active: localStyle.textColor === color }]"
        :style="{ backgroundColor: color }"
        @click="emit('select-text-color', color)"
      />
      <!-- 自訂顏色 -->
      <label
        :class="[
          'color-item custom-color-picker',
          {
            active:
              localStyle.textColor &&
              !foregroundColors.includes(localStyle.textColor),
          },
        ]"
        :style="{
          backgroundColor:
            localStyle.textColor &&
            !foregroundColors.includes(localStyle.textColor)
              ? localStyle.textColor
              : undefined,
        }"
      >
        <Palette :size="16" />
        <input
          type="color"
          class="hidden-color-input"
          :value="toHexColor(localStyle.textColor, '#000000')"
          @input="
            emit('select-text-color', ($event.target as HTMLInputElement).value)
          "
        />
      </label>
    </div>
  </div>

  <!-- 邊框色 -->
  <div class="setting-group">
    <div class="group-label">邊框顏色</div>
    <div class="colors-grid">
      <button
        v-for="color in borderColors"
        :key="color"
        :class="[
          'color-item border-color',
          { active: localStyle.borderColor === color },
        ]"
        :style="{
          backgroundColor: color === 'transparent' ? '#fff' : color,
        }"
        @click="emit('select-border-color', color)"
      >
        <span v-if="color === 'transparent'" class="no-border">✕</span>
      </button>
      <!-- 自訂顏色 -->
      <label
        :class="[
          'color-item custom-color-picker',
          {
            active:
              localStyle.borderColor &&
              localStyle.borderColor !== 'transparent' &&
              !borderColors.includes(localStyle.borderColor),
          },
        ]"
        :style="{
          backgroundColor:
            localStyle.borderColor &&
            localStyle.borderColor !== 'transparent' &&
            !borderColors.includes(localStyle.borderColor)
              ? localStyle.borderColor
              : undefined,
        }"
      >
        <Palette :size="16" />
        <input
          type="color"
          class="hidden-color-input"
          :value="toHexColor(localStyle.borderColor, '#000000')"
          @input="
            emit(
              'select-border-color',
              ($event.target as HTMLInputElement).value,
            )
          "
        />
      </label>
    </div>
  </div>
</template>

<style lang="scss" scoped>
@use "../../../styles/widget-settings-shared";

// 快速主題
.themes-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}

.theme-item {
  padding: 12px 8px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 600;
  text-align: center;
  transition: all 0.2s;
  border: 2px solid transparent;

  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  }

  &:active {
    transform: translateY(0);
  }
}

// 顏色類型標籤
.color-type-tabs {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
}

.type-tab {
  padding: 6px 16px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  color: #6b7280;
  background: #f3f4f6;
  transition: all 0.2s;

  &:hover {
    background: #e5e7eb;
  }

  &.active {
    background: #4f46e5;
    color: white;
  }
}

// 顏色網格
.colors-grid {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 10px;
}

.color-item {
  aspect-ratio: 1;
  border-radius: 12px;
  border: 3px solid transparent;
  transition: all 0.2s;
  position: relative;

  &:hover {
    transform: scale(1.1);
  }

  &.active {
    border-color: #4f46e5;
    box-shadow:
      0 0 0 2px white,
      0 0 0 4px #4f46e5;
  }

  &.border-color {
    border: 2px solid #e5e7eb;
  }

  .no-border {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 16px;
    color: #9ca3af;
  }
}

// 自訂調色盤按鈕
.custom-color-picker {
  background: #f3f4f6;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #9ca3af;
  cursor: pointer;
  border: 2px dashed #d1d5db;
  position: relative;
  overflow: hidden;

  &:hover {
    border-color: #9ca3af;
    color: #6b7280;
  }

  &.active {
    border-style: solid;
    border-color: #4f46e5;
    box-shadow:
      0 0 0 2px white,
      0 0 0 4px #4f46e5;
    color: white;
  }
}

.hidden-color-input {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  opacity: 0;
  cursor: pointer;
}

// 漸變網格
.gradients-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
}

.gradient-item {
  aspect-ratio: 2/1;
  border-radius: 12px;
  border: 3px solid transparent;
  transition: all 0.2s;
  display: flex;
  align-items: flex-end;
  padding: 8px;

  &:hover {
    transform: scale(1.02);
  }

  &.active {
    border-color: #4f46e5;
    box-shadow:
      0 0 0 2px white,
      0 0 0 4px #4f46e5;
  }

  .gradient-name {
    font-size: 11px;
    font-weight: 600;
    color: white;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
  }
}
</style>
