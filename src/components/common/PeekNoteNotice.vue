<template>
  <div class="peek-note" :class="`is-${note.kind}`">
    <button
      type="button"
      class="peek-note-pill"
      :aria-expanded="count ? open : undefined"
      :disabled="!count"
      @click="open = !open"
    >
      <svg class="peek-note-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
        <circle cx="12" cy="12" r="3" />
      </svg>
      <span>{{ headline }}</span>
      <span v-if="count" class="peek-note-action">
        看到 {{ count }} 個
        <svg class="peek-note-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </span>
    </button>
    <div v-if="open && count" class="peek-note-detail">
      <div class="peek-note-detail-title">你看到了</div>
      <ul class="peek-note-list">
        <li v-for="(item, i) in note.found" :key="i">
          <div class="peek-note-label">{{ item.label }}</div>
          <div v-if="item.detail" class="peek-note-text">{{ item.detail }}</div>
        </li>
      </ul>
      <div v-if="note.more" class="peek-note-more">還有 {{ note.more }} 個沒列出來</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import type { PeekNoteView } from "@/utils/peekLinks";

// 聊天裡偷看手機被發現／他起疑的那筆：一行小字，點了原地展開看到了什麼
const props = defineProps<{ note: PeekNoteView }>();

const open = ref(false);
const count = computed(() => props.note.found.length + props.note.more);

const headline = computed(() => {
  const name = props.note.charName;
  switch (props.note.kind) {
    case "caught": return `偷看手機被${name}發現了`;
    case "interrupted": return `偷看到一半被${name}撞見了`;
    case "suspicious": return `${name}覺得手機好像被動過`;
  }
});
</script>

<style scoped>
.peek-note { display: flex; flex-direction: column; align-items: center; gap: 6px; width: 100%; }
.peek-note-pill { display: inline-flex; align-items: center; gap: 5px; max-width: 90%; padding: 4px 14px; font: inherit; font-size: 12px; line-height: 1.4; color: var(--color-text-muted, #999); background: rgba(128, 128, 128, 0.1); border: none; border-radius: 12px; cursor: pointer; overflow-wrap: anywhere; text-align: left; }
.peek-note-pill:disabled { cursor: default; }
.peek-note-icon { flex-shrink: 0; width: 13px; height: 13px; }
.is-caught .peek-note-icon, .is-interrupted .peek-note-icon { color: var(--color-error, #d9534f); opacity: 0.8; }
.peek-note-action { display: inline-flex; align-items: center; gap: 1px; flex-shrink: 0; margin-left: 2px; color: var(--color-primary, #7dd3a8); white-space: nowrap; }
.peek-note-chevron { width: 12px; height: 12px; transition: transform 0.2s; }
[aria-expanded="true"] .peek-note-chevron { transform: rotate(180deg); }
.peek-note-detail { box-sizing: border-box; width: min(90%, 320px); padding: 10px 14px 12px; font-size: 12px; line-height: 1.55; color: var(--color-text-secondary, #666); background: var(--color-surface, #fff); border: 1px solid var(--color-border, #e2e8f0); border-radius: 12px; text-align: left; }
.peek-note-detail-title { margin-bottom: 6px; font-size: 11px; letter-spacing: 0.1em; color: var(--color-text-muted, #999); }
.peek-note-list { display: flex; flex-direction: column; gap: 8px; margin: 0; padding: 0; list-style: none; }
.peek-note-list li { padding-left: 9px; border-left: 2px solid rgba(128, 128, 128, 0.25); }
.peek-note-label { font-weight: 600; overflow-wrap: anywhere; }
.peek-note-text { color: var(--color-text-muted, #999); white-space: pre-wrap; overflow-wrap: anywhere; }
.peek-note-more { margin-top: 8px; color: var(--color-text-muted, #999); }
@media (prefers-reduced-motion: reduce) { .peek-note-chevron { transition: none; } }
</style>
