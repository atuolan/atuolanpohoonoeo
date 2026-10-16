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
  // Fallback for non-secure contexts (HTTP): 使用 js-sha256 的純 JS 實作
  // 來源：https://github.com/emn178/js-sha256 (MIT License)
  const K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
  ]

  const H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]

  const bytes = new Uint8Array(msgBuffer)
  const bitLen = bytes.length * 8
  const newLen = bytes.length + ((bytes.length % 64 < 56) ? (56 - bytes.length % 64) : (120 - bytes.length % 64))
  const padded = new Uint8Array(newLen + 8)
  padded.set(bytes)
  padded[bytes.length] = 0x80

  const view = new DataView(padded.buffer)
  view.setUint32(newLen + 4, bitLen, false)

  const W = new Uint32Array(64)
  for (let offset = 0; offset < padded.length; offset += 64) {
    for (let i = 0; i < 16; i++) {
      W[i] = view.getUint32(offset + i * 4, false)
    }
    for (let i = 16; i < 64; i++) {
      const s0 = ((W[i - 15] >>> 7) | (W[i - 15] << 25)) ^ ((W[i - 15] >>> 18) | (W[i - 15] << 14)) ^ (W[i - 15] >>> 3)
      const s1 = ((W[i - 2] >>> 17) | (W[i - 2] << 15)) ^ ((W[i - 2] >>> 19) | (W[i - 2] << 13)) ^ (W[i - 2] >>> 10)
      W[i] = (W[i - 16] + s0 + W[i - 7] + s1) >>> 0
    }

    let [a, b, c, d, e, f, g, h] = H
    for (let i = 0; i < 64; i++) {
      const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7))
      const ch = (e & f) ^ (~e & g)
      const temp1 = (h + S1 + ch + K[i] + W[i]) >>> 0
      const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10))
      const maj = (a & b) ^ (a & c) ^ (b & c)
      const temp2 = (S0 + maj) >>> 0

      h = g
      g = f
      f = e
      e = (d + temp1) >>> 0
      d = c
      c = b
      b = a
      a = (temp1 + temp2) >>> 0
    }

    H[0] = (H[0] + a) >>> 0
    H[1] = (H[1] + b) >>> 0
    H[2] = (H[2] + c) >>> 0
    H[3] = (H[3] + d) >>> 0
    H[4] = (H[4] + e) >>> 0
    H[5] = (H[5] + f) >>> 0
    H[6] = (H[6] + g) >>> 0
    H[7] = (H[7] + h) >>> 0
  }

  return H.map(x => x.toString(16).padStart(8, '0')).join('')
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
