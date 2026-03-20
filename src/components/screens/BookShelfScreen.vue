<script setup lang="ts">
import { useBooksStore } from "@/stores/books";
import { useUserStore } from "@/stores/user";
import type { StoredBook } from "@/types/book";
import { ArrowLeft, BookOpen, ChevronDown, Trash2, Upload, User } from "lucide-vue-next";
import { onMounted, ref } from "vue";

const emit = defineEmits<{
  back: [];
  openBook: [book: StoredBook];
}>();

const booksStore = useBooksStore();
const userStore = useUserStore();
const fileInput = ref<HTMLInputElement | null>(null);
const isDragging = ref(false);
const showPersonaPicker = ref(false);

onMounted(async () => {
  booksStore.loadBooks();
  if (!userStore.isLoaded) {
    await userStore.loadUserData();
  }
});

function triggerImport() {
  fileInput.value?.click();
}

async function handleFileChange(e: Event) {
  const files = (e.target as HTMLInputElement).files;
  if (!files?.length) return;
  for (const file of Array.from(files)) {
    await booksStore.importFile(file);
  }
  if (fileInput.value) fileInput.value.value = "";
}

function handleDrop(e: DragEvent) {
  isDragging.value = false;
  const files = e.dataTransfer?.files;
  if (!files?.length) return;
  for (const file of Array.from(files)) {
    booksStore.importFile(file);
  }
}

async function confirmDelete(book: StoredBook) {
  if (confirm(`確定要刪除《${book.title}》嗎？`)) {
    await booksStore.deleteBook(book.id);
  }
}

function formatSize(chars: number): string {
  if (chars >= 10000) return `${(chars / 10000).toFixed(1)} 萬字`;
  return `${chars} 字`;
}

function handleSelectPersona(personaId: string) {
  userStore.switchPersona(personaId);
  showPersonaPicker.value = false;
}
</script>

