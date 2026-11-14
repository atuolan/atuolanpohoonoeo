<script setup lang="ts">
/**
 * AI 訊息下方的數值變化膠囊：「♡ 好感度 +3 · 被誇獎」
 * 點了打開數值面板。也用來顯示「角色好像忘了回報數值」的提示。
 */
import type { AffinityChip } from "@/composables/useChatAffinity";

defineProps<{
  chip?: AffinityChip | null;
  /** 旁觀者正在判斷這一則 */
  judging?: boolean;
  /** 顯示「角色好像忘了回報」提示 */
  showJudgeHint?: boolean;
}>();

const emit = defineEmits<{
  (e: "open"): void;
  (e: "use-judge"): void;
  (e: "dismiss-hint"): void;
}>();
</script>

<template>
  <div class="affinity-chip-row">
    <button
      v-if="chip"
      type="button"
      class="affinity-chip"
      :title="chip.title"
      @click="emit('open')"
    >
      <span class="affinity-chip-heart" aria-hidden="true">♡</span>
      <template v-for="(item, idx) in chip.items" :key="idx">
        <span v-if="idx > 0" class="affinity-chip-sep">·</span>
        <span class="affinity-chip-item" :class="`is-${item.kind}`">{{ item.text }}</span>
      </template>
      <span v-if="chip.more > 0" class="affinity-chip-more">+{{ chip.more }}</span>
      <template v-if="chip.reason">
        <span class="affinity-chip-sep">·</span>
        <span class="affinity-chip-reason">{{ chip.reason }}</span>
      </template>
    </button>

    <span v-else-if="judging" class="affinity-chip is-pending">♡ 旁觀者判斷中…</span>

    <div v-if="showJudgeHint" class="affinity-judge-hint">
      <span>角色好像忘了回報數值。要改成由旁觀者判斷嗎？（每次回覆會多花一次呼叫）</span>
      <span class="affinity-judge-hint-actions">
        <button type="button" class="is-primary" @click="emit('use-judge')">改用</button>
        <button type="button" @click="emit('dismiss-hint')">先不用</button>
      </span>
    </div>
  </div>
</template>

<style scoped lang="scss">
.affinity-chip-row {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 2px 16px 4px;
}

.affinity-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  max-width: 100%;
  padding: 2px 10px;
  border: none;
  border-radius: 999px;
  background: var(--affinity-chip-bg, rgba(255, 107, 157, 0.1));
  color: var(--color-text-secondary, #6b7280);
  font-size: 11px;
  line-height: 18px;
  white-space: nowrap;
  overflow: hidden;
  cursor: pointer;

  &.is-pending {
    cursor: default;
    opacity: 0.7;
  }
}

.affinity-chip-heart {
  color: #ff6b9d;
}

.affinity-chip-item {
  &.is-up {
    color: #e0457b;
    font-weight: 600;
  }

  // 減少用灰藍，不用紅色（紅色看起來像出錯）
  &.is-down {
    color: #6b86a8;
    font-weight: 600;
  }
}

.affinity-chip-sep,
.affinity-chip-more,
.affinity-chip-reason {
  opacity: 0.75;
}

.affinity-chip-reason {
  overflow: hidden;
  text-overflow: ellipsis;
}

.affinity-judge-hint {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 6px;
  max-width: 320px;
  padding: 6px 10px;
  border-radius: 10px;
  background: var(--color-surface-hover, rgba(0, 0, 0, 0.04));
  color: var(--color-text-secondary, #6b7280);
  font-size: 11px;
  line-height: 1.5;
  text-align: center;
}

.affinity-judge-hint-actions {
  display: inline-flex;
  gap: 6px;

  button {
    padding: 2px 10px;
    border: 1px solid var(--color-border, #e5e7eb);
    border-radius: 999px;
    background: transparent;
    color: inherit;
    font-size: 11px;
    cursor: pointer;

    &.is-primary {
      border-color: #ff6b9d;
      color: #e0457b;
    }
  }
}
</style>
