<script setup lang="ts">
import type { WidgetInstance } from "@/types";
import {
    Check,
    Image as ImageIcon,
    Palette,
    RotateCcw,
    Shapes,
    X,
} from "lucide-vue-next";
import IconPickerPanel from "./IconPickerPanel.vue";
import CalendarColorSettings from "./widget-settings/CalendarColorSettings.vue";
import CharacterBindSettings from "./widget-settings/CharacterBindSettings.vue";
import ClockStyleSettings from "./widget-settings/ClockStyleSettings.vue";
import ColorSettings from "./widget-settings/ColorSettings.vue";
import IconSettings from "./widget-settings/IconSettings.vue";
import LayoutSelector from "./widget-settings/LayoutSelector.vue";
import ShapeSettings from "./widget-settings/ShapeSettings.vue";
import WidgetPreview from "./widget-settings/WidgetPreview.vue";
import { useWidgetSettings } from "./widget-settings/useWidgetSettings";

const props = defineProps<{
  widget: WidgetInstance;
}>();

const emit = defineEmits<{
  close: [];
}>();

// 全部本地狀態、setter、預覽 computed 與 save/reset 邏輯集中於 composable
const {
  // stores
  charactersStore,
  // 角色綁定
  isCharacterWidget,
  boundCharacterId,
  characterLayouts,
  characterLayout,
  selectCharacterLayout,
  // 樣式狀態
  localStyle,
  // 時鐘
  clockStyleValue,
  showSecondsValue,
  showDateValue,
  clockColorValue,
  // 行事曆
  calendarColors,
  // 分頁與顏色選擇器
  activeTab,
  // 佈局選項
  musicLayouts,
  worldBookLayouts,
  charPhoneLayouts,
  habitLayouts,
  styleLayouts,
  currentLayout,
  selectLayout,
  // 黑膠子風格
  vinylStyles,
  currentVinylStyle,
  selectVinylStyle,
  // 圖標選擇器
  showIconPicker,
  showIconSettings,
  // 背景/顏色
  backgroundType,
  selectBackgroundColor,
  selectGradient,
  selectForegroundColor,
  selectTextColor,
  selectBorderColor,
  applyTheme,
  onIconSelect,
  onCustomIconSelect,
  // 重置/保存
  resetStyle,
  saveAndClose,
  // 預覽 computed
  previewStyle,
  previewContentStyle,
  iconPreviewBlobStyle,
  iconPreviewIconStyle,
  previewUsesCustomImage,
  previewIconComponent,
  centerIconOffset,
  resetIconScale,
} = useWidgetSettings(props.widget, () => emit("close"));

</script>

