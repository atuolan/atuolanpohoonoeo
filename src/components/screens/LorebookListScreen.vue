<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { LorebookCard } from '@/components/common'
import { ListSettingsModal } from '@/components/modals'
import { useLorebooksStore, useCharactersStore } from '@/stores'
import { getImportExportService } from '@/services/ImportExportService'

// 列表設定類型
interface ListSettings {
  columns: number
  showCreator: boolean
  showTags: boolean
  showLorebookCount: boolean
  showDescription: boolean
  sortBy: 'name' | 'updated' | 'created'
  sortOrder: 'asc' | 'desc'
}

// 顯示用的世界書類型
interface DisplayLorebook {
  id: string
  name: string
  description?: string
  entries: { keys: string[] }[]
  recursive_scanning: boolean
  max_recursion_steps: number
  updatedAt: number
}

// Emits
const emit = defineEmits<{
  (e: 'back'): void
  (e: 'select', id: string): void
  (e: 'import'): void
  (e: 'create'): void
}>()

// Store
const lorebooksStore = useLorebooksStore()
const charactersStore = useCharactersStore()

// 搜尋關鍵字：store 裡的搜尋會留到下次進來，輸入框要跟著顯示
const searchQuery = ref(lorebooksStore.searchQuery)

// 設定模態框
const showSettings = ref(false)

// 列表設定
const listSettings = ref<ListSettings>({
  columns: 1,
  showCreator: true,
  showTags: true,
  showLorebookCount: true,
  showDescription: true,
  sortBy: 'updated',
  sortOrder: 'desc'
})

// 同步搜索到 store
function updateSearch(value: string) {
  searchQuery.value = value
  lorebooksStore.setSearchQuery(value)
}

const nameCollator = new Intl.Collator('zh-Hant', { numeric: true })

// 從 store 獲取世界書列表，照列表設定排序（以前排序設定完全沒套用）
const filteredLorebooks = computed((): DisplayLorebook[] => {
  const { sortBy, sortOrder } = listSettings.value
  const direction = sortOrder === 'asc' ? 1 : -1
  const sorted = [...lorebooksStore.filteredLorebooks].sort((a, b) => {
    if (sortBy === 'name') return direction * nameCollator.compare(a.name, b.name)
    const key = sortBy === 'created' ? 'createdAt' : 'updatedAt'
    return direction * ((a[key] ?? 0) - (b[key] ?? 0))
  })
  return sorted.map(lb => {
    // 防禦：entries 可能是物件（SillyTavern 格式）而非陣列
    const entriesArray = Array.isArray(lb.entries)
      ? lb.entries
      : (typeof lb.entries === 'object' && lb.entries ? Object.values(lb.entries) : [])
    return {
      id: lb.id,
      name: lb.name,
      description: lb.description,
      entries: entriesArray.map((e: any) => ({ keys: Array.isArray(e.key) ? e.key : (typeof e.key === 'string' ? [e.key] : []) })),
      recursive_scanning: lb.recursiveScanning ?? false,
      max_recursion_steps: 10,
      updatedAt: lb.updatedAt
    }
  })
})

// 每本世界書被哪些角色綁定（顯示角色名稱）
const boundNamesById = computed<Record<string, string[]>>(() => {
  const map: Record<string, string[]> = {}
  for (const character of charactersStore.characters) {
    const displayName = character.nickname || character.data?.name || ''
    for (const lorebookId of character.lorebookIds ?? []) {
      if (!map[lorebookId]) map[lorebookId] = []
      if (displayName && !map[lorebookId].includes(displayName)) {
        map[lorebookId].push(displayName)
      }
    }
  }
  return map
})

// 批量選取
const selecting = ref(false)
const selectedIds = ref<Set<string>>(new Set())

// 同名世界書分組（可能是重複匯入）
const duplicateNames = computed<{ name: string; count: number }[]>(() => {
  const groups = new Map<string, number>()
  for (const lorebook of lorebooksStore.lorebooks) {
    const name = (lorebook.name || '').trim()
    if (!name) continue
    groups.set(name, (groups.get(name) ?? 0) + 1)
  }
  return Array.from(groups.entries())
    .filter(([, count]) => count > 1)
    .map(([name, count]) => ({ name, count }))
})

