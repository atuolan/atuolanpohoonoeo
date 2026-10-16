<script setup lang="ts">
/** 一整列都能點的開關列 */
import SettingsSwitch from "./SettingsSwitch.vue";

const props = defineProps<{
  modelValue: boolean;
  label: string;
  description?: string;
  disabled?: boolean;
  indent?: boolean;
}>();

const emit = defineEmits<{
  (e: "update:modelValue", value: boolean): void;
  (e: "change", value: boolean): void;
}>();

function toggle() {
  if (props.disabled) return;
  const next = !props.modelValue;
  emit("update:modelValue", next);
  emit("change", next);
}
</script>

<template>
  <div
    class="st-row"
    :class="{ 'st-row--indent': indent }"
    :style="disabled ? undefined : { cursor: 'pointer' }"
    @click="toggle"
  >
    <span class="st-row__main">
      <span class="st-row__label">{{ label }}</span>
      <span v-if="description || $slots.description" class="st-row__desc">
        <slot name="description">{{ description }}</slot>
      </span>
    </span>
    <slot name="extra" />
    <SettingsSwitch
      :model-value="modelValue"
      :disabled="disabled"
      :label="label"
      @update:model-value="emit('update:modelValue', $event)"
      @change="emit('change', $event)"
    />
  </div>
</template>
