<script setup lang="ts">
import { getImportExportService } from "@/services/ImportExportService";
import type { CharacterImportResult } from "@/types/character";
import { computed, ref } from "vue";

// Props
const props = defineProps<{
  show: boolean;
  type: "character" | "lorebook";
}>();

// Emits
const emit = defineEmits<{
  (e: "close"): void;
  (e: "imported", result: CharacterImportResult): void;
  (e: "lorebookImported", lorebook: any): void;
}>();

// 狀態
const isDragging = ref(false);
const isImporting = ref(false);
const importResults = ref<CharacterImportResult[]>([]);
const errorMessage = ref("");

// 支持的文件類型
const acceptedTypes = computed(() => {
  return props.type === "character"
    ? ".png,.json,image/png,application/json"
    : ".json,application/json";
});

// 標題
const title = computed(() => {
  return props.type === "character" ? "導入角色卡" : "導入世界書";
});

// 描述
const description = computed(() => {
  return props.type === "character"
    ? "支持 SillyTavern 角色卡格式 (PNG/JSON)，包括內嵌世界書"
    : "支持 SillyTavern 世界書 JSON 格式";
});

// 處理拖拽
function handleDragEnter(e: DragEvent) {
  e.preventDefault();
  isDragging.value = true;
}

function handleDragLeave(e: DragEvent) {
  e.preventDefault();
  isDragging.value = false;
}

function handleDragOver(e: DragEvent) {
  e.preventDefault();
}

function handleDrop(e: DragEvent) {
  e.preventDefault();
  isDragging.value = false;

  const files = e.dataTransfer?.files;
  if (files && files.length > 0) {
    processFiles(files);
  }
}

// 處理文件選擇
function handleFileSelect(e: Event) {
  const input = e.target as HTMLInputElement;
  if (input.files && input.files.length > 0) {
    processFiles(input.files);
  }
  // 清空 input 以便再次選擇相同文件
  input.value = "";
}

// 處理文件
async function processFiles(files: FileList) {
  isImporting.value = true;
  errorMessage.value = "";
  importResults.value = [];

  const service = getImportExportService();

  try {
    if (props.type === "character") {
      // 批量導入角色
      const { successful, failed } = await service.importBatch(files);
      importResults.value = [...successful, ...failed];

      // 發送成功結果
      for (const result of successful) {
        emit("imported", result);
      }

      if (failed.length > 0 && successful.length === 0) {
        errorMessage.value = failed.map((f) => f.error).join("\n");
      }
    } else {
      // 導入世界書
      for (const file of Array.from(files)) {
        try {
          const text = await file.text();
          const data = JSON.parse(text);

          // 檢查是否為有效的世界書格式
          if (data.entries || data.name) {
            emit("lorebookImported", data);
          } else {
            errorMessage.value = "無效的世界書格式";
          }
        } catch {
          errorMessage.value = "無法解析 JSON 文件";
        }
      }
    }
  } catch (e) {
    errorMessage.value = String(e);
  } finally {
    isImporting.value = false;
  }
}

// 關閉模態框
function handleClose() {
  if (!isImporting.value) {
    importResults.value = [];
    errorMessage.value = "";
    emit("close");
  }
}

// 完成導入
function handleDone() {
  importResults.value = [];
  errorMessage.value = "";
  emit("close");
}
</script>

