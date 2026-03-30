<script setup lang="ts">
// Pixabay 圖片搜尋面板
// 從聊天加號選單開啟，供使用者搜尋並分享圖片

import type { PixabaySearchResult } from "@/api/PixabayApi";
import { PixabaySearchService } from "@/services/PixabaySearchService";
import { onMounted, onUnmounted, ref, watch } from "vue";

const props = defineProps<{ visible: boolean }>();

const emit = defineEmits<{
  close: [];
  select: [imageUrl: string, caption: string];
}>();

// ===== 搜尋服務 =====
const service = new PixabaySearchService();

// ===== 內部狀態 =====
const searchQuery = ref("");
const results = ref<PixabaySearchResult | null>(null);
const allHits = ref<PixabaySearchResult["hits"]>([]);
const currentPage = ref(1);
const isLoading = ref(false);
const error = ref<string | null>(null);
const hasMore = ref(false);

// ===== 無限捲動 sentinel =====
const sentinelRef = ref<HTMLDivElement | null>(null);
let observer: IntersectionObserver | null = null;

// ===== 搜尋邏輯 =====

/** 重置搜尋狀態 */
function resetState() {
  results.value = null;
  allHits.value = [];
  currentPage.value = 1;
  error.value = null;
  hasMore.value = false;
}

/** 輸入框變更時觸發防抖搜尋 */
async function onInput() {
  const q = searchQuery.value.trim();
  if (!q) {
    resetState();
    return;
  }
  resetState();
  isLoading.value = true;
  try {
    const result = await service.search({ q, page: 1, perPage: 20 });
    results.value = result;
    allHits.value = result.hits;
    currentPage.value = 1;
    hasMore.value = result.totalHits > result.hits.length;
  } catch (err: unknown) {
    // 防抖取消不算錯誤
    if (
      err &&
      typeof err === "object" &&
      "message" in err &&
      (err as { message: string }).message === "搜尋已取消"
    ) {
      return;
    }
    error.value = "搜尋失敗，請稍後再試";
  } finally {
    isLoading.value = false;
  }
}

/** 按下搜尋按鈕或 Enter 時立即搜尋 */
async function onSearch() {
  const q = searchQuery.value.trim();
  if (!q) {
    resetState();
    return;
  }
  resetState();
  isLoading.value = true;
  try {
    const result = await service.searchImmediate({ q, page: 1, perPage: 20 });
    results.value = result;
    allHits.value = result.hits;
    currentPage.value = 1;
    hasMore.value = result.totalHits > result.hits.length;
  } catch {
    error.value = "搜尋失敗，請稍後再試";
  } finally {
    isLoading.value = false;
  }
}

/** 載入下一頁 */
async function loadNextPage() {
  const q = searchQuery.value.trim();
  if (!q || isLoading.value || !hasMore.value) return;
  isLoading.value = true;
  const nextPage = currentPage.value + 1;
  try {
    const result = await service.searchImmediate({
      q,
      page: nextPage,
      perPage: 20,
    });
    allHits.value = [...allHits.value, ...result.hits];
    currentPage.value = nextPage;
    results.value = result;
    hasMore.value = result.totalHits > allHits.value.length;
  } catch {
    // 靜默失敗，不顯示錯誤（已有結果）
  } finally {
    isLoading.value = false;
  }
}

/** 點擊圖片：發送並關閉 */
function selectImage(hit: PixabaySearchResult["hits"][number]) {
  emit("select", hit.proxyWebformatURL, hit.user);
  emit("close");
}

// ===== IntersectionObserver 無限捲動 =====

function setupObserver() {
  if (observer) {
    observer.disconnect();
    observer = null;
  }
  observer = new IntersectionObserver(
    (entries) => {
      if (entries[0].isIntersecting && hasMore.value && !isLoading.value) {
        loadNextPage();
      }
    },
    { threshold: 0.1 },
  );
  if (sentinelRef.value) {
    observer.observe(sentinelRef.value);
  }
}

function teardownObserver() {
  if (observer) {
    observer.disconnect();
    observer = null;
  }
}

// 面板開啟時設置 observer，關閉時清理
watch(
  () => props.visible,
  (visible) => {
    if (visible) {
      // 等 DOM 更新後再設置
      setTimeout(() => setupObserver(), 100);
    } else {
      teardownObserver();
      resetState();
      searchQuery.value = "";
      service.cancelPending();
    }
  },
);

onMounted(() => {
  if (props.visible) setupObserver();
});

onUnmounted(() => {
  teardownObserver();
  service.cancelPending();
});
</script>

