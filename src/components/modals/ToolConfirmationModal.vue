<template>
  <div v-if="pending" class="tool-confirmation-backdrop" role="dialog" aria-modal="true">
    <section class="tool-confirmation-modal">
      <h2>確認工具操作</h2>
      <p class="tool-confirmation-name">{{ pending.tool.description }}</p>
      <pre>{{ maskedArgs }}</pre>
      <div class="tool-confirmation-actions">
        <button type="button" @click="$emit('reject', pending.id)">拒絕</button>
        <button type="button" class="primary" @click="$emit('approve', pending.id)">批准執行</button>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { PendingToolConfirmation } from "@/services/toolCalling/types";

const props = defineProps<{ pending?: PendingToolConfirmation | null }>();
defineEmits<{ (event: "approve", id: string): void; (event: "reject", id: string): void }>();

const maskedArgs = computed(() => JSON.stringify(props.pending?.toolCall.arguments ?? {}, (key, value) => {
  if (/token|key|secret|password/i.test(key)) return "[masked]";
  return value;
}, 2));
</script>

<style scoped>
.tool-confirmation-backdrop { position: fixed; inset: 0; z-index: 3000; display: grid; place-items: center; background: rgba(0,0,0,.45); }
.tool-confirmation-modal { width: min(92vw, 30rem); max-width: 30rem; padding: 1.25rem; background: var(--surface-card, #fff); color: var(--text-color, #222); border-radius: 8px; box-shadow: 0 12px 40px rgba(0,0,0,.25); }
.tool-confirmation-name { white-space: pre-wrap; }
.tool-confirmation-modal pre { max-height: 14rem; overflow: auto; padding: .75rem; background: rgba(127,127,127,.12); border-radius: 4px; }
.tool-confirmation-actions { display: flex; justify-content: flex-end; gap: .5rem; margin-top: 1rem; }
.tool-confirmation-actions button { padding: .55rem .8rem; border: 1px solid rgba(127,127,127,.35); border-radius: 6px; background: transparent; cursor: pointer; }
.tool-confirmation-actions .primary { background: var(--primary-color, #2563eb); color: white; border-color: transparent; }
</style>
