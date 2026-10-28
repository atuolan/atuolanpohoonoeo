<script setup lang="ts">
/**
 * 聊天裝扮試穿膠囊：浮在頂欄下方，不佔版面
 *
 * 外層是零高度的錨點，放在頂欄後面；膠囊本身絕對定位，不會推動訊息。
 */
defineProps<{
  pieceName: string;
  price: number;
}>();

const emit = defineEmits<{
  (e: "buy"): void;
  (e: "end"): void;
}>();
</script>

<template>
  <div class="skin-tryon-anchor">
    <div class="skin-tryon-pill" role="status">
      <span class="skin-tryon-label">試穿中：{{ pieceName }}</span>
      <button class="skin-tryon-btn buy" @click.stop="emit('buy')">購買 {{ price.toLocaleString() }}</button>
      <button class="skin-tryon-btn" @click.stop="emit('end')">結束</button>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.skin-tryon-anchor {
  position: relative;
  height: 0;
  z-index: 30;
  flex-shrink: 0;
}

.skin-tryon-pill {
  position: absolute;
  top: 8px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 6px;
  max-width: calc(100% - 32px);
  padding: 4px 4px 4px 12px;
  border-radius: 999px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.12);
  white-space: nowrap;
}

.skin-tryon-label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 12px;
  color: var(--color-text);
}

.skin-tryon-btn {
  flex-shrink: 0;
  padding: 4px 10px;
  border: none;
  border-radius: 999px;
  font-size: 12px;
  background: var(--color-surface-hover, var(--color-border));
  color: var(--color-text);
  cursor: pointer;

  &.buy {
    background: var(--color-primary);
    color: var(--color-on-primary-contrast, #fff);
  }
}
</style>