<template>
  <div class="bookshelf-screen">
    <!-- 頂欄 -->
    <div class="bookshelf-header">
      <button class="back-btn" @click="emit('back')">
        <ArrowLeft :size="20" />
      </button>
      <h1 class="header-title">書架</h1>

      <!-- 使用者選擇 -->
      <div class="persona-selector-wrapper">
        <button class="persona-btn" @click="showPersonaPicker = !showPersonaPicker">
          <img
            v-if="userStore.currentAvatar"
            :src="userStore.currentAvatar"
            class="persona-avatar-small"
            alt=""
          />
          <User v-else :size="14" />
          <span class="persona-name-text">{{ userStore.currentName }}</span>
          <ChevronDown :size="12" />
        </button>
        <Transition name="fade">
          <div v-if="showPersonaPicker" class="persona-dropdown">
            <button
              v-for="p in userStore.personas"
              :key="p.id"
              class="persona-dropdown-item"
              :class="{ active: userStore.currentPersonaId === p.id }"
              @click="handleSelectPersona(p.id)"
            >
              <img
                v-if="p.avatar"
                :src="p.avatar"
                class="persona-avatar-small"
                alt=""
              />
              <span v-else class="persona-avatar-small persona-avatar-placeholder">
                <User :size="12" />
              </span>
              <span>{{ p.name }}</span>
            </button>
          </div>
        </Transition>
      </div>

      <button class="import-btn" @click="triggerImport">
        <Upload :size="18" />
        <span>導入</span>
      </button>
    </div>

    <!-- 點擊外部關閉 persona picker -->
    <div
      v-if="showPersonaPicker"
      class="persona-backdrop"
      @click="showPersonaPicker = false"
    />

    <!-- 隱藏的文件輸入 -->
    <input
      ref="fileInput"
      type="file"
      accept=".txt,.epub,.pdf"
      multiple
      style="display: none"
      @change="handleFileChange"
    />

    <!-- 載入中 -->
    <div v-if="booksStore.isLoading" class="loading-state">
      <div class="spinner" />
      <span>正在解析書籍...</span>
    </div>

    <!-- 錯誤提示 -->
    <div v-if="booksStore.importError" class="error-toast">
      {{ booksStore.importError }}
    </div>

    <!-- 拖放區 / 空狀態 -->
    <div
      v-if="!booksStore.isLoading && booksStore.books.length === 0"
      class="empty-state"
      :class="{ dragging: isDragging }"
      @dragover.prevent="isDragging = true"
      @dragleave="isDragging = false"
      @drop.prevent="handleDrop"
    >
      <BookOpen :size="48" class="empty-icon" />
      <p class="empty-title">書架空空如也</p>
      <p class="empty-hint">
        點擊「導入」或拖放文件到此處<br />支援 TXT、EPUB、PDF
      </p>
      <button class="import-btn-large" @click="triggerImport">
        <Upload :size="16" />
        選擇文件
      </button>
    </div>

    <!-- 書籍列表 -->
    <div
      v-else
      class="book-grid"
      @dragover.prevent="isDragging = true"
      @dragleave="isDragging = false"
      @drop.prevent="handleDrop"
    >
      <div
        v-for="book in booksStore.books"
        :key="book.id"
        class="book-card"
        @click="emit('openBook', book)"
      >
        <!-- 封面 -->
        <div class="book-cover">
          <img v-if="book.cover" :src="book.cover" :alt="book.title" />
          <div v-else class="book-cover-placeholder">
            <BookOpen :size="32" />
          </div>
          <!-- 格式標籤 -->
          <span class="format-badge">{{ book.format.toUpperCase() }}</span>
        </div>

        <!-- 書籍信息 -->
        <div class="book-info">
          <p class="book-title">{{ book.title }}</p>
          <p v-if="book.author" class="book-author">{{ book.author }}</p>
          <p class="book-meta">
            {{ book.chapters.length }} 章 · {{ formatSize(book.totalChars) }}
          </p>
        </div>

        <!-- 刪除按鈕 -->
        <button
          class="delete-btn"
          @click.stop="confirmDelete(book)"
          title="刪除"
        >
          <Trash2 :size="14" />
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.bookshelf-screen {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--color-bg, #f5f5f5);
  overflow: hidden;
}

