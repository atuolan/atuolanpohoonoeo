<template>
  <section class="character-tool-permissions">
    <div class="master-card">
      <div class="master-text">
        <span class="master-title">讓角色使用工具</span>
        <span class="master-subtitle">已開啟 {{ enabledCount }} / {{ tools.length }} 項</span>
      </div>
      <button
        type="button"
        role="switch"
        class="master-switch"
        :class="{ on: modelValue.enabled }"
        :aria-checked="modelValue.enabled"
        aria-label="讓角色使用工具"
        @click="toggleMaster"
      >
        <span class="master-knob" />
      </button>
    </div>

    <div v-if="lowRiskTools.length" class="group" :class="{ dim: !modelValue.enabled }">
      <div class="group-heading">
        <span class="badge badge-success">低風險</span>
        <span class="group-desc">角色可以直接使用</span>
      </div>
      <div class="list-card">
        <label v-for="tool in lowRiskTools" :key="tool.name" class="tool-row">
          <span class="tool-name">{{ tool.displayName ?? tool.name }}</span>
          <input
            type="checkbox"
            class="tool-checkbox"
            :checked="isEnabled(tool.name)"
            :disabled="!modelValue.enabled"
            @change="toggle(tool.name, $event)"
          />
        </label>
      </div>
    </div>

    <div v-if="confirmTools.length" class="group" :class="{ dim: !modelValue.enabled }">
      <div class="group-heading">
        <span class="badge badge-warning">需確認</span>
        <span class="group-desc">每次使用前先問你</span>
      </div>
      <div class="list-card">
        <label v-for="tool in confirmTools" :key="tool.name" class="tool-row">
          <span class="tool-name">{{ tool.displayName ?? tool.name }}</span>
          <input
            type="checkbox"
            class="tool-checkbox"
            :checked="isEnabled(tool.name)"
            :disabled="!modelValue.enabled"
            @change="toggle(tool.name, $event)"
          />
        </label>
      </div>
    </div>

    <div v-if="mcpServers?.length" class="group" :class="{ dim: !modelValue.enabled }">
      <div class="group-heading">
        <span class="group-label">MCP 伺服器</span>
      </div>
      <div class="list-card">
        <label v-for="server in mcpServers" :key="server.id" class="tool-row">
          <span class="tool-name">{{ server.name }}</span>
          <input
            type="checkbox"
            class="tool-checkbox"
            :checked="isServerEnabled(server.id)"
            :disabled="!modelValue.enabled"
            @change="toggleServer(server.id, $event)"
          />
        </label>
      </div>
    </div>
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

const lowRiskTools = computed(() => props.tools.filter((tool) => tool.risk !== "high"));
const confirmTools = computed(() => props.tools.filter((tool) => tool.risk === "high"));
const enabledCount = computed(() => props.tools.filter((tool) => isEnabled(tool.name)).length);
function toggleMaster() {
  emit("update:modelValue", { ...props.modelValue, enabled: !props.modelValue.enabled });
}
</script>

<style scoped>
.character-tool-permissions {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.master-card {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 14px 14px 14px 16px;
  border-radius: 18px;
  background: var(--color-surface);
}
.master-text {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.master-title {
  font-size: 15px;
  font-weight: 700;
  color: var(--color-text);
}
.master-subtitle {
  font-size: 12px;
  color: var(--color-text-secondary);
}
.master-switch {
  flex: none;
  width: 52px;
  height: 32px;
  padding: 3px;
  border: none;
  border-radius: 16px;
  display: flex;
  align-items: center;
  justify-content: flex-start;
  background: var(--color-border);
  cursor: pointer;
}
.master-switch.on {
  justify-content: flex-end;
  background: var(--color-primary);
}
.master-knob {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
}
.group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.group.dim {
  opacity: 0.45;
}
.group-heading {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 4px 0;
}
.badge {
  height: 22px;
  padding: 0 8px;
  border-radius: 11px;
  font-size: 11px;
  font-weight: 700;
  display: flex;
  align-items: center;
}
.badge-success {
  background: color-mix(in srgb, var(--color-success) 16%, var(--color-surface));
  color: var(--color-success);
}
.badge-warning {
  background: color-mix(in srgb, var(--color-warning) 18%, var(--color-surface));
  color: var(--color-text);
}
.group-desc {
  font-size: 12px;
  color: var(--color-text-secondary);
}
.group-label {
  font-size: 12px;
  font-weight: 700;
  color: var(--color-text-secondary);
}
.list-card {
  border-radius: 18px;
  padding: 2px 0;
  background: var(--color-surface);
}
.tool-row {
  min-height: 48px;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0 16px;
  border-bottom: 1px solid var(--color-border);
  cursor: pointer;
}
.tool-row:last-child {
  border-bottom: none;
}
.tool-name {
  flex: 1;
  font-size: 15px;
  color: var(--color-text);
}
.tool-checkbox {
  width: 20px;
  height: 20px;
  margin: 0;
  accent-color: var(--color-primary);
}
</style>
