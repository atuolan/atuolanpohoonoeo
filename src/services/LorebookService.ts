/**
 * 世界書服務
 * 管理世界書的 CRUD 操作
 */

import type {
  Lorebook,
  WorldInfoEntry,
  WorldInfoSettings,
} from '../types/worldinfo'
import {
  createDefaultWorldInfoEntry,
  createDefaultWorldInfoSettings,
} from '../types/worldinfo'
import { db, DB_STORES } from '../db/database'

const STORAGE_KEY = 'aguaphone_lorebooks'
const SETTINGS_KEY = 'aguaphone_worldinfo_settings'

/**
 * 正規化世界書的 entries 欄位
 * SillyTavern 格式的 entries 是物件 { "0": {...}, "1": {...} }，需轉為陣列
 */
function normalizeLorebook(lb: Lorebook): Lorebook {
  if (!Array.isArray(lb.entries)) {
    lb.entries = (typeof lb.entries === 'object' && lb.entries)
      ? Object.values(lb.entries)
      : []
  }
  // 正規化每個條目的 key 欄位，防止非陣列格式導致渲染崩潰
  for (const entry of lb.entries) {
    if (!Array.isArray(entry.key)) {
      entry.key = typeof entry.key === 'string'
        ? (entry.key as string).split(',').map((k: string) => k.trim()).filter(Boolean)
        : []
    }
    if (!Array.isArray(entry.keysecondary)) {
      entry.keysecondary = typeof entry.keysecondary === 'string'
        ? (entry.keysecondary as string).split(',').map((k: string) => k.trim()).filter(Boolean)
        : []
    }
  }
  return lb
}

/**
 * 世界書服務類
 */
export class LorebookService {
  /**
   * 獲取所有世界書
   */
  async getAll(): Promise<Lorebook[]> {
    try {
      let result: Lorebook[]
      if (db.isOpen()) {
        result = await db.getAll<Lorebook>(DB_STORES.LOREBOOKS)
      } else {
        const data = localStorage.getItem(STORAGE_KEY)
        result = data ? JSON.parse(data) : []
      }
      return result.map(normalizeLorebook)
    } catch (e) {
      console.error('[LorebookService] Failed to get all lorebooks:', e)
      return []
    }
  }

  /**
   * 根據 ID 獲取世界書
   */
  async getById(id: string): Promise<Lorebook | null> {
    try {
      if (db.isOpen()) {
        const lb = await db.get<Lorebook>(DB_STORES.LOREBOOKS, id)
        return lb ? normalizeLorebook(lb) : null
      }
      
      const all = await this.getAll()
      return all.find(l => l.id === id) ?? null
    } catch (e) {
      console.error('[LorebookService] Failed to get lorebook:', e)
      return null
    }
  }

  /**
   * 根據名稱獲取世界書
   */
  async getByName(name: string): Promise<Lorebook | null> {
    const all = await this.getAll()
    return all.find(l => l.name === name) ?? null
  }

  /**
   * 創建新世界書
   */
  async create(data: Partial<Lorebook> = {}): Promise<Lorebook> {
    const lorebook: Lorebook = {
      id: data.id || crypto.randomUUID(),
      name: data.name || 'New Lorebook',
      description: data.description || '',
      entries: data.entries || [],
      scanDepth: data.scanDepth,
      tokenBudget: data.tokenBudget,
      recursiveScanning: data.recursiveScanning,
      caseSensitive: data.caseSensitive,
      matchWholeWords: data.matchWholeWords,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }

    try {
      // 轉換為純 JavaScript 物件，避免 Vue reactive 物件導致 DataCloneError
      const plainLorebook = JSON.parse(JSON.stringify(lorebook))
      
      if (db.isOpen()) {
        await db.put(DB_STORES.LOREBOOKS, plainLorebook)
      } else {
        const all = await this.getAll()
        all.push(plainLorebook)
        localStorage.setItem(STORAGE_KEY, JSON.stringify(all))
      }
      
      return plainLorebook
    } catch (e) {
      console.error('[LorebookService] Failed to create lorebook:', e)
      throw e
    }
  }

