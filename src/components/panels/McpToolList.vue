<template>
  <ul class="mcp-tool-list">
    <li v-for="tool in tools" :key="tool.name" class="mcp-tool">
      <div class="mcp-tool-text">
        <span class="mcp-tool-name">{{ tool.title || tool.name }}</span>
        <small v-if="tool.title" class="mcp-tool-id">{{ tool.name }}</small>
        <small v-if="tool.description" class="mcp-tool-desc">{{ tool.description }}</small>
      </div>
      <div class="mcp-tool-controls">
        <label class="mcp-confirm">
          <input v-model="tool.requireConfirm" type="checkbox" :disabled="!tool.enabled" @change="emit('change')" />
          執行前確認
        </label>
        <label class="mcp-switch">
          <input v-model="tool.enabled" type="checkbox" :aria-label="`啟用 ${tool.title || tool.name}`" @change="emit('change')" />
          <span class="mcp-switch-track" aria-hidden="true"></span>
        </label>
      </div>
    </li>
  </ul>
</template>

<script setup lang="ts">
import type { McpToolEntry } from "@/types/mcp";

defineProps<{ tools: McpToolEntry[] }>();
const emit = defineEmits<{ (event: "change"): void }>();
</script>