const dupDismissed = ref(false)

const showDuplicateNotice = computed(() =>
  !selecting.value &&
  !searchQuery.value.trim() &&
  duplicateNames.value.length > 0 &&
  !dupDismissed.value
)

const duplicateNoticeText = computed(() => {
  const groups = duplicateNames.value
  if (groups.length === 0) return ''
  if (groups.length === 1) {
    return `「${groups[0].name}」有 ${groups[0].count} 本，可能重複匯入`
  }
  return `有 ${groups.length} 組同名世界書，可能重複匯入`
})

const allSelected = computed(() =>
  filteredLorebooks.value.length > 0 &&
  filteredLorebooks.value.every(lb => selectedIds.value.has(lb.id))
)

const selectedCount = computed(() => selectedIds.value.size)

function startSelect() {
  selecting.value = true
  selectedIds.value = new Set()
}

function endSelect() {
  selecting.value = false
  selectedIds.value = new Set()
}

function toggleSelect(id: string) {
  const next = new Set(selectedIds.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  selectedIds.value = next
}

function toggleSelectAll() {
  if (allSelected.value) {
    selectedIds.value = new Set()
    return
  }
  selectedIds.value = new Set(filteredLorebooks.value.map(lb => lb.id))
}

// 匯出單本世界書
async function exportOne(id: string) {
  const svc = getImportExportService()
  const lorebook = lorebooksStore.lorebooks.find(l => l.id === id)
  const safeName = (lorebook?.name || 'lorebook').replace(/[<>:"/\\|?*]/g, '_')
  const blob = await svc.exportLorebookAsJson(id)
  if (blob) {
    svc.downloadBlob(blob, `${safeName}.json`)
  }
}

// 批量匯出
async function bulkExport() {
  if (selectedIds.value.size === 0) return
  for (const id of Array.from(selectedIds.value)) {
    await exportOne(id)
  }
  endSelect()
}

// 批量刪除
async function bulkDelete() {
  const ids = Array.from(selectedIds.value)
  if (ids.length === 0) return
  if (!confirm(`確定要刪除選取的 ${ids.length} 本世界書嗎？此操作不可恢復！`)) return
  for (const id of ids) {
    await lorebooksStore.deleteLorebook(id)
  }
  endSelect()
}

// 綁定到角色
const showBindPicker = ref(false)
const bindCharIds = ref<Set<string>>(new Set())

function openBindPicker() {
  if (selectedIds.value.size === 0) return
  bindCharIds.value = new Set()
  showBindPicker.value = true
}

function toggleBindChar(id: string) {
  const next = new Set(bindCharIds.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  bindCharIds.value = next
}

async function confirmBind() {
  const bookIds = Array.from(selectedIds.value)
  if (bookIds.length === 0 || bindCharIds.value.size === 0) return
  for (const charId of Array.from(bindCharIds.value)) {
    const character = charactersStore.characters.find(c => c.id === charId)
    if (!character) continue
    const merged = Array.from(new Set([...(character.lorebookIds ?? []), ...bookIds]))
    await charactersStore.updateCharacter(charId, { lorebookIds: merged })
  }
  showBindPicker.value = false
  bindCharIds.value = new Set()
  endSelect()
}

// ⋯ 更多選單
const sheetId = ref<string | null>(null)
const sheetLorebook = computed(() =>
  sheetId.value ? lorebooksStore.lorebooks.find(l => l.id === sheetId.value) ?? null : null
)

function openSheet(id: string) {
  sheetId.value = id
}

function closeSheet() {
  sheetId.value = null
}

function handleSheetEdit() {
  const id = sheetId.value
  closeSheet()
  if (id) emit('select', id)
}

async function handleSheetExport() {
  const id = sheetId.value
  closeSheet()
  if (id) await exportOne(id)
}

async function handleSheetDelete() {
  const id = sheetId.value
  closeSheet()
  if (id) await handleDelete(id)
}

// 載入數據和設定
onMounted(() => {
  lorebooksStore.loadLorebooks()
  if (charactersStore.characters.length === 0) {
    charactersStore.loadCharacters()
  }
  const saved = localStorage.getItem('lorebookListSettings')
  if (saved) {
    try {
      listSettings.value = { ...listSettings.value, ...JSON.parse(saved) }
    } catch { /* ignore */ }
  }
})

// 處理返回
function handleBack() {
  emit('back')
}

// 處理世界書點擊
function handleLorebookClick(id: string) {
  emit('select', id)
}

// 處理刪除
async function handleDelete(id: string) {
  if (confirm('確定要刪除這個世界書嗎？此操作不可恢復！')) {
    await lorebooksStore.deleteLorebook(id)
  }
}

// 處理導入
function handleImport() {
  emit('import')
}

// 處理創建
async function handleCreate() {
  const name = prompt('請輸入世界書名稱：', '新建世界書')
  if (name) {
    const newLorebook = await lorebooksStore.createLorebook({
      name: name.trim(),
      entries: [],
      recursiveScanning: false,
    })
    if (newLorebook) {
      emit('select', newLorebook.id)
    }
  }
}

// 提取世界書的關鍵詞預覽
function extractKeywords(lorebook: DisplayLorebook): string[] {
  const keywords: string[] = []
  for (const entry of lorebook.entries) {
    if (!Array.isArray(entry.keys)) continue
    for (const key of entry.keys) {
      if (key && !keywords.includes(key) && keywords.length < 10) {
        keywords.push(key)
      }
    }
  }
  return keywords
}

// 打開設定
function openSettings() {
  showSettings.value = true
}

// 更新列表設定
function updateListSettings(newSettings: ListSettings) {
  listSettings.value = newSettings
}
</script>

<template>
  <div class="screen-container lorebook-list-screen">
    <!-- 頂欄 -->
    <header class="lib-header">
      <template v-if="!selecting">
        <button type="button" class="icon-btn" aria-label="返回" @click="handleBack">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M15 5l-7 7 7 7"></path>
          </svg>
        </button>

        <div class="header-title-group">
          <h1 class="lib-title">世界書庫</h1>
          <span class="lib-count">{{ lorebooksStore.lorebooks.length }} 本</span>
        </div>

        <button
          type="button"
          class="text-btn"
          :disabled="lorebooksStore.lorebooks.length === 0"
          @click="startSelect"
        >
          選取
        </button>

        <button type="button" class="icon-btn" aria-label="匯入世界書" @click="handleImport">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M12 4v11M7 10l5 5 5-5"></path>
            <path d="M4 19h16"></path>
          </svg>
        </button>

        <button type="button" class="icon-btn" aria-label="列表設定" @click="openSettings">
          <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M3 17v2h6v-2H3zM3 5v2h10V5H3zm10 16v-2h8v-2h-8v-2h-2v6h2zM7 9v2H3v2h4v2h2V9H7zm14 4v-2H11v2h10zm-6-4h2V7h4V5h-4V3h-2v6z"/>
          </svg>
        </button>

        <button type="button" class="icon-btn primary" aria-label="新增世界書" @click="handleCreate">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true">
            <path d="M12 5v14M5 12h14"></path>
          </svg>
        </button>
      </template>

      <template v-else>
        <button type="button" class="text-btn" @click="endSelect">取消</button>
        <span class="select-title">已選 {{ selectedCount }} 本</span>
        <button type="button" class="text-btn accent" @click="toggleSelectAll">
          {{ allSelected ? '全不選' : '全選' }}
        </button>
      </template>
    </header>

    <!-- 搜尋欄 -->
    <div class="lib-search">
      <label class="search-field">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
          <circle cx="11" cy="11" r="7"></circle>
          <path d="M20 20l-3.5-3.5"></path>
        </svg>
        <input
          :value="searchQuery"
          type="search"
          placeholder="搜尋書名、條目關鍵詞"
          @input="updateSearch(($event.target as HTMLInputElement).value)"
        />
        <button v-if="searchQuery" type="button" class="search-clear" aria-label="清除搜尋" @click="updateSearch('')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18"></path>
          </svg>
        </button>
      </label>
    </div>

    <!-- 世界書列表 -->
    <main class="lib-content" :class="{ 'is-selecting': selecting }">
      <!-- 同名提示 -->
      <div v-if="showDuplicateNotice" class="dup-notice">
        <svg class="dup-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <rect x="8" y="8" width="12" height="12" rx="2"></rect>
          <path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"></path>
        </svg>
        <span class="dup-text">{{ duplicateNoticeText }}</span>
        <button type="button" class="dup-check" @click="updateSearch(duplicateNames[0].name)">檢查</button>
        <button type="button" class="dup-close" aria-label="關閉提示" @click="dupDismissed = true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18"></path>
          </svg>
        </button>
      </div>

      <LorebookCard
        v-for="lorebook in filteredLorebooks"
        :key="lorebook.id"
        :id="lorebook.id"
        :name="lorebook.name"
        :description="listSettings.showDescription ? lorebook.description : undefined"
        :entry-count="lorebook.entries.length"
        :recursive-enabled="lorebook.recursive_scanning"
        :max-recursion-steps="lorebook.max_recursion_steps"
        :keywords="listSettings.showTags ? extractKeywords(lorebook) : []"
        :updated-at="lorebook.updatedAt"
        :selecting="selecting"
        :is-selected="selectedIds.has(lorebook.id)"
        :bound-names="boundNamesById[lorebook.id] ?? []"
        @click="handleLorebookClick"
        @more="openSheet"
        @toggle-select="toggleSelect"
      />

      <!-- 空狀態 -->
      <div v-if="filteredLorebooks.length === 0" class="lib-empty">
        <svg class="empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z"></path>
          <path d="M5 17a3 3 0 0 1 3-3h11"></path>
        </svg>
        <p class="empty-title">
          {{ searchQuery ? '找不到符合的世界書' : '還沒有世界書' }}
        </p>
        <p class="empty-text">
          {{ searchQuery ? '試試其他關鍵字' : '點擊右上角按鈕創建或導入世界書' }}
        </p>
        <button v-if="!searchQuery" class="empty-action" @click="handleCreate">
          創建世界書
        </button>
      </div>
    </main>

    <!-- 批量操作列 -->
    <div v-if="selecting" class="bulk-bar">
      <button type="button" class="bulk-btn" :disabled="selectedCount === 0" @click="bulkExport">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M12 15V4M7 9l5-5 5 5"></path>
          <path d="M4 15v4h16v-4"></path>
        </svg>
        匯出
      </button>
      <button type="button" class="bulk-btn" :disabled="selectedCount === 0" @click="openBindPicker">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" aria-hidden="true">
          <circle cx="12" cy="8" r="4"></circle>
          <path d="M4 20a8 8 0 0 1 16 0"></path>
        </svg>
        綁定到角色
      </button>
      <button type="button" class="bulk-btn danger" :disabled="selectedCount === 0" @click="bulkDelete">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"></path>
        </svg>
        刪除
      </button>
    </div>

    <!-- 更多操作選單 -->
    <Transition name="sheet">
      <div v-if="sheetLorebook" class="lib-sheet" @click.stop>
        <button type="button" class="sheet-backdrop" aria-label="關閉" @click="closeSheet"></button>

        <div class="sheet-panel" role="dialog" aria-label="世界書操作">
          <span class="sheet-handle" aria-hidden="true"></span>

          <div class="sheet-head">
            <span class="sheet-name">{{ sheetLorebook.name }}</span>
          </div>

          <button type="button" class="sheet-item" @click="handleSheetEdit">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M4 20h4L19 9l-4-4L4 16z"></path>
            </svg>
            編輯世界書
          </button>

          <button type="button" class="sheet-item" @click="handleSheetExport">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M12 15V4M7 9l5-5 5 5"></path>
              <path d="M4 15v4h16v-4"></path>
            </svg>
            匯出 JSON
          </button>

          <button type="button" class="sheet-item danger" @click="handleSheetDelete">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"></path>
            </svg>
            刪除世界書
          </button>
        </div>
      </div>
    </Transition>

    <!-- 綁定到角色 -->
    <Transition name="sheet">
      <div v-if="showBindPicker" class="lib-sheet" @click.stop>
        <button type="button" class="sheet-backdrop" aria-label="關閉" @click="showBindPicker = false"></button>

        <div class="sheet-panel" role="dialog" aria-label="綁定到角色">
          <span class="sheet-handle" aria-hidden="true"></span>

          <div class="bind-head">
            <span class="sheet-name">綁定到角色</span>
            <span class="bind-sub">已選 {{ selectedCount }} 本世界書，會加到勾選的角色上</span>
          </div>

          <div class="bind-list">
            <label
              v-for="character in charactersStore.characters"
              :key="character.id"
              class="bind-row"
            >
              <input
                type="checkbox"
                :checked="bindCharIds.has(character.id)"
                @change="toggleBindChar(character.id)"
              />
              <span class="bind-avatar">
                <img v-if="character.avatar" :src="character.avatar" alt="" />
                <template v-else>{{ (character.nickname || character.data?.name || '?').charAt(0) }}</template>
              </span>
              <span class="bind-name">{{ character.nickname || character.data?.name }}</span>
            </label>
            <p v-if="charactersStore.characters.length === 0" class="bind-empty">
              還沒有角色
            </p>
          </div>

          <div class="bind-actions">
            <button type="button" class="bind-btn" @click="showBindPicker = false">取消</button>
            <button
              type="button"
              class="bind-btn primary"
              :disabled="bindCharIds.size === 0"
              @click="confirmBind"
            >
              綁定
            </button>
          </div>
        </div>
      </div>
    </Transition>

    <!-- 列表設定彈窗 -->
    <ListSettingsModal
      :show="showSettings"
      type="lorebook"
      @close="showSettings = false"
      @update="updateListSettings"
    />
  </div>
</template>

<style lang="scss" scoped>
.lorebook-list-screen {
  position: relative;
  background: var(--color-background);
  display: flex;
  flex-direction: column;
}

// ===== 頂欄 =====
.lib-header {
  flex: none;
  display: flex;
  align-items: center;
  gap: 4px;
  padding-top: calc(12px + var(--safe-top));
  padding-left: calc(8px + var(--safe-left));
  padding-right: calc(12px + var(--safe-right));
}

.header-title-group {
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

.icon-btn {
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
  transition: opacity var(--transition-fast), transform var(--transition-fast);

  svg {
    width: 22px;
    height: 22px;
  }

  &:active {
    transform: scale(0.96);
    opacity: 0.8;
  }

  &.primary {
    border-radius: 14px;
    background: var(--color-primary);
    color: var(--color-on-primary-contrast, var(--color-surface));
  }
}

.text-btn {
  flex: none;
  height: 44px;
  padding: 0 12px;
  border: none;
  border-radius: 22px;
  background: transparent;
  color: var(--color-text);
  font-family: inherit;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  transition: opacity var(--transition-fast);

  &.accent {
    color: var(--color-primary);
  }

  &:disabled {
    opacity: 0.45;
    cursor: default;
  }

  &:active:not(:disabled) {
    opacity: 0.7;
  }
}

.select-title {
  flex: 1;
  min-width: 0;
  text-align: center;
  font-size: 16px;
  font-weight: 700;
  color: var(--color-text);
  white-space: nowrap;
}

// ===== 搜尋 =====
.lib-search {
  flex: none;
  margin: 10px calc(16px + var(--safe-right)) 0 calc(16px + var(--safe-left));
}

.search-field {
  display: flex;
  align-items: center;
  gap: 10px;
  height: 46px;
  padding: 0 14px;
  border: 1px solid var(--color-border);
  border-radius: 14px;
  background: var(--color-surface);
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

    &::-webkit-search-cancel-button {
      display: none;
    }
  }
}

.search-clear {
  flex: none;
  width: 24px;
  height: 24px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: var(--color-border);
  color: var(--color-text-secondary);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;

  svg {
    width: 14px;
    height: 14px;
  }
}

// ===== 內容 =====
.lib-content {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px calc(16px + var(--safe-right)) calc(28px + var(--safe-bottom)) calc(16px + var(--safe-left));

  > * {
    flex-shrink: 0;
  }
}

.lib-content.is-selecting {
  padding-bottom: calc(104px + var(--safe-bottom));
}

// ===== 同名提示 =====
.dup-notice {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px 10px 14px;
  border-radius: 14px;
  background: color-mix(in srgb, var(--color-warning) 16%, var(--color-surface));
  color: var(--color-text);
  font-size: 13px;
}

.dup-icon {
  flex: none;
  width: 18px;
  height: 18px;
}

.dup-text {
  flex: 1;
  min-width: 0;
}

.dup-check {
  flex: none;
  height: 32px;
  padding: 0 10px;
  border: none;
  border-radius: 10px;
  background: color-mix(in srgb, var(--color-warning) 22%, transparent);
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

// ===== 空狀態 =====
.lib-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  gap: 6px;
  padding: 40px 20px;
  color: var(--color-text-secondary);

  .empty-icon {
    width: 44px;
    height: 44px;
    color: var(--color-text-muted);
    margin-bottom: 4px;
  }

  .empty-title {
    margin: 0;
    font-size: 15px;
    font-weight: 700;
    color: var(--color-text-secondary);
  }

  .empty-text {
    margin: 0;
    font-size: 13px;
    color: var(--color-text-muted);
  }

  .empty-action {
    margin-top: 12px;
    height: 44px;
    padding: 0 20px;
    border: none;
    border-radius: 14px;
    background: var(--color-primary);
    color: var(--color-on-primary-contrast, var(--color-surface));
    font-family: inherit;
    font-size: 14px;
    font-weight: 700;
    cursor: pointer;
  }
}

// ===== 批量操作列 =====
.bulk-bar {
  position: absolute;
  left: 12px;
  right: 12px;
  bottom: calc(16px + var(--safe-bottom));
  height: 72px;
  padding: 6px;
  box-sizing: border-box;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  border-radius: 24px;
  background: var(--color-text);
  color: var(--color-surface);
  box-shadow: 0 12px 30px rgba(0, 0, 0, 0.3);
}

.bulk-btn {
  border: none;
  border-radius: 18px;
  background: transparent;
  color: inherit;
  font-family: inherit;
  font-size: 12px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  cursor: pointer;
  transition: opacity var(--transition-fast);

  svg {
    width: 20px;
    height: 20px;
  }

  &.danger {
    color: var(--color-error);
    font-weight: 700;
  }

  &:disabled {
    opacity: 0.45;
    cursor: default;
  }

  &:active:not(:disabled) {
    opacity: 0.7;
  }
}

// ===== 底部面板 =====
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
  padding: 0 4px 10px;
}

.sheet-name {
  min-width: 0;
  font-size: 16px;
  font-weight: 700;
  color: var(--color-text);
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

// ===== 綁定到角色 =====
.bind-head {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 0 4px 10px;
}

.bind-sub {
  font-size: 12px;
  color: var(--color-text-secondary);
}

.bind-list {
  max-height: 50vh;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}

.bind-row {
  flex: none;
  height: 52px;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0 6px;
  border-top: 1px solid var(--color-border);
  cursor: pointer;

  input[type="checkbox"] {
    flex: none;
    width: 20px;
    height: 20px;
    margin: 0;
    accent-color: var(--color-primary);
    cursor: pointer;
  }
}

.bind-avatar {
  flex: none;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  overflow: hidden;
  background: var(--color-primary-light);
  color: var(--color-on-primary-light-contrast, var(--color-primary));
  font-size: 13px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
}

.bind-name {
  flex: 1;
  min-width: 0;
  font-size: 14px;
  color: var(--color-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.bind-empty {
  margin: 0;
  padding: 20px 6px;
  font-size: 13px;
  color: var(--color-text-secondary);
}

.bind-actions {
  display: flex;
  gap: 10px;
  padding-top: 14px;
}

.bind-btn {
  flex: 1;
  height: 48px;
  border: none;
  border-radius: 14px;
  background: var(--color-background);
  color: var(--color-text);
  font-family: inherit;
  font-size: 15px;
  font-weight: 700;
  cursor: pointer;
  transition: opacity var(--transition-fast);

  &.primary {
    background: var(--color-primary);
    color: var(--color-on-primary-contrast, var(--color-surface));
  }

  &:disabled {
    opacity: 0.45;
    cursor: default;
  }

  &:active:not(:disabled) {
    opacity: 0.8;
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
