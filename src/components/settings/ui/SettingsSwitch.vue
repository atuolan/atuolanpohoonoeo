<script setup lang="ts">
/** 開關（button role="switch"），放在 label 裡時點整列都會切換 */
const props = defineProps<{
  modelValue: boolean;
  disabled?: boolean;
  label?: string;
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
  <button
    type="button"
    role="switch"
    class="st-switch"
    :aria-checked="modelValue ? 'true' : 'false'"
    :aria-label="label"
    :disabled="disabled"
    @click.stop="toggle"
  >
    <span class="st-switch__knob" />
  </button>
</template>
