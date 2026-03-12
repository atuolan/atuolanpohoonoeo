<script setup lang="ts">
import { CharacterCard } from "@/components/common";
import { ListSettingsModal } from "@/components/modals";
import { useCharactersStore } from "@/stores";
import { computed, onMounted, ref } from "vue";

// 列表設定類型
interface ListSettings {
  columns: number;
  cardSize: "small" | "medium" | "large";
  showAvatar: boolean;
  showCreator: boolean;
  showTags: boolean;
  showLorebookCount: boolean;
  showDescription: boolean;
  sortBy: "name" | "updated" | "created";
  sortOrder: "asc" | "desc";
}

// Emits
const emit = defineEmits<{
  (e: "back"): void;
  (e: "select", id: string): void;
  (e: "chat", id: string): void;
  (e: "multiChar", id: string): void;
  (e: "import"): void;
  (e: "create"): void;
  (e: "aiCreate"): void;
}>();

// Store
const charactersStore = useCharactersStore();

// 搜尋關鍵字
const searchQuery = ref("");

// 顯示創建選單
const showCreateMenu = ref(false);

// 設定模態框
const showSettings = ref(false);

// 列表設定
const listSettings = ref<ListSettings>({
  columns: 2,
  cardSize: "medium",
  showAvatar: true,
  showCreator: true,
  showTags: true,
  showLorebookCount: true,
  showDescription: true,
  sortBy: "updated",
  sortOrder: "desc",
});

// 載入設定
onMounted(() => {
  const saved = localStorage.getItem("characterListSettings");
  if (saved) {
    try {
      listSettings.value = { ...listSettings.value, ...JSON.parse(saved) };
    } catch {
      /* ignore */
    }
  }
});

// 同步搜索到 store
function updateSearch(value: string) {
  searchQuery.value = value;
  charactersStore.setSearchQuery(value);
}

// 驗證 creator 是否為有效的名稱（不是 CSS 或程式碼）
function isValidCreator(creator: string | undefined): boolean {
  if (!creator) return false;
  // 如果包含 CSS 語法、括號或過長，則視為無效
  if (creator.includes("{") || creator.includes("}")) return false;
  if (creator.includes("/*") || creator.includes("*/")) return false;
  if (creator.includes(":root") || creator.includes("var(")) return false;
  if (creator.length > 50) return false;
  return true;
}

// 從 store 獲取角色列表
const filteredCharacters = computed(() => {
  const characters = charactersStore.filteredCharacters;
  // 轉換為顯示格式
  return characters.map((c) => ({
    id: c.id,
    name: c.data.name,
    nickname: c.nickname || c.data.name,
    avatar:
      c.avatar || `https://api.dicebear.com/7.x/adventurer/svg?seed=${c.id}`,
    creator: isValidCreator(c.data.creator) ? c.data.creator : undefined,
    tags: c.data.tags,
    lorebookIds: c.lorebookIds,
  }));
});

// 載入數據
onMounted(() => {
  charactersStore.loadCharacters();
});

// 處理返回
function handleBack() {
  emit("back");
}

// 處理角色點擊
function handleCharacterClick(id: string) {
  emit("select", id);
}

// 處理開始聊天
function handleChat(id: string) {
  emit("chat", id);
}

// 處理刪除
async function handleDelete(id: string) {
  if (confirm("確定要刪除這個角色嗎？")) {
    await charactersStore.deleteCharacter(id);
  }
}

// 處理導入
function handleImport() {
  emit("import");
}

// 處理手動創建
function handleManualCreate() {
  showCreateMenu.value = false;
  emit("create");
}

// 處理 AI 生成
function handleAICreate() {
  showCreateMenu.value = false;
  emit("aiCreate");
}

// 切換創建選單
function toggleCreateMenu() {
  showCreateMenu.value = !showCreateMenu.value;
}

// 關閉選單（點擊外部時）
function closeMenus() {
  showCreateMenu.value = false;
}

// 打開設定
function openSettings() {
  showSettings.value = true;
}

