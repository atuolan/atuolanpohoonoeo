<script setup lang="ts">
import BatchUploadModal from "@/components/modals/BatchUploadModal.vue";
import { useStickerStore } from "@/stores";
import type { StickerItem } from "@/types/sticker";
import { computed, nextTick, onMounted, ref } from "vue";

const emit = defineEmits<{
  (e: "select", value: string): void;
  (e: "close"): void;
}>();

const stickerStore = useStickerStore();

// 批量上傳彈窗
const showBatchModal = ref(false);

// 當前選中的分類
const activeCategory = ref("smileys");

// 搜索相關
const showSearch = ref(false);
const searchQuery = ref("");

// 管理菜單
const showManageMenu = ref(false);

// 編輯表情
const editingSticker = ref<StickerItem | null>(null);
const editName = ref("");
const editInput = ref<HTMLInputElement>();

// 批量刪除
const batchDeleteMode = ref(false);
const selectedForDelete = ref<Set<string>>(new Set());

// 添加表情彈窗
const showAddModal = ref(false);
const newStickerName = ref("");
const newStickerUrl = ref("");

// 批量上傳成功回調
function onBatchSuccess(count: number) {
  console.log(`成功添加 ${count} 個表情！`);
}

// 打開批量上傳
function openBatchUploadModal() {
  showBatchModal.value = true;
  showManageMenu.value = false;
}

// 當前分類的表情
const currentStickers = computed(() => {
  const category = stickerStore.allCategories.find(
    (c) => c.id === activeCategory.value,
  );
  return category?.stickers || [];
});

// 顯示的表情（搜索或普通模式）
const displayStickers = computed(() => {
  if (searchQuery.value) {
    return stickerStore.searchStickers(searchQuery.value);
  }
  return currentStickers.value;
});

// 當前分類是否為自定義
const isCurrentCategoryCustom = computed(() => {
  const category = stickerStore.allCategories.find(
    (c) => c.id === activeCategory.value,
  );
  return category?.isCustom || false;
});

// 選擇表情
function selectSticker(sticker: StickerItem) {
  if (batchDeleteMode.value) {
    toggleSelectForDelete(sticker.id);
    return;
  }

  // 自定義表情發送 [sticker:名稱] 格式
  if (sticker.url) {
    emit("select", `[sticker:${sticker.name}]`);
  } else if ((sticker as any).char) {
    // 系統 emoji 直接發送字符
    emit("select", (sticker as any).char);
  }
}

// 搜索
function toggleSearch() {
  showSearch.value = !showSearch.value;
  if (!showSearch.value) {
    searchQuery.value = "";
  }
}

function closeSearch() {
  showSearch.value = false;
  searchQuery.value = "";
}

// 管理菜單
function toggleManageMenu() {
  showManageMenu.value = !showManageMenu.value;
}

// 添加表情
function openAddModal() {
  showAddModal.value = true;
  showManageMenu.value = false;
  newStickerName.value = "";
  newStickerUrl.value = "";
}

async function confirmAddSticker() {
  if (!newStickerName.value.trim() || !newStickerUrl.value.trim()) return;

  await stickerStore.addSticker(activeCategory.value, {
    name: newStickerName.value.trim(),
    url: newStickerUrl.value.trim(),
    keywords: [newStickerName.value.trim()],
  });

  showAddModal.value = false;
}

// 編輯表情名稱
function startEditSticker(sticker: StickerItem, e: Event) {
  e.stopPropagation();
  editingSticker.value = sticker;
  editName.value = sticker.name;

  nextTick(() => {
    editInput.value?.focus();
    editInput.value?.select();
  });
}

function cancelEdit() {
  editingSticker.value = null;
  editName.value = "";
}

async function saveEdit() {
  if (!editingSticker.value || !editName.value.trim()) return;

  await stickerStore.updateStickerName(
    activeCategory.value,
    editingSticker.value.id,
    editName.value.trim(),
  );

  cancelEdit();
}

// 批量刪除
function openBatchDeleteMode() {
  if (!isCurrentCategoryCustom.value) {
    alert("批量刪除只能在自定義分類中使用");
    showManageMenu.value = false;
    return;
  }

  batchDeleteMode.value = true;
  selectedForDelete.value = new Set();
  showManageMenu.value = false;
}

