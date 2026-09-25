<script setup lang="ts">
import {
  createGradientFrom,
  getGradientAngle,
  getGradientStop,
  setGradientAngle,
  setGradientStop,
  toPickerHex,
} from "@/utils/simpleGradient";
import { computed, ref } from "vue";

const props = defineProps<{
  label: string;
  color: string | undefined;
  gradient: string | undefined;
  /** color 為空或不是 hex 時，色盤顯示的顏色 */
  fallbackColor: string;
}>();

const emit = defineEmits<{
  (e: "update:color", value: string): void;
  (e: "update:gradient", value: string): void;
}>();

const expanded = ref(false);

const pickerColor = computed(() => toPickerHex(props.color, props.fallbackColor));
const hasGradient = computed(() => !!props.gradient);

// 選純色代表改用純色，清掉漸層
function onColorInput(value: string) {
  emit("update:color", value);
  if (props.gradient) emit("update:gradient", "");
}

function onToggleGradient(enabled: boolean) {
  emit("update:gradient", enabled ? createGradientFrom(pickerColor.value) : "");
}
</script>

<template>
  <div class="color-item gradient-field" :class="{ expanded }" @click="expanded = !expanded">
    <div class="field-head">
      <span
        class="swatch"
        :class="{ 'has-gradient': hasGradient }"
        :style="hasGradient ? { backgroundImage: gradient } : undefined"
      >
        <input
          type="color"
          :value="pickerColor"
          :aria-label="label"
          @click.stop
          @input="onColorInput(($event.target as HTMLInputElement).value)"
        />
      </span>
      <span class="field-label">{{ label }}</span>
      <span class="chevron" aria-hidden="true">{{ expanded ? "▾" : "▸" }}</span>
    </div>

    <div v-if="expanded" class="gradient-detail" @click.stop>
      <label class="gradient-switch">
        <input
          type="checkbox"
          :checked="hasGradient"
          @change="onToggleGradient(($event.target as HTMLInputElement).checked)"
        />
        <span>啟用漸層</span>
      </label>
      <template v-if="gradient">
        <div class="gradient-stops">
          <div class="color-item mini">
            <input
              type="color"
              :value="getGradientStop(gradient, 0)"
              aria-label="漸層起始色"
              @input="emit('update:gradient', setGradientStop(gradient, 0, ($event.target as HTMLInputElement).value))"
            />
            <span>起始</span>
          </div>
          <div class="color-item mini">
            <input
              type="color"
              :value="getGradientStop(gradient, 1)"
              aria-label="漸層結束色"
              @input="emit('update:gradient', setGradientStop(gradient, 1, ($event.target as HTMLInputElement).value))"
            />
            <span>結束</span>
          </div>
        </div>
        <div class="slider-control">
          <input
            type="range"
            min="0"
            max="360"
            step="15"
            aria-label="漸層角度"
            :value="getGradientAngle(gradient)"
            @input="emit('update:gradient', setGradientAngle(gradient, Number(($event.target as HTMLInputElement).value)))"
          />
          <span class="slider-value">{{ getGradientAngle(gradient) }}°</span>
        </div>
      </template>
    </div>
  </div>
</template>

<style lang="scss" scoped>
@use "../../../styles/theme-settings-shared";

// 加上 .color-item 提高權重：父層共用的 .color-item（align-items: center）也會套到本元件根元素
.color-item.gradient-field {
  flex-direction: column;
  align-items: stretch;
  gap: 0;
  cursor: pointer;

  // 展開後跨整列，避免被擠在網格單格內
  &.expanded {
    grid-column: 1 / -1;
  }
}

.field-head {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

// 色盤外框：啟用漸層時顯示漸層，色盤本身透明
.swatch {
  position: relative;
  flex: 0 0 28px;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  overflow: hidden;
  background-size: cover;
  background-position: center;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.12);

  input[type="color"] {
    width: 100%;
    height: 100%;
    box-shadow: none;
  }

  &.has-gradient input[type="color"] {
    opacity: 0;
  }
}

// 窄螢幕允許換行，避免「想法氣泡背景」等長標籤被截斷
.color-item .field-label {
  flex: 1;
  white-space: normal;
  line-height: 1.3;
}

.chevron {
  flex: 0 0 auto;
  font-size: 11px;
  line-height: 1;
  opacity: 0.7;

  .expanded & {
    color: var(--color-primary);
    opacity: 1;
  }
}

.gradient-detail {
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px dashed var(--color-border);
  cursor: default;
}

.gradient-switch {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;

  input[type="checkbox"] {
    width: 14px;
    height: 14px;
    accent-color: var(--color-primary);
    cursor: pointer;
  }
}

.gradient-stops {
  display: flex;
  gap: 10px;
  margin: 8px 0 4px;

  .color-item.mini {
    flex: 1;
    padding: 6px 8px;
    background: var(--color-surface);

    input[type="color"] {
      width: 26px;
      height: 26px;
    }
  }
}
</style>
