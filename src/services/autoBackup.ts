/**
 * 自動備份服務
 * 在 IDB 載入成功後，將關鍵資料備份到 OPFS (Origin Private File System)。
 * OPFS 容量大、不受 localStorage 5MB 限制、不會被瀏覽器驅逐。
 * 若 IDB 資料遺失，可從 OPFS 自動恢復。
 */

import { DB_STORES, getDatabase } from '@/db/database'

const BACKUP_FILENAME = 'aguaphone_auto_backup.json'
const BACKUP_META_FILENAME = 'aguaphone_auto_backup_meta.json'

/** 需要備份的 store 列表（關鍵資料） */
const BACKUP_STORES = [
  DB_STORES.CHARACTERS,
  DB_STORES.LOREBOOKS,
  DB_STORES.CHATS,
  DB_STORES.SUMMARIES,
  DB_STORES.DIARIES,
  DB_STORES.IMPORTANT_EVENTS,
  DB_STORES.STICKERS,
] as const

interface BackupMeta {
  timestamp: number
  counts: Record<string, number>
  version: number
}

// ─── OPFS 讀寫工具 ───────────────────────────────────────

async function writeOPFS(filename: string, data: string): Promise<void> {
  const root = await navigator.storage.getDirectory()
  const fileHandle = await root.getFileHandle(filename, { create: true })
  const writable = await fileHandle.createWritable()
  await writable.write(data)
  await writable.close()
}

async function readOPFS(filename: string): Promise<string | null> {
  try {
    const root = await navigator.storage.getDirectory()
    const fileHandle = await root.getFileHandle(filename)
    const file = await fileHandle.getFile()
    return await file.text()
  } catch {
    return null // 檔案不存在
  }
}


// ─── 檢查與恢復 ─────────────────────────────────────────

/**
 * 檢查 IDB 是否有資料遺失，若有則從 OPFS 恢復
 * 優先使用常規備份，若不存在則嘗試升級前的預防性備份
 * 應在 loadAppData 的 loadCharacters 之前呼叫
 */
export async function checkAndRestore(): Promise<boolean> {
  try {
    // 檢查瀏覽器是否支援 OPFS
    if (!navigator.storage?.getDirectory) {
      console.warn('[自動備份] 瀏覽器不支援 OPFS，跳過恢復檢查')
      return false
    }

    const database = await getDatabase()

    // 檢查 characters store 是否為空（最關鍵的指標）
    const charCount = await database.count(DB_STORES.CHARACTERS as 'characters')
    if (charCount > 0) return false // IDB 有資料，不需要恢復

    // IDB 是空的，嘗試從備份恢復
    // 優先嘗試常規備份
    let backupStr = await readOPFS(BACKUP_FILENAME)
    let metaStr = await readOPFS(BACKUP_META_FILENAME)
    let backupSource = '常規備份'

    // 常規備份不存在或無角色，嘗試升級前的預防性備份
    if (!metaStr || !backupStr) {
      const preUpgradeMeta = await readOPFS('aguaphone_pre_upgrade_backup_meta.json')
      const preUpgradeData = await readOPFS('aguaphone_pre_upgrade_backup.json')
      if (preUpgradeMeta && preUpgradeData) {
        metaStr = preUpgradeMeta
        backupStr = preUpgradeData
        backupSource = '升級前預防性備份'
      }
    }

    if (!metaStr || !backupStr) return false // 沒有任何備份

    const meta = JSON.parse(metaStr)
    if (!meta.counts?.[DB_STORES.CHARACTERS] || meta.counts[DB_STORES.CHARACTERS] === 0) {
      return false // 備份裡也沒有角色
    }

    console.warn(`[自動備份] 偵測到 IDB 資料遺失，嘗試從 ${backupSource} 恢復...`)
    console.warn('[自動備份] 備份時間:', new Date(meta.timestamp).toLocaleString())
    console.warn('[自動備份] 備份內容:', meta.counts)

    const backup: Record<string, unknown[]> = JSON.parse(backupStr)
    let restoredTotal = 0

    for (const storeName of BACKUP_STORES) {
      const records = backup[storeName]
      if (!records || records.length === 0) continue

      const currentCount = await database.count(storeName as any)
      if (currentCount > 0) continue // 這個 store 有資料，跳過

      const tx = database.transaction(storeName as any, 'readwrite')
      const store = tx.objectStore(storeName as any)
      for (const record of records) {
        await (store as any).put(record)
      }
      await tx.done
      restoredTotal += records.length
      console.log(`[自動備份] 恢復 ${storeName}: ${records.length} 筆`)
    }

    if (restoredTotal > 0) {
      console.log(`[自動備份] 恢復完成，共 ${restoredTotal} 筆記錄（來源：${backupSource}）`)
      return true
    }

    return false
  } catch (error) {
    console.error('[自動備份] 恢復失敗:', error)
    return false
  }
}

// ─── 執行備份 ────────────────────────────────────────────

/**
 * 備份關鍵資料到 OPFS
 * 應在 loadAppData 成功載入後呼叫
 */
export async function performBackup(): Promise<void> {
  try {
    // 檢查瀏覽器是否支援 OPFS
    if (!navigator.storage?.getDirectory) {
      console.warn('[自動備份] 瀏覽器不支援 OPFS，跳過備份')
      return
    }

    const database = await getDatabase()

    // 先檢查是否有資料值得備份
    const charCount = await database.count(DB_STORES.CHARACTERS as 'characters')
    if (charCount === 0) {
      console.log('[自動備份] 沒有角色資料，跳過備份')
      return
    }

    const backup: Record<string, unknown[]> = {}
    const counts: Record<string, number> = {}

    for (const storeName of BACKUP_STORES) {
      try {
        const records = await database.getAll(storeName as any)
        if (storeName === DB_STORES.CHATS) {
          // chats 可能很大，只保留最近 100 條訊息
          backup[storeName] = records.map((chat: any) => ({
            ...chat,
            messages: (chat.messages || []).slice(-100),
          }))
        } else {
          backup[storeName] = records
        }
        counts[storeName] = records.length
      } catch {
        console.warn(`[自動備份] 讀取 ${storeName} 失敗，跳過`)
      }
    }

    const backupStr = JSON.stringify(backup)
    const sizeMB = backupStr.length / (1024 * 1024)

    await writeOPFS(BACKUP_FILENAME, backupStr)

    const meta: BackupMeta = {
      timestamp: Date.now(),
      counts,
      version: 1,
    }
    await writeOPFS(BACKUP_META_FILENAME, JSON.stringify(meta))

    console.log(`[自動備份] OPFS 備份完成 (${sizeMB.toFixed(2)}MB):`, counts)
  } catch (error) {
    console.error('[自動備份] 備份失敗:', error)
  }
}