function exitBatchDeleteMode() {
  batchDeleteMode.value = false;
  selectedForDelete.value = new Set();
}

function toggleSelectForDelete(stickerId: string) {
  if (selectedForDelete.value.has(stickerId)) {
    selectedForDelete.value.delete(stickerId);
  } else {
    selectedForDelete.value.add(stickerId);
  }
  selectedForDelete.value = new Set(selectedForDelete.value);
}

async function confirmBatchDelete() {
  if (selectedForDelete.value.size === 0) return;

  const count = selectedForDelete.value.size;
  if (!confirm(`確定要刪除 ${count} 個表情嗎？`)) return;

  for (const stickerId of selectedForDelete.value) {
    await stickerStore.removeSticker(activeCategory.value, stickerId);
  }

  exitBatchDeleteMode();
}

// 圖片錯誤處理
function onImageError(event: Event) {
  const img = event.target as HTMLImageElement;
  const originalUrl = img.src;

  if (!img.dataset.proxyAttempted) {
    img.dataset.proxyAttempted = "true";
    img.src = `https://images.weserv.nl/?url=${encodeURIComponent(originalUrl)}`;

    img.onerror = () => {
      if (!img.dataset.finalFailed) {
        img.dataset.finalFailed = "true";
        img.src =
          'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="48" height="48"%3E%3Crect width="48" height="48" fill="%23f0f0f0"/%3E%3Ctext x="50%25" y="50%25" dominant-baseline="middle" text-anchor="middle" font-size="16"%3E❌%3C/text%3E%3C/svg%3E';
        img.style.opacity = "0.5";
      }
    };
  }
}

onMounted(() => {
  stickerStore.init();
});
</script>