<template>
  <Teleport to="body">
    <Transition name="modal">
      <div v-if="show" class="modal-overlay" @click.self="handleClose">
        <div class="import-modal">
          <!-- 標題欄 -->
          <header class="modal-header">
            <h2>{{ title }}</h2>
            <button
              class="close-btn"
              @click="handleClose"
              :disabled="isImporting"
            >
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path
                  d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"
                />
              </svg>
            </button>
          </header>

          <!-- 內容 -->
          <div class="modal-content">
            <!-- 拖放區域 -->
            <div
              class="drop-zone"
              :class="{
                'is-dragging': isDragging,
                'is-importing': isImporting,
                'has-results': importResults.length > 0,
              }"
              @dragenter="handleDragEnter"
              @dragleave="handleDragLeave"
              @dragover="handleDragOver"
              @drop="handleDrop"
            >
              <template v-if="isImporting">
                <div class="loading-spinner"></div>
                <p class="drop-text">導入中...</p>
              </template>

              <template v-else-if="importResults.length > 0">
                <div class="results-list">
                  <div
                    v-for="(result, index) in importResults"
                    :key="index"
                    class="result-item"
                    :class="{ success: result.success, error: !result.success }"
                  >
                    <svg
                      v-if="result.success"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                      class="result-icon success"
                    >
                      <path
                        d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"
                      />
                    </svg>
                    <svg
                      v-else
                      viewBox="0 0 24 24"
                      fill="currentColor"
                      class="result-icon error"
                    >
                      <path
                        d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"
                      />
                    </svg>
                    <div class="result-info">
                      <p class="result-name">
                        {{
                          result.character?.nickname ||
                          result.character?.data?.name ||
                          "導入失敗"
                        }}
                      </p>
                      <p
                        v-if="result.success && result.lorebook"
                        class="result-detail"
                      >
                        包含世界書：{{ result.lorebook.name }} ({{
                          result.lorebook.entries.length
                        }}
                        條目)
                      </p>
                      <p
                        v-if="result.success && result.regexScriptsCount"
                        class="result-detail"
                      >
                        包含正則腳本：{{ result.regexScriptsCount }} 個
                      </p>
                      <p
                        v-if="result.success && result.mvuMetricsCount"
                        class="result-detail mvu-hint"
                      >
                        偵測到 MVU 數值系統，已自動轉換 {{ result.mvuMetricsCount }} 個指標至好感度配置
                      </p>
                      <p v-if="!result.success" class="result-error">
                        {{ result.error }}
                      </p>
                    </div>
                  </div>
                </div>
                <button class="done-btn" @click="handleDone">完成</button>
              </template>

              <template v-else>
                <svg class="drop-icon" viewBox="0 0 24 24" fill="currentColor">
                  <path
                    d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM14 13v4h-4v-4H7l5-5 5 5h-3z"
                  />
                </svg>
                <p class="drop-text">
                  {{ isDragging ? "放開以導入" : "拖放文件到這裡" }}
                </p>
                <p class="drop-hint">{{ description }}</p>
                <span class="drop-divider">或</span>
                <label class="select-btn">
                  選擇文件
                  <input
                    type="file"
                    :accept="acceptedTypes"
                    multiple
                    @change="handleFileSelect"
                  />
                </label>
              </template>
            </div>

            <!-- 錯誤信息 -->
            <div
              v-if="errorMessage && importResults.length === 0"
              class="error-message"
            >
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path
                  d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"
                />
              </svg>
              <span>{{ errorMessage }}</span>
            </div>

            <!-- 提示 -->
            <div class="import-tips">
              <h4>支持的格式：</h4>
              <ul v-if="type === 'character'">
                <li><strong>PNG</strong> - 帶有內嵌元數據的角色卡圖片</li>
                <li><strong>JSON</strong> - Character Card v2/v3 格式</li>
                <li>自動提取內嵌的世界書和正則腳本</li>
              </ul>
              <ul v-else>
                <li><strong>JSON</strong> - SillyTavern 世界書格式</li>
                <li>支持所有世界書設定（遞歸、機率等）</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style lang="scss" scoped>
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100dvh;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  padding: 20px;
}

