<script setup lang="ts">
import { useCanvasStore } from "@/stores";
import {
    backgroundColors,
    borderColors,
    foregroundColors,
    gradientPresets,
} from "@/styles/color-presets";
import { Check, RotateCcw, X } from "lucide-vue-next";
import { onMounted, onUnmounted, ref } from "vue";

const emit = defineEmits<{
  close: [];
}>();

const canvasStore = useCanvasStore();

// 背景類型
const backgroundType = ref<"solid" | "gradient">("solid");

// 選中的顏色
const selectedBgColor = ref<string | null>(null);
const selectedGradient = ref<string | null>(null);
const selectedFgColor = ref<string | null>(null);
const selectedBorderColor = ref<string | null>(null);

// 選擇純色背景
function selectBackgroundColor(color: string) {
  selectedBgColor.value = color;
  selectedGradient.value = null;
}

// 選擇漸變背景
function selectGradient(gradient: string) {
  selectedGradient.value = gradient;
  selectedBgColor.value = null;
}

// 選擇前景色
function selectForegroundColor(color: string) {
  selectedFgColor.value = selectedFgColor.value === color ? null : color;
}

// 選擇邊框色
function selectBorderColor(color: string) {
  selectedBorderColor.value =
    selectedBorderColor.value === color ? null : color;
}

// 重置選擇
function resetSelection() {
  selectedBgColor.value = null;
  selectedGradient.value = null;
  selectedFgColor.value = null;
  selectedBorderColor.value = null;
}

// 應用樣式到選取的組件
function applyStyles() {
  const style: Record<string, any> = {};

  if (selectedGradient.value) {
    style.backgroundGradient = selectedGradient.value;
    style.backgroundColor = undefined;
  } else if (selectedBgColor.value) {
    style.backgroundColor = selectedBgColor.value;
    style.backgroundGradient = undefined;
  }

  if (selectedFgColor.value) {
    style.foregroundColor = selectedFgColor.value;
  }

  if (selectedBorderColor.value) {
    style.borderColor = selectedBorderColor.value;
  }

  // 只有選擇了至少一個樣式才應用
  if (Object.keys(style).length > 0) {
    canvasStore.updateSelectedWidgetsStyle(style);
  }

  emit("close");
}

// 防止滾動穿透
onMounted(() => {
  document.body.style.overflow = "hidden";
});

onUnmounted(() => {
  document.body.style.overflow = "";
});
</script>

<template>
  <div class="batch-style-panel" @touchmove.prevent>
    <div class="panel-backdrop" @click="emit('close')"></div>

    <div class="panel-content" @touchmove.stop>
      <!-- 標題 -->
      <div class="panel-header">
        <h3>批量樣式設定</h3>
        <span class="selected-count"
          >已選 {{ canvasStore.selectedCount }} 個組件</span
        >
        <button class="close-btn" @click="emit('close')">
          <X :size="20" :stroke-width="2" />
        </button>
      </div>

      <div class="settings-section">
        <!-- 背景色 -->
        <div class="setting-group">
          <div class="group-label">背景色</div>
          <div class="color-type-tabs">
            <button
              :class="['type-tab', { active: backgroundType === 'solid' }]"
              @click="backgroundType = 'solid'"
            >
              純色
            </button>
            <button
              :class="['type-tab', { active: backgroundType === 'gradient' }]"
              @click="backgroundType = 'gradient'"
            >
              漸變
            </button>
          </div>

          <!-- 純色選擇 -->
          <div v-if="backgroundType === 'solid'" class="colors-grid">
            <button
              v-for="color in backgroundColors"
              :key="color"
              :class="['color-item', { active: selectedBgColor === color }]"
              :style="{ backgroundColor: color }"
              @click="selectBackgroundColor(color)"
            />
          </div>

          <!-- 漸變選擇 -->
          <div v-else class="gradients-grid">
            <button
              v-for="gradient in gradientPresets"
              :key="gradient.id"
              :class="[
                'gradient-item',
                { active: selectedGradient === gradient.value },
              ]"
              :style="{ background: gradient.value }"
              @click="selectGradient(gradient.value)"
            >
              <span class="gradient-name">{{ gradient.name }}</span>
            </button>
          </div>
        </div>

        <!-- 前景色（文字/圖標） -->
        <div class="setting-group">
          <div class="group-label">文字/圖標顏色</div>
          <div class="colors-grid">
            <button
              v-for="color in foregroundColors"
              :key="color"
              :class="['color-item', { active: selectedFgColor === color }]"
              :style="{ backgroundColor: color }"
              @click="selectForegroundColor(color)"
            />
          </div>
        </div>

        <!-- 邊框色 -->
        <div class="setting-group">
          <div class="group-label">邊框顏色</div>
          <div class="colors-grid">
            <button
              v-for="color in borderColors"
              :key="color"
              :class="[
                'color-item border-color',
                { active: selectedBorderColor === color },
              ]"
              :style="{
                backgroundColor: color === 'transparent' ? '#fff' : color,
              }"
              @click="selectBorderColor(color)"
            >
              <span v-if="color === 'transparent'" class="no-border">✕</span>
            </button>
          </div>
        </div>
      </div>

      <!-- 底部按鈕 -->
      <div class="panel-footer">
        <button class="footer-btn reset" @click="resetSelection">
          <RotateCcw :size="16" />
          重置
        </button>
        <button class="footer-btn save" @click="applyStyles">
          <Check :size="16" />
          套用
        </button>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.batch-style-panel {
  position: fixed;
  inset: 0;
  z-index: 200;
  display: flex;
  align-items: flex-end;
  justify-content: center;
}

