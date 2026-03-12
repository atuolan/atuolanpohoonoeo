<template>
  <teleport to="body">
    <transition name="drawer">
      <div v-if="visible" class="media-drawer-overlay" @click="handleClose">
        <div class="media-drawer" @click.stop>
          <div class="drawer-header">
            <h3>發送媒體</h3>
            <button class="close-btn" @click="handleClose">✕</button>
          </div>

          <div class="drawer-content">
            <!-- 描述型图片 -->
            <div class="media-option" @click="selectOption('descriptive-image')">
              <div class="option-icon">
                <Image :size="24" />
              </div>
              <div class="option-content">
                <h4>描述型圖片</h4>
                <p>用文字描述一張虛擬的照片</p>
              </div>
              <ChevronRight :size="20" />
            </div>

            <!-- 描述型影片 -->
            <div class="media-option" @click="selectOption('descriptive-video')">
              <div class="option-icon">
                <Video :size="24" />
              </div>
              <div class="option-content">
                <h4>描述型影片</h4>
                <p>用文字描述一段虛擬的影片</p>
              </div>
              <ChevronRight :size="20" />
            </div>

            <!-- 真实照片 -->
            <div class="media-option" @click="selectOption('real-image')">
              <div class="option-icon real">
                <Camera :size="24" />
              </div>
              <div class="option-content">
                <h4>上傳照片</h4>
                <p>上傳真實的照片，AI 可以識別圖片內容</p>
              </div>
              <ChevronRight :size="20" />
            </div>

            <!-- 图片链接 -->
            <div class="media-option" @click="selectOption('image-url')">
              <div class="option-icon url">
                <Link :size="24" />
              </div>
              <div class="option-content">
                <h4>圖片連結</h4>
                <p>使用圖片URL連結，節省儲存空間</p>
              </div>
              <ChevronRight :size="20" />
            </div>

            <!-- AI 文生圖 -->
            <div 
              v-if="novelAIEnabled" 
              class="media-option" 
              @click="selectOption('ai-generate')"
            >
              <div class="option-icon ai">
                <Sparkles :size="24" />
              </div>
              <div class="option-content">
                <h4>AI 文生圖</h4>
                <p>使用 NovelAI 生成圖片</p>
              </div>
              <ChevronRight :size="20" />
            </div>
          </div>
        </div>
      </div>
    </transition>

    <!-- 隱藏的文件輸入 -->
    <input
      ref="fileInputRef"
      type="file"
      accept="image/*"
      style="display: none"
      @change="handleFileSelect"
    />

    <!-- 描述型内容输入框 -->
    <transition name="modal">
      <div v-if="showDescriptionModal" class="description-modal-overlay" @click="closeDescriptionModal">
        <div class="description-modal" @click.stop>
          <div class="modal-header">
            <h3>{{ modalTitle }}</h3>
            <button class="close-btn" @click="closeDescriptionModal">✕</button>
          </div>

          <div class="modal-content">
            <textarea
              v-model="descriptionText"
              :placeholder="modalPlaceholder"
              class="description-input"
              rows="6"
            ></textarea>

            <div class="modal-tips">
              <Lightbulb :size="16" />
              <span>{{ modalTip }}</span>
            </div>
          </div>

          <div class="modal-footer">
            <button class="btn-cancel" @click="closeDescriptionModal">取消</button>
            <button class="btn-confirm" :disabled="!descriptionText.trim()" @click="confirmDescription">確定</button>
          </div>
        </div>
      </div>
    </transition>

    <!-- 图片URL输入框 -->
    <transition name="modal">
      <div v-if="showUrlModal" class="description-modal-overlay" @click="closeUrlModal">
        <div class="description-modal" @click.stop>
          <div class="modal-header">
            <h3>圖片連結</h3>
            <button class="close-btn" @click="closeUrlModal">✕</button>
          </div>

          <div class="modal-content">
            <div class="input-group">
              <label class="input-label">圖片連結</label>
              <input
                v-model="imageUrl"
                type="url"
                placeholder="請輸入圖片URL...例如：https://example.com/image.jpg"
                class="url-input"
              />
            </div>

            <!-- 图片预览 -->
            <div v-if="isValidUrl" class="image-preview">
              <img :src="imageUrl" @error="handleImageError" @load="handleImageLoad" alt="圖片預覽" />
              <div v-if="imageLoadError" class="preview-error">
                <AlertCircle :size="16" />
                <span>無法載入圖片，請檢查URL是否正確</span>
              </div>
            </div>

            <div class="input-group">
              <label class="input-label">圖片說明（可選）</label>
              <textarea
                v-model="imageCaption"
                placeholder="為圖片添加說明文字..."
                class="caption-input"
                rows="2"
              ></textarea>
            </div>

            <div class="modal-tips">
              <Lightbulb :size="16" />
              <span>使用圖片連結可以大幅減少數據佔用空間</span>
            </div>
          </div>

          <div class="modal-footer">
            <button class="btn-cancel" @click="closeUrlModal">取消</button>
            <button class="btn-confirm" :disabled="!imageUrl.trim() || imageLoadError" @click="confirmUrl">確定</button>
          </div>
        </div>
      </div>
    </transition>

    <!-- 真實圖片上傳預覽 -->
    <transition name="modal">
      <div v-if="showImagePreviewModal" class="description-modal-overlay" @click="closeImagePreview">
        <div class="description-modal image-preview-modal" @click.stop>
          <div class="modal-header">
            <h3>上傳照片</h3>
            <button class="close-btn" @click="closeImagePreview">✕</button>
          </div>

          <div class="modal-content">
            <!-- 圖片預覽 -->
            <div v-if="previewImageUrl" class="upload-preview">
              <img :src="previewImageUrl" alt="預覽" />
              <div v-if="compressionStats" class="compression-info">
                <span class="size-info">
                  {{ formatFileSize(compressionStats.originalSize) }} → {{ formatFileSize(compressionStats.compressedSize) }}
                </span>
                <span v-if="compressionStats.compressionRatio > 0" class="ratio-info">
                  節省 {{ compressionStats.compressionRatio }}%
                </span>
              </div>
            </div>

            <!-- 載入中 -->
            <div v-if="isCompressing" class="loading-state">
              <div class="spinner"></div>
              <span>正在壓縮圖片...</span>
            </div>

            <div class="input-group">
              <label class="input-label">圖片說明（可選）</label>
              <textarea
                v-model="uploadCaption"
                placeholder="為圖片添加說明文字，AI 會看到這段說明..."
                class="caption-input"
                rows="2"
              ></textarea>
            </div>

            <div class="modal-tips">
              <Lightbulb :size="16" />
              <span>AI 會識別圖片內容並根據說明進行回覆</span>
            </div>
          </div>

          <div class="modal-footer">
            <button class="btn-cancel" @click="closeImagePreview">取消</button>
            <button class="btn-confirm" :disabled="!previewImageUrl || isCompressing" @click="confirmImageUpload">發送</button>
          </div>
        </div>
      </div>
    </transition>

    <!-- AI 文生圖模態框 -->
    <transition name="modal">
      <div v-if="showAIGenerateModal" class="description-modal-overlay" @click="closeAIGenerateModal">
        <div class="description-modal" @click.stop>
          <div class="modal-header">
            <h3>AI 文生圖</h3>
            <button class="close-btn" @click="closeAIGenerateModal">✕</button>
          </div>

          <div class="modal-content">
            <textarea
              v-model="aiPrompt"
              placeholder="描述你想要生成的圖片...&#10;&#10;例如：1girl, long hair, blue eyes, school uniform, sitting by window, soft lighting, detailed background"
              class="description-input"
              rows="6"
            ></textarea>

            <div class="modal-tips">
              <Lightbulb :size="16" />
              <span>使用英文標籤效果更好，用逗號分隔不同元素</span>
            </div>
          </div>

          <div class="modal-footer">
            <button class="btn-cancel" @click="closeAIGenerateModal">取消</button>
            <button class="btn-confirm" :disabled="!aiPrompt.trim()" @click="confirmAIGenerate">生成</button>
          </div>
        </div>
      </div>
    </transition>
  </teleport>