.import-modal {
  background: var(--color-surface, #fff);
  border-radius: 20px;
  width: 100%;
  max-width: 500px;
  max-height: 90vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px;
  border-bottom: 1px solid var(--color-border, rgba(0, 0, 0, 0.1));

  h2 {
    font-size: 20px;
    font-weight: 600;
    color: var(--color-text, #333);
    margin: 0;
  }

  .close-btn {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    border: none;
    background: var(--color-background, #f5f5f5);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s;

    svg {
      width: 20px;
      height: 20px;
      color: var(--color-text-secondary, #666);
    }

    &:hover:not(:disabled) {
      background: var(--color-primary-light, #c7fcbb);

      svg {
        color: var(--color-primary, #7dd3a8);
      }
    }

    &:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
  }
}

.modal-content {
  padding: 24px;
  overflow-y: auto;
}

.drop-zone {
  border: 2px dashed var(--color-border, rgba(0, 0, 0, 0.2));
  border-radius: 16px;
  padding: 40px 24px;
  text-align: center;
  transition: all 0.3s;
  background: var(--color-background, #f9f9f9);
  min-height: 200px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;

  &.is-dragging {
    border-color: var(--color-primary, #7dd3a8);
    background: var(--color-primary-light, #c7fcbb);
    transform: scale(1.02);
  }

  &.is-importing {
    pointer-events: none;
    opacity: 0.8;
  }

  &.has-results {
    padding: 20px;
  }
}

.drop-icon {
  width: 64px;
  height: 64px;
  color: var(--color-primary, #7dd3a8);
  margin-bottom: 16px;
  opacity: 0.8;
}

.drop-text {
  font-size: 18px;
  font-weight: 500;
  color: var(--color-text, #333);
  margin: 0 0 8px;
}

.drop-hint {
  font-size: 14px;
  color: var(--color-text-secondary, #666);
  margin: 0 0 16px;
}

.drop-divider {
  font-size: 13px;
  color: var(--color-text-muted, #999);
  margin: 8px 0;
}

.select-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 12px 28px;
  background: linear-gradient(135deg, #a8e6cf, #7dd3a8);
  color: white;
  font-size: 15px;
  font-weight: 500;
  border-radius: 25px;
  cursor: pointer;
  transition: all 0.2s;

  input {
    display: none;
  }

  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 6px 20px rgba(255, 107, 157, 0.4);
  }
}

.loading-spinner {
  width: 48px;
  height: 48px;
  border: 4px solid var(--color-border, rgba(0, 0, 0, 0.1));
  border-top-color: var(--color-primary, #7dd3a8);
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin-bottom: 16px;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.results-list {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 16px;
  max-height: 300px;
  overflow-y: auto;
}

.result-item {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px 16px;
  border-radius: 12px;
  background: var(--color-background, #f9f9f9);
  text-align: left;

  &.success {
    border-left: 4px solid #4caf50;
  }

  &.error {
    border-left: 4px solid #f44336;
  }
}

.result-icon {
  width: 24px;
  height: 24px;
  flex-shrink: 0;

  &.success {
    color: #4caf50;
  }

  &.error {
    color: #f44336;
  }
}

.result-info {
  flex: 1;
  min-width: 0;
}

.result-name {
  font-size: 15px;
  font-weight: 500;
  color: var(--color-text, #333);
  margin: 0 0 4px;
}

.result-detail {
  font-size: 13px;
  color: var(--color-text-secondary, #666);
  margin: 0;
}

.mvu-hint {
  color: #059669;
  font-weight: 500;
}

.result-error {
  font-size: 13px;
  color: #f44336;
  margin: 0;
}

.done-btn {
  padding: 12px 32px;
  background: linear-gradient(135deg, #a8e6cf, #7dd3a8);
  color: white;
  font-size: 15px;
  font-weight: 500;
  border: none;
  border-radius: 25px;
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 6px 20px rgba(255, 107, 157, 0.4);
  }
}

.error-message {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  background: #ffebee;
  border-radius: 10px;
  margin-top: 16px;

  svg {
    width: 20px;
    height: 20px;
    color: #f44336;
    flex-shrink: 0;
  }

  span {
    font-size: 14px;
    color: #c62828;
  }
}

.import-tips {
  margin-top: 24px;
  padding-top: 20px;
  border-top: 1px solid var(--color-border, rgba(0, 0, 0, 0.1));

  h4 {
    font-size: 14px;
    font-weight: 600;
    color: var(--color-text, #333);
    margin: 0 0 12px;
  }

  ul {
    margin: 0;
    padding-left: 20px;

    li {
      font-size: 13px;
      color: var(--color-text-secondary, #666);
      margin-bottom: 6px;

      strong {
        color: var(--color-text, #333);
      }
    }
  }
}

// 動畫
.modal-enter-active,
.modal-leave-active {
  transition: all 0.3s ease;

  .import-modal {
    transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
  }
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;

  .import-modal {
    transform: scale(0.9) translateY(20px);
  }
}
</style>
