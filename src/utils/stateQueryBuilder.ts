/**
 * State_Query 建構器
 * 從近期對話訊息中提取有意義的語義實體（地點、食物、衣著、情緒、物品等）
 * 參考 Horae 的 buildStateQuery + _detectCategoryTerms 策略
 * 不再使用原文片段或滑動窗口，而是掃描類別詞表提取實體關鍵詞
 */

import type { ChatMessage } from '@/types/chat'
import { TERM_CATEGORIES, KEYWORD_TO_CATEGORY } from '@/data/termCategories'

/** 近期訊息的最小介面（只需要 content 欄位） */
type MessageLike = Pick<ChatMessage, 'content'>

// ─── 常數 ───────────────────────────────────────────────────

/** State_Query 最大長度（字元） */
const MAX_QUERY_LENGTH = 300

/** 取最近 N 條訊息作為實體提取來源 */
const RECENT_MESSAGE_COUNT = 10

/** 每個類別最多保留的關鍵詞數量 */
const MAX_TERMS_PER_CATEGORY = 4

/** 類別優先順序（越前面越重要，優先保留） */
const CATEGORY_PRIORITY: string[] = [
  'location',
  'clothing',
  'food',
  'emotion_positive',
  'emotion_negative',
  'body_contact',
  'social',
  'gift',
  'medical',
  'combat',
  'ceremony',
  'movement',
]

/**
 * 從近期對話訊息中建構 State_Query
 * 掃描訊息文本，提取各語義類別的實體關鍵詞，組成查詢文本
 * @param recentMessages - 近期對話訊息（建議最近 10-20 筆）
 * @param characterNames - 當前聊天的角色名稱列表（會加入查詢）
 * @param maxLength - 最大查詢長度，預設 300
 * @returns State_Query 文本字串，空字串表示無有效內容
 */
export function buildStateQuery(
  recentMessages: MessageLike[],
  characterNames: string[],
  maxLength: number = MAX_QUERY_LENGTH,
): string {
  if (recentMessages.length === 0) return ''

  // 取最近 N 條有內容的訊息
  const recent = recentMessages
    .filter((m) => m.content && m.content.trim().length > 0)
    .slice(-RECENT_MESSAGE_COUNT)

  if (recent.length === 0) return ''

  // 合併所有訊息文本，清理 HTML 和 markdown
  const combinedText = recent
    .map((m) =>
      m.content
        .replace(/<[^>]+>/g, '')
        .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
        .replace(/\[[^\]]*\]\([^)]*\)/g, '')
        .trim(),
    )
    .join(' ')

  // 從合併文本中提取各類別實體
  const extracted = extractEntities(combinedText)

  if (extracted.size === 0) return ''

  // 按類別優先順序組裝查詢
  const parts: string[] = []

  // 加入角色名稱（如果有）
  for (const name of characterNames) {
    if (name && combinedText.includes(name)) {
      parts.push(name)
    }
  }

  // 按優先順序加入各類別的實體
  for (const category of CATEGORY_PRIORITY) {
    const terms = extracted.get(category)
    if (terms && terms.length > 0) {
      // 每個類別最多取 MAX_TERMS_PER_CATEGORY 個
      parts.push(...terms.slice(0, MAX_TERMS_PER_CATEGORY))
    }
  }

  // 加入未在優先列表中的類別
  for (const [category, terms] of extracted) {
    if (!CATEGORY_PRIORITY.includes(category) && terms.length > 0) {
      parts.push(...terms.slice(0, MAX_TERMS_PER_CATEGORY))
    }
  }

  if (parts.length === 0) return ''

  // 去重並截斷
  const unique = [...new Set(parts)]
  let result = unique.join(' ')
  if (result.length > maxLength) {
    result = result.slice(0, maxLength)
  }

  return result
}

/**
 * 從文本中提取各語義類別的實體關鍵詞
 * 直接掃描 TERM_CATEGORIES 中的已知詞彙（無需分詞）
 * @returns Map<類別名稱, 命中的關鍵詞列表>
 */
function extractEntities(text: string): Map<string, string[]> {
  const categoryHits = new Map<string, string[]>()

  for (const [category, terms] of Object.entries(TERM_CATEGORIES)) {
    const hits: string[] = []
    for (const term of terms) {
      if (term.length >= 2 && text.includes(term)) {
        // 避免重複（繁簡體可能都命中同一概念）
        if (!hits.some((h) => isSameEntity(h, term))) {
          hits.push(term)
        }
      }
    }
    if (hits.length > 0) {
      // 按詞長降序（較長的詞通常更精確）
      hits.sort((a, b) => b.length - a.length)
      categoryHits.set(category, hits)
    }
  }

  return categoryHits
}

/**
 * 判斷兩個詞是否為同一實體（簡單的繁簡體/同義判斷）
 * 如果一個詞包含另一個詞，視為同一實體
 */
function isSameEntity(a: string, b: string): boolean {
  return a.includes(b) || b.includes(a)
}