// 更新列表設定
function updateListSettings(newSettings: ListSettings) {
  listSettings.value = newSettings;
}

// 計算網格樣式
const gridStyle = computed(() => ({
  "--grid-columns": listSettings.value.columns,
  "--card-size":
    listSettings.value.cardSize === "small"
      ? "120px"
      : listSettings.value.cardSize === "large"
        ? "200px"
        : "160px",
}));
</script>

<template>
  <div class="screen-container character-list-screen" @click="closeMenus">
    <!-- 標題欄 -->
    <header class="soft-header gradient">
      <button class="header-back" @click="handleBack">
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path
            d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"
          />
        </svg>
      </button>

      <h1 class="header-title">角色庫</h1>

      <div class="header-actions">
        <!-- 導入按鈕 -->
        <button class="header-btn" title="導入角色" @click.stop="handleImport">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z" />
          </svg>
        </button>

        <!-- 設定按鈕 -->
        <button class="header-btn" title="列表設定" @click.stop="openSettings">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path
              d="M3 3v8h8V3H3zm6 6H5V5h4v4zm-6 4v8h8v-8H3zm6 6H5v-4h4v4zm4-16v8h8V3h-8zm6 6h-4V5h4v4zm-6 4v8h8v-8h-8zm6 6h-4v-4h4v4z"
            />
          </svg>
        </button>

        <!-- 創建按鈕 + 下拉選單 -->
        <div class="create-dropdown" @click.stop>
          <button
            class="header-btn primary"
            title="創建角色"
            @click="toggleCreateMenu"
          >
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
            </svg>
          </button>

          <!-- 下拉選單 -->
          <Transition name="dropdown">
            <div v-if="showCreateMenu" class="dropdown-menu">
              <button class="dropdown-item" @click="handleManualCreate">
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path
                    d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"
                  />
                </svg>
                <span>手動創建</span>
              </button>
              <button class="dropdown-item ai" @click="handleAICreate">
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path
                    d="M19 9l1.25-2.75L23 5l-2.75-1.25L19 1l-1.25 2.75L15 5l2.75 1.25L19 9zm-7.5.5L9 4 6.5 9.5 1 12l5.5 2.5L9 20l2.5-5.5L17 12l-5.5-2.5zM19 15l-1.25 2.75L15 19l2.75 1.25L19 23l1.25-2.75L23 19l-2.75-1.25L19 15z"
                  />
                </svg>
                <span>AI 生成</span>
              </button>
            </div>
          </Transition>
        </div>
      </div>
    </header>

    <!-- 搜尋欄 -->
    <div class="search-bar">
      <div class="soft-search">
        <svg class="search-icon" viewBox="0 0 24 24" fill="currentColor">
          <path
            d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"
          />
        </svg>
        <input
          :value="searchQuery"
          @input="updateSearch(($event.target as HTMLInputElement).value)"
          type="text"
          placeholder="搜尋角色..."
        />
        <button v-if="searchQuery" class="clear-btn" @click="updateSearch('')">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path
              d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"
            />
          </svg>
        </button>
      </div>
    </div>

    <!-- 角色網格 -->
    <main class="soft-content grid" :style="gridStyle">
      <CharacterCard
        v-for="character in filteredCharacters"
        :key="character.id"
        :id="character.id"
        :name="character.name"
        :nickname="character.nickname"
        :avatar="character.avatar"
        :show-avatar="listSettings.showAvatar"
        :creator="listSettings.showCreator ? character.creator : undefined"
        :tags="listSettings.showTags ? character.tags : undefined"
        :lorebook-count="
          listSettings.showLorebookCount
            ? character.lorebookIds?.length || 0
            : 0
        "
        @click="handleCharacterClick"
        @chat="handleChat"
        @multi-char="(id: string) => emit('multiChar', id)"
        @delete="handleDelete"
      />

      <!-- 空狀態 -->
      <div v-if="filteredCharacters.length === 0" class="soft-empty">
        <svg class="empty-icon" viewBox="0 0 24 24" fill="currentColor">
          <path
            d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"
          />
        </svg>
        <p class="empty-title">
          {{ searchQuery ? "找不到符合的角色" : "還沒有角色卡" }}
        </p>
        <p class="empty-text">
          {{
            searchQuery ? "試試其他關鍵字" : "點擊右上角導入角色卡或創建新角色"
          }}
        </p>
        <button
          v-if="!searchQuery"
          class="soft-btn primary empty-action"
          @click="handleImport"
        >
          導入角色
        </button>
      </div>
    </main>

    <!-- 浮動添加按鈕（移動端） -->
    <button class="soft-fab mobile-only" @click="toggleCreateMenu">
      <svg viewBox="0 0 24 24" fill="currentColor">
        <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
      </svg>
    </button>

    <!-- 列表設定彈窗 -->
    <ListSettingsModal
      :show="showSettings"
      type="character"
      @close="showSettings = false"
      @update="updateListSettings"
    />
  </div>
