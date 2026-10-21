<script setup lang="ts">
import { CharacterCard } from "@/components/common";
import { ListSettingsModal } from "@/components/modals";
import { db, DB_STORES } from "@/db/database";
import { CHARACTER_DELETE_CONFIRM } from "@/services/characterDeletion";
import { getImportExportService } from "@/services/ImportExportService";
import { useCharactersStore, useLorebooksStore } from "@/stores";
import type { StoredCharacter } from "@/types/character";
import type { Chat } from "@/types/chat";
import { computed, onMounted, ref } from "vue";

// 列表設定類型
interface ListSettings {
  columns: number;
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
const lorebooksStore = useLorebooksStore();

// 搜尋關鍵字：store 裡的搜尋會留到下次進來，輸入框要跟著顯示，不然清單被篩掉卻看不出原因
const searchQuery = ref(charactersStore.searchQuery);

// 顯示創建選單（頂欄右上角的 +）
const showCreateMenu = ref(false);

// 設定模態框
const showSettings = ref(false);

// 列表設定
const listSettings = ref<ListSettings>({
  columns: 2,
  showAvatar: true,
  showCreator: true,
  showTags: true,
  showLorebookCount: true,
  showDescription: true,
  sortBy: "updated",
  sortOrder: "desc",
});

// 檢視模式（網格 / 列表）
const viewMode = ref<"grid" | "list">("grid");

// 篩選膠囊
const FILTER_IDS = ["all", "recent", "lorebook"] as const;
type FilterId = (typeof FILTER_IDS)[number];
const filter = ref<FilterId>("all");

// 重複角色卡提示是否已被使用者關閉
const dupDismissed = ref(false);

// 各角色最近一次聊天時間（characterId → updatedAt）
const lastChatAt = ref<Record<string, number>>({});

const DAY_MS = 24 * 60 * 60 * 1000;

// 載入設定與最近聊天時間
onMounted(async () => {
  const saved = localStorage.getItem("characterListSettings");
  if (saved) {
    try {
      listSettings.value = { ...listSettings.value, ...JSON.parse(saved) };
    } catch {
      /* ignore */
    }
  }
  const savedView = localStorage.getItem("characterListViewMode");
  if (savedView === "grid" || savedView === "list") {
    viewMode.value = savedView;
  }

  try {
    await db.init();
    const chats = await db.getAll<Chat>(DB_STORES.CHATS);
    const latest: Record<string, number> = {};
    for (const chat of chats) {
      if (chat.isGroupChat || !chat.characterId) continue;
      const prev = latest[chat.characterId] ?? 0;
      if ((chat.updatedAt ?? 0) > prev) {
        latest[chat.characterId] = chat.updatedAt;
      }
    }
    lastChatAt.value = latest;
  } catch {
    lastChatAt.value = {};
  }
});

function setViewMode(mode: "grid" | "list") {
  viewMode.value = mode;
  try {
    localStorage.setItem("characterListViewMode", mode);
  } catch {
    /* ignore */
  }
}

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

// 世界書被刪掉後角色身上還留著 id，數量只算還在的
const existingLorebookIds = computed(
  () => new Set(lorebooksStore.lorebooks.map((lb) => lb.id)),
);

const nameCollator = new Intl.Collator("zh-Hant", { numeric: true });

// 取當天 0 點，用來做「今天 / 昨天」的日曆日比較
function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

// 最近聊天時間的相對文字
function relativeWhen(ts?: number): string {
  if (!ts) return "";
  const now = Date.now();
  const calendarDays = Math.round(
    (startOfDay(now) - startOfDay(ts)) / DAY_MS,
  );
  if (calendarDays <= 0) return "今天";
  if (calendarDays === 1) return "昨天";
  if (calendarDays < 7) return `${calendarDays} 天前`;

  const days = Math.floor((now - ts) / DAY_MS);
  if (days < 30) return `${Math.max(1, Math.floor(days / 7))} 週前`;
  if (days < 365) return `${Math.floor(days / 30)} 個月前`;
  return `${Math.floor(days / 365)} 年前`;
}

// 從 store 獲取角色列表，照列表設定排序
const filteredCharacters = computed(() => {
  const { sortBy, sortOrder } = listSettings.value;
  const direction = sortOrder === "asc" ? 1 : -1;
  const characters = [...charactersStore.filteredCharacters].sort((a, b) => {
    if (sortBy === "name") {
      return (
        direction *
        nameCollator.compare(a.nickname || a.data.name, b.nickname || b.data.name)
      );
    }
    const key = sortBy === "created" ? "createdAt" : "updatedAt";
    return direction * ((a[key] ?? 0) - (b[key] ?? 0));
  });
  // 轉換為顯示格式
  return characters.map((c) => {
    const lastAt = lastChatAt.value[c.id];
    return {
      id: c.id,
      name: c.data.name,
      nickname: c.nickname || c.data.name,
      avatar:
        c.avatar || `https://api.dicebear.com/7.x/adventurer/svg?seed=${c.id}`,
      creator: isValidCreator(c.data.creator) ? c.data.creator : undefined,
      tags: c.data.tags,
      lorebookCount: (c.lorebookIds ?? []).filter((id) =>
        existingLorebookIds.value.has(id),
      ).length,
      description: c.data.description,
      when: relativeWhen(lastAt),
      recent: typeof lastAt === "number" && Date.now() - lastAt <= 7 * DAY_MS,
    };
  });
});

// 套用篩選膠囊
const visibleCharacters = computed(() => {
  if (filter.value === "recent") {
    return filteredCharacters.value.filter((c) => c.recent);
  }
  if (filter.value === "lorebook") {
    return filteredCharacters.value.filter((c) => c.lorebookCount > 0);
  }
  return filteredCharacters.value;
});

// 篩選膠囊（數量跟著搜尋結果走）
const filterChips = computed<
  { id: FilterId; label: string; n: number }[]
>(() => [
  { id: "all", label: "全部", n: filteredCharacters.value.length },
  {
    id: "recent",
    label: "最近聊過",
    n: filteredCharacters.value.filter((c) => c.recent).length,
  },
  {
    id: "lorebook",
    label: "有世界書",
    n: filteredCharacters.value.filter((c) => c.lorebookCount > 0).length,
  },
]);

// 同名角色卡（可能是重複匯入）
const duplicateNames = computed(() => {
  const counts = new Map<string, number>();
  for (const c of charactersStore.characters) {
    const name = (c.data.name ?? "").trim();
    if (!name) continue;
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([name]) => name);
});

const showDupNotice = computed(
  () =>
    filter.value === "all" &&
    !searchQuery.value.trim() &&
    duplicateNames.value.length > 0 &&
    !dupDismissed.value,
);

// 更多操作底部選單
const sheetId = ref<string | null>(null);

const sheetCharacter = computed(
  () => filteredCharacters.value.find((c) => c.id === sheetId.value) ?? null,
);

const sheetSubtitle = computed(() => {
  const c = sheetCharacter.value;
  if (!c) return "";
  if (c.nickname && c.nickname !== c.name) return c.name;
  return c.creator || c.when || "角色卡";
});

function openSheet(id: string) {
  sheetId.value = id;
}

function closeSheet() {
  sheetId.value = null;
}

// 載入數據
onMounted(() => {
  charactersStore.loadCharacters();
  if (lorebooksStore.lorebooks.length === 0) {
    lorebooksStore.loadLorebooks();
  }
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
  closeSheet();
  if (confirm(CHARACTER_DELETE_CONFIRM)) {
    await charactersStore.deleteCharacter(id);
  }
}

// 處理匯入
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

// 編輯角色卡（底部選單）
function handleEdit(id: string) {
  closeSheet();
  emit("select", id);
}

// 建立副本
async function handleDuplicate(id: string) {
  closeSheet();
  const original = charactersStore.characters.find((c) => c.id === id);
  if (!original) return;
  const copy = JSON.parse(JSON.stringify(original)) as Partial<StoredCharacter>;
  delete copy.id;
  delete copy.createdAt;
  delete copy.updatedAt;
  if (copy.data) copy.data.name = `${original.data.name}（副本）`;
  if (copy.nickname) copy.nickname = `${copy.nickname}（副本）`;
  await charactersStore.createCharacter(copy);
}

// 匯出角色卡 JSON
async function handleExport(id: string) {
  const character = charactersStore.characters.find((c) => c.id === id);
  const safeName = (character?.data.name || "character").replace(
    /[<>:"/\\|?*]/g,
    "_",
  );
  closeSheet();
  const svc = getImportExportService();
  const blob = await svc.exportCharacterAsJson(id);
  if (blob) {
    svc.downloadBlob(blob, `${safeName}.json`);
  } else {
    alert("匯出失敗");
  }
}

const createMenuItems = [
  {
    label: "手動創建",
    ai: false,
    action: handleManualCreate,
    icon: "M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z",
  },
  {
    label: "AI 生成",
    ai: true,
    action: handleAICreate,
    icon: "M19 9l1.25-2.75L23 5l-2.75-1.25L19 1l-1.25 2.75L15 5l2.75 1.25L19 9zm-7.5.5L9 4 6.5 9.5 1 12l5.5 2.5L9 20l2.5-5.5L17 12l-5.5-2.5zM19 15l-1.25 2.75L15 19l2.75 1.25L19 23l1.25-2.75L23 19l-2.75-1.25L19 15z",
  },
];

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
}));
</script>