  /**
   * 更新世界書
   */
  async update(id: string, updates: Partial<Lorebook>): Promise<Lorebook | null> {
    try {
      const existing = await this.getById(id)
      if (!existing) return null

      const updated: Lorebook = {
        ...existing,
        ...updates,
        id, // 確保 ID 不變
        updatedAt: Date.now(),
      }

      // 轉換為純 JavaScript 物件，避免 Vue reactive 物件導致 DataCloneError
      const plainObject = JSON.parse(JSON.stringify(updated))

      if (db.isOpen()) {
        await db.put(DB_STORES.LOREBOOKS, plainObject)
      } else {
        const all = await this.getAll()
        const index = all.findIndex(l => l.id === id)
        if (index !== -1) {
          all[index] = updated
          localStorage.setItem(STORAGE_KEY, JSON.stringify(all))
        }
      }

      return updated
    } catch (e) {
      console.error('[LorebookService] Failed to update lorebook:', e)
      throw e
    }
  }

  /**
   * 刪除世界書
   */
  async delete(id: string): Promise<boolean> {
    try {
      if (db.isOpen()) {
        await db.delete(DB_STORES.LOREBOOKS, id)
      } else {
        const all = await this.getAll()
        const filtered = all.filter(l => l.id !== id)
        localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered))
      }
      return true
    } catch (e) {
      console.error('[LorebookService] Failed to delete lorebook:', e)
      return false
    }
  }

  /**
   * 搜索世界書
   */
  async search(query: string): Promise<Lorebook[]> {
    const all = await this.getAll()
    const lowerQuery = query.toLowerCase()
    
    return all.filter(l => 
      l.name.toLowerCase().includes(lowerQuery) ||
      l.description?.toLowerCase().includes(lowerQuery) ||
      l.entries.some(e => 
        e.comment.toLowerCase().includes(lowerQuery) ||
        e.key.some(k => k.toLowerCase().includes(lowerQuery))
      )
    )
  }

  // ===== 條目操作 =====

  /**
   * 添加條目到世界書
   */
  async addEntry(lorebookId: string, entry?: Partial<WorldInfoEntry>): Promise<WorldInfoEntry | null> {
    try {
      const lorebook = await this.getById(lorebookId)
      if (!lorebook) return null

      // 計算新 UID
      const maxUid = Math.max(0, ...lorebook.entries.map(e => e.uid))
      const newEntry = {
        ...createDefaultWorldInfoEntry(maxUid + 1),
        ...entry,
        uid: maxUid + 1,
      }

      lorebook.entries.push(newEntry)
      await this.update(lorebookId, { entries: lorebook.entries })

      return newEntry
    } catch (e) {
      console.error('[LorebookService] Failed to add entry:', e)
      return null
    }
  }

  /**
   * 更新條目
   */
  async updateEntry(
    lorebookId: string,
    entryUid: number,
    updates: Partial<WorldInfoEntry>
  ): Promise<WorldInfoEntry | null> {
    try {
      const lorebook = await this.getById(lorebookId)
      if (!lorebook) return null

      const index = lorebook.entries.findIndex(e => e.uid === entryUid)
      if (index === -1) return null

      lorebook.entries[index] = {
        ...lorebook.entries[index],
        ...updates,
        uid: entryUid, // 確保 UID 不變
      }

      await this.update(lorebookId, { entries: lorebook.entries })
      return lorebook.entries[index]
    } catch (e) {
      console.error('[LorebookService] Failed to update entry:', e)
      return null
    }
  }

  /**
   * 刪除條目
   */
  async deleteEntry(lorebookId: string, entryUid: number): Promise<boolean> {
    try {
      const lorebook = await this.getById(lorebookId)
      if (!lorebook) return false

      lorebook.entries = lorebook.entries.filter(e => e.uid !== entryUid)
      await this.update(lorebookId, { entries: lorebook.entries })
      
      return true
    } catch (e) {
      console.error('[LorebookService] Failed to delete entry:', e)
      return false
    }
  }

  /**
   * 複製條目
   */
  async duplicateEntry(lorebookId: string, entryUid: number): Promise<WorldInfoEntry | null> {
    try {
      const lorebook = await this.getById(lorebookId)
      if (!lorebook) return null

      const original = lorebook.entries.find(e => e.uid === entryUid)
      if (!original) return null

      const maxUid = Math.max(0, ...lorebook.entries.map(e => e.uid))
      const copy: WorldInfoEntry = {
        ...structuredClone(original),
        uid: maxUid + 1,
        comment: `${original.comment} (Copy)`,
      }

      lorebook.entries.push(copy)
      await this.update(lorebookId, { entries: lorebook.entries })

      return copy
    } catch (e) {
      console.error('[LorebookService] Failed to duplicate entry:', e)
      return null
    }
  }

  /**
   * 重新排序條目
   */
  async reorderEntries(lorebookId: string, orderedUids: number[]): Promise<boolean> {
    try {
      const lorebook = await this.getById(lorebookId)
      if (!lorebook) return false

      const entryMap = new Map(lorebook.entries.map(e => [e.uid, e]))
      lorebook.entries = orderedUids
        .map(uid => entryMap.get(uid))
        .filter((e): e is WorldInfoEntry => e !== undefined)

      await this.update(lorebookId, { entries: lorebook.entries })
      return true
    } catch (e) {
      console.error('[LorebookService] Failed to reorder entries:', e)
      return false
    }
  }

  // ===== 批量操作 =====

  /**
   * 啟用/禁用多個條目
   */
  async toggleEntries(lorebookId: string, entryUids: number[], enabled: boolean): Promise<boolean> {
    try {
      const lorebook = await this.getById(lorebookId)
      if (!lorebook) return false

      for (const entry of lorebook.entries) {
        if (entryUids.includes(entry.uid)) {
          entry.disable = !enabled
        }
      }

      await this.update(lorebookId, { entries: lorebook.entries })
      return true
    } catch (e) {
      console.error('[LorebookService] Failed to toggle entries:', e)
      return false
    }
  }

  /**
   * 批量刪除條目
   */
  async deleteEntries(lorebookId: string, entryUids: number[]): Promise<boolean> {
    try {
      const lorebook = await this.getById(lorebookId)
      if (!lorebook) return false

      lorebook.entries = lorebook.entries.filter(e => !entryUids.includes(e.uid))
      await this.update(lorebookId, { entries: lorebook.entries })
      
      return true
    } catch (e) {
      console.error('[LorebookService] Failed to delete entries:', e)
      return false
    }
  }

  // ===== 導入導出 =====

  /**
   * 導出為 JSON
   */
  async exportToJSON(id: string): Promise<string | null> {
    const lorebook = await this.getById(id)
    if (!lorebook) return null

    return JSON.stringify(lorebook, null, 2)
  }

  /**
   * 從 JSON 導入
   */
  async importFromJSON(json: string): Promise<Lorebook | null> {
    try {
      const data = JSON.parse(json)
      
      // 生成新 ID 避免衝突
      data.id = crypto.randomUUID()
      data.createdAt = Date.now()
      data.updatedAt = Date.now()

      return this.create(data)
    } catch (e) {
      console.error('[LorebookService] Failed to import from JSON:', e)
      return null
    }
  }

  /**
   * 複製世界書
   */
  async duplicate(id: string): Promise<Lorebook | null> {
    const original = await this.getById(id)
    if (!original) return null

    const copy: Lorebook = {
      ...structuredClone(original),
      id: crypto.randomUUID(),
      name: `${original.name} (Copy)`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }

    return this.create(copy)
  }

  // ===== 全局設定 =====

  /**
   * 獲取全局世界書設定
   */
  getGlobalSettings(): WorldInfoSettings {
    try {
      const data = localStorage.getItem(SETTINGS_KEY)
      return data ? JSON.parse(data) : createDefaultWorldInfoSettings()
    } catch {
      return createDefaultWorldInfoSettings()
    }
  }

  /**
   * 保存全局世界書設定
   */
  saveGlobalSettings(settings: WorldInfoSettings): void {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
  }

  // ===== 統計 =====

  /**
   * 獲取統計信息
   */
  async getStats(): Promise<{
    totalLorebooks: number
    totalEntries: number
    enabledEntries: number
    constantEntries: number
  }> {
    const all = await this.getAll()
    let totalEntries = 0
    let enabledEntries = 0
    let constantEntries = 0

    for (const l of all) {
      totalEntries += l.entries.length
      enabledEntries += l.entries.filter(e => !e.disable).length
      constantEntries += l.entries.filter(e => e.constant).length
    }

    return {
      totalLorebooks: all.length,
      totalEntries,
      enabledEntries,
      constantEntries,
    }
  }
}

// 全局單例
let lorebookService: LorebookService | null = null

/**
 * 獲取世界書服務實例
 */
export function getLorebookService(): LorebookService {
  if (!lorebookService) {
    lorebookService = new LorebookService()
  }
  return lorebookService
}
