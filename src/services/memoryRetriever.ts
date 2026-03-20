/**
 * 記憶檢索服務（升級版）
 * 混合檢索架構：雙路搜尋（意圖+狀態）+ 關鍵詞擴展 + 上下文窗口
 * 協調 EmbeddingEngine、Vector Store、Similarity Engine、KeywordExpander、ContextWindow
 */

import { getDatabase, DB_STORES } from '@/db/database'
import {
  putVectorEmbedding,
  getVectorsByChatId,
  deleteVectorsByChatId,
} from '@/db/vectorStore'
import type { VectorEmbeddingRecord } from '@/db/vectorStore'
import { searchSimilar } from '@/utils/similarity'
import type { SimilarityResult } from '@/utils/similarity'
import { contentHash } from '@/utils/contentHash'
import { embeddingEngine } from '@/services/embeddingEngine'
import { expandKeywords, keywordMatch } from '@/utils/keywordExpander'
import { expandContextWindow } from '@/utils/contextWindow'
import { buildStateQuery } from '@/utils/stateQueryBuilder'
import type { ChatMessage } from '@/types/chat'

// ─── 介面定義 ───────────────────────────────────────────────

/** 近期訊息的最小介面（只需要 content 欄位） */
type MessageLike = Pick<ChatMessage, 'content'>

/** 檢索到的記憶片段 */
export interface RetrievedMemory {
  sourceId: string
  sourceType: 'summary' | 'diary'
  content: string
  score: number
  createdAt: number
}

/** 內部候選向量項目 */
interface CandidateItem {
  id: string
  sourceId: string
  sourceType: 'summary' | 'diary'
  vector: Float32Array
}

/** 排除最近 N 筆記憶的預設值（會被外部傳入的 summaryReadCount 覆蓋） */
const DEFAULT_EXCLUDE_RECENT = 3

// ─── 服務實作 ───────────────────────────────────────────────

export class MemoryRetrieverService {
  /**
   * 根據查詢文本檢索最相關的記憶（混合檢索管線）
   * @param queryText - 用戶最新訊息文本
   * @param chatId - 當前聊天 ID
   * @param topK - 返回數量上限
   * @param threshold - 最低相似度門檻（Settings_Store 中的 vectorThreshold）
   * @param recentMessages - 近期對話訊息（用於 State_Query，可選）
   * @param characterNames - 角色名稱列表（用於關鍵詞匹配和 State_Query，可選）
   * @param excludeRecentCount - 排除最近 N 筆總結（應等於 summaryReadCount，避免與時間排序總結重複）
   */
  async retrieve(
    queryText: string,
    chatId: string,
    topK: number,
    threshold: number,
    recentMessages?: MessageLike[],
    characterNames?: string[],
    excludeRecentCount?: number,
  ): Promise<RetrievedMemory[]> {
    try {
      console.log(`[向量記憶] 🔍 開始檢索 | 查詢: "${queryText.slice(0, 60)}..." | chatId: ${chatId} | topK: ${topK} | 門檻: ${threshold}`)

      // 1. 載入候選向量
      const candidates = await this.loadCandidates(chatId)
      if (candidates.length === 0) {
        console.log('[向量記憶] ⚠️ 候選向量為空（尚無嵌入資料），跳過檢索')
        return []
      }
      console.log(`[向量記憶] 📦 載入 ${candidates.length} 條候選向量`)

      // 2. Intent Path：用戶訊息向量搜尋（降低門檻擴大召回）
      const intentThreshold = Math.max(threshold - 0.25, 0.4)
      const intentVector = await embeddingEngine.embed(queryText)
      const intentResults = searchSimilar(intentVector, candidates, topK * 2, intentThreshold)
      console.log(`[向量記憶] 🎯 Intent Path: ${intentResults.length} 條命中（門檻 ${intentThreshold.toFixed(2)}）`)

      // 3. State Path：狀態查詢向量搜尋（原始門檻）
      let stateResults: SimilarityResult[] = []
      if (recentMessages && recentMessages.length > 0) {
        const stateQuery = buildStateQuery(recentMessages, characterNames ?? [])
        if (stateQuery) {
          const stateVector = await embeddingEngine.embed(stateQuery)
          stateResults = searchSimilar(stateVector, candidates, topK, threshold)
          console.log(`[向量記憶] 🧠 State Path: ${stateResults.length} 條命中 | 查詢: "${stateQuery.slice(0, 80)}..."`)
        }
      }

      // 4. Keyword Path：關鍵詞擴展文本匹配
      const keywordResults = await this.keywordSearch(
        queryText, chatId, characterNames ?? [],
      )
      console.log(`[向量記憶] 🔤 Keyword Path: ${keywordResults.length} 條命中`)

      // 5. 合併三路結果（sourceId 去重，保留較高分數）
      const merged = this.mergeResults(intentResults, stateResults, keywordResults)

      // 6. 排除最近 N 筆記憶（跟隨總結讀取數量，避免與時間排序總結重複）
      const actualExclude = excludeRecentCount ?? DEFAULT_EXCLUDE_RECENT
      const filtered = await this.excludeRecent(merged, chatId, actualExclude)
      console.log(`[向量記憶] 🚫 排除最近 ${actualExclude} 筆（剩餘 ${filtered.length} 條）`)

      // 7. 解析來源內容
      const db = await getDatabase()
      const resolved: RetrievedMemory[] = []
      for (const item of filtered.slice(0, topK)) {
        const content = await this.resolveSourceContent(db, item.sourceId, item.sourceType)
        if (content !== null) {
          resolved.push({
            sourceId: item.sourceId,
            sourceType: item.sourceType,
            content,
            score: item.score,
            createdAt: await this.resolveSourceCreatedAt(db, item.sourceId, item.sourceType),
          })
        }
      }

      // 8. 上下文窗口擴展（±1 相鄰條目）
      const expanded = await expandContextWindow(resolved, chatId, 0.85)

      // 9. 最終去重 + Top-K
      const final = this.finalDedup(expanded)

      // 輸出最終結果摘要
      if (final.length > 0) {
        console.log(`[向量記憶] ✅ 最終檢索結果: ${final.length} 條記憶注入提示詞`)
        for (const m of final.slice(0, topK)) {
          console.log(`  📌 [${m.sourceType}] ${m.sourceId} | 分數: ${m.score.toFixed(3)} | 內容: "${m.content.slice(0, 80)}..."`)
        }
      } else {
        console.log('[向量記憶] ℹ️ 未檢索到符合門檻的記憶')
      }

      return final.slice(0, topK)
    } catch (error) {
      console.error('[向量記憶] ❌ 檢索失敗，返回空陣列:', error)
      return []
    }
  }

