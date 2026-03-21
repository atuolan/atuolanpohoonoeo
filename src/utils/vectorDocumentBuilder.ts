/**
 * 向量文件建構器
 * 將總結原文轉換為精煉的「向量文件」再進行 embedding
 *
 * 靈感來自 Horae 的 buildVectorDocument：
 * Horae 從結構化 horae_meta（事件摘要、NPC、場景）建構向量文件
 * Aguaphone 沒有結構化元數據，但可以從總結文本中提取語義核心：
 *   1. 用 extractSummaryKeywords 提取主題關鍵詞（詞表匹配 + 動賓短語 + 虛詞切分）
 *   2. 用 TERM_CATEGORIES 偵測場景類別標籤
 *   3. 保留角色名稱
 *   4. 用 | 分隔拼接，讓 embedding 聚焦在語義關鍵內容
 *
 * 效果：去除敘事性噪音（「然後」「接著」「他說」等），
 * 讓 bge-small-zh 的 512 維向量空間更集中在事件/情緒/動作語義上
 */

import { extractSummaryKeywords } from '@/utils/summaryKeywordExtractor'
import { TERM_CATEGORIES } from '@/data/termCategories'

/** 向量文件最大長度（字元） */
const MAX_DOCUMENT_LENGTH = 300

/** 每個類別最多保留的標籤數 */
const MAX_CATEGORY_TAGS = 2

/**
 * 從總結文本建構精煉的向量文件
 * @param content - 總結原文
 * @param storedKeywords - 用戶編輯過的關鍵詞（優先使用）
 * @param characterNames - 角色名稱列表（可選，用於保留出現的角色名）
 * @returns 精煉的向量文件文本；若無法提取有效內容則返回截斷的原文
 */
export function buildVectorDocument(
  content: string,
  storedKeywords?: string[],
  characterNames?: string[],
): string {
  if (!content || content.trim().length === 0) return ''

  const cleaned = cleanForExtraction(content)
  const parts: string[] = []

  // 1. 角色名稱（在文本中出現的）
  if (characterNames && characterNames.length > 0) {
    for (const name of characterNames) {
      if (name && name.length >= 2 && cleaned.includes(name)) {
        parts.push(name)
      }
    }
  }

  // 2. 用戶編輯的關鍵詞（最高優先）
  if (storedKeywords && storedKeywords.length > 0) {
    for (const kw of storedKeywords) {
      if (kw && !parts.includes(kw)) {
        parts.push(kw)
      }
    }
  }

  // 3. 自動提取的主題關鍵詞
  const extracted = extractSummaryKeywords(cleaned)
  for (const kw of extracted) {
    if (!parts.some(p => p.includes(kw) || kw.includes(p))) {
      parts.push(kw)
    }
  }

  // 4. 類別標籤（偵測文本中出現的語義類別）
  const categoryTags = detectCategoryTags(cleaned)
  for (const tag of categoryTags) {
    if (!parts.includes(tag)) {
      parts.push(tag)
    }
  }

  // 5. 若提取結果太少，fallback 到截斷原文
  if (parts.length < 3) {
    const fallback = cleaned.length > MAX_DOCUMENT_LENGTH
      ? cleaned.slice(0, MAX_DOCUMENT_LENGTH)
      : cleaned
    return fallback
  }

  // 6. 用 | 分隔拼接（與 Horae 一致的格式）
  let result = parts.join(' | ')
  if (result.length > MAX_DOCUMENT_LENGTH) {
    result = result.slice(0, MAX_DOCUMENT_LENGTH)
  }

  return result
}

// ─── 內部函式 ───────────────────────────────────────────────

/** 清理文本：移除 HTML、markdown 標記、多餘空白 */
function cleanForExtraction(text: string): string {
  return text
    .replace(/<[^>]+>/g, '')
    .replace(/\*{1,2}([^*]+)\*{1,2}/g, '$1')
    .replace(/_{1,2}([^_]+)_{1,2}/g, '$1')
    .replace(/["「」『』\u201C\u201D]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * 偵測文本中出現的語義類別標籤
 * 例如文本提到「包紮」「傷口」→ 返回 ['醫療']
 * 每個類別至少需要命中 2 個詞才算有效（避免單詞誤判）
 */
function detectCategoryTags(text: string): string[] {
  const CATEGORY_LABELS: Record<string, string> = {
    medical: '醫療',
    combat: '戰鬥',
    social: '社交',
    ceremony: '儀式',
    gift: '禮物',
    emotion_positive: '正面情緒',
    emotion_negative: '負面情緒',
    food: '飲食',
    clothing: '衣著',
    body_contact: '親密接觸',
    movement: '移動',
    location: '場所',
  }

  const tags: string[] = []

  for (const [category, terms] of Object.entries(TERM_CATEGORIES)) {
    let hitCount = 0
    for (const term of terms) {
      if (term.length >= 2 && text.includes(term)) {
        hitCount++
        if (hitCount >= 2) break
      }
    }
    if (hitCount >= 2) {
      const label = CATEGORY_LABELS[category]
      if (label && tags.length < MAX_CATEGORY_TAGS) {
        tags.push(label)
      }
    }
  }

  return tags
}
