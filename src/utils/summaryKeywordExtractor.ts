/**
 * 總結關鍵詞提取器
 * 從總結文本中提取語義關鍵詞，用於向量記憶檢索匹配
 *
 * 策略：純詞表匹配，不做任何正則切分
 * 1. TERM_CATEGORIES 詞表匹配（情緒、地點、動作等 RP 詞彙）
 * 2. synonymFamilies 同義詞族匹配
 * 3. 常用動賓短語詞表（硬編碼的完整短語，不做正則拆分）
 *
 * 設計原則：
 * - 只產出「詞表中已知的完整詞彙」，絕不做中文正則切分
 * - 中文沒有空格分詞，任何基於正則的切分都會產生截斷垃圾詞
 * - 寧可少提取幾個詞，也不要產出截斷的垃圾
 */

import { TERM_CATEGORIES } from '@/data/termCategories'
import { synonymFamilies } from '@/data/synonymFamilies'
import { VERB_OBJECT_PHRASES } from '@/data/verbObjectPhrases'

const MAX_TERMS_PER_CATEGORY = 2
const MAX_TOTAL_KEYWORDS = 10

const CATEGORY_PRIORITY: string[] = [
  'gift', 'social', 'ceremony', 'medical', 'combat',
  'body_contact', 'emotion_negative', 'emotion_positive',
  'food', 'movement', 'clothing', 'location',
]

const termToFamilyHead = new Map<string, string>()
for (const family of synonymFamilies) {
  const head = family[0]
  for (const term of family) {
    if (!termToFamilyHead.has(term)) {
      termToFamilyHead.set(term, head)
    }
  }
}

const STOP_WORDS = new Set([
  '之後', '以後', '後來', '以前', '日後', '將來', '未來',
  '之后', '以后', '后来', '日后', '将来',
])

function cleanText(text: string): string {
  return text
    .replace(/<[^>]+>/g, '')
    .replace(/\*{1,2}([^*]+)\*{1,2}/g, '$1')
    .replace(/["\u300C\u300D\u300E\u300F\u201C\u201D]/g, '')
    .trim()
}

export function extractSummaryKeywords(content: string): string[] {
  if (!content || content.trim().length === 0) return []

  const cleaned = cleanText(content)
  const candidates = new Map<string, number>()

  function addCandidate(word: string, score: number) {
    if (word.length < 2) return
    for (const [existing] of candidates) {
      if (existing !== word && (existing.includes(word) || word.includes(existing))) {
        const oldScore = candidates.get(existing) ?? 0
        if (word.length > existing.length || (word.length === existing.length && score > oldScore)) {
          candidates.delete(existing)
          candidates.set(word, score)
        }
        return
      }
    }
    candidates.set(word, Math.max(candidates.get(word) ?? 0, score))
  }

  // 第一層：詞表匹配（高分 = 10）
  for (const category of CATEGORY_PRIORITY) {
    const terms = TERM_CATEGORIES[category]
    if (!terms) continue
    let count = 0
    for (const term of terms) {
      if (count >= MAX_TERMS_PER_CATEGORY) break
      if (term.length >= 2 && cleaned.includes(term)) {
        addCandidate(term, 10)
        count++
      }
    }
  }

  // 第二層：同義詞族匹配（高分 = 8）
  for (const [term] of termToFamilyHead) {
    if (term.length >= 2 && !STOP_WORDS.has(term) && cleaned.includes(term)) {
      addCandidate(term, 8)
    }
  }

  // 第三層：動賓短語詞表匹配（中分 = 6）
  for (const phrase of VERB_OBJECT_PHRASES) {
    if (cleaned.includes(phrase)) {
      addCandidate(phrase, 6)
    }
  }

  const sorted = [...candidates.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([word]) => word)

  return sorted.slice(0, MAX_TOTAL_KEYWORDS)
}
