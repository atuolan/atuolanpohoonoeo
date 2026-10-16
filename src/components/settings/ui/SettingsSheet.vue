<script setup lang="ts">
/** 從下方升起的面板（切換配置、配置操作、挑音色） */
defineProps<{
  open: boolean;
  title: string;
  /** 右上角按鈕文字，不給就不顯示 */
  doneLabel?: string;
}>();

const emit = defineEmits<{ (e: "close"): void }>();
</script>

<template>
  <div
    v-if="open"
    class="st-overlay st-overlay--sheet"
    data-no-swipe-back
    @click.self="emit('close')"
  >
    <section class="st-sheet" role="dialog" aria-modal="true" :aria-label="title">
      <span class="st-sheet__grip" aria-hidden="true" />
      <div class="st-sheet__head">
        <h2 class="st-sheet__title">{{ title }}</h2>
        <button v-if="doneLabel" type="button" class="st-sheet__done" @click="emit('close')">
          {{ doneLabel }}
        </button>
      </div>
      <slot />
    </section>
  </div>
</template>
