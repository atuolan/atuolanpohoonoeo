<template>
  <section class="character-tool-permissions">
    <div class="panel-heading"><h3>角色工具權限</h3><label><input v-model="model.enabled" type="checkbox" /> 啟用工具</label></div>
    <label v-for="tool in tools" :key="tool.name" class="tool-row">
      <input :checked="isEnabled(tool.name)" type="checkbox" @change="toggle(tool.name, $event)" />
      <span>{{ tool.displayName ?? tool.name }}</span><small :data-risk="tool.risk">{{ tool.risk === 'high' ? '需確認' : '低風險' }}</small>
    </label>
    <template v-if="mcpServers?.length">
      <h4 class="group-heading">MCP 伺服器</h4>
      <label v-for="server in mcpServers" :key="server.id" class="tool-row">
        <input :checked="isServerEnabled(server.id)" type="checkbox" @change="toggleServer(server.id, $event)" />
        <span>{{ server.name }}</span>
      </label>
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { CharacterToolPermissions } from "@/types/character";
import type { ChatToolDefinition } from "@/services/toolCalling/types";
import { mcpCategory } from "@/services/mcp/mcpToolSource";

const props = defineProps<{ modelValue: CharacterToolPermissions; tools: ChatToolDefinition[]; mcpServers?: Array<{ id: string; name: string }> }>();
const emit = defineEmits<{ (event: "update:modelValue", value: CharacterToolPermissions): void }>();
const model = computed({ get: () => props.modelValue, set: (value) => emit("update:modelValue", value) });
const isEnabled = (name: string) => props.modelValue.tools[name] !== false;
const isServerEnabled = (id: string) => props.modelValue.categories[mcpCategory(id)] !== false;
function toggle(name: string, event: Event) {
  const enabled = (event.target as HTMLInputElement).checked;
  emit("update:modelValue", { ...props.modelValue, tools: { ...props.modelValue.tools, [name]: enabled } });
}
function toggleServer(id: string, event: Event) {
  const enabled = (event.target as HTMLInputElement).checked;
  emit("update:modelValue", { ...props.modelValue, categories: { ...props.modelValue.categories, [mcpCategory(id)]: enabled } });
}
</script>

<style scoped>
.character-tool-permissions { display: grid; gap: .5rem; padding: 1rem 0; }
.panel-heading, .tool-row { display: flex; align-items: center; gap: .6rem; }
.panel-heading { justify-content: space-between; }
.tool-row small { margin-left: auto; opacity: .7; }
.tool-row small[data-risk="high"] { color: #b45309; }
.group-heading { margin: .5rem 0 0; font-size: .9rem; opacity: .8; }
</style>
