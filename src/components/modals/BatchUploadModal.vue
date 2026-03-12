<script setup lang="ts">
import { useStickerStore } from "@/stores";
import {
  compressImage,
  compressionPresets,
  formatFileSize,
} from "@/utils/imageCompression";
import { computed, ref } from "vue";

const emit = defineEmits<{
  (e: "close"): void;
  (e: "success", count: number): void;
}>();

const stickerStore = useStickerStore();

// 基本設置
const selectedCategory = ref(stickerStore.customCategories[0]?.id || "");
const uploadMode = ref<"url" | "txtfile" | "file">("url");
const autoNaming = ref(true);
const namePrefix = ref("");

// URL 模式
const urlList = ref("");
const urlNames = ref<string[]>([]);

// 解析 URL 列表
const parsedUrls = computed(() => {
  const lines = urlList.value.split("\n").map((line) => line.trim());
  const urls: string[] = [];
  const names: string[] = [];

  for (const line of lines) {
    if (!line || line.startsWith("#")) continue;

    // 檢查 "名稱|URL" 格式
    if (line.includes("|")) {
      const parts = line.split("|");
      if (parts.length === 2) {
        const name = parts[0].trim();
        const url = parts[1].trim();
        if ((url.startsWith("http://") || url.startsWith("https://")) && name) {
          urls.push(url);
          names.push(name);
          continue;
        }
      }
    }

    // 純 URL 格式
    if (line.startsWith("http://") || line.startsWith("https://")) {
      urls.push(line);
      names.push("");
    }
  }

  urlNames.value = names;
  return urls;
});

// 文本文件模式
interface TxtSticker {
  name: string;
  url: string;
}
const parsedTxtStickers = ref<TxtSticker[]>([]);
const txtFileInput = ref<HTMLInputElement>();

// 文件模式
interface FileWithPreview {
  file: File;
  name: string;
  preview: string;
  base64?: string;
}
const selectedFiles = ref<FileWithPreview[]>([]);
const fileNames = ref<string[]>([]);
const isDragging = ref(false);
const fileInput = ref<HTMLInputElement>();

const customCategories = computed(() => stickerStore.customCategories);

const totalCount = computed(() => {
  if (uploadMode.value === "url") return parsedUrls.value.length;
  if (uploadMode.value === "txtfile") return parsedTxtStickers.value.length;
  return selectedFiles.value.length;
});

const canSubmit = computed(() => {
  return selectedCategory.value && totalCount.value > 0;
});

// URL 模式方法
function removeUrl(index: number) {
  const lines = urlList.value.split("\n");
  const urls = parsedUrls.value;
  const urlToRemove = urls[index];
  const lineIndex = lines.findIndex((line) => line.trim() === urlToRemove);
  if (lineIndex !== -1) {
    lines.splice(lineIndex, 1);
    urlList.value = lines.join("\n");
  }
}

function handleImageError(event: Event) {
  const img = event.target as HTMLImageElement;
  if (!img.dataset.proxyAttempted) {
    img.dataset.proxyAttempted = "true";
    // 使用自己的 Cloudflare Worker 代理
    img.src = `https://nai-proxy.aguacloud.uk/image-proxy?url=${encodeURIComponent(img.src)}`;
  }
}

// 文件模式方法
function triggerFileInput() {
  fileInput.value?.click();
}

async function handleFileSelect(event: Event) {
  const input = event.target as HTMLInputElement;
  if (input.files) {
    await processFiles(Array.from(input.files));
  }
}

async function handleDrop(event: DragEvent) {
  isDragging.value = false;
  if (event.dataTransfer?.files) {
    await processFiles(Array.from(event.dataTransfer.files));
  }
}

