<script setup lang="ts">
import { computed } from "vue";
import { formatGap } from "@/utils/elapsedTime";

const props = defineProps<{
  open: boolean;
  /** 劇情時間減現實時間（負的＝劇情比較慢） */
  gapMs: number;
  /** 目前劇情時間（毫秒） */
  storyNow: number;
  /** 對齊現實的目標時間（毫秒） */
  realignTarget: number;
}>();

const emit = defineEmits<{
  (e: "keep"): void;
  (e: "realign"): void;
}>();

const behind = computed(() => props.gapMs < 0);

const gapText = computed(() =>
  behind.value
    ? `劇情比現實慢 ${formatGap(-props.gapMs)}`
    : `劇情比現實快 ${formatGap(props.gapMs)}`,
);

/** 跟今天同一天只寫 HH:mm，不同天加上 M/D */
function formatPoint(ms: number): string {
  const d = new Date(ms);
  const hm = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  return d.toDateString() === new Date().toDateString()
    ? hm
    : `${d.getMonth() + 1}/${d.getDate()} ${hm}`;
}

const keepLabel = computed(() => `接續劇情時間 ${formatPoint(props.storyNow)}`);
const realignLabel = computed(() =>
  behind.value
    ? `回到現實時間 ${formatPoint(props.realignTarget)}`
    : `對齊現實的時刻 ${formatPoint(props.realignTarget)}`,
);
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="story-return-overlay" @click.self="emit('keep')">
      <div
        class="story-return-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="story-return-title"
      >
        <h3 id="story-return-title" class="story-return-title">回到線上</h3>
        <p class="story-return-gap">{{ gapText }}</p>
        <div class="story-return-actions">
          <button type="button" class="story-return-btn primary" @click="emit('keep')">
            {{ keepLabel }}
          </button>
          <button type="button" class="story-return-btn" @click="emit('realign')">
            {{ realignLabel }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.story-return-overlay {
  position: fixed;
  inset: 0;
  z-index: 3000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background: rgba(0, 0, 0, 0.4);
}

.story-return-dialog {
  width: 100%;
  max-width: 320px;
  padding: 20px 16px 16px;
  border-radius: 14px;
  background: var(--color-surface, #fff);
  color: var(--color-text, #222);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18);
}

.story-return-title {
  margin: 0 0 6px;
  font-size: 16px;
  font-weight: 600;
}

.story-return-gap {
  margin: 0 0 16px;
  font-size: 13px;
  color: var(--color-text-secondary, #666);
}

.story-return-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.story-return-btn {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--color-border, #ddd);
  border-radius: 10px;
  background: transparent;
  color: var(--color-text, #222);
  font-size: 14px;
  cursor: pointer;
}

.story-return-btn.primary {
  border-color: var(--color-primary);
  background: var(--color-primary);
  color: #fff;
}
</style>
