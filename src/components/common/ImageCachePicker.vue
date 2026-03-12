<script setup lang="ts">
import { useImageCacheStore } from "@/stores";
import type { CachedImage } from "@/types/imageCache";
import { computed, onMounted, ref } from "vue";

// Props
const props = defineProps<{
  /** 是否顯示 */
  visible: boolean;
}>();

// Emits
const emit = defineEmits<{
  (e: "close"): void;
  (e: "select", imageData: string): void;
}>();

// Store
const imageCacheStore = useImageCacheStore();

// 上傳 input ref
const fileInput = ref<HTMLInputElement | null>(null);

// 載入中狀態
const isUploading = ref(false);

// 圖片直連 URL
const imageUrl = ref("");
const isLoadingUrl = ref(false);

// 錯誤訊息
const errorMessage = ref("");

// 排序後的圖片列表
const sortedImages = computed(() => imageCacheStore.sortedImages);

// 緩存狀態
const cacheStatus = computed(() => ({
  count: imageCacheStore.count,
  max: imageCacheStore.config.maxCount,
  isFull: imageCacheStore.isFull,
}));

// 初始化
onMounted(async () => {
  if (!imageCacheStore.isLoaded) {
    await imageCacheStore.loadImageCache();
  }
});

// 觸發上傳
function triggerUpload() {
  fileInput.value?.click();
}

// 處理檔案上傳
async function handleFileUpload(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;

  isUploading.value = true;
  errorMessage.value = "";

  try {
    const image = await imageCacheStore.addImageFromFile(file);
    emit("select", image.data);
    emit("close");
  } catch (err) {
    errorMessage.value = (err as Error).message;
  } finally {
    isUploading.value = false;
    input.value = "";
  }
}

// 選擇緩存圖片
async function selectCachedImage(image: CachedImage) {
  const data = await imageCacheStore.getImageAndUse(image.id);
  if (data) {
    emit("select", data);
    emit("close");
  }
}

// 刪除緩存圖片
async function deleteCachedImage(image: CachedImage, event: Event) {
  event.stopPropagation();
  if (!confirm("確定要刪除這張圖片嗎？")) return;
  await imageCacheStore.removeImage(image.id);
}

// 清空所有緩存
async function clearAllCache() {
  if (!confirm("確定要清空所有緩存圖片嗎？")) return;
  await imageCacheStore.clearAll();
}

// 使用圖片直連 URL
async function handleUrlSubmit() {
  const url = imageUrl.value.trim();
  if (!url) return;

  // 簡單驗證 URL 格式
  try {
    new URL(url);
  } catch {
    errorMessage.value = "請輸入有效的圖片網址";
    return;
  }

  isLoadingUrl.value = true;
  errorMessage.value = "";

  try {
    // 緩存 URL 並使用
    const image = await imageCacheStore.addImageFromUrl(url);
    emit("select", image.data);
    imageUrl.value = "";
    emit("close");
  } catch (err) {
    errorMessage.value = (err as Error).message;
  } finally {
    isLoadingUrl.value = false;
  }
}

// 關閉
function handleClose() {
  emit("close");
}

// 格式化檔案大小
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div
        v-if="visible"
        class="image-picker-overlay"
        @click.self="handleClose"
      >
        <div class="image-picker-modal">
          <!-- 標題 -->
          <header class="picker-header">
            <h3 class="picker-title">選擇頭像</h3>
            <button class="close-btn" @click="handleClose">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path
                  d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"
                />
              </svg>
            </button>
          </header>

          <!-- 上傳區域 -->
          <section class="upload-section">
            <button
              class="upload-btn"
              :disabled="isUploading"
              @click="triggerUpload"
            >
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M9 16h6v-6h4l-7-7-7 7h4v6zm-4 2h14v2H5v-2z" />
              </svg>
              <span>{{ isUploading ? "上傳中..." : "上傳新圖片" }}</span>
            </button>
            <input
              ref="fileInput"
              type="file"
              accept="image/*"
              class="hidden-input"
              @change="handleFileUpload"
            />
            <p v-if="errorMessage" class="error-message">{{ errorMessage }}</p>
          </section>

          <!-- 圖片直連 URL -->
          <section class="url-section">
            <div class="url-input-row">
              <input
                v-model="imageUrl"
                type="url"
                class="url-input"
                placeholder="貼上圖片網址..."
                @keydown.enter="handleUrlSubmit"
              />
              <button
                class="url-submit-btn"
                :disabled="!imageUrl.trim() || isLoadingUrl"
                @click="handleUrlSubmit"
              >
                {{ isLoadingUrl ? '...' : '使用' }}
              </button>
            </div>
          </section>

          <!-- 緩存狀態 -->
          <div class="cache-status">
            <span
              >已緩存 {{ cacheStatus.count }} / {{ cacheStatus.max }} 張</span
            >
            <button
              v-if="cacheStatus.count > 0"
              class="clear-btn"
              @click="clearAllCache"
            >
              清空
            </button>
          </div>

          <!-- 緩存圖片列表 -->
          <section class="cache-grid">
            <div
              v-for="image in sortedImages"
              :key="image.id"
              class="cache-item"
              @click="selectCachedImage(image)"
            >
              <img
                :src="image.thumbnail"
                :alt="image.fileName"
                class="cache-thumbnail"
              />
              <div class="cache-info">
                <span class="cache-name">{{ image.fileName }}</span>
                <span class="cache-size">{{
                  image.mimeType === 'image/url' ? '圖片連結' : formatFileSize(image.fileSize)
                }}</span>
              </div>
              <button
                class="delete-btn"
                title="刪除"
                @click="deleteCachedImage(image, $event)"
              >
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path
                    d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"
                  />
                </svg>
              </button>
            </div>

            <!-- 空狀態 -->
            <div v-if="sortedImages.length === 0" class="empty-state">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path
                  d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"
                />
              </svg>
              <p>還沒有緩存圖片</p>
              <p class="hint">上傳的圖片會自動緩存，方便下次使用</p>
            </div>
          </section>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style lang="scss" scoped>
