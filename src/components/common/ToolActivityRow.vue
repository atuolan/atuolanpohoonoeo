<template>
  <div class="tool-activity-row" :class="{ live }" role="status">
    <button
      v-for="entry in entries"
      :key="entry.id"
      type="button"
      class="tool-activity-pill"
      :data-status="entry.status"
      :aria-expanded="openId === entry.id"
      @click="toggle(entry.id)"
    >
      {{ pillText(entry) }}
    </button>
    <div v-if="openEntry" class="tool-activity-detail">
      <div class="tool-activity-detail-title">{{ openEntry.label }} · {{ STATUS_TEXT[openEntry.status] }}</div>
      <p v-if="openEntry.summary" class="tool-activity-detail-text">{{ openEntry.summary }}</p>
      <p v-if="openEntry.imageCount" class="tool-activity-detail-note">回傳了 {{ openEntry.imageCount }} 張圖片（圖片不會存進聊天紀錄）</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import type { LiveToolActivity, LiveToolActivityStatus } from "@/types/toolActivity";

const props = defineProps<{ entries: LiveToolActivity[]; actorName?: string; live?: boolean }>();

const STATUS_TEXT: Record<LiveToolActivityStatus, string> = {
  running: "執行中",
  awaiting_confirmation: "等你確認",
  success: "成功",
  error: "失敗",
  rejected: "已拒絕",
  cancelled: "已取消",
};

const openId = ref<string | null>(null);
const openEntry = computed(() => props.entries.find((entry) => entry.id === openId.value) ?? null);

function toggle(id: string): void {
  openId.value = openId.value === id ? null : id;
}

function pillText(entry: LiveToolActivity): string {
  const name = `「${entry.label}」`;
  switch (entry.status) {
    case "running": return `${props.actorName || "角色"}正在使用${name}…`;
    case "awaiting_confirmation": return `等你確認${name}`;
    case "success": return `使用了${name} ✓`;
    case "error": return `${name}失敗`;
    case "rejected": return `已拒絕${name}`;
    case "cancelled": return `${name}已取消`;
  }
}
</script>

<style scoped>
.tool-activity-row { display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 4px 0; margin: 2px 0; }
.tool-activity-pill { max-width: 90%; padding: 4px 14px; font-size: 12px; line-height: 1.4; color: var(--color-text-muted, #999); background: rgba(128, 128, 128, 0.1); border: none; border-radius: 12px; cursor: pointer; overflow-wrap: anywhere; }
.tool-activity-pill[data-status="running"], .tool-activity-pill[data-status="awaiting_confirmation"] { color: var(--color-primary, #4caf50); }
.tool-activity-pill[data-status="error"] { color: var(--color-error, #d9534f); }
.tool-activity-detail { max-width: min(90%, 320px); padding: 8px 12px; font-size: 12px; color: var(--color-text-secondary, #666); background: var(--color-surface, #fff); border: 1px solid var(--color-border, #e2e8f0); border-radius: 12px; }
.tool-activity-detail-title { font-weight: 600; margin-bottom: 4px; overflow-wrap: anywhere; }
.tool-activity-detail-text { margin: 0; max-height: 160px; overflow-y: auto; white-space: pre-wrap; overflow-wrap: anywhere; }
.tool-activity-detail-note { margin: 4px 0 0; color: var(--color-text-muted, #999); }
.live .tool-activity-pill[data-status="running"] { animation: tool-activity-pulse 1.4s ease-in-out infinite; }
@keyframes tool-activity-pulse { 50% { opacity: 0.55; } }
@media (prefers-reduced-motion: reduce) { .live .tool-activity-pill[data-status="running"] { animation: none; } }
</style>
