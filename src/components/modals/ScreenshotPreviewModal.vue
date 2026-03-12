<script setup lang="ts">
import {
    useScreenshot,
    type ScreenshotOptions,
} from "@/composables/useScreenshot";
import { computed, ref } from "vue";

const props = defineProps<{
  imageDataUrl: string;
}>();

const emit = defineEmits<{
  (e: "close"): void;
  (e: "retake", opts: Partial<ScreenshotOptions>): void;
}>();

const { downloadScreenshot, shareScreenshot } = useScreenshot();

const format = ref<"png" | "jpeg">("png");
const quality = ref(0.92);
const showWatermarkInput = ref(false);
const watermarkText = ref("");
const isSharing = ref(false);
const showSavedTip = ref(false);

const canShare = computed(() => !!navigator.share);

function handleDownload() {
  downloadScreenshot(props.imageDataUrl);
  showSavedTip.value = true;
  setTimeout(() => (showSavedTip.value = false), 2000);
}

async function handleShare() {
  isSharing.value = true;
  const shared = await shareScreenshot(props.imageDataUrl);
  isSharing.value = false;
  if (shared) emit("close");
}

function handleRetake() {
  emit("retake", {
    format: format.value,
    quality: quality.value,
    watermark: showWatermarkInput.value && !!watermarkText.value,
    watermarkText: watermarkText.value,
  });
}
</script>

<template>
  <Teleport to="body">
    <Transition name="modal-fade">
      <div class="screenshot-overlay" @click.self="emit('close')">
        <div class="screenshot-modal">
          <!-- 頭部 -->
          <div class="modal-header">
            <span class="header-title">截圖預覽</span>
            <button class="close-btn" @click="emit('close')">
              <svg
                viewBox="0 0 24 24"
                fill="currentColor"
                width="20"
                height="20"
              >
                <path
                  d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"
                />
              </svg>
            </button>
          </div>

          <!-- 預覽圖 -->
          <div class="preview-area">
            <img :src="imageDataUrl" alt="截圖預覽" class="preview-image" />
          </div>

          <!-- 選項 -->
          <div class="options-area">
            <!-- 格式選擇 -->
            <div class="option-row">
              <span class="option-label">格式</span>
              <div class="option-toggle">
                <button
                  :class="{ active: format === 'png' }"
                  @click="format = 'png'"
                >
                  PNG
                </button>
                <button
                  :class="{ active: format === 'jpeg' }"
                  @click="format = 'jpeg'"
                >
                  JPEG
                </button>
              </div>
            </div>

            <!-- JPEG 品質 -->
            <div v-if="format === 'jpeg'" class="option-row">
              <span class="option-label">品質</span>
              <input
                v-model.number="quality"
                type="range"
                min="0.5"
                max="1"
                step="0.01"
                class="quality-slider"
              />
              <span class="quality-value"
                >{{ Math.round(quality * 100) }}%</span
              >
            </div>

            <!-- 浮水印 -->
            <div class="option-row">
              <span class="option-label">浮水印</span>
              <label class="toggle-switch">
                <input v-model="showWatermarkInput" type="checkbox" />
                <span class="toggle-slider"></span>
              </label>
            </div>
            <div v-if="showWatermarkInput" class="option-row">
              <input
                v-model="watermarkText"
                type="text"
                placeholder="輸入浮水印文字..."
                class="watermark-input"
                @keyup.enter="handleRetake"
              />
              <button class="retake-btn" @click="handleRetake">套用</button>
            </div>
          </div>

          <!-- 操作按鈕 -->
          <div class="action-area">
            <button class="action-btn download-btn" @click="handleDownload">
              <svg
                viewBox="0 0 24 24"
                fill="currentColor"
                width="18"
                height="18"
              >
                <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z" />
              </svg>
              <span>{{ showSavedTip ? "已儲存" : "下載" }}</span>
            </button>
            <button
              v-if="canShare"
              class="action-btn share-btn"
              :disabled="isSharing"
              @click="handleShare"
            >
              <svg
                viewBox="0 0 24 24"
                fill="currentColor"
                width="18"
                height="18"
              >
                <path
                  d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92s2.92-1.31 2.92-2.92-1.31-2.92-2.92-2.92z"
                />
              </svg>
              <span>{{ isSharing ? "分享中..." : "分享" }}</span>
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style lang="scss" scoped>
.modal-fade-enter-active,
.modal-fade-leave-active {
  transition: opacity 0.2s ease;
}
.modal-fade-enter-from,
.modal-fade-leave-to {
  opacity: 0;
}

