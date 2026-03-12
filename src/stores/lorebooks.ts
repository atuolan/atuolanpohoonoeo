/**
 * 世界書 Store
 * 管理世界書列表狀態
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Lorebook, WorldInfoEntry, WorldInfoSettings } from '@/types/worldinfo'
import { getLorebookService } from '@/services/LorebookService'

export const useLorebooksStore = defineStore('lorebooks', () => {
  // ===== State =====
  const lorebooks = ref<Lorebook[]>([])
  const currentLorebookId = ref<string | null>(null)
  const isLoading = ref(false)
  const searchQuery = ref('')
  const globalSettings = ref<WorldInfoSettings | null>(null)

  // ===== Getters =====
  const currentLorebook = computed(() => {
    if (!currentLorebookId.value) return null
    return lorebooks.value.find(l => l.id === currentLorebookId.value) ?? null
  })

  const filteredLorebooks = computed(() => {
    if (!searchQuery.value) return lorebooks.value

    const query = searchQuery.value.toLowerCase()
    return lorebooks.value.filter(l =>
      l.name.toLowerCase().includes(query) ||
      l.description?.toLowerCase().includes(query)
    )
  })

  const lorebookCount = computed(() => lorebooks.value.length)

  const totalEntryCount = computed(() => {
    return lorebooks.value.reduce((sum, l) => sum + l.entries.length, 0)
  })

  // ===== Actions =====

  /**
   * 載入所有世界書
   */
  async function loadLorebooks(): Promise<void> {
    isLoading.value = true
    try {
      const service = getLorebookService()
      lorebooks.value = await service.getAll()
      globalSettings.value = service.getGlobalSettings()
    } catch (e) {
      console.error('[LorebooksStore] Failed to load lorebooks:', e)
    } finally {
      isLoading.value = false
    }
  }

  /**
   * 創建世界書
   */
  async function createLorebook(data: Partial<Lorebook>): Promise<Lorebook | null> {
    try {
      const service = getLorebookService()
      const lorebook = await service.create(data)
      lorebooks.value.push(lorebook)
      return lorebook
    } catch (e) {
      console.error('[LorebooksStore] Failed to create lorebook:', e)
      return null
    }
  }

  /**
   * 更新世界書
   */
  async function updateLorebook(id: string, updates: Partial<Lorebook>): Promise<boolean> {
    try {
      const service = getLorebookService()
      const updated = await service.update(id, updates)
      if (updated) {
        const index = lorebooks.value.findIndex(l => l.id === id)
        if (index !== -1) {
          lorebooks.value[index] = updated
        }
        return true
      }
      return false
    } catch (e) {
      console.error('[LorebooksStore] Failed to update lorebook:', e)
      return false
    }
  }

  /**
   * 刪除世界書
   */
  async function deleteLorebook(id: string): Promise<boolean> {
    try {
      const service = getLorebookService()
      const success = await service.delete(id)
      if (success) {
        lorebooks.value = lorebooks.value.filter(l => l.id !== id)
        if (currentLorebookId.value === id) {
          currentLorebookId.value = null
        }
        return true
      }
      return false
    } catch (e) {
      console.error('[LorebooksStore] Failed to delete lorebook:', e)
      return false
    }
  }

  /**
   * 添加條目
   */
  async function addEntry(lorebookId: string, entry?: Partial<WorldInfoEntry>): Promise<WorldInfoEntry | null> {
    try {
      const service = getLorebookService()
      const newEntry = await service.addEntry(lorebookId, entry)
      if (newEntry) {
        const lorebook = lorebooks.value.find(l => l.id === lorebookId)
        if (lorebook) {
          lorebook.entries.push(newEntry)
        }
        return newEntry
      }
      return null
    } catch (e) {
      console.error('[LorebooksStore] Failed to add entry:', e)
      return null
    }
  }

  /**
   * 更新條目
   */
  async function updateEntry(
    lorebookId: string,
    entryUid: number,
    updates: Partial<WorldInfoEntry>
  ): Promise<boolean> {
    try {
      const service = getLorebookService()
      const updated = await service.updateEntry(lorebookId, entryUid, updates)
      if (updated) {
        const lorebook = lorebooks.value.find(l => l.id === lorebookId)
        if (lorebook) {
          const index = lorebook.entries.findIndex(e => e.uid === entryUid)
          if (index !== -1) {
            lorebook.entries[index] = updated
          }
        }
        return true
      }
      return false
    } catch (e) {
      console.error('[LorebooksStore] Failed to update entry:', e)
      return false
    }
  }

  /**
   * 刪除條目
   */
  async function deleteEntry(lorebookId: string, entryUid: number): Promise<boolean> {
    try {
      const service = getLorebookService()
      const success = await service.deleteEntry(lorebookId, entryUid)
      if (success) {
        const lorebook = lorebooks.value.find(l => l.id === lorebookId)
        if (lorebook) {
          lorebook.entries = lorebook.entries.filter(e => e.uid !== entryUid)
        }
        return true
      }
      return false
    } catch (e) {
      console.error('[LorebooksStore] Failed to delete entry:', e)
      return false
    }
  }

  /**
   * 設置當前世界書
   */
  function setCurrentLorebook(id: string | null): void {
    currentLorebookId.value = id
  }

  /**
   * 設置搜索查詢
   */
  function setSearchQuery(query: string): void {
    searchQuery.value = query
  }

  /**
   * 保存全局設定
   */
  function saveGlobalSettings(settings: WorldInfoSettings): void {
    const service = getLorebookService()
    service.saveGlobalSettings(settings)
    globalSettings.value = settings
  }

  /**
   * 根據 ID 獲取世界書
   */
  function getLorebookById(id: string): Lorebook | null {
    return lorebooks.value.find(l => l.id === id) ?? null
  }

  /**
   * 獲取角色綁定的世界書
   */
  function getLorebooksForCharacter(lorebookIds: string[]): Lorebook[] {
    return lorebooks.value.filter(l => lorebookIds.includes(l.id))
  }

  return {
    // State
    lorebooks,
    currentLorebookId,
    isLoading,
    searchQuery,
    globalSettings,
    // Getters
    currentLorebook,
    filteredLorebooks,
    lorebookCount,
    totalEntryCount,
    // Actions
    loadLorebooks,
    createLorebook,
    updateLorebook,
    deleteLorebook,
    addEntry,
    updateEntry,
    deleteEntry,
    setCurrentLorebook,
    setSearchQuery,
    saveGlobalSettings,
    getLorebookById,
    getLorebooksForCharacter,
  }
})
