<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { LorebookCard } from '@/components/common'
import { ListSettingsModal } from '@/components/modals'
import { useLorebooksStore } from '@/stores'

// 列表設定類型
interface ListSettings {
  columns: number
  cardSize: 'small' | 'medium' | 'large'
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

// 搜尋關鍵字
const searchQuery = ref('')

// 設定模態框
const showSettings = ref(false)

// 列表設定
const listSettings = ref<ListSettings>({
  columns: 1,
  cardSize: 'medium',
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

// 從 store 獲取世界書列表
const filteredLorebooks = computed((): DisplayLorebook[] => {
  return lorebooksStore.filteredLorebooks.map(lb => {
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

// 載入數據和設定
onMounted(() => {
  lorebooksStore.loadLorebooks()
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
    <!-- 標題欄 -->
    <header class="soft-header gradient">
      <button class="header-back" @click="handleBack">
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/>
        </svg>
      </button>
      
      <h1 class="header-title">世界書庫</h1>
      
      <div class="header-actions">
        <!-- 導入按鈕 -->
        <button class="header-btn" title="導入世界書" @click.stop="handleImport">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/>
          </svg>
        </button>
        
        <!-- 設定按鈕 -->
        <button class="header-btn" title="列表設定" @click.stop="openSettings">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M3 3v8h8V3H3zm6 6H5V5h4v4zm-6 4v8h8v-8H3zm6 6H5v-4h4v4zm4-16v8h8V3h-8zm6 6h-4V5h4v4zm-6 4v8h8v-8h-8zm6 6h-4v-4h4v4z"/>
          </svg>
        </button>
        
        <!-- 創建按鈕 -->
        <button class="header-btn primary" title="創建世界書" @click="handleCreate">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
          </svg>
        </button>
      </div>
    </header>
    
    <!-- 搜尋欄 -->
    <div class="search-bar">
      <div class="soft-search">
        <svg class="search-icon" viewBox="0 0 24 24" fill="currentColor">
          <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/>
        </svg>
        <input 
          :value="searchQuery"
          @input="updateSearch(($event.target as HTMLInputElement).value)"
          type="text" 
          placeholder="搜尋世界書..."
        />
        <button v-if="searchQuery" class="clear-btn" @click="updateSearch('')">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
          </svg>
        </button>
      </div>
    </div>
    
    <!-- 世界書列表 -->
    <main class="soft-content list">
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
        @click="handleLorebookClick"
        @delete="handleDelete"
      />
      
      <!-- 空狀態 -->
      <div v-if="filteredLorebooks.length === 0" class="soft-empty">
        <svg class="empty-icon" viewBox="0 0 24 24" fill="currentColor">
          <path d="M18 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zM6 4h5v8l-2.5-1.5L6 12V4z"/>
        </svg>
        <p class="empty-title">
          {{ searchQuery ? '找不到符合的世界書' : '還沒有世界書' }}
        </p>
        <p class="empty-text">
          {{ searchQuery ? '試試其他關鍵字' : '點擊右上角按鈕創建或導入世界書' }}
        </p>
        <button v-if="!searchQuery" class="soft-btn primary empty-action" @click="handleCreate">
          創建世界書
        </button>
      </div>
    </main>
    
    <!-- 浮動添加按鈕（移動端） -->
    <button class="soft-fab mobile-only" @click="handleCreate">
      <svg viewBox="0 0 24 24" fill="currentColor">
        <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
      </svg>
    </button>
    
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
  background: var(--color-background);
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

// 列表佈局
.soft-content.list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-width: 800px;
  margin: 0 auto;
  width: 100%;

  // 防止卡片在 flex 容器中被壓縮
  > * {
    flex-shrink: 0;
  }
}

.header-btn.primary {
  background: linear-gradient(135deg, var(--color-primary), var(--color-secondary));
  color: white;
  
  &:hover {
    transform: scale(1.05);
  }
}

// 移動端浮動按鈕
.mobile-only {
  display: none;
  
  @media (max-width: 600px) {
    display: flex;
  }
}

@media (min-width: 601px) {
  .soft-fab {
    display: none;
  }
}
</style>
