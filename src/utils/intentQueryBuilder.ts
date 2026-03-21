/**
 * Intent_Query 建構器
 * 從用戶的單條訊息中提取核心語義意圖（動作 + 物件 + 情緒）
 * 解決 RP 訊息過長導致 embedding 向量被噪音稀釋的問題
 *
 * 策略：
 * 1. 清理 HTML/markdown/OOC 標記
 * 2. 從 TERM_CATEGORIES 提取實體關鍵詞（同 stateQueryBuilder）
 * 3. 從 synonymFamilies 提取動作/情緒/關係詞
 * 4. 提取動詞短語（中文常見的「動詞+賓語」模式）
 * 5. 組裝為精煉的查詢文本
 * 6. 若提煉結果太少，fallback 到截斷的原始文本
 */

import { TERM_CATEGORIES } from '@/data/termCategories'
import { synonymFamilies } from '@/data/synonymFamilies'

/** Intent_Query 最大長度（字元） */
const MAX_QUERY_LENGTH = 200

/** 每個類別最多保留的關鍵詞數量 */
const MAX_TERMS_PER_CATEGORY = 3

/** 最少需要提取到的詞數，低於此值則 fallback */
const MIN_EXTRACTED_TERMS = 2

/** fallback 時截取原始文本的最大長度 */
const FALLBACK_MAX_LENGTH = 150

/**
 * Intent 提取的類別優先順序
 * 與 stateQueryBuilder 不同：這裡優先提取動作性、事件性的詞彙
 * 而非環境狀態（地點、衣著等）
 */
const INTENT_CATEGORY_PRIORITY: string[] = [
  'gift',              // 禮物/贈送 — 最直接的意圖信號
  'social',            // 社交互動（告白、道歉、擁抱）
  'ceremony',          // 儀式/慶典
  'medical',           // 醫療/受傷
  'combat',            // 戰鬥/衝突
  'body_contact',      // 身體接觸
  'emotion_negative',  // 負面情緒
  'emotion_positive',  // 正面情緒
  'food',              // 食物（做飯、吃飯等動作）
  'movement',          // 動作/移動
  'clothing',          // 衣著（換衣等動作）
  'location',          // 地點（最低優先，通常是背景噪音）
]

// ─── 預建同義詞族索引 ──────────────────────────────────────

/** 詞彙 → 所屬族群的代表詞（第一個詞） */
const termToFamilyHead = new Map<string, string>()
for (const family of synonymFamilies) {
  const head = family[0]
  for (const term of family) {
    if (!termToFamilyHead.has(term)) {
      termToFamilyHead.set(term, head)
    }
  }
}

// ─── 中文動詞短語模式 ──────────────────────────────────────

/**
 * 常見的「動詞+賓語」模式
 * 用於捕捉 TERM_CATEGORIES 和 synonymFamilies 未覆蓋的動作意圖
 */
const VERB_PATTERNS: RegExp[] = [
  /(?:送|給|遞|贈|交|還|拿|帶|買|賣|借|偷|搶|撿|丟|扔|放|藏|收|留|寄)(?:了|給|過)?(?:[\u4e00-\u9fff]{1,4})/g,
  /(?:打開|關上|拿起|放下|撿起|丟掉|拿出|掏出|收起|藏好|交出|遞過|帶走|帶來|拿走|送出|送來)(?:了)?(?:[\u4e00-\u9fff]{1,4})?/g,
  /(?:做|煮|烤|蒸|炒|泡|沖|倒|切|洗|擦|刷|修|補|裝|拆|建|蓋)(?:了|好|完)?(?:[\u4e00-\u9fff]{1,4})?/g,
]

/**
 * 從用戶的單條訊息中建構 Intent_Query
 * @param messageText - 用戶訊息原文
 * @param characterNames - 角色名稱列表（可選，用於加入查詢）
 * @returns 精煉的查詢文本；若無法提取有效意圖則返回截斷的原始文本
 */
