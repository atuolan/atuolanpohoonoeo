<script setup lang="ts">
/**
 * 設定頁的對話框。不 teleport：絕對定位在設定畫面裡，
 * 桌面版手機框內也不會跑出去；data-no-swipe-back 擋住右滑返回。
 */
withDefaults(
  defineProps<{
    open: boolean;
    title: string;
    text?: string;
    /** 點背景能不能關 */
    dismissible?: boolean;
  }>(),
  { dismissible: true },
);

const emit = defineEmits<{ (e: "close"): void }>();
</script>

<template>
  <div
    v-if="open"
    class="st-overlay"
    data-no-swipe-back
    @click.self="dismissible && emit('close')"
  >
    <div class="st-dialog" role="dialog" aria-modal="true" :aria-label="title">
      <h3 class="st-dialog__title">{{ title }}</h3>
      <p v-if="text" class="st-dialog__text">{{ text }}</p>
      <slot />
      <div v-if="$slots.actions" class="st-dialog__actions">
        <slot name="actions" />
      </div>
    </div>
  </div>
</template>
