/**
 * 管理員驗證 Store
 * 簡單密碼驗證，持久化到 IDB（記住設備）
 */

import { db, DB_STORES } from '@/db/database'
import { defineStore } from 'pinia'
import { ref } from 'vue'

// SHA-256 hash of admin password
const ADMIN_PASSWORD_HASH = 'ac4477327309c9c312b319e3d25a135db3ea0b9656a62271aca99aed05b8ccff'

async function sha256(message: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(message)
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
  }
  // Fallback for non-secure contexts (HTTP)
  let h1 = 0xdeadbeef
  let h2 = 0x41c6ce57
  for (let i = 0; i < message.length; i++) {
    const ch = message.charCodeAt(i)
    h1 = Math.imul(h1 ^ ch, 2654435761)
    h2 = Math.imul(h2 ^ ch, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507)
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507)
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  const combined = 4294967296 * (2097151 & h2) + (h1 >>> 0)
  return combined.toString(16).padStart(16, '0')
}

export const useAdminStore = defineStore('admin', () => {
  const isAdmin = ref(false)
  const isLoaded = ref(false)

  /** 從 IDB 載入管理員狀態（記住設備） */
  async function loadAdminState(): Promise<void> {
    try {
      await db.init()
      const saved = await db.get<{ id: string; isAdmin: boolean }>(
        DB_STORES.APP_SETTINGS,
        'admin-state',
      )
      if (saved?.isAdmin) {
        isAdmin.value = true
      }
      isLoaded.value = true
    } catch (e) {
      console.error('[AdminStore] 載入失敗:', e)
      isLoaded.value = true
    }
  }

  /** 驗證密碼 */
  async function login(password: string): Promise<boolean> {
    const hash = await sha256(password)
    if (hash === ADMIN_PASSWORD_HASH) {
      isAdmin.value = true
      await saveState()
      return true
    }
    return false
  }

  /** 登出 */
  async function logout(): Promise<void> {
    isAdmin.value = false
    await saveState()
  }

  async function saveState(): Promise<void> {
    try {
      await db.init()
      await db.put(DB_STORES.APP_SETTINGS, {
        id: 'admin-state',
        isAdmin: isAdmin.value,
      })
    } catch (e) {
      console.error('[AdminStore] 保存失敗:', e)
    }
  }

  return { isAdmin, isLoaded, loadAdminState, login, logout }
})