.image-picker-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  padding: 16px;
}

.image-picker-modal {
  background: white;
  border-radius: 16px;
  width: 100%;
  max-width: 400px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.picker-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px;
  border-bottom: 1px solid #eee;
}

.picker-title {
  font-size: 18px;
  font-weight: 600;
  margin: 0;
  color: #333;
}

.close-btn {
  width: 32px;
  height: 32px;
  border: none;
  background: transparent;
  border-radius: 8px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.2s;

  svg {
    width: 20px;
    height: 20px;
    color: #666;
  }

  &:hover {
    background: #f5f5f5;
  }
}

.upload-section {
  padding: 16px;
  border-bottom: 1px solid #eee;
}

.upload-btn {
  width: 100%;
  padding: 12px;
  border: 2px dashed #ccc;
  border-radius: 12px;
  background: #fafafa;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  font-size: 14px;
  color: #666;
  transition: all 0.2s;

  svg {
    width: 20px;
    height: 20px;
  }

  &:hover:not(:disabled) {
    border-color: var(--color-primary, #7dd3a8);
    background: rgba(125, 211, 168, 0.1);
    color: var(--color-primary, #7dd3a8);
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
}

.hidden-input {
  display: none;
}

.error-message {
  margin: 8px 0 0;
  font-size: 13px;
  color: #ef4444;
  text-align: center;
}

.url-section {
  padding: 12px 16px;
  border-bottom: 1px solid #eee;
}

.url-input-row {
  display: flex;
  gap: 8px;
}

.url-input {
  flex: 1;
  padding: 8px 12px;
  border: 1px solid #ddd;
  border-radius: 8px;
  font-size: 13px;
  outline: none;
  transition: border-color 0.2s;

  &::placeholder {
    color: #aaa;
  }

  &:focus {
    border-color: var(--color-primary, #7dd3a8);
  }
}

.url-submit-btn {
  padding: 8px 14px;
  border: none;
  border-radius: 8px;
  background: var(--color-primary, #7dd3a8);
  color: white;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  white-space: nowrap;
  transition: opacity 0.2s;

  &:hover:not(:disabled) {
    opacity: 0.85;
  }

  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
}

.cache-status {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 16px;
  background: #f9fafb;
  font-size: 13px;
  color: #666;
}

.clear-btn {
  padding: 4px 8px;
  border: none;
  background: transparent;
  color: #ef4444;
  font-size: 12px;
  cursor: pointer;
  border-radius: 4px;
  transition: background 0.2s;

  &:hover {
    background: #ffebee;
  }
}

.cache-grid {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}

.cache-item {
  position: relative;
  aspect-ratio: 1;
  border-radius: 12px;
  overflow: hidden;
  cursor: pointer;
  background: #f5f5f5;
  transition:
    transform 0.2s,
    box-shadow 0.2s;

  &:hover {
    transform: scale(1.02);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);

    .cache-info {
      opacity: 1;
    }

    .delete-btn {
      opacity: 1;
    }
  }
}

.cache-thumbnail {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.cache-info {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 6px;
  background: linear-gradient(transparent, rgba(0, 0, 0, 0.7));
  opacity: 0;
  transition: opacity 0.2s;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.cache-name {
  font-size: 10px;
  color: white;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cache-size {
  font-size: 9px;
  color: rgba(255, 255, 255, 0.7);
}

.delete-btn {
  position: absolute;
  top: 4px;
  right: 4px;
  width: 24px;
  height: 24px;
  border: none;
  background: rgba(0, 0, 0, 0.5);
  border-radius: 50%;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition:
    opacity 0.2s,
    background 0.2s;

  svg {
    width: 14px;
    height: 14px;
    color: white;
  }

  &:hover {
    background: #ef4444;
  }
}

.empty-state {
  grid-column: 1 / -1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 32px 16px;
  color: #9ca3af;

  svg {
    width: 48px;
    height: 48px;
    margin-bottom: 12px;
    opacity: 0.5;
  }

  p {
    margin: 0;
    font-size: 14px;
  }

  .hint {
    margin-top: 4px;
    font-size: 12px;
    opacity: 0.7;
  }
}

// 動畫
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.fade-enter-active .image-picker-modal,
.fade-leave-active .image-picker-modal {
  transition: transform 0.2s ease;
}

.fade-enter-from .image-picker-modal,
.fade-leave-to .image-picker-modal {
  transform: scale(0.95);
}
</style>
