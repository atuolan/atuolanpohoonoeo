<script setup lang="ts">
import type { StoredCharacter } from "@/types/character";
import LayoutSelector from "./LayoutSelector.vue";
import type { LayoutOption } from "./widgetSettingsOptions";

defineProps<{
  characters: StoredCharacter[];
  layouts: LayoutOption[];
  characterLayout: string;
}>();

const emit = defineEmits<{
  "select-layout": [value: string];
}>();

const boundCharacterId = defineModel<string>("boundCharacterId", {
  required: true,
});
</script>

<template>
  <!-- 綁定角色選擇器 -->
  <div class="setting-group">
    <div class="group-label">綁定角色</div>
    <select v-model="boundCharacterId" class="character-select">
      <option value="">未綁定</option>
      <option v-for="char in characters" :key="char.id" :value="char.id">
        {{ char.nickname || char.data?.name || "未命名角色" }}
      </option>
    </select>
    <p v-if="characters.length === 0" class="select-hint">
      尚無角色，請先建立角色
    </p>
  </div>

  <!-- 顯示風格 -->
  <div v-if="layouts.length > 0" class="setting-group">
    <div class="group-label">顯示風格</div>
    <LayoutSelector
      :layouts="layouts"
      :model-value="characterLayout"
      @update:model-value="emit('select-layout', $event)"
    />
  </div>
</template>

<style lang="scss" scoped>
@use "../../../styles/widget-settings-shared";

.character-select {
  width: 100%;
  padding: 10px 12px;
  border-radius: 12px;
  border: 2px solid #e5e7eb;
  background: #f8fafc;
  font-size: 14px;
  color: #374151;
  cursor: pointer;
  transition: border-color 0.2s;

  &:focus {
    outline: none;
    border-color: #6366f1;
  }
}

.select-hint {
  margin-top: 8px;
  font-size: 12px;
  color: #9ca3af;
}
</style>
