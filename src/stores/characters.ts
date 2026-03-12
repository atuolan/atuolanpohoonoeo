/**
 * 角色 Store
 * 管理角色列表狀態
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { StoredCharacter } from '@/types/character'
import { getCharacterService } from '@/services/CharacterService'

export const useCharactersStore = defineStore('characters', () => {
  // ===== State =====
  const characters = ref<StoredCharacter[]>([])
  const currentCharacterId = ref<string | null>(null)
  const isLoading = ref(false)
  const searchQuery = ref('')
  const filterTags = ref<string[]>([])

  // ===== Getters =====
  const currentCharacter = computed(() => {
    if (!currentCharacterId.value) return null
    return characters.value.find(c => c.id === currentCharacterId.value) ?? null
  })

  const filteredCharacters = computed(() => {
    let result = characters.value

    // 搜索過濾
    if (searchQuery.value) {
      const query = searchQuery.value.toLowerCase()
      result = result.filter(c => {
        const name = c.nickname || c.data.name
        return (
          name.toLowerCase().includes(query) ||
          c.data.description?.toLowerCase().includes(query)
        )
      })
    }

    // 標籤過濾
    if (filterTags.value.length > 0) {
      result = result.filter(c =>
        filterTags.value.some(tag => c.data.tags?.includes(tag))
      )
    }

    return result
  })

  const allTags = computed(() => {
    const tags = new Set<string>()
    for (const c of characters.value) {
      for (const tag of c.data.tags || []) {
        tags.add(tag)
      }
    }
    return Array.from(tags).sort()
  })

  const characterCount = computed(() => characters.value.length)

  // ===== Actions =====

  /**
   * 載入所有角色
   */
  async function loadCharacters(): Promise<void> {
    isLoading.value = true
    try {
      const service = getCharacterService()
      characters.value = await service.getAll()
    } catch (e) {
      console.error('[CharactersStore] Failed to load characters:', e)
    } finally {
      isLoading.value = false
    }
  }

  /**
   * 創建角色
   */
  async function createCharacter(data: Partial<StoredCharacter>): Promise<StoredCharacter | null> {
    try {
      const service = getCharacterService()
      const character = await service.create(data)
      characters.value.push(character)
      return character
    } catch (e) {
      console.error('[CharactersStore] Failed to create character:', e)
      return null
    }
  }

  /**
   * 更新角色
   */
  async function updateCharacter(id: string, updates: Partial<StoredCharacter>): Promise<boolean> {
    try {
      const service = getCharacterService()
      const updated = await service.update(id, updates)
      if (updated) {
        const index = characters.value.findIndex(c => c.id === id)
        if (index !== -1) {
          characters.value[index] = updated
        }
        return true
      }
      return false
    } catch (e) {
      console.error('[CharactersStore] Failed to update character:', e)
      return false
    }
  }

  /**
   * 刪除角色
   */
  async function deleteCharacter(id: string): Promise<boolean> {
    try {
      const service = getCharacterService()
      const success = await service.delete(id)
      if (success) {
        characters.value = characters.value.filter(c => c.id !== id)
        if (currentCharacterId.value === id) {
          currentCharacterId.value = null
        }
        return true
      }
      return false
    } catch (e) {
      console.error('[CharactersStore] Failed to delete character:', e)
      return false
    }
  }

  /**
   * 設置當前角色
   */
  function setCurrentCharacter(id: string | null): void {
    currentCharacterId.value = id
  }

  /**
   * 設置搜索查詢
   */
  function setSearchQuery(query: string): void {
    searchQuery.value = query
  }

  /**
   * 設置標籤過濾
   */
  function setFilterTags(tags: string[]): void {
    filterTags.value = tags
  }

  /**
   * 清除過濾
   */
  function clearFilters(): void {
    searchQuery.value = ''
    filterTags.value = []
  }

  /**
   * 根據 ID 獲取角色
   */
  function getCharacterById(id: string): StoredCharacter | null {
    return characters.value.find(c => c.id === id) ?? null
  }

  return {
    // State
    characters,
    currentCharacterId,
    isLoading,
    searchQuery,
    filterTags,
    // Getters
    currentCharacter,
    filteredCharacters,
    allTags,
    characterCount,
    // Actions
    loadCharacters,
    createCharacter,
    updateCharacter,
    deleteCharacter,
    setCurrentCharacter,
    setSearchQuery,
    setFilterTags,
    clearFilters,
    getCharacterById,
  }
})