.screenshot-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  padding: 16px;
}

.screenshot-modal {
  width: 100%;
  max-width: 400px;
  max-height: 85vh;
  background: var(--color-surface, #fff);
  border-radius: 16px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.2);
  animation: slideUp 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
}

@keyframes slideUp {
  from {
    opacity: 0;
    transform: translateY(24px) scale(0.96);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  border-bottom: 1px solid rgba(128, 128, 128, 0.15);

  .header-title {
    font-size: 16px;
    font-weight: 600;
    color: var(--color-text, #1a1a1a);
  }

  .close-btn {
    width: 32px;
    height: 32px;
    border: none;
    background: rgba(128, 128, 128, 0.1);
    border-radius: 8px;
    color: var(--color-text-secondary, #666);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 0.15s;

    &:active {
      background: rgba(128, 128, 128, 0.2);
    }
  }
}

.preview-area {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
  display: flex;
  justify-content: center;
  background: rgba(128, 128, 128, 0.05);
  min-height: 120px;
  max-height: 40vh;

  .preview-image {
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
    border-radius: 8px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  }
}

.options-area {
  padding: 12px 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  border-top: 1px solid rgba(128, 128, 128, 0.1);
}

.option-row {
  display: flex;
  align-items: center;
  gap: 10px;

  .option-label {
    font-size: 13px;
    color: var(--color-text-secondary, #666);
    min-width: 48px;
  }
}

.option-toggle {
  display: flex;
  gap: 4px;
  background: rgba(128, 128, 128, 0.1);
  border-radius: 8px;
  padding: 2px;

  button {
    padding: 4px 12px;
    border: none;
    background: transparent;
    border-radius: 6px;
    font-size: 12px;
    color: var(--color-text-secondary, #666);
    cursor: pointer;
    transition: all 0.15s;

    &.active {
      background: var(--color-primary, #667eea);
      color: #fff;
    }
  }
}

.quality-slider {
  flex: 1;
  height: 4px;
  accent-color: var(--color-primary, #667eea);
}

.quality-value {
  font-size: 12px;
  color: var(--color-text-secondary, #666);
  min-width: 36px;
  text-align: right;
}

.toggle-switch {
  position: relative;
  width: 40px;
  height: 22px;
  cursor: pointer;

  input {
    opacity: 0;
    width: 0;
    height: 0;
  }

  .toggle-slider {
    position: absolute;
    inset: 0;
    background: rgba(128, 128, 128, 0.3);
    border-radius: 11px;
    transition: background 0.2s;

    &::before {
      content: "";
      position: absolute;
      width: 18px;
      height: 18px;
      left: 2px;
      bottom: 2px;
      background: #fff;
      border-radius: 50%;
      transition: transform 0.2s;
    }
  }

  input:checked + .toggle-slider {
    background: var(--color-primary, #667eea);

    &::before {
      transform: translateX(18px);
    }
  }
}

.watermark-input {
  flex: 1;
  padding: 6px 10px;
  border: 1px solid rgba(128, 128, 128, 0.2);
  border-radius: 8px;
  font-size: 13px;
  background: var(--color-surface, #fff);
  color: var(--color-text, #1a1a1a);
  outline: none;

  &:focus {
    border-color: var(--color-primary, #667eea);
  }
}

.retake-btn {
  padding: 6px 12px;
  border: none;
  background: var(--color-primary, #667eea);
  color: #fff;
  border-radius: 8px;
  font-size: 12px;
  cursor: pointer;
  white-space: nowrap;

  &:active {
    opacity: 0.8;
  }
}

.action-area {
  display: flex;
  gap: 10px;
  padding: 12px 16px;
  padding-bottom: max(12px, var(--safe-bottom, 0px));
  border-top: 1px solid rgba(128, 128, 128, 0.1);
}

.action-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 10px;
  border: none;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;

  &:active {
    transform: scale(0.97);
  }
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}

.download-btn {
  background: var(--color-primary, #667eea);
  color: #fff;

  &:active {
    opacity: 0.85;
  }
}

.share-btn {
  background: rgba(128, 128, 128, 0.1);
  color: var(--color-text, #1a1a1a);

  &:active {
    background: rgba(128, 128, 128, 0.2);
  }
}

// 移動端底部彈出
@media (max-width: 480px) {
  .screenshot-overlay {
    padding: 0;
    align-items: flex-end;
  }

  .screenshot-modal {
    max-width: 100%;
    max-height: 90vh;
    border-radius: 16px 16px 0 0;
  }
}
</style>