async function processFiles(files: File[]) {
  const imageFiles = files.filter((file) => file.type.startsWith("image/"));

  for (const file of imageFiles) {
    const originalSize = file.size;
    const compressedDataUrl = await compressImage(
      file,
      compressionPresets.sticker,
    );

    const base64Data = compressedDataUrl.split(",")[1] || "";
    const compressedSize = Math.round((base64Data.length * 3) / 4);

    if (originalSize > compressedSize + 5000) {
      const savedPercent = Math.round(
        (1 - compressedSize / originalSize) * 100,
      );
      console.log(
        `📸 表情包壓縮: ${file.name} ${formatFileSize(originalSize)} → ${formatFileSize(compressedSize)} (節省 ${savedPercent}%)`,
      );
    }

    const index = selectedFiles.value.length;
    selectedFiles.value.push({
      file,
      name: file.name,
      preview: compressedDataUrl,
      base64: compressedDataUrl,
    });
    fileNames.value[index] = file.name.replace(/\.[^/.]+$/, "");
  }
}

function removeFile(index: number) {
  selectedFiles.value.splice(index, 1);
  fileNames.value.splice(index, 1);
}

// 文本文件模式方法
function triggerTxtFileInput() {
  txtFileInput.value?.click();
}

async function handleTxtFileSelect(event: Event) {
  const input = event.target as HTMLInputElement;
  if (input.files && input.files[0]) {
    await parseTxtFile(input.files[0]);
  }
}

async function handleTxtDrop(event: DragEvent) {
  isDragging.value = false;
  if (event.dataTransfer?.files && event.dataTransfer.files[0]) {
    await parseTxtFile(event.dataTransfer.files[0]);
  }
}

async function parseTxtFile(file: File) {
  try {
    const text = await file.text();
    const lines = text.split("\n");
    const stickers: TxtSticker[] = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;

      const parts = trimmed.split("|");
      if (parts.length === 2) {
        const name = parts[0].trim();
        const url = parts[1].trim();
        if ((url.startsWith("http://") || url.startsWith("https://")) && name) {
          stickers.push({ name, url });
        }
      }
    }

    if (stickers.length > 0) {
      parsedTxtStickers.value = stickers;
    } else {
      alert("未找到有效的表情包數據，請檢查文件格式");
    }
  } catch (error) {
    console.error("解析文本文件失敗:", error);
    alert("解析文件失敗，請確保文件格式正確");
  }
}

function removeTxtSticker(index: number) {
  parsedTxtStickers.value.splice(index, 1);
}

// 批量上傳
async function handleBatchUpload() {
  if (!canSubmit.value) return;

  let addedCount = 0;

  if (uploadMode.value === "url") {
    for (let index = 0; index < parsedUrls.value.length; index++) {
      const url = parsedUrls.value[index];
      let name = urlNames.value[index]?.trim() || "";
      if (!name) {
        name = autoNaming.value
          ? `表情${index + 1}`
          : `${namePrefix.value}${index + 1}`;
      }

      await stickerStore.addSticker(selectedCategory.value, {
        url,
        name,
        keywords: [name],
      });
      addedCount++;
    }
  } else if (uploadMode.value === "txtfile") {
    for (const sticker of parsedTxtStickers.value) {
      await stickerStore.addSticker(selectedCategory.value, {
        url: sticker.url,
        name: sticker.name,
        keywords: [sticker.name],
      });
      addedCount++;
    }
  } else {
    for (let index = 0; index < selectedFiles.value.length; index++) {
      const fileItem = selectedFiles.value[index];
      let name = fileNames.value[index]?.trim() || "";
      if (!name) {
        name = autoNaming.value
          ? fileItem.name.replace(/\.[^/.]+$/, "")
          : `${namePrefix.value}${index + 1}`;
      }

      await stickerStore.addSticker(selectedCategory.value, {
        url: fileItem.base64!,
        name,
        keywords: [],
      });
      addedCount++;
    }
  }

  emit("success", addedCount);
  emit("close");
}
</script>

