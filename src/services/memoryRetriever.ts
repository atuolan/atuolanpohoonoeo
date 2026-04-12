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
  CURRENT_VECTOR_SCHEMA_VERSION,
} from '@/db/vectorStore'
import type { VectorEmbeddingRecord } from '@/db/vectorStore'
import { searchSimilar } from '@/utils/similarity'
import type { SimilarityResult } from '@/utils/similarity'
import { contentHash } from '@/utils/contentHash'
import { embeddingEngine } from '@/services/embeddingEngine'
import { expandKeywords, keywordMatch } from '@/utils/keywordExpander'
import { expandContextWindow } from '@/utils/contextWindow'
import { buildStateQuery } from '@/utils/stateQueryBuilder'
import { buildIntentQuery } from '@/utils/intentQueryBuilder'
import { buildVectorDocument } from '@/utils/vectorDocumentBuilder'
import { extractSummaryKeywords } from '@/utils/summaryKeywordExtractor'
import type { ChatMessage } from '@/types/chat'

// ─── 介面定義 ───────────────────────────────────────────────

/** 近期訊息的最小介面（只需要 content 欄位） */
type MessageLike = Pick<ChatMessage, 'content'>

/** 檢索到的記憶片段 */
export interface RetrievedMemory {
  sourceId: string
  sourceType: 'summary' | 'diary' | 'event'
  content: string
  score: number
  createdAt: number
}

/** 內部候選向量項目 */
interface CandidateItem {
  id: string
  sourceId: string
  sourceType: 'summary' | 'diary' | 'event'
  vector: Float32Array
}

interface ScoredResult extends SimilarityResult {
  path: 'raw' | 'intent' | 'state' | 'keyword'
}

/** 排除最近 N 筆記憶的預設值（會被外部傳入的 summaryReadCount 覆蓋） */
const DEFAULT_EXCLUDE_RECENT = 3

/** 原始查詢文本最大長度 */
const MAX_RAW_QUERY_LENGTH = 220

const PATH_SCORE_MULTIPLIERS = {
  raw: 1.03,
  intent: 1,
  state: 0.96,
  keyword: 0.92,
} as const

