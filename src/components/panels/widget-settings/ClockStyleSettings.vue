<script setup lang="ts">
import type { ClockStyle } from "@/types";
import { Clock, Palette } from "lucide-vue-next";
import { clockStyles } from "./widgetSettingsOptions";

const clockStyleValue = defineModel<ClockStyle>("clockStyle", {
  required: true,
});
const showSecondsValue = defineModel<boolean>("showSeconds", {
  required: true,
});
const showDateValue = defineModel<boolean>("showDate", { required: true });
const clockColorValue = defineModel<string>("clockColor", { required: true });

const presetSwatches = [
  "",
  "#1f2937",
  "#ffffff",
  "#7dd3a8",
  "#f5a9b8",
  "#89CFF0",
  "#FFB347",
  "#a78bfa",
  "#fb7185",
];

function isCustomColor(color: string): boolean {
  return !!color && !presetSwatches.includes(color);
}

function toHexColor(color: string | undefined, fallback: string): string {
  if (!color) return fallback;
  if (/^#[0-9a-fA-F]{6}$/.test(color)) return color;
  if (/^#[0-9a-fA-F]{3}$/.test(color)) {
    return (
      "#" +
      color
        .slice(1)
        .split("")
        .map((ch) => ch + ch)
        .join("")
    );
  }
  return fallback;
}
</script>

<template>
  <div class="setting-group">
    <div class="group-label">
      <Clock
        :size="14"
        style="display: inline-block; vertical-align: middle; margin-right: 4px"
      />
      時鐘樣式
    </div>
    <div class="clock-styles-grid">
      <button
        v-for="style in clockStyles"
        :key="style.id"
        :class="['clock-style-item', { active: clockStyleValue === style.id }]"
        @click="clockStyleValue = style.id"
      >
        <span class="style-icon">{{ style.icon }}</span>
        <span class="style-name">{{ style.name }}</span>
        <span class="style-desc">{{ style.desc }}</span>
      </button>
    </div>

    <!-- 時鐘顯示選項 -->
    <div class="clock-options">
      <label class="toggle-option">
        <input type="checkbox" v-model="showSecondsValue" />
        <span class="toggle-label">顯示秒數</span>
      </label>
      <label class="toggle-option">
        <input type="checkbox" v-model="showDateValue" />
        <span class="toggle-label">顯示日期</span>
      </label>
    </div>

    <!-- 時鐘顏色（僅 minimal/digital/flip 等文字型時鐘） -->
    <div
      v-if="['minimal', 'digital', 'flip', 'analog'].includes(clockStyleValue)"
      class="clock-color-row"
    >
      <span class="clock-color-label">時鐘顏色</span>
      <div class="clock-color-swatches">
        <button
          v-for="c in presetSwatches"
          :key="c"
          :class="['clock-swatch', { active: clockColorValue === c }]"
          :style="c ? { backgroundColor: c } : {}"
          @click="clockColorValue = c"
        >
          <span v-if="!c" class="swatch-auto">自動</span>
        </button>
        <!-- 自訂顏色 -->
        <label
          :class="[
            'clock-swatch custom-swatch',
            { active: isCustomColor(clockColorValue) },
          ]"
          :style="
            isCustomColor(clockColorValue)
              ? { backgroundColor: clockColorValue }
              : {}
          "
        >
          <Palette :size="12" />
          <input
            type="color"
            class="hidden-color-input"
            :value="toHexColor(clockColorValue, '#000000')"
            @input="clockColorValue = ($event.target as HTMLInputElement).value"
          />
        </label>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
@use "../../../styles/widget-settings-shared";

// 時鐘樣式網格
.clock-styles-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  margin-bottom: 16px;
}

.clock-style-item {
  padding: 10px 6px;
  border-radius: 12px;
  background: #f8fafc;
  border: 2px solid transparent;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  text-align: center;
  transition: all 0.2s;

  &:hover {
    background: #f1f5f9;
    transform: translateY(-2px);
  }

  &.active {
    background: linear-gradient(135deg, #e0e7ff 0%, #ddd6fe 100%);
    border-color: #6366f1;

    .style-name {
      color: #4f46e5;
    }
  }

  .style-icon {
    font-size: 20px;
    line-height: 1;
  }

  .style-name {
    font-size: 12px;
    font-weight: 600;
    color: #374151;
  }

  .style-desc {
    font-size: 9px;
    color: #6b7280;
    line-height: 1.2;
  }
}

// 時鐘選項
.clock-options {
  display: flex;
  gap: 16px;
  padding: 12px;
  background: #f8fafc;
  border-radius: 12px;
}

// 時鐘顏色列
.clock-color-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 10px;
  padding: 10px 12px;
  background: #f8fafc;
  border-radius: 12px;

  .clock-color-label {
    font-size: 12px;
    font-weight: 600;
    color: #374151;
    white-space: nowrap;
    flex-shrink: 0;
  }

  .clock-color-swatches {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
    align-items: center;
  }
}

.clock-swatch {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  border: 2px solid transparent;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s;
  flex-shrink: 0;
  outline: 2px solid transparent;
  outline-offset: 2px;

  &.active {
    outline-color: #6366f1;
  }

  &:first-child {
    background: linear-gradient(135deg, #e5e7eb 50%, #9ca3af 50%);
  }

  .swatch-auto {
    font-size: 8px;
    font-weight: 700;
    color: #6b7280;
    line-height: 1;
  }

  &.custom-swatch {
    background: #f3f4f6;
    border-color: #e5e7eb;
    cursor: pointer;
    position: relative;
    overflow: hidden;
  }
}

.toggle-option {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;

  input[type="checkbox"] {
    width: 18px;
    height: 18px;
    accent-color: #6366f1;
    cursor: pointer;
  }

  .toggle-label {
    font-size: 13px;
    font-weight: 500;
    color: #374151;
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
</style>
