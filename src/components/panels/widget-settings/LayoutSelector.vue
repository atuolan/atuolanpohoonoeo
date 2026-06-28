<script setup lang="ts">
import type { LayoutOption } from "./widgetSettingsOptions";

defineProps<{
  layouts: LayoutOption[];
  modelValue: string;
}>();

const emit = defineEmits<{
  "update:modelValue": [value: string];
}>();

function select(id: string) {
  emit("update:modelValue", id);
}
</script>

<template>
  <div class="layouts-grid">
    <button
      v-for="layout in layouts"
      :key="layout.id"
      :class="['layout-item', { active: modelValue === layout.id }]"
      @click="select(layout.id)"
    >
      <span class="layout-name">{{ layout.name }}</span>
      <span class="layout-desc">{{ layout.desc }}</span>
    </button>
  </div>
</template>

<style lang="scss" scoped>
// 佈局網格
.layouts-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}

.layout-item {
  padding: 12px 8px;
  border-radius: 12px;
  background: #f8fafc;
  border: 2px solid transparent;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  text-align: center;
  transition: all 0.2s;

  &:hover {
    background: #f1f5f9;
  }

  &.active {
    background: #e0e7ff;
    border-color: #6366f1;

    .layout-name {
      color: #4f46e5;
    }
  }

  .layout-name {
    font-size: 13px;
    font-weight: 600;
    color: #374151;
  }

  .layout-desc {
    font-size: 10px;
    color: #6b7280;
    line-height: 1.2;
  }
}
</style>