</template>

<script setup lang="ts">
import { compressImageWithStats, compressionPresets, formatFileSize } from '@/utils/imageCompression';
import { AlertCircle, Camera, ChevronRight, Image, Lightbulb, Link, Sparkles, Video } from 'lucide-vue-next';
import { computed, ref } from 'vue';

export type MediaType = 'descriptive-image' | 'descriptive-video' | 'real-image' | 'image-url' | 'ai-generate';

export interface ImageData {
  dataUrl: string;
  base64: string;
  mimeType: string;
  caption?: string;
}

defineProps<{
  visible: boolean;
  novelAIEnabled?: boolean;
}>();

const emit = defineEmits<{
  close: [];
  select: [type: MediaType, content?: string, caption?: string];
  imageUpload: [imageData: ImageData];
  aiGenerate: [prompt: string];
}>();

// 文件輸入引用
const fileInputRef = ref<HTMLInputElement | null>(null);

// 描述型模態框
const showDescriptionModal = ref(false);
const selectedType = ref<'descriptive-image' | 'descriptive-video' | null>(null);
const descriptionText = ref('');

// URL 模態框
const showUrlModal = ref(false);
const imageUrl = ref('');
const imageCaption = ref('');
const imageLoadError = ref(false);

// AI 文生圖模態框
const showAIGenerateModal = ref(false);
const aiPrompt = ref('');

