<script setup lang="ts">
import { Palette } from "lucide-vue-next";

type CalendarColorKey = "today" | "holiday" | "weekday";
type CalendarColors = Record<CalendarColorKey, string>;

const calendarColors = defineModel<CalendarColors>("calendarColors", {
  required: true,
});

const items: { key: CalendarColorKey; label: string; default: string }[] = [
  { key: "today", label: "今日高亮", default: "#6366f1" },
  { key: "holiday", label: "節假日", default: "#f59e0b" },
  { key: "weekday", label: "一般日期", default: "#374151" },
];

const presetSwatches = [
  "#7dd3a8",
  "#f5a9b8",
  "#89CFF0",
  "#FFB347",
  "#e53e3e",
  "#1f2937",
  "#ffffff",
];

function swatchesFor(item: { default: string }): string[] {
  return ["", item.default, ...presetSwatches];
}

function isCustomColor(value: string, item: { default: string }): boolean {
  if (!value) return false;
  if (value === item.default) return false;
  return !presetSwatches.includes(value);
}

function setColor(key: CalendarColorKey, value: string) {
  calendarColors.value = { ...calendarColors.value, [key]: value };
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
    <div class="group-label">日期顏色</div>
    <div class="cal-color-blocks">
      <div v-for="item in items" :key="item.key" class="cal-color-block">
        <div class="cal-block-header">
          <span class="cal-block-label">{{ item.label }}</span>
          <span
            class="cal-block-preview"
            :style="{
              background: calendarColors[item.key] || item.default,
            }"
          ></span>
        </div>
        <div class="cal-swatches">
          <button
            v-for="c in swatchesFor(item)"
            :key="c"
            :class="['cal-swatch', { active: calendarColors[item.key] === c }]"
            :style="c ? { backgroundColor: c } : {}"
            @click="setColor(item.key, c)"
          >
            <span v-if="!c" class="swatch-auto">自動</span>
          </button>
          <label
            class="cal-swatch cal-swatch-custom"
            :class="{ active: isCustomColor(calendarColors[item.key], item) }"
            :style="
              isCustomColor(calendarColors[item.key], item)
                ? { backgroundColor: calendarColors[item.key] }
                : {}
            "
          >
            <Palette :size="11" />
            <input
              type="color"
              class="hidden-color-input"
              :value="toHexColor(calendarColors[item.key], item.default)"
              @input="
                setColor(item.key, ($event.target as HTMLInputElement).value)
              "
            />
          </label>
        </div>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
@use "../../../styles/widget-settings-shared";

// 行事曆顏色設定
.cal-color-blocks {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.cal-color-block {
  background: #f8fafc;
  border-radius: 12px;
  padding: 10px 12px;

  .cal-block-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 8px;
  }

  .cal-block-label {
    font-size: 12px;
    font-weight: 600;
    color: #374151;
  }

  .cal-block-preview {
    width: 18px;
    height: 18px;
    border-radius: 50%;
    border: 2px solid rgba(0, 0, 0, 0.08);
    flex-shrink: 0;
  }

  .cal-swatches {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
    align-items: center;
  }
}

.cal-swatch {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  border: 2px solid transparent;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  outline: 2px solid transparent;
  outline-offset: 2px;
  transition: all 0.15s;

  &:first-child {
    background: linear-gradient(135deg, #e5e7eb 50%, #9ca3af 50%);
  }

  &.active {
    outline-color: #6366f1;
  }

  .swatch-auto {
    font-size: 7px;
    font-weight: 700;
    color: #6b7280;
    line-height: 1;
  }

  &.cal-swatch-custom {
    background: #f3f4f6;
    border-color: #e5e7eb;
    cursor: pointer;
    position: relative;
    overflow: hidden;
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