<template>
  <Transition name="slide-up-panel">
    <div v-if="visible" class="image-search-panel" @click.stop>
      <!-- 頂部標題列 -->
      <div class="panel-header">
        <h3>搜圖分享</h3>
        <button class="close-btn" @click="$emit('close')">✕</button>
      </div>

      <!-- 搜尋列 -->
      <div class="search-bar">
        <input
          v-model="searchQuery"
          class="search-input"
          placeholder="搜尋圖片..."
          @input="onInput"
          @keyup.enter="onSearch"
        />
        <button class="search-btn" @click="onSearch">搜尋</button>
      </div>

      <!-- 載入中（初始載入） -->
      <div v-if="isLoading && allHits.length === 0" class="loading">
        <span>載入中...</span>
      </div>

      <!-- 錯誤狀態 -->
      <div v-else-if="error" class="error-state">
        <p>{{ error }}</p>
        <button class="retry-btn" @click="onSearch">重試</button>
      </div>

      <!-- 空結果 -->
      <div v-else-if="results && allHits.length === 0" class="empty-state">
        找不到相關圖片
      </div>

      <!-- 結果網格 -->
      <div class="results-grid">
        <img
          v-for="hit in allHits"
          :key="hit.id"
          :src="hit.proxyPreviewURL"
          :alt="hit.tags"
          class="result-img"
          loading="lazy"
          @click="selectImage(hit)"
        />
      </div>

      <!-- 無限捲動 sentinel -->
      <div ref="sentinelRef" class="sentinel"></div>

      <!-- 載入更多指示器 -->
      <div v-if="isLoading && allHits.length > 0" class="loading-more">
        載入更多...
      </div>
    </div>
  </Transition>
</template>

<style lang="scss" scoped>
.image-search-panel {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 300;
  background: var(--color-surface, var(--bg-primary, #fff));
  border-radius: 16px 16px 0 0;
  box-shadow: 0 -4px 24px rgba(0, 0, 0, 0.18);
  display: flex;
  flex-direction: column;
  max-height: 75vh;
  overflow: hidden;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px 10px;
  border-bottom: 1px solid var(--color-border, rgba(0, 0, 0, 0.08));
  flex-shrink: 0;

  h3 {
    margin: 0;
    font-size: 16px;
    font-weight: 600;
    color: var(--color-text-primary, #222);
  }

  .close-btn {
    background: none;
    border: none;
    font-size: 18px;
    cursor: pointer;
    color: var(--color-text-secondary, #888);
    padding: 4px 8px;
    border-radius: 6px;
    line-height: 1;

    &:hover {
      background: var(--color-hover, rgba(0, 0, 0, 0.06));
    }
  }
}

.search-bar {
  display: flex;
  gap: 8px;
  padding: 10px 16px;
  flex-shrink: 0;

  .search-input {
    flex: 1;
    padding: 8px 12px;
    border: 1px solid var(--color-border, rgba(0, 0, 0, 0.15));
    border-radius: 8px;
    font-size: 14px;
    background: var(--color-input-bg, var(--color-surface, #f5f5f5));
    color: var(--color-text-primary, #222);
    outline: none;

    &:focus {
      border-color: var(--color-primary, #4a90e2);
    }
  }

  .search-btn {
    padding: 8px 14px;
    background: var(--color-primary, #4a90e2);
    color: #fff;
    border: none;
    border-radius: 8px;
    font-size: 14px;
    cursor: pointer;
    white-space: nowrap;

    &:hover {
      opacity: 0.88;
    }
  }
}

.loading,
.empty-state,
.error-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 32px 16px;
  color: var(--color-text-secondary, #888);
  font-size: 14px;
  gap: 10px;
}

.retry-btn {
  padding: 6px 16px;
  background: var(--color-primary, #4a90e2);
  color: #fff;
  border: none;
  border-radius: 6px;
  font-size: 13px;
  cursor: pointer;
}

.results-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px;
  padding: 4px;
  overflow-y: auto;
  flex: 1;
  min-height: 0;

  .result-img {
    width: 100%;
    aspect-ratio: 1;
    object-fit: cover;
    cursor: pointer;
    border-radius: 4px;
    transition: opacity 0.15s;

    &:hover {
      opacity: 0.85;
    }
  }
}

.sentinel {
  height: 1px;
  flex-shrink: 0;
}

.loading-more {
  text-align: center;
  padding: 12px;
  font-size: 13px;
  color: var(--color-text-secondary, #888);
  flex-shrink: 0;
}

// 滑入動畫
.slide-up-panel-enter-active,
.slide-up-panel-leave-active {
  transition: transform 0.28s cubic-bezier(0.32, 0.72, 0, 1);
}

.slide-up-panel-enter-from,
.slide-up-panel-leave-to {
  transform: translateY(100%);
}
</style>