// 真實圖片上傳
const showImagePreviewModal = ref(false);
const previewImageUrl = ref<string | null>(null);
const uploadCaption = ref('');
const isCompressing = ref(false);
const compressionStats = ref<{
  originalSize: number;
  compressedSize: number;
  compressionRatio: number;
} | null>(null);
const uploadedImageData = ref<ImageData | null>(null);

const modalTitle = computed(() => {
  if (selectedType.value === 'descriptive-image') return '描述圖片內容';
  if (selectedType.value === 'descriptive-video') return '描述影片內容';
  return '';
});

const modalPlaceholder = computed(() => {
  if (selectedType.value === 'descriptive-image') {
    return '請描述這張照片的內容...\n\n例如：一張在海邊拍攝的日落照片，天空呈現出橙紅色的漸層，海浪輕柔地拍打著沙灘。';
  }
  if (selectedType.value === 'descriptive-video') {
    return '請描述這段影片的內容...\n\n例如：一段在咖啡廳拍攝的短影片，鏡頭從拿鐵咖啡的拉花開始，緩慢移動到窗外的街景。';
  }
  return '';
});

const modalTip = computed(() => {
  if (selectedType.value === 'descriptive-image') {
    return '描述得越詳細，對方越能想像這張照片的樣子';
  }
  if (selectedType.value === 'descriptive-video') {
    return '可以描述影片的畫面、聲音、時長等細節';
  }
  return '';
});

const handleClose = () => {
  emit('close');
};

const selectOption = (type: MediaType) => {
  if (type === 'real-image') {
    // 觸發文件選擇
    fileInputRef.value?.click();
  } else if (type === 'image-url') {
    showUrlModal.value = true;
  } else if (type === 'ai-generate') {
    showAIGenerateModal.value = true;
  } else {
    selectedType.value = type;
    showDescriptionModal.value = true;
  }
};

// 處理文件選擇
async function handleFileSelect(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;

  // 重置輸入
  input.value = '';

  // 檢查文件類型
  if (!file.type.startsWith('image/')) {
    alert('請選擇圖片文件');
    return;
  }

  // 顯示預覽模態框
  showImagePreviewModal.value = true;
  isCompressing.value = true;
  compressionStats.value = null;
  previewImageUrl.value = null;
  uploadedImageData.value = null;

  try {
    // 壓縮圖片
    const result = await compressImageWithStats(file, compressionPresets.vision);
    
    previewImageUrl.value = result.dataUrl;
    compressionStats.value = {
      originalSize: result.originalSize,
      compressedSize: result.compressedSize,
      compressionRatio: result.compressionRatio,
    };
    uploadedImageData.value = {
      dataUrl: result.dataUrl,
      base64: result.base64,
      mimeType: result.mimeType,
    };
  } catch (error) {
    console.error('圖片壓縮失敗:', error);
    alert('圖片處理失敗，請重試');
    closeImagePreview();
  } finally {
    isCompressing.value = false;
  }
}

// 關閉圖片預覽
function closeImagePreview() {
  showImagePreviewModal.value = false;
  previewImageUrl.value = null;
  uploadCaption.value = '';
  compressionStats.value = null;
  uploadedImageData.value = null;
}