  /**
   * 為總結/日記生成嵌入並儲存
   */
  async generateAndStoreEmbedding(
    sourceId: string,
    sourceType: 'summary' | 'diary',
    content: string,
    chatId: string,
    characterId: string,
  ): Promise<void> {
    const hash = await contentHash(content)
    const embedding = await embeddingEngine.embed(content)

    const now = Date.now()
    const record: VectorEmbeddingRecord = {
      id: `vec_${sourceId}`,
      sourceId,
      sourceType,
      chatId,
      characterId,
      vector: embedding,
      contentHash: hash,
      dimensions: embedding.length,
      createdAt: now,
      updatedAt: now,
    }

    await putVectorEmbedding(record)
    console.log(`[向量記憶] ✅ ${sourceType} 嵌入成功: ${sourceId}（${embedding.length} 維）`)
  }

  /**
   * 批量生成嵌入（用於導入和重建）
   */
  async generateBatchEmbeddings(
    items: Array<{ sourceId: string; sourceType: 'summary' | 'diary'; content: string }>,
    chatId: string,
    characterId: string,
    onProgress?: (processed: number, total: number) => void,
  ): Promise<void> {
    if (items.length === 0) return

    const texts = items.map((item) => item.content)
    const embeddings = await embeddingEngine.embedBatch(texts)

    const now = Date.now()
    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      const hash = await contentHash(item.content)

      const record: VectorEmbeddingRecord = {
        id: `vec_${item.sourceId}`,
        sourceId: item.sourceId,
        sourceType: item.sourceType,
        chatId,
        characterId,
        vector: embeddings[i],
        contentHash: hash,
        dimensions: embeddings[i].length,
        createdAt: now,
        updatedAt: now,
      }

      await putVectorEmbedding(record)
      onProgress?.(i + 1, items.length)
    }
  }

  /**
   * 重建指定聊天的所有嵌入（僅總結，日記不參與向量化）
   */
  async rebuildChat(
    chatId: string,
    characterId: string,
    onProgress?: (processed: number, total: number) => void,
  ): Promise<void> {
    await deleteVectorsByChatId(chatId)

    const db = await getDatabase()
    const summaries = await db.getAllFromIndex(
      DB_STORES.SUMMARIES as 'summaries',
      'by-chat',
      chatId,
    )

    const items: Array<{ sourceId: string; sourceType: 'summary'; content: string }> = summaries.map((s) => ({
      sourceId: s.id,
      sourceType: 'summary' as const,
      content: s.content,
    }))

    await this.generateBatchEmbeddings(items, chatId, characterId, onProgress)
  }

  // ─── 私有方法 ─────────────────────────────────────────────

  /** 載入候選向量（過濾 stale 記錄） */
  private async loadCandidates(chatId: string): Promise<CandidateItem[]> {
    const records = await getVectorsByChatId(chatId)
    return records
      .filter((r): r is VectorEmbeddingRecord & { vector: Float32Array } => r.vector !== null)
      .map((r) => ({
        id: r.id,
        sourceId: r.sourceId,
        sourceType: r.sourceType,
        vector: r.vector,
      }))
  }

  /** 關鍵詞擴展搜尋：對所有總結文本執行關鍵詞匹配（日記不參與向量化） */
  private async keywordSearch(
    queryText: string,
    chatId: string,
    characterNames: string[],
  ): Promise<SimilarityResult[]> {
    const expansion = expandKeywords(queryText)
    if (expansion.expandedTerms.length === 0) return []

    // 載入所有總結的文本
    const db = await getDatabase()
    const summaries = await db.getAllFromIndex(DB_STORES.SUMMARIES as 'summaries', 'by-chat', chatId)

    const results: SimilarityResult[] = []

    for (const s of summaries) {
      const match = keywordMatch(s.content, expansion.expandedTerms, characterNames)
      if (match.matched) {
        results.push({
          id: `vec_${s.id}`,
          sourceId: s.id,
          sourceType: 'summary',
          score: match.score,
        })
      }
    }

    return results
  }

  /** 合併三路結果，sourceId 去重，保留較高分數 */
  private mergeResults(
    intentResults: SimilarityResult[],
    stateResults: SimilarityResult[],
    keywordResults: SimilarityResult[],
  ): SimilarityResult[] {
    const merged = new Map<string, SimilarityResult>()

    const addResult = (result: SimilarityResult) => {
      const existing = merged.get(result.sourceId)
      if (!existing || result.score > existing.score) {
        merged.set(result.sourceId, result)
      }
    }

    for (const r of intentResults) addResult(r)
    for (const r of stateResults) addResult(r)
    for (const r of keywordResults) addResult(r)

    return Array.from(merged.values()).sort((a, b) => b.score - a.score)
  }

  /** 排除最近 N 筆總結條目（依 createdAt 排序，僅計算 summary） */
  private async excludeRecent(
    results: SimilarityResult[],
    chatId: string,
    count: number,
  ): Promise<SimilarityResult[]> {
    if (count <= 0) return results

    const db = await getDatabase()
    const summaries = await db.getAllFromIndex(DB_STORES.SUMMARIES as 'summaries', 'by-chat', chatId)

    // 只排除最近 N 筆總結的 ID（日記不參與向量化，無需排除）
    const allEntries = summaries
      .map((s) => ({ id: s.id, createdAt: s.createdAt }))
      .sort((a, b) => b.createdAt - a.createdAt)

    const recentIds = new Set(allEntries.slice(0, count).map((e) => e.id))

    return results.filter((r) => !recentIds.has(r.sourceId))
  }

  /** 最終去重（sourceId 去重） */
  private finalDedup(memories: RetrievedMemory[]): RetrievedMemory[] {
    const seen = new Map<string, RetrievedMemory>()
    for (const m of memories) {
      const existing = seen.get(m.sourceId)
      if (!existing || m.score > existing.score) {
        seen.set(m.sourceId, m)
      }
    }
    return Array.from(seen.values()).sort((a, b) => b.score - a.score)
  }

  /** 從 summaries/diaries store 解析來源內容 */
  private async resolveSourceContent(
    db: Awaited<ReturnType<typeof getDatabase>>,
    sourceId: string,
    sourceType: 'summary' | 'diary',
  ): Promise<string | null> {
    try {
      if (sourceType === 'summary') {
        const summary = await db.get(DB_STORES.SUMMARIES as 'summaries', sourceId)
        return summary?.content ?? null
      } else {
        const diary = await db.get(DB_STORES.DIARIES as 'diaries', sourceId)
        return diary?.content ?? null
      }
    } catch (error) {
      console.error(`[向量記憶] 無法載入來源內容 (${sourceType}: ${sourceId}):`, error)
      return null
    }
  }

  /** 從 summaries/diaries store 解析來源建立時間 */
  private async resolveSourceCreatedAt(
    db: Awaited<ReturnType<typeof getDatabase>>,
    sourceId: string,
    sourceType: 'summary' | 'diary',
  ): Promise<number> {
    try {
      if (sourceType === 'summary') {
        const summary = await db.get(DB_STORES.SUMMARIES as 'summaries', sourceId)
        return summary?.createdAt ?? 0
      } else {
        const diary = await db.get(DB_STORES.DIARIES as 'diaries', sourceId)
        return diary?.createdAt ?? 0
      }
    } catch {
      return 0
    }
  }
}
