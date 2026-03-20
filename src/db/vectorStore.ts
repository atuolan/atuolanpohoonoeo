/**
 * 向量嵌入 CRUD 操作層
 *
 * 重要：本模組直接使用 getDatabase() 而非 db wrapper，
 * 因為 db.put() 的 JSON 深拷貝防禦邏輯會破壞 Float32Array。
 * IndexedDB 的結構化克隆演算法原生支援 Float32Array。
 */

import { getDatabase, DB_STORES } from '@/db/database'
import type { VectorEmbeddingRecord } from '@/db/database'

// 重新匯出 VectorEmbeddingRecord 供外部使用
export type { VectorEmbeddingRecord } from '@/db/database'

const STORE = DB_STORES.VECTOR_EMBEDDINGS

/**
 * 儲存或更新向量嵌入記錄
 */
export async function putVectorEmbedding(record: VectorEmbeddingRecord): Promise<void> {
  const db = await getDatabase()
  await db.put(STORE, record)
}

/**
 * 根據 ID 取得向量嵌入記錄
 */
export async function getVectorEmbedding(id: string): Promise<VectorEmbeddingRecord | undefined> {
  const db = await getDatabase()
  return db.get(STORE, id)
}

/**
 * 取得指定聊天的所有向量嵌入記錄
 */
export async function getVectorsByChatId(chatId: string): Promise<VectorEmbeddingRecord[]> {
  const db = await getDatabase()
  return db.getAllFromIndex(STORE, 'by-chatId', chatId)
}

/**
 * 刪除指定 ID 的向量嵌入記錄
 */
export async function deleteVectorEmbedding(id: string): Promise<void> {
  const db = await getDatabase()
  await db.delete(STORE, id)
}

/**
 * 刪除指定聊天的所有向量嵌入記錄（級聯刪除）
 */
export async function deleteVectorsByChatId(chatId: string): Promise<void> {
  const db = await getDatabase()
  const tx = db.transaction(STORE, 'readwrite')
  const index = tx.store.index('by-chatId')
  let cursor = await index.openCursor(chatId)
  while (cursor) {
    await cursor.delete()
    cursor = await cursor.continue()
  }
  await tx.done
}

/**
 * 將指定 sourceId 的向量標記為 stale（清除向量數據）
 */
export async function markVectorStale(sourceId: string): Promise<void> {
  const db = await getDatabase()
  const tx = db.transaction(STORE, 'readwrite')
  const index = tx.store.index('by-sourceId')
  const record = await index.get(sourceId)
  if (record) {
    record.vector = null
    record.updatedAt = Date.now()
    await tx.store.put(record)
  }
  await tx.done
}

/**
 * 取得指定聊天的向量統計資訊
 */
export async function getVectorStats(chatId: string): Promise<{ count: number; sizeBytes: number }> {
  const records = await getVectorsByChatId(chatId)
  const count = records.length
  let sizeBytes = 0
  for (const record of records) {
    if (record.vector) {
      // Float32 = 4 bytes per element
      sizeBytes += record.dimensions * 4
    }
  }
  return { count, sizeBytes }
}