// 確認上傳圖片
function confirmImageUpload() {
  if (!uploadedImageData.value) return;

  emit('imageUpload', {
    ...uploadedImageData.value,
    caption: uploadCaption.value.trim() || undefined,
  });
  
  closeImagePreview();
  emit('close');
}

const closeDescriptionModal = () => {
  showDescriptionModal.value = false;
  descriptionText.value = '';
  selectedType.value = null;
};

const confirmDescription = () => {
  if (selectedType.value && descriptionText.value.trim()) {
    emit('select', selectedType.value, descriptionText.value.trim());
    closeDescriptionModal();
    emit('close');
  }
};

const isValidUrl = computed(() => {
  try {
    if (!imageUrl.value.trim()) return false;
    const url = new URL(imageUrl.value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
});

const closeUrlModal = () => {
  showUrlModal.value = false;
  imageUrl.value = '';
  imageCaption.value = '';
  imageLoadError.value = false;
};

const confirmUrl = () => {
  if (imageUrl.value.trim() && !imageLoadError.value) {
    emit('select', 'image-url', imageUrl.value.trim(), imageCaption.value.trim());
    closeUrlModal();
    emit('close');
  }
};

const handleImageError = () => {
  imageLoadError.value = true;
};

const handleImageLoad = () => {
  imageLoadError.value = false;
};

// AI 文生圖相關
const closeAIGenerateModal = () => {
  showAIGenerateModal.value = false;
  aiPrompt.value = '';
};

const confirmAIGenerate = () => {
  if (aiPrompt.value.trim()) {
    emit('aiGenerate', aiPrompt.value.trim());
    closeAIGenerateModal();
    emit('close');
  }
};

// formatFileSize 已在頂層定義，自動暴露給模板使用
</script>


<style scoped lang="scss">
.media-drawer-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: flex-end;
  z-index: 10000;
  backdrop-filter: blur(4px);
}

.media-drawer {
  background: white;
  border-radius: 20px 20px 0 0;
  width: 100%;
  max-height: 60vh;
  display: flex;
  flex-direction: column;
  animation: slideUp 0.2s ease-out;
}

.drawer-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.08);

  h3 {
    margin: 0;
    font-size: 18px;
    font-weight: 600;
    color: #1f2937;
  }

  .close-btn {
    width: 32px;
    height: 32px;
    border: none;
    background: #f3f4f6;
    border-radius: 50%;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 18px;
    color: #6b7280;
    transition: transform 0.2s;

    &:active {
      transform: scale(0.95);
    }
  }
}

.drawer-content {
  flex: 1;
  overflow-y: auto;
  padding: 10px 0;
  
  &::-webkit-scrollbar {
    width: 6px;
  }
  
  &::-webkit-scrollbar-thumb {
    background: rgba(0, 0, 0, 0.15);
    border-radius: 3px;
  }
}

.media-option {
  display: flex;
  align-items: center;
  padding: 16px 20px;
  cursor: pointer;
  transition: background 0.2s;
  gap: 16px;

  &:active {
    background: #f5f5f5;
  }

  .option-icon {
    width: 48px;
    height: 48px;
    border-radius: 12px;
    background: #7dd3a8;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    color: white;

    &.real {
      background: #ff6b6b;
    }

    &.url {
      background: #10b981;
    }

    &.ai {
      background: linear-gradient(135deg, #a78bfa, #8b5cf6);
    }
  }

  .option-content {
    flex: 1;

    h4 {
      margin: 0 0 4px 0;
      font-size: 16px;
      font-weight: 600;
      color: #1f2937;
    }

    p {
      margin: 0;
      font-size: 13px;
      color: #9ca3af;
    }
  }
}

.description-modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100dvh;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10001;
  backdrop-filter: blur(4px);
  padding: 20px;
}

.description-modal {
  background: white;
  border-radius: 20px;
  width: 100%;
  max-width: 500px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.15);
  animation: modalSlideIn 0.2s ease-out;

  &.image-preview-modal {
    max-width: 400px;
  }
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.08);

  h3 {
    margin: 0;
    font-size: 18px;
    font-weight: 600;
    color: #1f2937;
  }

  .close-btn {
    width: 32px;
    height: 32px;
    border: none;
    background: #f3f4f6;
    border-radius: 50%;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 18px;
    color: #6b7280;
    transition: transform 0.2s;

    &:active {
      transform: scale(0.95);
    }
  }
}

