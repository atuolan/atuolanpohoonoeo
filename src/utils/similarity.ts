/**
 * 語義相似度引擎
 * 純函式模組，無副作用，無外部依賴
 * 用於在瀏覽器端計算餘弦相似度並檢索最相關的記憶片段
 */

/** 相似度搜尋結果 */
export interface SimilarityResult {
  id: string
  sourceId: string
  sourceType: 'summary' | 'diary'
  score: number
  content?: string
}

/**
 * 計算兩個向量的餘弦相似度
 * cosine_similarity = (a · b) / (‖a‖ × ‖b‖)
 * 零向量返回 0（避免除以零）
 */
export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) {
    return 0
  }

  let dot = 0
  let normA = 0
  let normB = 0

  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB)

  // 零向量返回 0
  if (denominator === 0) {
    return 0
  }

  return dot / denominator
}

/** 候選向量項目 */
interface CandidateItem {
  id: string
  sourceId: string
  sourceType: 'summary' | 'diary'
  vector: Float32Array
}

/**
 * 在一組向量中搜尋最相似的 Top-K 結果
 * @param query - 查詢向量
 * @param candidates - 候選向量列表
 * @param topK - 返回數量上限
 * @param threshold - 最低相似度門檻
 * @returns 按相似度降序排列的結果，已過濾低於門檻的項目
 */
export function searchSimilar(
  query: Float32Array,
  candidates: CandidateItem[],
  topK: number,
  threshold: number,
): SimilarityResult[] {
  const results: SimilarityResult[] = []

  for (const candidate of candidates) {
    // 維度不匹配時跳過並記錄警告
    if (candidate.vector.length !== query.length) {
      console.warn(
        `[向量記憶] 維度不匹配：查詢向量 ${query.length} 維，候選向量 ${candidate.vector.length} 維，已跳過 (id: ${candidate.id})`,
      )
      continue
    }

    const score = cosineSimilarity(query, candidate.vector)

    // 過濾低於門檻的結果
    if (score >= threshold) {
      results.push({
        id: candidate.id,
        sourceId: candidate.sourceId,
        sourceType: candidate.sourceType,
        score,
      })
    }
  }

  // 按相似度降序排列
  results.sort((a, b) => b.score - a.score)

  // 限制返回數量
  return results.slice(0, topK)
}