</template>

<style lang="scss" scoped>
.character-list-screen {
  background: var(--color-background);

  // 動態網格 - 保留全局樣式，只覆蓋列數
  .soft-content.grid {
    grid-template-columns: repeat(var(--grid-columns, 2), 1fr);
    grid-auto-rows: min-content; // 使用 min-content 確保行高由內容決定
    align-content: start;

    // 確保卡片不被裁剪
    > * {
      min-height: 0;
    }

    // 響應式調整（如果需要自定義列數）
    @media (min-width: 600px) {
      grid-template-columns: repeat(var(--grid-columns, 3), 1fr);
    }

    @media (min-width: 900px) {
      grid-template-columns: repeat(var(--grid-columns, 4), 1fr);
    }
  }
}

// 搜尋欄
.search-bar {
  padding: 0 16px 12px;
  padding-left: calc(16px + var(--safe-left));
  padding-right: calc(16px + var(--safe-right));
  background: var(--color-surface);

  .soft-search {
    max-width: 600px;
    margin: 0 auto;
  }

  .clear-btn {
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--color-text-muted);
    border-radius: 50%;
    border: none;
    cursor: pointer;
    opacity: 0.6;
    transition: opacity var(--transition-fast);

    svg {
      width: 14px;
      height: 14px;
      color: white;
    }

    &:hover {
      opacity: 1;
    }
  }
}

// 創建下拉選單
.create-dropdown {
  position: relative;
}

.header-btn.primary {
  background: linear-gradient(
    135deg,
    var(--color-primary),
    var(--color-secondary)
  );
  color: white;

  &:hover {
    transform: scale(1.05);
  }
}

.dropdown-menu {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  background: var(--color-surface);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-lg);
  overflow-y: auto;
  overflow-x: hidden;
  min-width: 160px;
  max-height: calc(100dvh - 120px);
  max-height: calc(100svh - 120px);
  z-index: 100;

  &::-webkit-scrollbar {
    width: 4px;
  }

  &::-webkit-scrollbar-track {
    background: transparent;
  }

  &::-webkit-scrollbar-thumb {
    background: var(--color-border);
    border-radius: 2px;
  }
}

.dropdown-item {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 14px 18px;
  background: transparent;
  border: none;
  font-size: 15px;
  color: var(--color-text);
  cursor: pointer;
  transition: background var(--transition-fast);

  svg {
    width: 20px;
    height: 20px;
    color: var(--color-text-secondary);
  }

  &:hover {
    background: var(--color-background);
  }

  &.ai {
    svg {
      color: var(--color-primary);
    }

    &:hover {
      background: var(--color-primary-light);
    }
  }
}

// 下拉動畫
.dropdown-enter-active,
.dropdown-leave-active {
  transition: all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.dropdown-enter-from,
.dropdown-leave-to {
  opacity: 0;
  transform: translateY(-8px) scale(0.95);
}

// 移動端浮動按鈕
.mobile-only {
  display: none;

  @media (max-width: 600px) {
    display: flex;
  }
}

// 平板以上隱藏
@media (min-width: 601px) {
  .soft-fab {
    display: none;
  }
}
</style>