<template>
  <div class="screen-container character-list-screen" @click="closeMenus">
    <!-- 頂欄 -->
    <header class="lib-header">
      <button class="lib-icon-btn" aria-label="返回" @click.stop="handleBack">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="M15 5l-7 7 7 7" />
        </svg>
      </button>

      <div class="lib-title-wrap">
        <h1 class="lib-title">角色卡庫</h1>
        <span class="lib-count">{{ charactersStore.characters.length }} 張</span>
      </div>

      <div class="lib-actions" @click.stop>
        <!-- 匯入 -->
        <button
          class="lib-icon-btn"
          aria-label="匯入角色卡"
          @click.stop="handleImport"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.8"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="M12 4v11M7 10l5 5 5-5" />
            <path d="M4 19h16" />
          </svg>
        </button>

        <!-- 列表設定 -->
        <button
          class="lib-icon-btn"
          aria-label="列表設定"
          @click.stop="openSettings"
        >
          <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path
              d="M3 17v2h6v-2H3zM3 5v2h10V5H3zm10 16v-2h8v-2h-8v-2h-2v6h2zM7 9v2H3v2h4v2h2V9H7zm14 4v-2H11v2h10zm-6-4h2V7h4V5h-4V3h-2v6z"
            />
          </svg>
        </button>

        <!-- 新增角色卡 + 下拉選單 -->
        <div class="create-dropdown">
          <button
            class="lib-add-btn"
            aria-label="新增角色卡"
            @click.stop="toggleCreateMenu"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2.2"
              stroke-linecap="round"
              aria-hidden="true"
            >
              <path d="M12 5v14M5 12h14" />
            </svg>
          </button>

          <Transition name="dropdown">
            <div v-if="showCreateMenu" class="dropdown-menu">
              <button
                v-for="item in createMenuItems"
                :key="item.label"
                class="dropdown-item"
                :class="{ ai: item.ai }"
                @click.stop="item.action"
              >
                <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path :d="item.icon" />
                </svg>
                <span>{{ item.label }}</span>
              </button>
            </div>
          </Transition>
        </div>
      </div>
    </header>

    <!-- 搜尋框 -->
    <div class="lib-search">
      <label class="search-field">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          aria-hidden="true"
        >
          <circle cx="11" cy="11" r="7" />
          <path d="M20 20l-3.5-3.5" />
        </svg>
        <input
          :value="searchQuery"
          type="search"
          placeholder="搜尋名稱、標籤、創建者"
          aria-label="搜尋角色"
          @input="updateSearch(($event.target as HTMLInputElement).value)"
        />
        <button
          v-if="searchQuery"
          type="button"
          class="clear-btn"
          aria-label="清除搜尋"
          @click.stop="updateSearch('')"
        >
          <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path
              d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"
            />
          </svg>
        </button>
      </label>
    </div>

    <!-- 篩選列 -->
    <div class="lib-filters">
      <div class="chips" role="tablist" aria-label="篩選">
        <button
          v-for="chip in filterChips"
          :key="chip.id"
          type="button"
          role="tab"
          class="chip"
          :class="{ active: filter === chip.id }"
          :aria-selected="filter === chip.id"
          @click.stop="filter = chip.id"
        >
          {{ chip.label }}<span class="chip-n">{{ chip.n }}</span>
        </button>
      </div>

      <div class="view-toggle" role="group" aria-label="檢視方式">
        <button
          type="button"
          class="view-btn"
          :class="{ active: viewMode === 'grid' }"
          aria-label="格狀檢視"
          :aria-pressed="viewMode === 'grid'"
          @click.stop="setViewMode('grid')"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            aria-hidden="true"
          >
            <rect x="4" y="4" width="7" height="7" rx="1.5" />
            <rect x="13" y="4" width="7" height="7" rx="1.5" />
            <rect x="4" y="13" width="7" height="7" rx="1.5" />
            <rect x="13" y="13" width="7" height="7" rx="1.5" />
          </svg>
        </button>
        <button
          type="button"
          class="view-btn"
          :class="{ active: viewMode === 'list' }"
          aria-label="清單檢視"
          :aria-pressed="viewMode === 'list'"
          @click.stop="setViewMode('list')"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            aria-hidden="true"
          >
            <path d="M9 6h11M9 12h11M9 18h11" />
            <circle cx="4.5" cy="6" r="1" />
            <circle cx="4.5" cy="12" r="1" />
            <circle cx="4.5" cy="18" r="1" />
          </svg>
        </button>
      </div>
    </div>

    <!-- 內容區 -->
    <main class="lib-content">
      <!-- 重複角色卡提示 -->
      <div v-if="showDupNotice" class="dup-notice">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <rect x="8" y="8" width="12" height="12" rx="2" />
          <path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3" />
        </svg>
        <span class="dup-text">
          有 {{ duplicateNames.length }} 組同名角色卡，可能是重複匯入
        </span>
        <button
          type="button"
          class="dup-action"
          @click.stop="updateSearch(duplicateNames[0])"
        >
          檢查
        </button>
        <button
          type="button"
          class="dup-close"
          aria-label="關閉提示"
          @click.stop="dupDismissed = true"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            aria-hidden="true"
          >
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>

      <!-- 角色卡 -->
      <div
        v-if="visibleCharacters.length > 0"
        :class="viewMode === 'grid' ? 'card-grid' : 'card-list-box'"
        :style="gridStyle"
      >
        <CharacterCard
          v-for="character in visibleCharacters"
          :key="character.id"
          :id="character.id"
          :name="character.name"
          :nickname="character.nickname"
          :avatar="character.avatar"
          :layout="viewMode"
          :show-avatar="listSettings.showAvatar"
          :creator="listSettings.showCreator ? character.creator : undefined"
          :tags="listSettings.showTags ? character.tags : undefined"
          :description="
            listSettings.showDescription ? character.description : undefined
          "
          :lorebook-count="
            listSettings.showLorebookCount ? character.lorebookCount : 0
          "
          :when="character.when"
          @click="handleCharacterClick"
          @chat="handleChat"
          @multi-char="(id: string) => emit('multiChar', id)"
          @more="openSheet"
        />
      </div>

      <!-- 完全沒有角色卡 -->
      <div
        v-else-if="charactersStore.characters.length === 0"
        class="lib-empty"
      >
        <svg
          class="empty-icon"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.6"
          stroke-linecap="round"
          aria-hidden="true"
        >
          <circle cx="9" cy="8" r="3" />
          <path d="M3 19a6 6 0 0 1 12 0" />
          <path d="M16 5a3 3 0 0 1 0 6M18 19a6 6 0 0 0-2-4.5" />
        </svg>
        <p class="empty-title">還沒有角色卡</p>
        <p class="empty-text">點擊右上角導入角色卡或創建新角色</p>
        <button type="button" class="empty-action" @click.stop="handleImport">
          導入角色
        </button>
      </div>

      <!-- 搜尋／篩選沒有結果 -->
      <div v-else class="lib-empty">
        <svg
          class="empty-icon"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.6"
          stroke-linecap="round"
          aria-hidden="true"
        >
          <circle cx="11" cy="11" r="7" />
          <path d="M20 20l-3.5-3.5M8.5 11h5" />
        </svg>
        <p class="empty-title">找不到符合的角色</p>
        <p class="empty-text">換個關鍵字，或清除篩選看看</p>
      </div>
    </main>

    <!-- 更多操作底部選單 -->
    <Transition name="sheet">
      <div v-if="sheetCharacter" class="lib-sheet" @click.stop>
        <button
          type="button"
          class="sheet-backdrop"
          aria-label="關閉選單"
          @click="closeSheet"
        ></button>

        <div
          class="sheet-panel"
          role="dialog"
          :aria-label="`${sheetCharacter.nickname || sheetCharacter.name} 的操作`"
        >
          <span class="sheet-handle" aria-hidden="true"></span>

          <div class="sheet-head">
            <img
              class="sheet-avatar"
              :src="sheetCharacter.avatar"
              :alt="sheetCharacter.name"
            />
            <div class="sheet-meta">
              <span class="sheet-name">
                {{ sheetCharacter.nickname || sheetCharacter.name }}
              </span>
              <span class="sheet-sub">{{ sheetSubtitle }}</span>
            </div>
          </div>

          <button
            type="button"
            class="sheet-item"
            @click="handleEdit(sheetCharacter.id)"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path d="M4 20h4L19 9l-4-4L4 16z" />
            </svg>
            編輯角色卡
          </button>

          <button
            type="button"
            class="sheet-item"
            @click="handleDuplicate(sheetCharacter.id)"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <rect x="8" y="8" width="12" height="12" rx="2" />
              <path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3" />
            </svg>
            建立副本
          </button>

          <button
            type="button"
            class="sheet-item"
            @click="handleExport(sheetCharacter.id)"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path d="M12 15V4M7 9l5-5 5 5" />
              <path d="M4 15v4h16v-4" />
            </svg>
            匯出 JSON
          </button>

          <button
            type="button"
            class="sheet-item danger"
            @click="handleDelete(sheetCharacter.id)"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
            </svg>
            刪除角色卡
          </button>
        </div>
      </div>
    </Transition>

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
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--color-background);
}