<template>
  <div class="modal-overlay" @click.self="$emit('close')">
    <div class="modal-content">
      <div class="modal-header">
        <h3>批量添加表情</h3>
        <button class="close-btn" @click="$emit('close')">×</button>
      </div>

      <div class="modal-body">
        <!-- 選擇分類 -->
        <div class="form-group">
          <label>目標分類</label>
          <select v-model="selectedCategory" class="form-control">
            <option
              v-for="cat in customCategories"
              :key="cat.id"
              :value="cat.id"
            >
              {{ cat.name }}
            </option>
          </select>
        </div>

        <!-- 上傳方式切換 -->
        <div class="upload-tabs">
          <button
            :class="['tab', { active: uploadMode === 'url' }]"
            @click="uploadMode = 'url'"
          >
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path
                d="M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z"
              />
            </svg>
            URL 批量導入
          </button>
          <button
            :class="['tab', { active: uploadMode === 'txtfile' }]"
            @click="uploadMode = 'txtfile'"
          >
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path
                d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"
              />
            </svg>
            文本文件導入
          </button>
          <button
            :class="['tab', { active: uploadMode === 'file' }]"
            @click="uploadMode = 'file'"
          >
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path
                d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM14 13v4h-4v-4H7l5-5 5 5h-3z"
              />
            </svg>
            本地圖片上傳
          </button>
        </div>

        <!-- URL 批量導入模式 -->
        <div v-if="uploadMode === 'url'" class="upload-section">
          <label>圖片連結（每行一個）</label>
          <textarea
            v-model="urlList"
            class="form-control textarea"
            placeholder="可愛貓咪|https://example.com/cat.jpg&#10;https://example.com/image2.jpg&#10;開心表情|https://example.com/happy.png"
            rows="6"
          />
          <p class="hint">
            支持兩種格式：純 URL 或 表情包名|URL（# 開頭為註釋）
          </p>

          <!-- URL 預覽 -->
          <div v-if="parsedUrls.length > 0" class="preview-section">
            <div class="preview-header">
              <span>預覽 ({{ parsedUrls.length }} 張)</span>
              <button class="btn-small" @click="urlList = ''">清空</button>
            </div>
            <div class="preview-grid">
              <div
                v-for="(url, index) in parsedUrls"
                :key="index"
                class="preview-item"
              >
                <img :src="url" @error="handleImageError" />
                <input
                  v-model="urlNames[index]"
                  type="text"
                  class="sticker-name-input"
                  :placeholder="`表情 ${index + 1}`"
                  @click.stop
                />
                <button class="remove-btn" @click="removeUrl(index)">×</button>
              </div>
            </div>
          </div>
        </div>

        <!-- 文本文件導入模式 -->
        <div v-else-if="uploadMode === 'txtfile'" class="upload-section">
          <label>上傳預設表情包配置文件</label>
          <div class="format-info">
            <p><strong>支持的格式：</strong></p>
            <pre>
