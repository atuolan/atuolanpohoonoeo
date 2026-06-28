<script setup lang="ts">
import type { WidgetCustomStyle } from "@/types";
import { shapePresets } from "@/styles/shape-presets";

defineProps<{ localStyle: WidgetCustomStyle }>();
</script>

<template>
  <div class="setting-group">
    <div class="group-label">選擇形狀</div>
    <div class="shapes-grid">
      <button
        v-for="shape in shapePresets"
        :key="shape.id"
        :class="['shape-item', { active: localStyle.shape === shape.id }]"
        @click="
          localStyle.shape =
            localStyle.shape === shape.id ? undefined : shape.id
        "
      >
        <svg class="shape-preview" viewBox="0 0 60 60" fill="none">
          <path
            :d="shape.previewPath"
            fill="currentColor"
            opacity="0.15"
            stroke="currentColor"
            stroke-width="1.5"
          />
        </svg>
        <span class="shape-name">{{ shape.name }}</span>
      </button>
    </div>
    <p class="shape-hint">點擊已選形狀可取消，恢復預設流體形狀</p>
  </div>
</template>

<style lang="scss" scoped>
@use "../../../styles/widget-settings-shared";

// 形狀選擇網格
.shapes-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 10px;
}

.shape-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 10px 4px 8px;
  border-radius: 12px;
  background: #f8fafc;
  border: 2px solid transparent;
  transition: all 0.2s;
  color: #6b7280;

  &:hover {
    background: #f1f5f9;
    color: #4f46e5;
    transform: translateY(-2px);
  }

  &.active {
    background: #e0e7ff;
    border-color: #6366f1;
    color: #4f46e5;
  }

  .shape-preview {
    width: 36px;
    height: 36px;
  }

  .shape-name {
    font-size: 11px;
    font-weight: 500;
    line-height: 1;
  }
}

.shape-hint {
  font-size: 11px;
  color: #9ca3af;
  margin-top: 8px;
  text-align: center;
}
</style>
