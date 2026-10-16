<script setup lang="ts">
/**
 * 生成參數：名稱 + 數值 + （可選）送不送出的開關 + 滑桿。
 * 有開關的參數關閉時不顯示滑桿，只寫「不送出」。
 */
import { computed } from "vue";
import SettingsSwitch from "./SettingsSwitch.vue";

const props = withDefaults(
  defineProps<{
    label: string;
    modelValue: number;
    min: number;
    max: number;
    step: number;
    /** 不給就是沒有開關的參數（一定會送出） */
    enabled?: boolean;
    /** 數值顯示方式 */
    format?: (value: number) => string;
    /** 滑桿下方的刻度文字 */
    scale?: string[];
    hint?: string;
  }>(),
  // 布林 prop 沒給時 Vue 會轉成 false，要明寫 undefined 才分得出「沒有開關」
  { enabled: undefined },
);

const emit = defineEmits<{
  (e: "update:modelValue", value: number): void;
  (e: "update:enabled", value: boolean): void;
  (e: "change"): void;
}>();

const hasToggle = computed(() => props.enabled !== undefined);
const showSlider = computed(() => !hasToggle.value || props.enabled);
const display = computed(() =>
  props.format ? props.format(props.modelValue) : String(props.modelValue),
);

const fill = computed(() => {
  const span = props.max - props.min;
  const ratio = span > 0 ? (props.modelValue - props.min) / span : 0;
  return `${Math.min(100, Math.max(0, ratio * 100))}%`;
});

function onInput(event: Event) {
  emit("update:modelValue", Number((event.target as HTMLInputElement).value));
}
</script>

<template>
  <div class="st-param" :style="showSlider ? undefined : { paddingTop: '11px', paddingBottom: '11px' }">
    <div class="st-param__head">
      <span class="st-param__name">{{ label }}</span>
      <span v-if="showSlider" class="st-badge">{{ display }}</span>
      <span v-else class="st-row__desc">不送出</span>
      <SettingsSwitch
        v-if="hasToggle"
        :model-value="!!enabled"
        :label="`送出${label}`"
        @update:model-value="emit('update:enabled', $event)"
        @change="emit('change')"
      />
    </div>
    <template v-if="showSlider">
      <input
        class="st-range"
        type="range"
        :min="min"
        :max="max"
        :step="step"
        :value="modelValue"
        :aria-label="label"
        :style="{ '--st-fill': fill }"
        @input="onInput"
        @change="emit('change')"
      />
      <div v-if="scale?.length" class="st-param__scale">
        <span v-for="mark in scale" :key="mark">{{ mark }}</span>
      </div>
      <p v-if="hint" class="st-hint">{{ hint }}</p>
    </template>
  </div>
</template>