// ===== 頂欄 =====
.lib-header {
  flex: none;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 12px calc(12px + var(--safe-right)) 0 calc(8px + var(--safe-left));
  padding-top: calc(12px + var(--safe-top));
  background: transparent;
  position: relative;
  z-index: 20;
}

.lib-icon-btn {
  flex: none;
  width: 44px;
  height: 44px;
  padding: 0;
  border: none;
  border-radius: 22px;
  background: transparent;
  color: var(--color-text);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background var(--transition-fast);

  svg {
    width: 22px;
    height: 22px;
  }

  &:active {
    background: var(--color-border);
  }
}

.lib-title-wrap {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.lib-title {
  margin: 0;
  font-family: "Noto Serif TC", "Source Han Serif TC", serif;
  font-size: 24px;
  font-weight: 900;
  letter-spacing: 0.04em;
  color: var(--color-text);
  white-space: nowrap;
}

.lib-count {
  font-size: 13px;
  color: var(--color-text-secondary);
  white-space: nowrap;
}

.lib-actions {
  flex: none;
  display: flex;
  align-items: center;
  gap: 2px;
}

.lib-add-btn {
  flex: none;
  width: 44px;
  height: 44px;
  padding: 0;
  border: none;
  border-radius: 14px;
  background: var(--color-primary);
  color: var(--color-on-primary-contrast);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;

  svg {
    width: 22px;
    height: 22px;
  }

  &:active {
    transform: scale(0.96);
  }
}

// 建立下拉選單
.create-dropdown {
  position: relative;
}

.dropdown-menu {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  min-width: 168px;
  background: var(--color-surface);
  border-radius: 16px;
  box-shadow: var(--shadow-lg);
  overflow: hidden;
  z-index: 100;
}

.dropdown-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  height: 48px;
  padding: 0 16px;
  background: transparent;
  border: none;
  font-family: inherit;
  font-size: 15px;
  color: var(--color-text);
  text-align: left;
  cursor: pointer;
  transition: background var(--transition-fast);

  svg {
    width: 20px;
    height: 20px;
    color: var(--color-text-secondary);
    flex: none;
  }

  &:active {
    background: var(--color-background);
  }

  &.ai svg {
    color: var(--color-primary);
  }
}