<template>
  <div class="sticker-panel" @click.stop>
    <!-- 搜索框 -->
    <div v-if="showSearch" class="search-bar">
      <input
        v-model="searchQuery"
        type="text"
        placeholder="搜索表情..."
        class="search-input"
      />
      <button class="close-search-btn" @click="closeSearch">×</button>
    </div>

    <!-- 分類標籤 -->
    <div class="category-tabs">
      <button
        v-for="category in stickerStore.allCategories"
        :key="category.id"
        :class="['tab-btn', { active: activeCategory === category.id }]"
        :title="category.name"
        @click.stop="activeCategory = category.id"
      >
        <!-- 系統分類用 SVG -->
        <svg
          v-if="category.id === 'smileys'"
          viewBox="0 0 24 24"
          fill="currentColor"
        >
          <path
            d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm3.5-9c.83 0 1.5-.67 1.5-1.5S16.33 8 15.5 8 14 8.67 14 9.5s.67 1.5 1.5 1.5zm-7 0c.83 0 1.5-.67 1.5-1.5S9.33 8 8.5 8 7 8.67 7 9.5 7.67 11 8.5 11zm3.5 6.5c2.33 0 4.31-1.46 5.11-3.5H6.89c.8 2.04 2.78 3.5 5.11 3.5z"
          />
        </svg>
        <svg
          v-else-if="category.id === 'gestures'"
          viewBox="0 0 24 24"
          fill="currentColor"
        >
          <path
            d="M23 5.5V20c0 2.2-1.8 4-4 4h-7.3c-1.08 0-2.1-.43-2.85-1.19L1 14.83s1.26-1.23 1.3-1.25c.22-.19.49-.29.79-.29.22 0 .42.06.6.16.04.01 4.31 2.46 4.31 2.46V4c0-.83.67-1.5 1.5-1.5S11 3.17 11 4v7h1V1.5c0-.83.67-1.5 1.5-1.5S15 .67 15 1.5V11h1V2.5c0-.83.67-1.5 1.5-1.5s1.5.67 1.5 1.5V11h1V5.5c0-.83.67-1.5 1.5-1.5s1.5.67 1.5 1.5z"
          />
        </svg>
        <svg
          v-else-if="category.id === 'hearts'"
          viewBox="0 0 24 24"
          fill="currentColor"
        >
          <path
            d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"
          />
        </svg>
        <svg
          v-else-if="category.id === 'animals'"
          viewBox="0 0 24 24"
          fill="currentColor"
        >
          <path
            d="M4.5 11c-1.38 0-2.5 1.12-2.5 2.5S3.12 16 4.5 16 7 14.88 7 13.5 5.88 11 4.5 11zm15 0c-1.38 0-2.5 1.12-2.5 2.5s1.12 2.5 2.5 2.5 2.5-1.12 2.5-2.5-1.12-2.5-2.5-2.5zM9 4C7.62 4 6.5 5.12 6.5 6.5S7.62 9 9 9s2.5-1.12 2.5-2.5S10.38 4 9 4zm6 0c-1.38 0-2.5 1.12-2.5 2.5S13.62 9 15 9s2.5-1.12 2.5-2.5S16.38 4 15 4zm-3 6c-4.97 0-9 2.69-9 6v4h18v-4c0-3.31-4.03-6-9-6z"
          />
        </svg>
        <svg
          v-else-if="category.id === 'food'"
          viewBox="0 0 24 24"
          fill="currentColor"
        >
          <path
            d="M18.06 22.99h1.66c.84 0 1.53-.64 1.63-1.46L23 5.05l-5 2v5.12c0 .57-.59.96-1.11.74L15 12l-1.89.91c-.52.22-1.11-.17-1.11-.74V7.05l-5-2 1.65 16.48c.1.82.79 1.46 1.63 1.46h1.66l.67-8.03h3.72l.67 8.03zM9 5l3-3 3 3v2.05l-3 1.5-3-1.5V5z"
          />
        </svg>
        <svg
          v-else-if="category.id === 'objects'"
          viewBox="0 0 24 24"
          fill="currentColor"
        >
          <path
            d="M9 21c0 .55.45 1 1 1h4c.55 0 1-.45 1-1v-1H9v1zm3-19C8.14 2 5 5.14 5 9c0 2.38 1.19 4.47 3 5.74V17c0 .55.45 1 1 1h6c.55 0 1-.45 1-1v-2.26c1.81-1.27 3-3.36 3-5.74 0-3.86-3.14-7-7-7zm2.85 11.1l-.85.6V16h-4v-2.3l-.85-.6A4.997 4.997 0 0 1 7 9c0-2.76 2.24-5 5-5s5 2.24 5 5c0 1.63-.8 3.16-2.15 4.1z"
          />
        </svg>
        <svg
          v-else-if="category.id === 'symbols'"
          viewBox="0 0 24 24"
          fill="currentColor"
        >
          <path
            d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z"
          />
        </svg>
        <!-- 自定義分類用資料夾圖標 -->
        <svg v-else viewBox="0 0 24 24" fill="currentColor">
          <path
            d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"
          />
        </svg>
      </button>

      <!-- 搜索按鈕 -->
      <button class="tab-btn" title="搜索表情" @click.stop="toggleSearch">
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path
            d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"
          />
        </svg>
      </button>

      <!-- 管理按鈕 -->
      <button
        v-if="isCurrentCategoryCustom"
        class="tab-btn manage-btn"
        title="管理表情"
        @click.stop="toggleManageMenu"
      >
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path
            d="M19.14 12.94c.04-.31.06-.63.06-.94 0-.31-.02-.63-.06-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"
          />
        </svg>
      </button>
    </div>

    <!-- 批量刪除提示 -->
    <div v-if="batchDeleteMode" class="batch-delete-bar">
      <span>已選擇 {{ selectedForDelete.size }} 個</span>
      <div class="batch-actions">
        <button
          class="btn-small btn-danger"
          :disabled="selectedForDelete.size === 0"
          @click="confirmBatchDelete"
        >
          刪除選中
        </button>
        <button class="btn-small" @click="exitBatchDeleteMode">取消</button>
      </div>
    </div>

    <!-- 表情網格 -->
    <div class="sticker-grid">
      <button
        v-for="sticker in displayStickers"
        :key="sticker.id"
        :class="[
          'sticker-btn',
          {
            selected: selectedForDelete.has(sticker.id),
            'delete-mode': batchDeleteMode,
          },
        ]"
        :title="sticker.name"
        @click="selectSticker(sticker)"
      >
        <div class="sticker-content">
          <!-- 自定義表情（圖片） -->
          <img
            v-if="sticker.url"
            :src="sticker.url"
            class="sticker-img"
            referrerpolicy="no-referrer"
            @error="onImageError"
          />
          <!-- 系統 emoji -->
          <span v-else class="emoji-char">{{ (sticker as any).char }}</span>
        </div>

        <!-- 表情名稱 -->
        <span class="sticker-name">{{ sticker.name }}</span>

        <!-- 批量刪除選擇標記 -->
        <div
          v-if="batchDeleteMode && selectedForDelete.has(sticker.id)"
          class="select-indicator"
        >
          ✓
        </div>

        <!-- 編輯按鈕 -->
        <button
          v-if="sticker.url && !batchDeleteMode"
          class="edit-btn"
          title="編輯名稱"
          @click="startEditSticker(sticker, $event)"
        >
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path
              d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"
            />
          </svg>
        </button>
      </button>

      <!-- 添加按鈕 -->
      <button
        v-if="isCurrentCategoryCustom && !batchDeleteMode && !searchQuery"
        class="sticker-btn add-sticker-btn"
        title="添加表情"
        @click="openAddModal"
      >
        <div class="sticker-content">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
          </svg>
        </div>
        <span class="sticker-name">添加</span>
      </button>

      <!-- 無結果 -->
      <div
        v-if="searchQuery && displayStickers.length === 0"
        class="no-results"
      >
        <div class="no-results-icon">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path
              d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"
            />
          </svg>
        </div>
        <div class="no-results-text">沒有找到匹配的表情</div>
      </div>
    </div>

    <!-- 管理菜單 -->
    <div
      v-if="showManageMenu"
      class="manage-menu-overlay"
      @click="showManageMenu = false"
    >
      <div class="manage-menu" @click.stop>
        <button @click="openAddModal">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
          </svg>
          添加表情
        </button>
        <button @click="openBatchUploadModal">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path
              d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM14 13v4h-4v-4H7l5-5 5 5h-3z"
            />
          </svg>
          批量上傳
        </button>
        <button @click="openBatchDeleteMode">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path
              d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"
            />
          </svg>
          批量刪除
        </button>
      </div>
    </div>

    <!-- 添加表情彈窗 -->
    <div
      v-if="showAddModal"
      class="modal-overlay"
      @click="showAddModal = false"
    >
      <div class="modal-content" @click.stop>
        <div class="modal-header">
          <h3>添加表情</h3>
          <button class="close-btn" @click="showAddModal = false">×</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label>表情名稱</label>
            <input
              v-model="newStickerName"
              type="text"
              placeholder="輸入表情名稱"
            />
          </div>
          <div class="form-group">
            <label>圖片網址</label>
            <input
              v-model="newStickerUrl"
              type="text"
              placeholder="輸入圖片 URL"
            />
          </div>
          <div v-if="newStickerUrl" class="preview">
            <img :src="newStickerUrl" @error="onImageError" />
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn-cancel" @click="showAddModal = false">取消</button>
          <button
            class="btn-save"
            :disabled="!newStickerName.trim() || !newStickerUrl.trim()"
            @click="confirmAddSticker"
          >
            添加
          </button>
        </div>
      </div>
    </div>

    <!-- 編輯名稱彈窗 -->
    <div v-if="editingSticker" class="modal-overlay" @click="cancelEdit">
      <div class="modal-content" @click.stop>
        <div class="modal-header">
          <h3>編輯表情</h3>
          <button class="close-btn" @click="cancelEdit">×</button>
        </div>
        <div class="modal-body">
          <img :src="editingSticker.url" class="edit-preview" />
          <div class="form-group">
            <label>表情名稱</label>
            <input
              ref="editInput"
              v-model="editName"
              type="text"
              placeholder="輸入新名稱"
              @keyup.enter="saveEdit"
            />
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn-cancel" @click="cancelEdit">取消</button>
          <button
            class="btn-save"
            :disabled="!editName.trim()"
            @click="saveEdit"
          >
            保存
          </button>
        </div>
      </div>
    </div>

    <!-- 批量上傳彈窗 -->
    <BatchUploadModal
      v-if="showBatchModal"
      @close="showBatchModal = false"
      @success="onBatchSuccess"
    />
  </div>
