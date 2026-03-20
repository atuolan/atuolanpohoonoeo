/**
 * 關鍵詞擴展器
 * 維護同義詞族表，從查詢文本中偵測已知詞彙並擴展為語義相關詞組
 * 純函式模組，無副作用，無外部依賴
 */

import { synonymFamilies } from '@/data/synonymFamilies'

// ─── 介面定義 ───────────────────────────────────────────────

/** 關鍵詞擴展結果 */
export interface KeywordExpandResult {
  /** 查詢中偵測到的已知詞彙 */
  originalTerms: string[]
  /** 擴展後的所有同義詞（含原始詞） */
  expandedTerms: string[]
  /** 命中的同義詞族 */
  families: string[][]
}

/** 關鍵詞匹配結果 */
export interface KeywordMatchResult {
  /** 是否匹配 */
  matched: boolean
  /** 匹配分數（0-0.8） */
  score: number
  /** 匹配到的詞彙 */
  matchedTerms: string[]
}

// ─── 預建索引（模組載入時一次性建立） ────────────────────────

/** 詞彙 → 所屬族群索引的映射 */
const termToFamilyIndex = new Map<string, number[]>()

for (let i = 0; i < synonymFamilies.length; i++) {
  for (const term of synonymFamilies[i]) {
    const existing = termToFamilyIndex.get(term)
    if (existing) {
      existing.push(i)
    } else {
      termToFamilyIndex.set(term, [i])
    }
  }
}

// ─── 公開函式 ───────────────────────────────────────────────

/**
 * 從查詢文本中偵測同義詞並擴展
 * @param queryText - 查詢文本
 * @returns 擴展結果
 */
export function expandKeywords(queryText: string): KeywordExpandResult {
  const originalTerms: string[] = []
  const hitFamilyIndices = new Set<number>()

  // 遍歷所有已知詞彙，檢查是否出現在查詢文本中
  for (const [term, familyIndices] of termToFamilyIndex) {
    if (queryText.includes(term)) {
      originalTerms.push(term)
      for (const idx of familyIndices) {
        hitFamilyIndices.add(idx)
      }
    }
  }

  if (hitFamilyIndices.size === 0) {
    return { originalTerms: [], expandedTerms: [], families: [] }
  }

  // 收集所有命中族群的成員
  const expandedSet = new Set<string>()
  const families: string[][] = []

  for (const idx of hitFamilyIndices) {
    const family = synonymFamilies[idx]
    families.push(family)
    for (const term of family) {
      expandedSet.add(term)
    }
  }

  return {
    originalTerms,
    expandedTerms: Array.from(expandedSet),
    families,
  }
}

/**
 * 對候選記憶文本執行關鍵詞匹配
 * 規則：至少匹配 2 個擴展詞，或 1 個擴展詞 + 角色名
 * @param content - 候選記憶的文本內容
 * @param expandedTerms - 擴展後的同義詞列表
 * @param characterNames - 角色名稱列表
 * @returns 匹配結果
 */
export function keywordMatch(
  content: string,
  expandedTerms: string[],
  characterNames: string[],
): KeywordMatchResult {
  if (expandedTerms.length === 0) {
    return { matched: false, score: 0, matchedTerms: [] }
  }

  // 統計匹配的擴展詞
  const matchedTerms: string[] = []
  for (const term of expandedTerms) {
    if (content.includes(term)) {
      matchedTerms.push(term)
    }
  }

  // 檢查是否包含角色名
  const hasCharacterName = characterNames.some((name) => content.includes(name))

  // 匹配規則：≥2 個擴展詞，或 1 個擴展詞 + 角色名
  const matched =
    matchedTerms.length >= 2 || (matchedTerms.length >= 1 && hasCharacterName)

  if (!matched) {
    return { matched: false, score: 0, matchedTerms: [] }
  }

  // 計算分數：匹配詞數 / 擴展詞總數，限制在 0.3-0.8 之間
  const rawScore = matchedTerms.length / expandedTerms.length
  const score = Math.min(0.8, Math.max(0.3, rawScore))

  return { matched, score, matchedTerms }
}