.bookshelf-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px;
  padding-top: max(16px, var(--safe-top, 0px));
  background: var(--color-surface, #fff);
  border-bottom: 1px solid var(--color-border, #e0e0e0);
  flex-shrink: 0;

  .header-title {
    flex: 1;
    font-size: 18px;
    font-weight: 600;
    color: var(--color-text, #333);
    margin: 0;
  }
}

.back-btn,
.import-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-size: 14px;
  transition: background 0.2s;
}

.back-btn {
  background: transparent;
  color: var(--color-text, #333);

  &:hover {
    background: var(--color-hover, rgba(0, 0, 0, 0.06));
  }
}

.import-btn {
  background: var(--color-primary, #7dd3a8);
  color: #fff;

  &:hover {
    filter: brightness(0.95);
  }
}

// ===== 使用者選擇器 =====
.persona-selector-wrapper {
  position: relative;
}

.persona-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border: 1px solid var(--color-border, #e0e0e0);
  border-radius: 8px;
  background: transparent;
  color: var(--color-text, #333);
  font-size: 13px;
  cursor: pointer;
  transition: background 0.2s;

  &:hover {
    background: var(--color-hover, rgba(0, 0, 0, 0.06));
  }
}

.persona-name-text {
  max-width: 80px;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.persona-avatar-small {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  object-fit: cover;
  flex-shrink: 0;
}

.persona-avatar-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-hover, rgba(0, 0, 0, 0.08));
  color: var(--color-text-secondary, #888);
}

.persona-dropdown {
  position: absolute;
  top: 100%;
  left: 0;
  margin-top: 4px;
  min-width: 160px;
  max-height: 240px;
  overflow-y: auto;
  background: var(--color-surface, #fff);
  border: 1px solid var(--color-border, #e0e0e0);
  border-radius: 10px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
  z-index: 30;
  padding: 4px 0;
}

.persona-dropdown-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 8px 12px;
  border: none;
  background: transparent;
  color: var(--color-text, #333);
  font-size: 13px;
  cursor: pointer;
  text-align: left;
  transition: background 0.15s;

  &:hover {
    background: var(--color-hover, rgba(0, 0, 0, 0.05));
  }

  &.active {
    color: var(--color-primary, #7dd3a8);
    font-weight: 600;
    background: rgba(125, 211, 168, 0.1);
  }
}

.persona-backdrop {
  position: fixed;
  inset: 0;
  z-index: 25;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.15s;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  flex: 1;
  color: var(--color-text-secondary, #888);

  .spinner {
    width: 32px;
    height: 32px;
    border: 3px solid var(--color-border, #e0e0e0);
    border-top-color: var(--color-primary, #7dd3a8);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.error-toast {
  margin: 12px 16px 0;
  padding: 10px 14px;
  background: #fee2e2;
  color: #e53e3e;
  border-radius: 8px;
  font-size: 13px;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  flex: 1;
  padding: 40px;
  border: 2px dashed transparent;
  border-radius: 12px;
  margin: 16px;
  transition:
    border-color 0.2s,
    background 0.2s;

  &.dragging {
    border-color: var(--color-primary, #7dd3a8);
    background: rgba(125, 211, 168, 0.08);
  }

  .empty-icon {
    color: var(--color-text-secondary, #bbb);
  }

  .empty-title {
    font-size: 16px;
    font-weight: 600;
    color: var(--color-text, #333);
    margin: 0;
  }

  .empty-hint {
    font-size: 13px;
    color: var(--color-text-secondary, #888);
    text-align: center;
    line-height: 1.6;
    margin: 0;
  }
}

.import-btn-large {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 20px;
  background: var(--color-primary, #7dd3a8);
  color: #fff;
  border: none;
  border-radius: 10px;
  font-size: 14px;
  cursor: pointer;
  margin-top: 8px;

  &:hover {
    filter: brightness(0.95);
  }
}

.book-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 16px;
  padding: 16px;
  overflow-y: auto;
  flex: 1;
}

.book-card {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 8px;
  cursor: pointer;
  border-radius: 10px;
  padding: 8px;
  transition: background 0.2s;

  &:hover {
    background: var(--color-hover, rgba(0, 0, 0, 0.04));

    .delete-btn {
      opacity: 1;
    }
  }
}

.book-cover {
  position: relative;
  width: 100%;
  aspect-ratio: 2 / 3;
  border-radius: 6px;
  overflow: hidden;
  background: var(--color-surface, #fff);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
}

.book-cover-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-surface-alt, #f0f0f0);
  color: var(--color-text-secondary, #bbb);
}

.format-badge {
  position: absolute;
  bottom: 6px;
  right: 6px;
  padding: 2px 6px;
  background: rgba(0, 0, 0, 0.55);
  color: #fff;
  font-size: 10px;
  border-radius: 4px;
  font-weight: 600;
  letter-spacing: 0.5px;
}

.book-info {
  .book-title {
    font-size: 13px;
    font-weight: 600;
    color: var(--color-text, #333);
    margin: 0;
    overflow: hidden;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    line-height: 1.4;
  }

  .book-author {
    font-size: 11px;
    color: var(--color-text-secondary, #888);
    margin: 2px 0 0;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .book-meta {
    font-size: 11px;
    color: var(--color-text-secondary, #aaa);
    margin: 2px 0 0;
  }
}

.delete-btn {
  position: absolute;
  top: 4px;
  right: 4px;
  width: 26px;
  height: 26px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(229, 62, 62, 0.85);
  color: #fff;
  border: none;
  border-radius: 50%;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.2s;

  &:hover {
    background: #e53e3e;
  }
}
</style>
