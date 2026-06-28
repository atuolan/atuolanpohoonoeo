<script setup lang="ts">
import type { WidgetCustomStyle } from "@/types";
import type { Component, StyleValue } from "vue";

defineProps<{
  showIconSettings: boolean;
  localStyle: WidgetCustomStyle;
  label?: string;
  iconPreviewBlobStyle: StyleValue;
  iconPreviewIconStyle: StyleValue;
  previewUsesCustomImage: boolean;
  previewIconComponent: Component | null;
  previewStyle: StyleValue;
  previewContentStyle: StyleValue;
}>();
</script>

<template>
  <div class="preview-section">
    <div class="preview-label">預覽效果</div>
    <!-- fluid-button：模擬實際 widget（流體形狀 + 圖標 + 標籤），即時反映色彩/形狀/圖標/大小/X/Y -->
    <div v-if="showIconSettings" class="preview-box fluid-preview-box">
      <div class="fluid-preview-mock">
        <div class="fluid-preview-blob" :style="iconPreviewBlobStyle">
          <img
            v-if="previewUsesCustomImage"
            :src="localStyle.customIconUrl"
            alt="圖標預覽"
            class="preview-icon-img"
            :style="iconPreviewIconStyle"
          />
          <component
            :is="previewIconComponent"
            v-else
            class="preview-icon-svg"
            :style="iconPreviewIconStyle"
            :stroke-width="1.5"
          />
        </div>
        <span
          v-if="label"
          class="fluid-preview-label"
          :style="previewContentStyle"
        >
          {{ label }}
        </span>
      </div>
    </div>
    <!-- 其他 widget：保留原有色塊文字預覽 -->
    <div v-else class="preview-box" :style="previewStyle">
      <span class="preview-text" :style="previewContentStyle">
        {{ label || "預覽" }}
      </span>
    </div>
  </div>
</template>

<style lang="scss" scoped>
// 預覽區域
.preview-section {
  margin-bottom: 20px;
}

.preview-label {
  font-size: 13px;
  font-weight: 600;
  color: #6b7280;
  margin-bottom: 8px;
}

.preview-box {
  height: 80px;
  border-radius: 16px;
  background: #f8fafc;
  border: 2px solid #e5e7eb;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.3s;
}

.preview-text {
  font-size: 16px;
  font-weight: 600;
  color: #374151;
}

// fluid-button 真實預覽（模擬畫布上的實際 widget）
.preview-box.fluid-preview-box {
  height: 160px;
  background-color: #f8fafc;
  background-image:
    linear-gradient(45deg, #e5e7eb 25%, transparent 25%),
    linear-gradient(-45deg, #e5e7eb 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, #e5e7eb 75%),
    linear-gradient(-45deg, transparent 75%, #e5e7eb 75%);
  background-size: 14px 14px;
  background-position:
    0 0,
    0 7px,
    7px -7px,
    -7px 0;
  border: 2px solid #e5e7eb;
  padding: 8px;
}

.fluid-preview-mock {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
}

.fluid-preview-blob {
  width: 110px;
  height: 110px;
  aspect-ratio: 1 / 1;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: 1.5px solid rgba(0, 0, 0, 0.25);
  overflow: hidden;
  transition: border-radius 0.2s;
  flex-shrink: 0;

  .preview-icon-svg {
    color: #1f2937;
    opacity: 0.85;
    min-width: 16px;
    min-height: 16px;
    transition: transform 0.15s ease-out;
  }

  .preview-icon-img {
    object-fit: contain;
    min-width: 18px;
    min-height: 18px;
    transition: transform 0.15s ease-out;
  }
}

.fluid-preview-label {
  font-size: 11px;
  font-weight: 500;
  color: #374151;
  text-align: center;
  letter-spacing: 0.2px;
  flex-shrink: 0;
  line-height: 1.2;
  max-width: 100%;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
