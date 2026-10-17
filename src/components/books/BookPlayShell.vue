<script setup lang="ts">
/**
 * 好玩模式的外框：蓋滿閱讀器，顏色跟著閱讀背景（--rd-*）
 */
import { ArrowLeft } from "lucide-vue-next";

defineProps<{
  title: string;
  subtitle?: string;
}>();

const emit = defineEmits<{ close: [] }>();
</script>

<template>
  <section class="play-shell" role="dialog" :aria-label="title">
    <header class="play-head">
      <button class="play-icon-btn" aria-label="回到書裡" @click="emit('close')">
        <ArrowLeft :size="22" />
      </button>
      <div class="play-titles">
        <h2>{{ title }}</h2>
        <span v-if="subtitle">{{ subtitle }}</span>
      </div>
      <slot name="actions" />
    </header>
    <div class="play-body">
      <slot />
    </div>
  </section>
</template>

<style scoped lang="scss">
.play-shell {
  --pl-text: var(--rd-text, var(--color-text, #2d3748));
  --pl-sub: var(--rd-sub, var(--color-text-secondary, #6b7280));
  --pl-raise: var(--rd-raise, rgba(0, 0, 0, 0.05));
  --pl-line: var(--rd-line, rgba(0, 0, 0, 0.12));
  --pl-accent: var(--rd-accent, var(--color-primary, #7dd3a8));
  --pl-on-accent: var(--rd-on-accent, #0b1f16);

  position: absolute;
  inset: 0;
  z-index: 25;
  display: flex;
  flex-direction: column;
  background: var(--rd-bg, var(--color-background, #fff));
  color: var(--pl-text);
}

.play-head {
  display: flex;
  align-items: center;
  gap: 4px;
  width: 100%;
  max-width: 760px;
  margin: 0 auto;
  box-sizing: border-box;
  padding: 6px 8px 6px 6px;
  padding-top: max(6px, var(--safe-top, 0px));
  flex-shrink: 0;
}

.play-icon-btn {
  width: 44px;
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 22px;
  background: transparent;
  color: inherit;
  cursor: pointer;
  flex-shrink: 0;

  &:hover {
    background: var(--pl-raise);
  }
}

.play-titles {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;

  h2 {
    margin: 0;
    font-size: 17px;
    font-weight: 700;
  }

  span {
    font-size: 12px;
    color: var(--pl-sub);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
}

.play-body {
  flex: 1;
  min-height: 0;
  width: 100%;
  max-width: 760px;
  margin: 0 auto;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  padding-bottom: max(16px, var(--safe-bottom, 0px));
}
</style>
