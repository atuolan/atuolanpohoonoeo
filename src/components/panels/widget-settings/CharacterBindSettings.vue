<script setup lang="ts">
import type { StoredCharacter } from "@/types/character";
import type { WidgetCustomStyle } from "@/types";
import LayoutSelector from "./LayoutSelector.vue";
import type { LayoutOption } from "./widgetSettingsOptions";

defineProps<{
  characters: StoredCharacter[];
  layouts: LayoutOption[];
  characterLayout: string;
  localStyle: WidgetCustomStyle;
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

  <!-- 角色卡面背景 -->
  <div class="setting-group">
    <label class="toggle-row">
      <span class="group-label no-margin">角色卡面背景</span>
      <input
        type="checkbox"
        class="toggle-checkbox"
        :checked="localStyle.useCharacterBg"
        @change="
          localStyle.useCharacterBg = ($event.target as HTMLInputElement).checked
        "
      />
    </label>
    <p class="select-hint">開啟後以角色卡面作為背景，可調整透明度</p>

    <!-- 透明度滑桿 -->
    <div v-if="localStyle.useCharacterBg" class="opacity-row">
      <span class="opacity-label">透明度</span>
      <input
        type="range"
        min="0"
        max="100"
        step="5"
        class="opacity-slider"
        :value="localStyle.characterBgOpacity ?? 50"
        @input="
          localStyle.characterBgOpacity = Number(
            ($event.target as HTMLInputElement).value,
          )
        "
      />
      <span class="opacity-value">{{ localStyle.characterBgOpacity ?? 50 }}%</span>
    </div>
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

.toggle-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  cursor: pointer;
}

.group-label.no-margin {
  margin: 0;
}

.toggle-checkbox {
  width: 20px;
  height: 20px;
  accent-color: #6366f1;
  cursor: pointer;
}

.opacity-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 12px;
}

.opacity-label {
  font-size: 13px;
  color: #374151;
  flex-shrink: 0;
}

.opacity-slider {
  flex: 1;
  accent-color: #6366f1;
  cursor: pointer;
}

.opacity-value {
  font-size: 13px;
  color: #6366f1;
  font-weight: 600;
  min-width: 38px;
  text-align: right;
}
</style>