</template>

<style lang="scss" scoped>
.sticker-panel {
  background: var(--color-surface, white);
  border-top: 1px solid var(--color-border, #e0e0e0);
  display: flex;
  flex-direction: column;
  height: 280px;
  position: relative;
}

// 搜索欄
.search-bar {
  padding: 8px 12px;
  border-bottom: 1px solid var(--color-border, #f0f0f0);
  display: flex;
  gap: 8px;
  align-items: center;
}

.search-input {
  flex: 1;
  padding: 8px 12px;
  border: 1px solid var(--color-border, #d0d0d0);
  border-radius: 20px;
  font-size: 14px;
  outline: none;
  background: var(--color-background, white);
  color: var(--color-text, #333);

  &:focus {
    border-color: var(--color-primary, #007bff);
  }
}

.close-search-btn {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: none;
  background: var(--color-background, #f0f0f0);
  font-size: 18px;
  color: var(--color-text-secondary, #666);
  cursor: pointer;

  &:hover {
    background: var(--color-surface-hover, #e0e0e0);
  }
}

// 分類標籤
.category-tabs {
  display: flex;
  gap: 4px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--color-border, #f0f0f0);
  overflow-x: auto;

  &::-webkit-scrollbar {
    height: 3px;
  }

  &::-webkit-scrollbar-thumb {
    background: var(--color-border, #d0d0d0);
    border-radius: 2px;
  }
}

.tab-btn {
  padding: 8px;
  border: none;
  background: transparent;
  cursor: pointer;
  border-radius: 8px;
  transition: all 0.2s;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  color: var(--color-text-secondary, #666);

  svg {
    width: 20px;
    height: 20px;
  }

  &:hover {
    background: var(--color-background, #f5f5f5);
    color: var(--color-text, #333);
  }

  &.active {
    background: var(--color-primary-light, #e8f0fe);
    color: var(--color-primary, #007bff);
  }

  &.manage-btn {
    margin-left: auto;
  }
}

// 批量刪除欄
.batch-delete-bar {
  padding: 10px 16px;
  background: #fff3cd;
  border-bottom: 1px solid #ffeaa7;
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 14px;
  font-weight: 500;
}

.batch-actions {
  display: flex;
  gap: 8px;
}

.btn-small {
  padding: 6px 12px;
  border: 1px solid var(--color-border, #d0d0d0);
  background: var(--color-surface, white);
  border-radius: 6px;
  font-size: 13px;
  cursor: pointer;

  &:hover {
    background: var(--color-background, #f5f5f5);
  }

  &.btn-danger {
    background: #ff4444;
    color: white;
    border-color: #ff4444;

    &:hover:not(:disabled) {
      background: #cc0000;
    }

    &:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
  }
}

// 表情網格
.sticker-grid {
  flex: 1;
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 6px;
  padding: 8px;
  overflow-y: auto;
  align-items: start;

  &::-webkit-scrollbar {
    width: 6px;
  }

  &::-webkit-scrollbar-thumb {
    background: var(--color-border, #d0d0d0);
    border-radius: 3px;
  }

  @media (max-width: 400px) {
    grid-template-columns: repeat(4, 1fr);
  }
}

.sticker-btn {
  padding: 4px;
  border: none;
  background: transparent;
  cursor: pointer;
  border-radius: 6px;
  transition: all 0.15s;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  position: relative;
  max-width: 72px;

  &:hover {
    background: var(--color-background, #f5f5f5);
    transform: scale(1.05);
  }

  &.delete-mode.selected {
    background: var(--color-primary-light, #e8f0fe);
    border: 2px solid var(--color-primary, #007bff);
  }
}

.sticker-content {
  width: 56px;
  height: 56px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.sticker-img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}

.emoji-char {
  font-size: 28px;
}

.sticker-name {
  font-size: 10px;
  color: var(--color-text-secondary, #666);
  text-align: center;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.select-indicator {
  position: absolute;
  top: 2px;
  right: 2px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: var(--color-primary, #007bff);
  color: white;
  font-size: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.edit-btn {
  position: absolute;
  top: 2px;
  right: 2px;
  width: 20px;
  height: 20px;
  padding: 2px;
  border: none;
  border-radius: 50%;
  background: rgba(0, 123, 255, 0.9);
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;

  svg {
    width: 12px;
    height: 12px;
    fill: white;
  }

  &:hover {
    transform: scale(1.1);
  }
}

.sticker-btn:hover .edit-btn {
  opacity: 1;
}

.add-sticker-btn {
  border: 2px dashed var(--color-border, #d0d0d0) !important;
  color: var(--color-text-secondary, #999);
  font-size: 24px;

  &:hover {
    border-color: var(--color-primary, #007bff) !important;
    color: var(--color-primary, #007bff);
  }
}

// 無結果
.no-results {
  grid-column: 1 / -1;
  text-align: center;
  padding: 40px 20px;
  color: var(--color-text-muted, #999);
}

.no-results-icon {
  margin-bottom: 12px;
  opacity: 0.5;

  svg {
    width: 48px;
    height: 48px;
    fill: currentColor;
  }
}

.no-results-text {
  font-size: 14px;
}

// 管理菜單
.manage-menu-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.1);
  z-index: 200;
  display: flex;
  align-items: flex-start;
  justify-content: flex-end;
  padding: 8px 12px;
}

.manage-menu {
  background: var(--color-surface, white);
  border: 1px solid var(--color-border, #e0e0e0);
  border-radius: 12px;
  box-shadow: var(--shadow-lg, 0 8px 24px rgba(0, 0, 0, 0.2));
  overflow: hidden;
  min-width: 160px;

  button {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    padding: 14px 20px;
    border: none;
    background: var(--color-surface, white);
    text-align: left;
    font-size: 15px;
    cursor: pointer;
    color: var(--color-text, #333);

    svg {
      width: 18px;
      height: 18px;
      flex-shrink: 0;
    }

    &:hover {
      background: var(--color-background, #f5f5f5);
    }

    &:not(:last-child) {
      border-bottom: 1px solid var(--color-border, #f0f0f0);
    }
  }
}

// 彈窗
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100dvh;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
}

.modal-content {
  background: var(--color-surface, white);
  border-radius: 12px;
  width: 90%;
  max-width: 400px;
  box-shadow: var(--shadow-lg, 0 4px 20px rgba(0, 0, 0, 0.3));
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid var(--color-border, #e0e0e0);

  h3 {
    margin: 0;
    font-size: 18px;
    font-weight: 600;
    color: var(--color-text, #333);
  }

  .close-btn {
    width: 32px;
    height: 32px;
    border: none;
    background: transparent;
    font-size: 24px;
    color: var(--color-text-secondary, #666);
    cursor: pointer;
    border-radius: 50%;

    &:hover {
      background: var(--color-background, #f0f0f0);
    }
  }
}

.modal-body {
  padding: 20px;

  .form-group {
    margin-bottom: 16px;

    label {
      display: block;
      margin-bottom: 8px;
      font-size: 14px;
      font-weight: 500;
      color: var(--color-text, #333);
    }

    input {
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
  }

  .preview {
    text-align: center;

    img {
      max-width: 100px;
      max-height: 100px;
      object-fit: contain;
      border-radius: 8px;
    }
  }

  .edit-preview {
    width: 80px;
    height: 80px;
    object-fit: contain;
    margin: 0 auto 16px;
    display: block;
    border-radius: 8px;
  }
}

.modal-footer {
  display: flex;
  gap: 12px;
  padding: 16px 20px;
  border-top: 1px solid var(--color-border, #e0e0e0);

  button {
    flex: 1;
    padding: 10px;
    border: none;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
  }

  .btn-cancel {
    background: var(--color-background, #f0f0f0);
    color: var(--color-text-secondary, #666);

    &:hover {
      background: var(--color-surface-hover, #e0e0e0);
    }
  }

  .btn-save {
    background: var(--color-primary, #007bff);
    color: white;

    &:hover:not(:disabled) {
      filter: brightness(0.9);
    }

    &:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
  }
}
</style>