<template>
  <div class="widget-settings-panel" @touchmove.prevent>
    <div class="panel-backdrop" @click="emit('close')" @touchmove.prevent></div>

    <div class="panel-content" @touchmove.stop>
      <!-- 標題 -->
      <div class="panel-header">
        <h3>組件設定</h3>
        <button class="close-btn" @click="emit('close')">
          <X :size="20" :stroke-width="2" />
        </button>
      </div>

      <!-- 預覽區域 -->
      <WidgetPreview
        :show-icon-settings="showIconSettings"
        :local-style="localStyle"
        :label="widget.data?.label"
        :icon-preview-blob-style="iconPreviewBlobStyle"
        :icon-preview-icon-style="iconPreviewIconStyle"
        :preview-uses-custom-image="previewUsesCustomImage"
        :preview-icon-component="previewIconComponent"
        :preview-style="previewStyle"
        :preview-content-style="previewContentStyle"
      />

      <!-- 標籤頁 -->
      <div class="tabs" v-if="showIconSettings">
        <button
          :class="['tab', { active: activeTab === 'color' }]"
          @click="activeTab = 'color'"
        >
          <Palette :size="16" />
          色彩
        </button>
        <button
          :class="['tab', { active: activeTab === 'shape' }]"
          @click="activeTab = 'shape'"
        >
          <Shapes :size="16" />
          形狀
        </button>
        <button
          :class="['tab', { active: activeTab === 'icon' }]"
          @click="activeTab = 'icon'"
        >
          <ImageIcon :size="16" />
          圖標
        </button>
      </div>

      <!-- 色彩設定 -->
      <div v-show="activeTab === 'color'" class="settings-section">
        <!-- 時鐘樣式選擇 (僅時鐘) -->
        <ClockStyleSettings
          v-if="widget.type === 'clock'"
          v-model:clock-style="clockStyleValue"
          v-model:show-seconds="showSecondsValue"
          v-model:show-date="showDateValue"
          v-model:clock-color="clockColorValue"
        />

        <!-- 行事曆顏色設定 -->
        <CalendarColorSettings
          v-if="widget.type === 'calendar'"
          v-model:calendar-colors="calendarColors"
        />

        <!-- 佈局選擇 (僅音樂播放器) -->
        <div v-if="widget.type === 'music'" class="setting-group">
          <div class="group-label">顯示風格</div>
          <LayoutSelector
            :layouts="musicLayouts"
            :model-value="currentLayout"
            @update:model-value="selectLayout"
          />
        </div>

        <!-- 黑膠唱片子風格選擇 -->
        <div
          v-if="widget.type === 'music' && currentLayout === 'vinyl'"
          class="setting-group"
        >
          <div class="group-label">黑膠風格</div>
          <LayoutSelector
            :layouts="vinylStyles"
            :model-value="currentVinylStyle"
            @update:model-value="selectVinylStyle"
          />
        </div>

        <!-- 佈局選擇 (僅世界書) -->
        <div v-if="widget.type === 'world-book'" class="setting-group">
          <div class="group-label">顯示風格</div>
          <LayoutSelector
            :layouts="worldBookLayouts"
            :model-value="currentLayout"
            @update:model-value="selectLayout"
          />
        </div>

        <!-- 佈局選擇 (僅角色手機) -->
        <div v-if="widget.type === 'char-phone'" class="setting-group">
          <div class="group-label">顯示風格</div>
          <LayoutSelector
            :layouts="charPhoneLayouts"
            :model-value="currentLayout"
            @update:model-value="selectLayout"
          />
        </div>

        <!-- 佈局選擇 (支持防普普風切換的組件) -->
        <div
          v-if="
            [
              'polaroid',
              'mood-diary',
              'quote',
              'todo',
              'focus-timer',
              'weather',
              'calendar',
            ].includes(widget.type)
          "
          class="setting-group"
        >
          <div class="group-label">顯示風格</div>
          <LayoutSelector
            :layouts="styleLayouts"
            :model-value="currentLayout"
            @update:model-value="selectLayout"
          />
        </div>

        <!-- 習慣追蹤佈局選擇 -->
        <div v-if="widget.type === 'habit-tracker'" class="setting-group">
          <div class="group-label">顯示風格</div>
          <LayoutSelector
            :layouts="habitLayouts"
            :model-value="currentLayout"
            @update:model-value="selectLayout"
          />
        </div>

        <!-- 角色綁定組件：綁定角色 + 顯示風格 -->
        <CharacterBindSettings
          v-if="isCharacterWidget"
          v-model:bound-character-id="boundCharacterId"
          :characters="charactersStore.characters"
          :layouts="characterLayouts"
          :character-layout="characterLayout"
          @select-layout="selectCharacterLayout"
        />

        <!-- 快速主題 + 背景/圖標/文字/邊框色 -->
        <ColorSettings
          v-model:background-type="backgroundType"
          :local-style="localStyle"
          @apply-theme="applyTheme"
          @select-background-color="selectBackgroundColor"
          @select-gradient="selectGradient"
          @select-foreground-color="selectForegroundColor"
          @select-text-color="selectTextColor"
          @select-border-color="selectBorderColor"
        />
      </div>

      <!-- 形狀設定 -->
      <div
        v-show="activeTab === 'shape' && showIconSettings"
        class="settings-section"
      >
        <ShapeSettings :local-style="localStyle" />
      </div>

      <!-- 圖標設定 -->
      <div
        v-show="activeTab === 'icon' && showIconSettings"
        class="settings-section"
      >
        <IconSettings
          :local-style="localStyle"
          @show-picker="showIconPicker = true"
          @reset-icon-scale="resetIconScale"
          @center-icon-offset="centerIconOffset"
        />
      </div>

      <!-- 底部按鈕 -->
      <div class="panel-footer">
        <button class="footer-btn reset" @click="resetStyle">
          <RotateCcw :size="16" />
          重置
        </button>
        <button class="footer-btn save" @click="saveAndClose">
          <Check :size="16" />
          保存
        </button>
      </div>
    </div>

    <!-- 圖標選擇器 -->
    <IconPickerPanel
      v-if="showIconPicker"
      @select="onIconSelect"
      @select-custom="onCustomIconSelect"
      @close="showIconPicker = false"
    />
  </div>
</template>

<style lang="scss" scoped>
@use "../../styles/widget-settings-shared";

.widget-settings-panel {
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
  max-height: 90vh;
  background: #ffffff;
  border-radius: 24px 24px 0 0;
  padding: 20px;
  padding-bottom: max(20px, var(--safe-bottom, 0px));
  animation: slideUp 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  overscroll-behavior: contain;
  transform: translateZ(0);
  will-change: transform;
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
  justify-content: space-between;
  margin-bottom: 16px;

  h3 {
    font-size: 18px;
    font-weight: 700;
    color: #1f2937;
  }

  .close-btn {
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

// 標籤頁
.tabs {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
  background: #f3f4f6;
  border-radius: 12px;
  padding: 4px;
}

.tab {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 10px 16px;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 500;
  color: #6b7280;
  transition: all 0.2s;

  &:hover {
    color: #374151;
  }

  &.active {
    background: white;
    color: #4f46e5;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  }
}

// 設定區塊
.settings-section {
  max-height: 40vh;
  min-height: 150px;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  overscroll-behavior: contain;
  padding-right: 4px;

  // PC 端給更多空間
  @media (min-width: 768px) {
    max-height: 45vh;
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