.modal-content {
  flex: 1;
  padding: 20px;
  overflow-y: auto;

  .description-input {
    width: 100%;
    padding: 12px;
    border: 2px solid #e5e7eb;
    border-radius: 12px;
    font-size: 15px;
    font-family: inherit;
    resize: vertical;
    min-height: 120px;
    transition: border-color 0.2s;

    &:focus {
      outline: none;
      border-color: #7dd3a8;
    }

    &::placeholder {
      color: #9ca3af;
    }
  }

  .modal-tips {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    margin-top: 12px;
    padding: 12px;
    background: #f9fafb;
    border-radius: 8px;
    font-size: 13px;
    color: #6b7280;
  }

  .input-group {
    margin-bottom: 16px;

    .input-label {
      display: block;
      margin-bottom: 8px;
      font-size: 14px;
      font-weight: 600;
      color: #374151;
    }
  }

  .url-input,
  .caption-input {
    width: 100%;
    padding: 12px;
    border: 2px solid #e5e7eb;
    border-radius: 12px;
    font-size: 15px;
    font-family: inherit;
    transition: border-color 0.2s;

    &:focus {
      outline: none;
      border-color: #7dd3a8;
    }

    &::placeholder {
      color: #9ca3af;
    }
  }

  .caption-input {
    resize: vertical;
    min-height: 60px;
  }

  .image-preview {
    margin-bottom: 16px;
    border-radius: 12px;
    overflow: hidden;
    border: 2px solid #e5e7eb;
    position: relative;

    img {
      width: 100%;
      max-height: 200px;
      object-fit: contain;
      display: block;
      background: #f9fafb;
    }

    .preview-error {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 20px;
      background: #fee;
      color: #c00;
      font-size: 13px;
    }
  }

  .upload-preview {
    margin-bottom: 16px;
    border-radius: 12px;
    overflow: hidden;
    border: 2px solid #e5e7eb;
    background: #f9fafb;

    img {
      width: 100%;
      max-height: 250px;
      object-fit: contain;
      display: block;
    }

    .compression-info {
      display: flex;
      justify-content: space-between;
      padding: 8px 12px;
      background: #f3f4f6;
      font-size: 12px;
      color: #6b7280;

      .ratio-info {
        color: #10b981;
        font-weight: 500;
      }
    }
  }

  .loading-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 40px;
    gap: 12px;
    color: #6b7280;

    .spinner {
      width: 32px;
      height: 32px;
      border: 3px solid #e5e7eb;
      border-top-color: #7dd3a8;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }
  }
}

.modal-footer {
  display: flex;
  gap: 12px;
  padding: 16px 20px;
  border-top: 1px solid rgba(0, 0, 0, 0.08);

  button {
    flex: 1;
    padding: 12px;
    border: none;
    border-radius: 12px;
    font-size: 15px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;

    &.btn-cancel {
      background: #f3f4f6;
      color: #6b7280;

      &:active {
        background: #e5e7eb;
      }
    }

    &.btn-confirm {
      background: #7dd3a8;
      color: white;

      &:active:not(:disabled) {
        opacity: 0.9;
      }

      &:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
    }

    &:active:not(:disabled) {
      transform: scale(0.98);
    }
  }
}

// 動畫
.drawer-enter-active,
.drawer-leave-active {
  transition: opacity 0.2s;

  .media-drawer {
    transition: transform 0.2s ease-out;
  }
}

.drawer-enter-from,
.drawer-leave-to {
  opacity: 0;

  .media-drawer {
    transform: translateY(100%);
  }
}

.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.2s;

  .description-modal {
    transition: all 0.2s ease-out;
  }
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;

  .description-modal {
    transform: scale(0.9);
    opacity: 0;
  }
}

@keyframes slideUp {
  from { transform: translateY(100%); }
  to { transform: translateY(0); }
}

@keyframes modalSlideIn {
  from { transform: scale(0.9); opacity: 0; }
  to { transform: scale(1); opacity: 1; }
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>
