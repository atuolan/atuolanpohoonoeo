/**
 * 上下文窗口擴展
 * 對初始檢索結果執行 ±1 時間相鄰條目擴展
 * 純函式模組，無副作用
 */

import { getDatabase, DB_STORES } from '@/db/database'
import type { RetrievedMemory } from '@/services/memoryRetriever'

// ─── 介面定義 ───────────────────────────────────────────────

/** 擴展後的記憶片段（含來源標記） */
export interface ContextExpandedMemory extends RetrievedMemory {
  /** 來源：direct=直接命中, context=上下文擴展 */
  source: 'direct' | 'context'
}

// ─── 內部型別 ───────────────────────────────────────────────

interface SourceEntry {
  id: string
  content: string
  createdAt: number
  sourceType: 'summary' | 'diary'
}

// ─── 公開函式 ───────────────────────────────────────────────

/**
 * 對初始檢索結果執行 ±1 上下文窗口擴展
 * @param hits - 初始檢索結果
 * @param chatId - 聊天 ID
 * @param scoreDecay - 相鄰條目的分數衰減係數，預設 0.85
 * @returns 擴展後的結果（含原始命中 + 相鄰條目），按分數降序排列
 */
export async function expandContextWindow(
  hits: RetrievedMemory[],
  chatId: string,
  scoreDecay: number = 0.85,
): Promise<ContextExpandedMemory[]> {
  if (hits.length === 0) return []

  // 1. 一次性載入同聊天的所有總結和日記
  const db = await getDatabase()
  const [summaries, diaries] = await Promise.all([
    db.getAllFromIndex(DB_STORES.SUMMARIES as 'summaries', 'by-chat', chatId),
    db.getAllFromIndex(DB_STORES.DIARIES as 'diaries', 'by-chat', chatId),
  ])

  // 2. 合併為統一格式並按 createdAt 排序
  const allEntries: SourceEntry[] = [
    ...summaries.map((s) => ({
      id: s.id,
      content: s.content,
      createdAt: s.createdAt,
      sourceType: 'summary' as const,
    })),
    ...diaries.map((d) => ({
      id: d.id,
      content: d.content,
      createdAt: d.createdAt,
      sourceType: 'diary' as const,
    })),
  ].sort((a, b) => a.createdAt - b.createdAt)

  // 3. 建立 sourceId → 索引的映射
  const idToIndex = new Map<string, number>()
  for (let i = 0; i < allEntries.length; i++) {
    idToIndex.set(allEntries[i].id, i)
  }

  // 4. 收集已命中的 sourceId（用於排除重複）
  const hitSourceIds = new Set(hits.map((h) => h.sourceId))

  // 5. 標記原始命中
  const result: ContextExpandedMemory[] = hits.map((h) => ({
    ...h,
    source: 'direct' as const,
  }))

  // 6. 對每筆命中查找 ±1 相鄰條目
  const addedIds = new Set<string>()

  for (const hit of hits) {
    const idx = idToIndex.get(hit.sourceId)
    if (idx === undefined) continue

    // 前一筆
    if (idx > 0) {
      const prev = allEntries[idx - 1]
      if (!hitSourceIds.has(prev.id) && !addedIds.has(prev.id)) {
        addedIds.add(prev.id)
        result.push({
          sourceId: prev.id,
          sourceType: prev.sourceType,
          content: prev.content,
          score: hit.score * scoreDecay,
          createdAt: prev.createdAt,
          source: 'context',
        })
      }
    }

    // 後一筆
    if (idx < allEntries.length - 1) {
      const next = allEntries[idx + 1]
      if (!hitSourceIds.has(next.id) && !addedIds.has(next.id)) {
        addedIds.add(next.id)
        result.push({
          sourceId: next.id,
          sourceType: next.sourceType,
          content: next.content,
          score: hit.score * scoreDecay,
          createdAt: next.createdAt,
          source: 'context',
        })
      }
    }
  }

  // 7. 按分數降序排列
  result.sort((a, b) => b.score - a.score)

  return result
}