表情包名|圖片連結
可愛貓咪|https://example.com/cat.jpg</pre
            >
            <p class="hint"># 開頭的行為註釋，空行會被忽略</p>
          </div>

          <div
            class="drop-zone"
            :class="{ 'drag-over': isDragging }"
            @drop.prevent="handleTxtDrop"
            @dragover.prevent="isDragging = true"
            @dragleave.prevent="isDragging = false"
            @click="triggerTxtFileInput"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" class="drop-icon">
              <path
                d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"
              />
            </svg>
            <div class="drop-text">點擊選擇 .txt 文件或拖放到這裡</div>
          </div>

          <input
            ref="txtFileInput"
            type="file"
            accept=".txt,text/plain"
            style="display: none"
            @change="handleTxtFileSelect"
          />

          <!-- 解析結果預覽 -->
          <div v-if="parsedTxtStickers.length > 0" class="preview-section">
            <div class="preview-header">
              <span>解析成功 ({{ parsedTxtStickers.length }} 張)</span>
              <button class="btn-small" @click="parsedTxtStickers = []">
                清空
              </button>
            </div>
            <div class="preview-grid">
              <div
                v-for="(sticker, index) in parsedTxtStickers"
                :key="index"
                class="preview-item"
              >
                <img :src="sticker.url" @error="handleImageError" />
                <input
                  v-model="sticker.name"
                  type="text"
                  class="sticker-name-input"
                  :placeholder="`表情 ${index + 1}`"
                  @click.stop
                />
                <button class="remove-btn" @click="removeTxtSticker(index)">
                  ×
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- 本地文件上傳模式 -->
        <div v-else class="upload-section">
          <div
            class="drop-zone"
            :class="{ 'drag-over': isDragging }"
            @drop.prevent="handleDrop"
            @dragover.prevent="isDragging = true"
            @dragleave.prevent="isDragging = false"
            @click="triggerFileInput"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" class="drop-icon">
              <path
                d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM14 13v4h-4v-4H7l5-5 5 5h-3z"
              />
            </svg>
            <div class="drop-text">點擊選擇文件或拖放到這裡</div>
            <div class="drop-hint">支持 JPG、PNG、GIF、WebP</div>
          </div>

          <input
            ref="fileInput"
            type="file"
            accept="image/*"
            multiple
            style="display: none"
            @change="handleFileSelect"
          />

          <!-- 文件預覽 -->
          <div v-if="selectedFiles.length > 0" class="preview-section">
            <div class="preview-header">
              <span>已選擇 {{ selectedFiles.length }} 個文件</span>
              <button class="btn-small" @click="selectedFiles = []">
                清空
              </button>
            </div>
            <div class="preview-grid">
              <div
                v-for="(file, index) in selectedFiles"
                :key="index"
                class="preview-item"
              >
                <img :src="file.preview" />
                <input
                  v-model="fileNames[index]"
                  type="text"
                  class="sticker-name-input"
                  :placeholder="file.name"
                  @click.stop
                />
                <button class="remove-btn" @click="removeFile(index)">×</button>
              </div>
            </div>
          </div>

          <p class="hint">注意：圖片會轉換為 Base64 格式存儲在瀏覽器中</p>
        </div>

        <!-- 自動命名選項 -->
        <div class="form-group">
          <label class="checkbox-label">
            <input v-model="autoNaming" type="checkbox" />
            自動命名（表情1、表情2...）
          </label>
        </div>

        <div v-if="!autoNaming" class="form-group">
          <label>統一前綴</label>
          <input
            v-model="namePrefix"
            type="text"
            class="form-control"
            placeholder="例如：可愛_"
          />
        </div>
      </div>

      <div class="modal-footer">
        <button class="btn btn-secondary" @click="$emit('close')">取消</button>
        <button
          class="btn btn-primary"
          :disabled="!canSubmit"
          @click="handleBatchUpload"
        >
          批量添加 ({{ totalCount }})
        </button>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
  padding: 20px;
}