const RERANK_CANDIDATE_LIMIT = 12

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

      const queryKeywords = extractSummaryKeywords(queryText)

      // 2. Raw Query Path：保留使用者原始語義，避免意圖提煉過度壓縮
      const rawThreshold = Math.max(threshold - 0.12, 0.45)
      const rawQuery = this.buildRawVectorQuery(queryText)
      const rawVector = await embeddingEngine.embed(rawQuery)
      const rawResults = searchSimilar(rawVector, candidates, topK * 2, rawThreshold)
      console.log(`[向量記憶] 🧾 Raw Path: ${rawResults.length} 條命中（門檻 ${rawThreshold.toFixed(2)}）| 查詢: "${rawQuery.slice(0, 80)}..."`)

      // 3. Intent Path：提煉用戶意圖後向量搜尋（降低門檻擴大召回）
      const intentThreshold = Math.max(threshold - 0.25, 0.4)
      const intentQuery = buildIntentQuery(queryText, characterNames ?? [])
      const intentVector = await embeddingEngine.embed(intentQuery)
      const intentResults = searchSimilar(intentVector, candidates, topK * 2, intentThreshold)
      console.log(`[向量記憶] 🎯 Intent Path: ${intentResults.length} 條命中（門檻 ${intentThreshold.toFixed(2)}）| 查詢: "${intentQuery.slice(0, 80)}..."`)

      // 4. State Path：狀態查詢向量搜尋（原始門檻）
      let stateResults: SimilarityResult[] = []
      if (recentMessages && recentMessages.length > 0) {
        const stateQuery = buildStateQuery(recentMessages, characterNames ?? [])
        if (stateQuery) {
          const stateVector = await embeddingEngine.embed(stateQuery)
          stateResults = searchSimilar(stateVector, candidates, topK, threshold)
          console.log(`[向量記憶] 🧠 State Path: ${stateResults.length} 條命中 | 查詢: "${stateQuery.slice(0, 80)}..."`)
        }
      }

      // 5. Keyword Path：關鍵詞擴展文本匹配
      const keywordResults = await this.keywordSearch(
        queryText, chatId, characterNames ?? [],
      )
      console.log(`[向量記憶] 🔤 Keyword Path: ${keywordResults.length} 條命中`)

      // 6. 合併四路結果（sourceId 去重，保留較高分數）
      const merged = this.mergeResults(rawResults, intentResults, stateResults, keywordResults)

      // 7. 排除最近 N 筆記憶（跟隨總結讀取數量，避免與時間排序總結重複）
      const actualExclude = excludeRecentCount ?? DEFAULT_EXCLUDE_RECENT
      const filtered = await this.excludeRecent(merged, chatId, actualExclude)
      console.log(`[向量記憶] 🚫 排除最近 ${actualExclude} 筆（剩餘 ${filtered.length} 條）`)

      // 8. 解析來源內容
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

      const reranked = this.rerankResolvedMemories(
        resolved,
        queryText,
        rawQuery,
        intentQuery,
        queryKeywords,
        characterNames ?? [],
      )

      // 9. 上下文窗口擴展（±1 相鄰條目）
      const expanded = await expandContextWindow(reranked, chatId, 0.85)

      // 10. 最終去重 + Top-K
      const final = this.finalDedup(expanded)

      // 輸出最終結果摘要
      const result = final.slice(0, topK)
      if (result.length > 0) {
        console.log(`[向量記憶] ✅ 最終檢索結果: ${result.length} 條記憶注入提示詞（擴展後 ${final.length} 條，topK=${topK} 截斷）`)
        for (const m of result) {
          console.log(`  📌 [${m.sourceType}] ${m.sourceId} | 分數: ${m.score.toFixed(3)} | 內容: "${m.content.slice(0, 80)}..."`)
        }
      } else {
        console.log('[向量記憶] ℹ️ 未檢索到符合門檻的記憶')
      }

      return result
    } catch (error) {
      console.error('[向量記憶] ❌ 檢索失敗，返回空陣列:', error)
      return []
    }
  }

  /**
   * 為總結/日記生成嵌入並儲存
   * 使用 buildVectorDocument 將原文轉換為精煉的向量文件再 embedding
   * @param storedKeywords - 用戶編輯的關鍵詞（可選，優先用於向量文件建構）
   * @param characterNames - 角色名稱列表（可選，用於保留出現的角色名）
   */
  async generateAndStoreEmbedding(
    sourceId: string,
    sourceType: 'summary' | 'diary' | 'event',
    content: string,
    chatId: string,
    characterId: string,
    storedKeywords?: string[],
    characterNames?: string[],
  ): Promise<void> {
    // 建構精煉的向量文件（去除敘事噪音，聚焦語義核心）
    const vectorDoc = buildVectorDocument(content, storedKeywords, characterNames)
    const textToEmbed = vectorDoc || content
    const hash = await contentHash(content)
    const embedding = await embeddingEngine.embed(textToEmbed)
    console.log(`[向量記憶] 📄 向量文件: "${textToEmbed.slice(0, 100)}..."（原文 ${content.length} 字 → 精煉 ${textToEmbed.length} 字）`)

    const now = Date.now()
    const record: VectorEmbeddingRecord = {
      id: `vec_${sourceId}`,
      sourceId,
      sourceType,
      chatId,
      characterId,
      vector: embedding,
      contentHash: hash,
      schemaVersion: CURRENT_VECTOR_SCHEMA_VERSION,
      dimensions: embedding.length,
      createdAt: now,
      updatedAt: now,
    }

    await putVectorEmbedding(record)
    console.log(`[向量記憶] ✅ ${sourceType} 嵌入成功: ${sourceId}（${embedding.length} 維）`)
  }

  /**
   * 批量生成嵌入（用於導入和重建）
   * 使用 buildVectorDocument 將每條原文轉換為精煉的向量文件
   */
  async generateBatchEmbeddings(
    items: Array<{ sourceId: string; sourceType: 'summary' | 'diary' | 'event'; content: string; keywords?: string[] }>,
    chatId: string,
    characterId: string,
    onProgress?: (processed: number, total: number) => void,
    characterNames?: string[],
  ): Promise<void> {
    if (items.length === 0) return

    // 建構精煉的向量文件
    const texts = items.map((item) => {
      const vectorDoc = buildVectorDocument(item.content, item.keywords, characterNames)
      return vectorDoc || item.content
    })
    console.log(`[向量記憶] 📄 向量文件建構完成，${texts.length} 條，首條: "${texts[0]?.slice(0, 80)}..."`)
    const embeddings = await embeddingEngine.embedBatch(texts)
    console.log(`[向量記憶] 🧮 嵌入完成，${embeddings.length} 條向量`)

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
        schemaVersion: CURRENT_VECTOR_SCHEMA_VERSION,
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
    characterNames?: string[],
  ): Promise<void> {
    console.log(`[向量記憶] 🔄 開始重建 chatId: ${chatId}`)
    await deleteVectorsByChatId(chatId)

    const db = await getDatabase()
    const summaries = await db.getAllFromIndex(
      DB_STORES.SUMMARIES as 'summaries',
      'by-chat',
      chatId,
    )
    console.log(`[向量記憶] 📋 找到 ${summaries.length} 條總結`)

    // 重建時同步重新生成關鍵詞（使用改進後的提取器）
    for (const s of summaries) {
      const newKeywords = extractSummaryKeywords(s.content)
      if (JSON.stringify(newKeywords) !== JSON.stringify(s.keywords ?? [])) {
        s.keywords = newKeywords
        await db.put(DB_STORES.SUMMARIES as 'summaries', s)
      }
    }

    const items: Array<{ sourceId: string; sourceType: 'summary' | 'event'; content: string; keywords?: string[] }> = summaries.map((s) => ({
      sourceId: s.id,
      sourceType: 'summary' as const,
      content: s.content,
      keywords: s.keywords,
    }))

    // 載入重要事件並加入重建列表
    const allLogs = await db.getAll(DB_STORES.IMPORTANT_EVENTS as 'importantEvents')
    const chatLog = allLogs.find((log: any) => log.chatId === chatId || log.id === chatId)
    if (chatLog && chatLog.events && chatLog.events.length > 0) {
      console.log(`[向量記憶] 📋 找到 ${chatLog.events.length} 條重要事件`)
      for (const event of chatLog.events) {
        if (event.content) {
          items.push({
            sourceId: event.id,
            sourceType: 'event',
            content: event.content,
            keywords: event.vectorKeywords,
          })
        }
      }
    }

    console.log(`[向量記憶] 🚀 開始批量嵌入 ${items.length} 條（characterNames: ${characterNames?.join(', ') ?? '無'}）`)
    await this.generateBatchEmbeddings(items, chatId, characterId, onProgress, characterNames)
    console.log(`[向量記憶] ✅ 重建完成 ${items.length} 條`)
  }

  // ─── 私有方法 ─────────────────────────────────────────────

  /** 建立較保真的原始查詢文本，避免過度提煉損失語義 */
  private buildRawVectorQuery(queryText: string): string {
    const cleaned = queryText
      .replace(/<[^>]+>/g, ' ')
      .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
      .replace(/\[[^\]]*\]\([^)]*\)/g, ' ')
      .replace(/\(OOC[:：]?[^)]*\)/gi, ' ')
      .replace(/\{OOC[:：]?[^}]*\}/gi, ' ')
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/`[^`]*`/g, ' ')
      .replace(/\*{1,2}([^*]+)\*{1,2}/g, '$1')
      .replace(/_{1,2}([^_]+)_{1,2}/g, '$1')
      .replace(/["「」『』\u201C\u201D]/g, '')
      .replace(/\s+/g, ' ')
      .trim()

    if (cleaned.length <= MAX_RAW_QUERY_LENGTH) {
      return cleaned
    }

    return cleaned.slice(0, MAX_RAW_QUERY_LENGTH)
  }

  /** 載入候選向量（過濾 stale 記錄） */
  private async loadCandidates(chatId: string): Promise<CandidateItem[]> {
    const records = await getVectorsByChatId(chatId)
    return records
      .filter((r): r is VectorEmbeddingRecord & { vector: Float32Array } => {
        const schemaVersion = r.schemaVersion ?? 1
        return r.vector !== null && schemaVersion >= CURRENT_VECTOR_SCHEMA_VERSION
      })
      .map((r) => ({
        id: r.id,
        sourceId: r.sourceId,
        sourceType: r.sourceType,
        vector: r.vector,
      }))
  }

  /** 關鍵詞擴展搜尋：對總結和重要事件執行關鍵詞匹配 */
  private async keywordSearch(
    queryText: string,
    chatId: string,
    characterNames: string[],
  ): Promise<SimilarityResult[]> {
    const expansion = expandKeywords(queryText)
    if (expansion.expandedTerms.length === 0) return []

    const db = await getDatabase()
    const results: SimilarityResult[] = []

    // 載入所有總結的文本
    const summaries = await db.getAllFromIndex(DB_STORES.SUMMARIES as 'summaries', 'by-chat', chatId)

    for (const s of summaries) {
      // 優先使用用戶編輯的關鍵詞進行匹配
      const storedKeywords: string[] | undefined = (s as any).keywords
      let matched = false
      let score = 0

      if (storedKeywords && storedKeywords.length > 0) {
        // 用儲存的關鍵詞與查詢的擴展詞交叉匹配
        const hits = storedKeywords.filter(kw =>
          expansion.expandedTerms.some(et => et.includes(kw) || kw.includes(et))
        )
        if (hits.length >= 1) {
          matched = true
          score = Math.min(0.8, Math.max(0.3, hits.length / storedKeywords.length))
        }
      }

      // 同時也對內容文本做匹配（兩者取較高分）
      const contentMatch = keywordMatch(s.content, expansion.expandedTerms, characterNames)
      if (contentMatch.matched && contentMatch.score > score) {
        matched = true
        score = contentMatch.score
      }

      if (matched) {
        results.push({
          id: `vec_${s.id}`,
          sourceId: s.id,
          sourceType: 'summary',
          score,
        })
      }
    }

    // 載入重要事件並進行關鍵詞匹配
    const allLogs = await db.getAll(DB_STORES.IMPORTANT_EVENTS as 'importantEvents')
    const chatLog = allLogs.find((log: any) => log.chatId === chatId || log.id === chatId)
    if (chatLog?.events) {
      for (const event of chatLog.events) {
        if (!event.content) continue
        let matched = false
        let score = 0

        // 優先使用向量關鍵詞匹配
        if (event.vectorKeywords && event.vectorKeywords.length > 0) {
          const hits = event.vectorKeywords.filter((kw: string) =>
            expansion.expandedTerms.some(et => et.includes(kw) || kw.includes(et))
          )
          if (hits.length >= 1) {
            matched = true
            score = Math.min(0.8, Math.max(0.3, hits.length / event.vectorKeywords.length))
          }
        }

        // 同時對內容文本做匹配
        const contentMatch = keywordMatch(event.content, expansion.expandedTerms, characterNames)
        if (contentMatch.matched && contentMatch.score > score) {
          matched = true
          score = contentMatch.score
        }

        if (matched) {
          results.push({
            id: `vec_${event.id}`,
            sourceId: event.id,
            sourceType: 'event',
            score,
          })
        }
      }
    }

    return results
  }

  /** 合併四路結果，sourceId 去重，保留較高分數 */
  private mergeResults(
    rawResults: SimilarityResult[],
    intentResults: SimilarityResult[],
    stateResults: SimilarityResult[],
    keywordResults: SimilarityResult[],
  ): SimilarityResult[] {
    const merged = new Map<string, ScoredResult>()

    const addResult = (result: SimilarityResult, path: ScoredResult['path']) => {
      const boostedScore = Math.min(1.25, result.score * PATH_SCORE_MULTIPLIERS[path])
      const weighted: ScoredResult = {
        ...result,
        score: boostedScore,
        path,
      }
      const existing = merged.get(result.sourceId)
      if (!existing || weighted.score > existing.score) {
        merged.set(result.sourceId, weighted)
      }
    }

    for (const r of rawResults) addResult(r, 'raw')
    for (const r of intentResults) addResult(r, 'intent')
    for (const r of stateResults) addResult(r, 'state')
    for (const r of keywordResults) addResult(r, 'keyword')

    return Array.from(merged.values()).sort((a, b) => b.score - a.score)
  }

  private rerankResolvedMemories(
    memories: RetrievedMemory[],
    queryText: string,
    rawQuery: string,
    intentQuery: string,
    queryKeywords: string[],
    characterNames: string[],
  ): RetrievedMemory[] {
    if (memories.length <= 1) return memories

    const normalizedQuery = this.normalizeForMatch(queryText)
    const normalizedRawQuery = this.normalizeForMatch(rawQuery)
    const normalizedIntentTerms = intentQuery
      .split(/\s+/)
      .map(term => term.trim())
      .filter(term => term.length >= 2)

    return memories
      .slice(0, RERANK_CANDIDATE_LIMIT)
      .map(memory => {
        const content = this.normalizeForMatch(memory.content)
        let bonus = 0

        if (normalizedQuery && content.includes(normalizedQuery)) {
          bonus += 0.12
        }

        if (normalizedRawQuery && normalizedRawQuery !== normalizedQuery && content.includes(normalizedRawQuery)) {
          bonus += 0.08
        }

        let keywordHits = 0
        for (const kw of queryKeywords) {
          if (kw.length >= 2 && content.includes(kw)) {
            keywordHits++
          }
        }
        bonus += Math.min(0.12, keywordHits * 0.025)

        let intentHits = 0
        for (const term of normalizedIntentTerms) {
          if (content.includes(term)) {
            intentHits++
          }
        }
        bonus += Math.min(0.12, intentHits * 0.02)

        const charHits = characterNames.filter(name => name && content.includes(name)).length
        if (charHits > 0) {
          bonus += Math.min(0.08, charHits * 0.04)
        }

        if (memory.sourceType === 'event') {
          bonus += 0.03
        }

        return {
          ...memory,
          score: Math.min(1.5, memory.score + bonus),
        }
      })
      .concat(memories.slice(RERANK_CANDIDATE_LIMIT))
      .sort((a, b) => b.score - a.score)
  }

  private normalizeForMatch(text: string): string {
    return text
      .replace(/<[^>]+>/g, ' ')
      .replace(/["「」『』\u201C\u201D]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
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
    sourceType: 'summary' | 'diary' | 'event',
  ): Promise<string | null> {
    try {
      if (sourceType === 'summary') {
        const summary = await db.get(DB_STORES.SUMMARIES as 'summaries', sourceId)
        return summary?.content ?? null
      } else if (sourceType === 'diary') {
        const diary = await db.get(DB_STORES.DIARIES as 'diaries', sourceId)
        return diary?.content ?? null
      } else {
        // event: 從 importantEvents store 中查找
        // 重要事件的 sourceId 格式: "evt_{eventId}_{logId}"
        // 需要遍歷所有 log 找到對應事件
        const allLogs = await db.getAll(DB_STORES.IMPORTANT_EVENTS as 'importantEvents')
        for (const log of allLogs) {
          const event = log.events?.find((e: { id: string }) => e.id === sourceId)
          if (event) return event.content ?? null
        }
        return null
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
    sourceType: 'summary' | 'diary' | 'event',
  ): Promise<number> {
    try {
      if (sourceType === 'summary') {
        const summary = await db.get(DB_STORES.SUMMARIES as 'summaries', sourceId)
        return summary?.createdAt ?? 0
      } else if (sourceType === 'diary') {
        const diary = await db.get(DB_STORES.DIARIES as 'diaries', sourceId)
        return diary?.createdAt ?? 0
      } else {
        // event: 從 importantEvents store 中查找 timestamp
        const allLogs = await db.getAll(DB_STORES.IMPORTANT_EVENTS as 'importantEvents')
        for (const log of allLogs) {
          const event = log.events?.find((e: { id: string }) => e.id === sourceId)
          if (event) return event.timestamp ?? 0
        }
        return 0
      }
    } catch {
      return 0
    }
  }
}