export function buildIntentQuery(
  messageText: string,
  characterNames: string[] = [],
): string {
  if (!messageText || messageText.trim().length === 0) return ''

  // 1. 清理文本
  const cleaned = cleanText(messageText)
  if (cleaned.length === 0) return ''

  // 2. 提取各類別實體
  const categoryHits = extractCategoryTerms(cleaned)

  // 3. 提取同義詞族命中
  const familyHits = extractFamilyTerms(cleaned)

  // 4. 提取動詞短語
  const verbPhrases = extractVerbPhrases(cleaned)

  // 5. 按優先順序組裝
  const parts: string[] = []

  // 加入角色名稱（如果在文本中出現）
  for (const name of characterNames) {
    if (name && cleaned.includes(name)) {
      parts.push(name)
    }
  }

  // 按優先順序加入類別實體
  for (const category of INTENT_CATEGORY_PRIORITY) {
    const terms = categoryHits.get(category)
    if (terms && terms.length > 0) {
      parts.push(...terms.slice(0, MAX_TERMS_PER_CATEGORY))
    }
  }

  // 加入同義詞族命中（去重）
  for (const term of familyHits) {
    if (!parts.includes(term)) {
      parts.push(term)
    }
  }

  // 加入動詞短語（去重）
  for (const phrase of verbPhrases) {
    if (!parts.some(p => p.includes(phrase) || phrase.includes(p))) {
      parts.push(phrase)
    }
  }

  // 6. 去重
  const unique = [...new Set(parts)]

  // 7. 判斷是否需要 fallback
  if (unique.length < MIN_EXTRACTED_TERMS) {
    // 提取的詞太少，fallback 到截斷的清理文本
    const fallback = cleaned.length > FALLBACK_MAX_LENGTH
      ? cleaned.slice(0, FALLBACK_MAX_LENGTH)
      : cleaned
    return fallback
  }

  // 8. 截斷並返回
  let result = unique.join(' ')
  if (result.length > MAX_QUERY_LENGTH) {
    result = result.slice(0, MAX_QUERY_LENGTH)
  }

  return result
}

// ─── 內部函式 ───────────────────────────────────────────────

/** 清理文本：移除 HTML、markdown、OOC 標記、星號動作標記 */
function cleanText(text: string): string {
  return text
    .replace(/<[^>]+>/g, '')                    // HTML 標籤
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')       // markdown 圖片
    .replace(/\[[^\]]*\]\([^)]*\)/g, '')        // markdown 連結
    .replace(/\(OOC[:：]?[^)]*\)/gi, '')        // OOC 標記
    .replace(/\{OOC[:：]?[^}]*\}/gi, '')        // OOC 大括號
    .replace(/```[\s\S]*?```/g, '')             // 程式碼區塊
    .replace(/`[^`]*`/g, '')                    // 行內程式碼
    .replace(/\*{1,2}([^*]+)\*{1,2}/g, '$1')   // 星號標記（保留內容）
    .replace(/_{1,2}([^_]+)_{1,2}/g, '$1')     // 底線標記（保留內容）
    .replace(/["「」『』""]/g, '')               // 引號
    .replace(/\s+/g, ' ')
    .trim()
}

/** 從文本中提取 TERM_CATEGORIES 實體 */
function extractCategoryTerms(text: string): Map<string, string[]> {
  const hits = new Map<string, string[]>()

  for (const [category, terms] of Object.entries(TERM_CATEGORIES)) {
    const matched: string[] = []
    for (const term of terms) {
      if (term.length >= 2 && text.includes(term)) {
        if (!matched.some(m => m.includes(term) || term.includes(m))) {
          matched.push(term)
        }
      }
    }
    if (matched.length > 0) {
      matched.sort((a, b) => b.length - a.length)
      hits.set(category, matched)
    }
  }

  return hits
}

/** 從文本中提取同義詞族的代表詞 */
function extractFamilyTerms(text: string): string[] {
  const heads = new Set<string>()

  for (const [term, head] of termToFamilyHead) {
    if (term.length >= 2 && text.includes(term)) {
      heads.add(head)
    }
  }

  return Array.from(heads)
}

/** 從文本中提取動詞短語 */
function extractVerbPhrases(text: string): string[] {
  const phrases: string[] = []

  for (const pattern of VERB_PATTERNS) {
    // 重置 lastIndex（全域正則）
    pattern.lastIndex = 0
    let match: RegExpExecArray | null
    while ((match = pattern.exec(text)) !== null) {
      const phrase = match[0]
      // 過濾太短或太長的匹配
      if (phrase.length >= 2 && phrase.length <= 8) {
        if (!phrases.some(p => p.includes(phrase) || phrase.includes(p))) {
          phrases.push(phrase)
        }
      }
    }
  }

  return phrases.slice(0, 5) // 最多 5 個動詞短語
}
