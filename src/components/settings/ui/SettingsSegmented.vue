<script setup lang="ts">
/** 分段切換（一排按鈕選一個） */
defineProps<{
  modelValue: string;
  options: Array<{ value: string; label: string }>;
  label: string;
}>();

defineEmits<{ (e: "update:modelValue", value: string): void }>();
</script>

<template>
  <div class="st-seg" role="group" :aria-label="label">
    <button
      v-for="option in options"
      :key="option.value"
      type="button"
      class="st-seg__btn"
      :aria-pressed="modelValue === option.value ? 'true' : 'false'"
      @click="$emit('update:modelValue', option.value)"
    >
      {{ option.label }}
    </button>
  </div>
</template>