.panel-backdrop {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.3);
  backdrop-filter: blur(4px);
  animation: fadeIn 0.2s ease;
}

@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

.panel-content {
  position: relative;
  width: 100%;
  max-width: 500px;
  max-height: 80vh;
  background: #ffffff;
  border-radius: 24px 24px 0 0;
  padding: 20px;
  padding-bottom: max(20px, var(--safe-bottom, 0px));
  animation: slideUp 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
  overflow-y: auto;
}

@keyframes slideUp {
  from {
    transform: translateY(100%);
  }
  to {
    transform: translateY(0);
  }
}

.panel-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;

  h3 {
    font-size: 18px;
    font-weight: 700;
    color: #1f2937;
  }

  .selected-count {
    font-size: 13px;
    color: #6b7280;
    background: #f3f4f6;
    padding: 4px 10px;
    border-radius: 12px;
  }

  .close-btn {
    margin-left: auto;
    width: 36px;
    height: 36px;
    border-radius: 50%;
    background: #f3f4f6;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #6b7280;
    transition: all 0.2s;

    &:hover {
      background: #e5e7eb;
      color: #374151;
    }
  }
}

.settings-section {
  max-height: 50vh;
  overflow-y: auto;
  padding-right: 4px;
}

.setting-group {
  margin-bottom: 20px;
}

.group-label {
  font-size: 13px;
  font-weight: 600;
  color: #374151;
  margin-bottom: 10px;
}

// 顏色類型標籤
.color-type-tabs {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
}

.type-tab {
  padding: 6px 16px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  color: #6b7280;
  background: #f3f4f6;
  transition: all 0.2s;

  &:hover {
    background: #e5e7eb;
  }

  &.active {
    background: #4f46e5;
    color: white;
  }
}

// 顏色網格
.colors-grid {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 10px;
}

.color-item {
  aspect-ratio: 1;
  border-radius: 12px;
  border: 3px solid transparent;
  transition: all 0.2s;
  position: relative;

  &:hover {
    transform: scale(1.1);
  }

  &.active {
    border-color: #4f46e5;
    box-shadow:
      0 0 0 2px white,
      0 0 0 4px #4f46e5;
  }

  &.border-color {
    border: 2px solid #e5e7eb;
  }

  .no-border {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 16px;
    color: #9ca3af;
  }
}

// 漸變網格
.gradients-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
}

.gradient-item {
  aspect-ratio: 2/1;
  border-radius: 12px;
  border: 3px solid transparent;
  transition: all 0.2s;
  display: flex;
  align-items: flex-end;
  padding: 8px;

  &:hover {
    transform: scale(1.02);
  }

  &.active {
    border-color: #4f46e5;
    box-shadow:
      0 0 0 2px white,
      0 0 0 4px #4f46e5;
  }

  .gradient-name {
    font-size: 11px;
    font-weight: 600;
    color: white;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
  }
}

// 底部按鈕
.panel-footer {
  display: flex;
  gap: 12px;
  margin-top: 20px;
  padding-top: 16px;
  border-top: 1px solid #e5e7eb;
}

.footer-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 14px 20px;
  border-radius: 14px;
  font-size: 15px;
  font-weight: 600;
  transition: all 0.2s;

  &.reset {
    background: #f3f4f6;
    color: #6b7280;

    &:hover {
      background: #e5e7eb;
      color: #374151;
    }
  }

  &.save {
    background: linear-gradient(135deg, #84fab0 0%, #8fd3f4 100%);
    color: #065f46;

    &:hover {
      transform: translateY(-2px);
      box-shadow: 0 6px 16px rgba(132, 250, 176, 0.4);
    }
  }
}
</style>
