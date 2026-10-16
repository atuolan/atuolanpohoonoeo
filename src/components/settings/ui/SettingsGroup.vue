<script setup lang="ts">
/** 設定頁的一組：小標題 + 白色卡片 + 底下說明 */
defineProps<{
  title?: string;
  footer?: string;
}>();
</script>

<template>
  <section class="st-group">
    <h2 v-if="title || $slots.title" class="st-group__title">
      <slot name="title">{{ title }}</slot>
    </h2>
    <div class="st-card">
      <slot />
    </div>
    <p v-if="footer || $slots.footer" class="st-group__footer">
      <slot name="footer">{{ footer }}</slot>
    </p>
  </section>
</template>