.modal-content {
  background: var(--color-surface, white);
  border-radius: 16px;
  width: 100%;
  max-width: 560px;
  max-height: 85vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.modal-header {
  padding: 16px 20px;
  border-bottom: 1px solid var(--color-border, #e0e0e0);
  display: flex;
  justify-content: space-between;
  align-items: center;

  h3 {
    margin: 0;
    font-size: 18px;
    font-weight: 600;
    color: var(--color-text, #333);
  }
}

.close-btn {
  background: none;
  border: none;
  font-size: 28px;
  color: var(--color-text-secondary, #666);
  cursor: pointer;
  line-height: 1;
  padding: 0;
  width: 32px;
  height: 32px;

  &:hover {
    color: var(--color-text, #000);
  }
}

.modal-body {
  padding: 20px;
  overflow-y: auto;
  flex: 1;
}

.form-group {
  margin-bottom: 16px;

  label {
    display: block;
    font-size: 14px;
    font-weight: 500;
    color: var(--color-text, #333);
    margin-bottom: 8px;
  }
}

.form-control {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--color-border, #d0d0d0);
  border-radius: 8px;
  font-size: 14px;
  outline: none;
  background: var(--color-background, white);
  color: var(--color-text, #333);

  &:focus {
    border-color: var(--color-primary, #007bff);
  }
}

.textarea {
  font-family: "Consolas", "Monaco", monospace;
  font-size: 13px;
  resize: vertical;
  min-height: 100px;
}

.upload-tabs {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
  flex-wrap: wrap;

  .tab {
    flex: 1;
    min-width: 120px;
    padding: 10px 12px;
    border: 1px solid var(--color-border, #d0d0d0);
    background: var(--color-surface, white);
    border-radius: 8px;
    font-size: 13px;
    cursor: pointer;
    transition: all 0.2s;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    color: var(--color-text, #333);

    svg {
      width: 16px;
      height: 16px;
      flex-shrink: 0;
    }

    &:hover {
      background: var(--color-background, #f5f5f5);
    }

    &.active {
      background: var(--color-primary, #007bff);
      color: white;
      border-color: var(--color-primary, #007bff);
    }
  }
}

.upload-section {
  margin-bottom: 16px;

  label {
    display: block;
    font-size: 14px;
    font-weight: 500;
    color: var(--color-text, #333);
    margin-bottom: 8px;
  }
}

.format-info {
  background: var(--color-background, #f8f9fa);
  border: 1px solid var(--color-border, #dee2e6);
  border-radius: 8px;
  padding: 12px 16px;
  margin-bottom: 12px;

  p {
    margin: 4px 0;
    font-size: 13px;
    color: var(--color-text-secondary, #495057);
  }

  pre {
    background: var(--color-surface, white);
    border: 1px solid var(--color-border, #dee2e6);
    border-radius: 4px;
    padding: 8px 12px;
    font-size: 12px;
    font-family: "Consolas", "Monaco", monospace;
    margin: 8px 0;
    overflow-x: auto;
    color: var(--color-text, #212529);
  }
}

.drop-zone {
  border: 2px dashed var(--color-border, #d0d0d0);
  border-radius: 12px;
  padding: 32px 20px;
  text-align: center;
  cursor: pointer;
  transition: all 0.3s;

  &:hover,
  &.drag-over {
    border-color: var(--color-primary, #007bff);
    background: var(--color-primary-light, #f0f8ff);
  }
}

.drop-icon {
  width: 48px;
  height: 48px;
  margin-bottom: 12px;
  color: var(--color-text-secondary, #666);
}

.drop-text {
  font-size: 15px;
  font-weight: 500;
  color: var(--color-text, #333);
  margin-bottom: 4px;
}

.drop-hint {
  font-size: 13px;
  color: var(--color-text-secondary, #666);
}

.preview-section {
  margin-top: 16px;
}

.preview-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  font-size: 14px;
  font-weight: 500;
  color: var(--color-text, #333);
}

.btn-small {
  padding: 6px 12px;
  border: 1px solid var(--color-border, #d0d0d0);
  background: var(--color-surface, white);
  border-radius: 6px;
  font-size: 13px;
  cursor: pointer;
  color: var(--color-text, #333);

  &:hover {
    background: var(--color-background, #f5f5f5);
  }
}

.preview-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(90px, 1fr));
  gap: 10px;
  max-height: 200px;
  overflow-y: auto;
  padding: 4px;
}

.preview-item {
  position: relative;
  aspect-ratio: 1;
  border: 1px solid var(--color-border, #e0e0e0);
  border-radius: 8px;
  overflow: hidden;
  background: var(--color-background, #f5f5f5);

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .sticker-name-input {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    width: 100%;
    padding: 4px 6px;
    border: none;
    border-top: 1px solid var(--color-border, #e0e0e0);
    background: rgba(255, 255, 255, 0.95);
    font-size: 11px;
    text-align: center;
    outline: none;

    &:focus {
      background: white;
      border-top-color: var(--color-primary, #007bff);
    }
  }

  .remove-btn {
    position: absolute;
    top: 4px;
    right: 4px;
    width: 22px;
    height: 22px;
    border-radius: 50%;
    border: none;
    background: rgba(255, 0, 0, 0.8);
    color: white;
    font-size: 14px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0;
    transition: opacity 0.2s;
  }

  &:hover .remove-btn {
    opacity: 1;
  }
}

.hint {
  font-size: 13px;
  color: var(--color-text-secondary, #666);
  margin-top: 8px;
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  font-weight: normal;

  input[type="checkbox"] {
    width: 18px;
    height: 18px;
    cursor: pointer;
  }
}

.modal-footer {
  padding: 16px 20px;
  border-top: 1px solid var(--color-border, #e0e0e0);
  display: flex;
  gap: 12px;
  justify-content: flex-end;
}

.btn {
  padding: 10px 20px;
  border: none;
  border-radius: 8px;
  font-size: 15px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}

.btn-secondary {
  background: var(--color-background, #f0f0f0);
  color: var(--color-text, #333);

  &:hover:not(:disabled) {
    background: var(--color-surface-hover, #e0e0e0);
  }
}

.btn-primary {
  background: var(--color-primary, #007bff);
  color: white;

  &:hover:not(:disabled) {
    filter: brightness(0.9);
  }
}
</style>
