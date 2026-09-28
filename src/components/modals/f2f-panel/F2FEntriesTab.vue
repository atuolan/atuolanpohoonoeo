<!-- src/components/modals/f2f-panel/F2FEntriesTab.vue -->
<script setup lang="ts">
/**
 * 面對面設定面板 第三頁：列出所有條目，可直接開關，並標示所屬模塊
 */
import { computed, ref } from "vue";
import { useF2FPanel } from "@/composables/useF2FPanel";

const { entries, layout, toggleEntry } = useF2FPanel();

const query = ref("");
const onlyUngrouped = ref(false);

const moduleTitles = computed(() => new Map(layout.value.modules.map((m) => [m.id, m.title])));

const visibleEntries = computed(() => {
  const keyword = query.value.trim();
  return entries.value.filter((entry) => {
    if (onlyUngrouped.value && (entry.ownerModuleId || entry.structural)) return false;
    return !keyword || entry.name.includes(keyword);
  });
});

function onToggle(identifier: string, event: Event) {
  toggleEntry(identifier, (event.target as HTMLInputElement).checked);
}
</script>

<template>
  <div class="f2f-tab">
    <div class="f2f-toolbar">
      <input v-model="query" class="f2f-input" type="search" placeholder="搜尋條目" />
      <label class="f2f-check">
        <input v-model="onlyUngrouped" type="checkbox" />
        只看未歸類
      </label>
    </div>
    <ul class="f2f-entry-list">
      <li
        v-for="entry in visibleEntries"
        :key="entry.identifier"
        :class="['f2f-entry', { structural: entry.structural }]"
      >
        <div class="f2f-entry-main">
          <span class="f2f-entry-name">{{ entry.name }}</span>
          <span v-if="entry.ownerModuleId" class="f2f-badge">{{ moduleTitles.get(entry.ownerModuleId) }}</span>
          <span v-else-if="!entry.structural" class="f2f-badge muted">未歸類</span>
        </div>
        <label class="f2f-switch">
          <input
            type="checkbox"
            :aria-label="entry.name"
            :checked="entry.enabled"
            @change="onToggle(entry.identifier, $event)"
          />
          <span class="f2f-switch-slider"></span>
        </label>
      </li>
    </ul>
    <p v-if="visibleEntries.length === 0" class="f2f-empty">沒有符合的條目</p>
  </div>
</template>