.dropdown-enter-active,
.dropdown-leave-active {
  transition: all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.dropdown-enter-from,
.dropdown-leave-to {
  opacity: 0;
  transform: translateY(-8px) scale(0.95);
}

// ===== 搜尋框 =====
.lib-search {
  flex: none;
  padding: 10px calc(16px + var(--safe-right)) 0
    calc(16px + var(--safe-left));
}

.search-field {
  display: flex;
  align-items: center;
  gap: 10px;
  height: 46px;
  padding: 0 14px;
  border-radius: 14px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  box-sizing: border-box;

  > svg {
    flex: none;
    width: 18px;
    height: 18px;
    color: var(--color-text-secondary);
  }

  input {
    flex: 1;
    min-width: 0;
    border: none;
    outline: none;
    background: transparent;
    font-family: inherit;
    font-size: 15px;
    color: var(--color-text);
    appearance: none;

    &::placeholder {
      color: var(--color-text-muted);
    }

    &::-webkit-search-cancel-button,
    &::-webkit-search-decoration {
      display: none;
    }
  }
}

.clear-btn {
  flex: none;
  width: 24px;
  height: 24px;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 50%;
  background: var(--color-text-muted);
  color: var(--color-surface);
  cursor: pointer;
  opacity: 0.7;

  svg {
    width: 14px;
    height: 14px;
  }

  &:hover {
    opacity: 1;
  }
}

// ===== 篩選列 =====
.lib-filters {
  flex: none;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px calc(16px + var(--safe-right)) 4px
    calc(16px + var(--safe-left));
}

.chips {
  flex: 1;
  min-width: 0;
  display: flex;
  gap: 6px;
  overflow-x: auto;
  scrollbar-width: none;

  &::-webkit-scrollbar {
    display: none;
  }
}

.chip {
  flex: none;
  height: 34px;
  padding: 0 12px;
  border-radius: 17px;
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  color: var(--color-text);
  font-family: inherit;
  font-size: 13px;
  font-weight: 500;
  display: flex;
  align-items: center;
  gap: 5px;
  white-space: nowrap;
  cursor: pointer;
  transition: background var(--transition-fast), color var(--transition-fast);

  &.active {
    background: var(--color-text);
    border-color: var(--color-text);
    color: var(--color-surface);
    font-weight: 700;
  }
}

.chip-n {
  font-size: 12px;
  opacity: 0.75;
}

.view-toggle {
  flex: none;
  display: flex;
  background: var(--color-border);
  border-radius: 12px;
  padding: 3px;
}

.view-btn {
  width: 36px;
  height: 32px;
  padding: 0;
  border: none;
  border-radius: 9px;
  background: transparent;
  color: var(--color-text);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;

  svg {
    width: 16px;
    height: 16px;
  }

  &.active {
    background: var(--color-surface);
  }
}

// ===== 內容區 =====
.lib-content {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  padding: 8px calc(16px + var(--safe-right))
    calc(28px + var(--safe-bottom)) calc(16px + var(--safe-left));
}

// 重複匯入提示
.dup-notice {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
  padding: 10px 8px 10px 14px;
  border-radius: 14px;
  background: color-mix(
    in srgb,
    var(--color-warning) 16%,
    var(--color-surface)
  );
  color: var(--color-text);
  font-size: 13px;

  > svg {
    flex: none;
    width: 18px;
    height: 18px;
    color: var(--color-text-secondary);
  }
}

.dup-text {
  flex: 1;
  min-width: 0;
}

.dup-action {
  flex: none;
  height: 32px;
  padding: 0 10px;
  border: none;
  border-radius: 10px;
  background: color-mix(
    in srgb,
    var(--color-warning) 26%,
    var(--color-surface)
  );
  color: var(--color-text);
  font-family: inherit;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}

.dup-close {
  flex: none;
  width: 32px;
  height: 32px;
  padding: 0;
  border: none;
  border-radius: 16px;
  background: transparent;
  color: var(--color-text-secondary);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;

  svg {
    width: 16px;
    height: 16px;
  }
}

// 格狀
.card-grid {
  display: grid;
  grid-template-columns: repeat(var(--grid-columns, 2), minmax(0, 1fr));
  gap: 12px;
  align-content: start;

  > * {
    min-height: 0;
  }

  @media (min-width: 600px) {
    grid-template-columns: repeat(var(--grid-columns, 3), minmax(0, 1fr));
  }

  @media (min-width: 900px) {
    grid-template-columns: repeat(var(--grid-columns, 4), minmax(0, 1fr));
  }
}

// 清單
.card-list-box {
  border-radius: 18px;
  background: var(--color-surface);
  overflow: hidden;
}

// 空狀態
.lib-empty {
  padding: 60px 20px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  text-align: center;
  color: var(--color-text-secondary);
}

.empty-icon {
  width: 36px;
  height: 36px;
  color: var(--color-text-secondary);
}

.empty-title {
  margin: 0;
  font-size: 15px;
  font-weight: 700;
  color: var(--color-text);
}

.empty-text {
  margin: 0;
  font-size: 13px;
  color: var(--color-text-secondary);
}

.empty-action {
  margin-top: 8px;
  height: 44px;
  padding: 0 22px;
  border: none;
  border-radius: 12px;
  background: var(--color-primary);
  color: var(--color-on-primary-contrast);
  font-family: inherit;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
}

// ===== 更多操作底部選單 =====
.lib-sheet {
  position: fixed;
  inset: 0;
  z-index: 200;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
}

.sheet-backdrop {
  flex: 1;
  padding: 0;
  border: none;
  background: rgba(0, 0, 0, 0.42);
  cursor: pointer;
}

.sheet-panel {
  flex: none;
  display: flex;
  flex-direction: column;
  background: var(--color-surface);
  border-radius: 24px 24px 0 0;
  padding: 10px 16px calc(28px + var(--safe-bottom));
  box-shadow: var(--shadow-lg);
}

.sheet-handle {
  align-self: center;
  width: 40px;
  height: 5px;
  border-radius: 3px;
  background: var(--color-border);
  margin-bottom: 12px;
}

.sheet-head {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0 4px 14px;
}

.sheet-avatar {
  flex: none;
  width: 44px;
  height: 54px;
  border-radius: 10px;
  object-fit: cover;
  background: var(--color-primary-light);
}

.sheet-meta {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.sheet-name {
  font-size: 16px;
  font-weight: 700;
  color: var(--color-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.sheet-sub {
  font-size: 12px;
  color: var(--color-text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.sheet-item {
  height: 52px;
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 0 6px;
  border: none;
  border-top: 1px solid var(--color-border);
  background: none;
  color: var(--color-text);
  font-family: inherit;
  font-size: 15px;
  text-align: left;
  cursor: pointer;

  svg {
    flex: none;
    width: 20px;
    height: 20px;
  }

  &:active {
    opacity: 0.7;
  }

  &.danger {
    color: var(--color-error);
    font-weight: 700;
  }
}

.sheet-enter-active,
.sheet-leave-active {
  transition: opacity 0.2s ease;

  .sheet-panel {
    transition: transform 0.24s cubic-bezier(0.2, 0.8, 0.2, 1);
  }
}

.sheet-enter-from,
.sheet-leave-to {
  opacity: 0;

  .sheet-panel {
    transform: translateY(100%);
  }
}
</style>
