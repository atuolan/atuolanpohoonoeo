<script setup lang="ts" generic="T extends string | number">
/**
 * 下拉列：看起來是一般設定列（標題 + 目前值 + 上下箭頭），
 * 實際上整列蓋著一個透明的原生 select，點下去跳系統選單。
 */
import { ChevronsUpDown } from "lucide-vue-next";
import { computed } from "vue";

interface Option {
  value: T;
  label: string;
  disabled?: boolean;
}

const props = defineProps<{
  modelValue: T | null | undefined;
  label: string;
  description?: string;
  options?: readonly Option[];
  groups?: ReadonlyArray<{ label: string; options: readonly Option[] }>;
  disabled?: boolean;
  indent?: boolean;
  /** 列上顯示的值，預設用選中項目的 label */
  display?: string;
}>();

const emit = defineEmits<{
  (e: "update:modelValue", value: T): void;
  (e: "change", value: T): void;
}>();

const allOptions = computed<Option[]>(() => [
  ...(props.options ?? []),
  ...(props.groups ?? []).flatMap((g) => g.options),
]);

const selectedLabel = computed(() => {
  if (props.display !== undefined) return props.display;
  const hit = allOptions.value.find((o) => String(o.value) === String(props.modelValue));
  return hit?.label ?? (props.modelValue == null ? "" : String(props.modelValue));
});

function onChange(event: Event) {
  const raw = (event.target as HTMLSelectElement).value;
  const hit = allOptions.value.find((o) => String(o.value) === raw);
  if (!hit) return;
  emit("update:modelValue", hit.value);
  emit("change", hit.value);
}
</script>

<template>
  <div
    class="st-row st-select-row"
    :class="{ 'st-row--indent': indent }"
    :style="disabled ? { opacity: 0.5 } : undefined"
  >
    <span class="st-row__main">
      <span class="st-row__label">{{ label }}</span>
      <span v-if="description || $slots.description" class="st-row__desc">
        <slot name="description">{{ description }}</slot>
      </span>
    </span>
    <span class="st-row__value">{{ selectedLabel }}</span>
    <ChevronsUpDown class="st-row__chevron" aria-hidden="true" />
    <select
      class="st-select-row__native"
      :value="modelValue == null ? '' : String(modelValue)"
      :aria-label="label"
      :disabled="disabled"
      @change="onChange"
    >
      <option
        v-for="option in options ?? []"
        :key="String(option.value)"
        :value="String(option.value)"
        :disabled="option.disabled"
      >
        {{ option.label }}
      </option>
      <optgroup v-for="group in groups ?? []" :key="group.label" :label="group.label">
        <option
          v-for="option in group.options"
          :key="String(option.value)"
          :value="String(option.value)"
          :disabled="option.disabled"
        >
          {{ option.label }}
        </option>
      </optgroup>
    </select>
  </div>
</template>
