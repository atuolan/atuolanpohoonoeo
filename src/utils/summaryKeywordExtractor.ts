/**
 * 總結關鍵詞提取器
 * 從總結文本中提取語義關鍵詞，用於向量記憶檢索匹配
 *
 * 策略（三層）：
 * 1. 詞表匹配：TERM_CATEGORIES + synonymFamilies（捕捉情緒、地點等 RP 詞彙）
 * 2. 功能詞切分：用中文虛詞（的、了、著、在、把、被...）作為天然分詞邊界，
 *    提取 2-4 字的實詞片段，過濾停用詞後保留有意義的主題詞
 * 3. 動賓短語：用精確的「單字動詞 + 1-2字賓語」模式提取（練車、吃泡麵、匯錢）
 *
 * 設計原則：不依賴分詞庫，用虛詞切分 + 停用詞過濾實現輕量級提取
 */

import { TERM_CATEGORIES } from '@/data/termCategories'
import { synonymFamilies } from '@/data/synonymFamilies'

/** 每個類別最多保留的關鍵詞數量 */
const MAX_TERMS_PER_CATEGORY = 2

/** 最終關鍵詞數量上限 */
const MAX_TOTAL_KEYWORDS = 10

/** 類別優先順序 */
const CATEGORY_PRIORITY: string[] = [
  'gift', 'social', 'ceremony', 'medical', 'combat',
  'body_contact', 'emotion_negative', 'emotion_positive',
  'food', 'movement', 'clothing', 'location',
]

/** 預建同義詞族索引：詞彙 → 族群代表詞 */
const termToFamilyHead = new Map<string, string>()
for (const family of synonymFamilies) {
  const head = family[0]
  for (const term of family) {
    if (!termToFamilyHead.has(term)) {
      termToFamilyHead.set(term, head)
    }
  }
}

// ─── 功能詞切分字元 ────────────────────────────────────────
// 這些字元在中文中充當天然的「詞邊界」

/** 虛詞/功能詞/代詞（用於切分文本） */
const SPLIT_CHARS = '的了著過嗎呢吧啊呀哦嘛哈唉在把被讓給跟和與或但而也都就還又才只很太更最不沒是有' +
  '着过吗让与还没' +
  '因為所以雖然如果既然於為從向對則卻甚至而且然而不過於是接著況且何況儘管盡管即使哪怕' +
  '因为虽然从向对却甚至而且然而不过于是接着况且尽管即使哪怕' +
  '些這那每當用來去到說看想要會能做吃喝睡穿走跑坐站次回種份件條個本該此' +  // 量詞/指示詞/泛化動詞
  '这那每当用来去到说看想要会能做吃喝睡穿走跑坐站次回种份件条个本该此' +
  '輕輕慢慢悄悄偷偷靜靜默默緩緩急急狠狠重重深深淺淺' +  // 常見疊詞副詞（拆為單字）
  '輕慢悄偷靜默緩急狠重深淺' +  // 疊詞的單字形式也作為邊界
  '轻慢悄偷静默缓急狠重深浅' +
  '我你他她它們们' +
  '，。！？；：、…—「」『』\u201C\u201D（）()【】《》' +
  ',.!?;:\n\r\t '

const SPLIT_SET = new Set(SPLIT_CHARS.split(''))

// ─── 停用詞表 ──────────────────────────────────────────────

const STOP_WORDS = new Set([
  // 代詞
  '我', '你', '他', '她', '它', '我們', '你們', '他們', '她們', '自己', '這個', '那個',
  '我的', '你的', '他的', '她的', '我们', '你们', '他们', '她们',
  // 泛化動詞
  '做', '去', '來', '到', '說', '看', '想', '要', '會', '能', '可以',
  '知道', '覺得', '認為', '開始', '繼續', '結果', '然後', '之後', '因為', '所以',
  '来', '说', '会', '觉得', '认为', '开始', '继续', '结果', '然后', '之后', '因为',
  // 泛化形容詞
  '好', '大', '小', '多', '少', '長', '短', '新', '舊', '真', '假', '长', '旧',
  // 量詞/方位
  '個', '些', '點', '次', '下', '裡', '上', '中', '前', '後', '間', '个', '里', '后',
  // 時間
  '時候', '時間', '今天', '昨天', '明天', '現在', '以前', '以後', '一直', '馬上',
  '时候', '时间', '现在', '以后', '马上',
  // 其他
  '什麼', '怎麼', '這樣', '那樣', '一樣', '一起', '其實', '可能', '應該', '需要',
  '什么', '怎么', '这样', '那样', '其实', '应该',
  '不過', '雖然', '如果', '即使', '除了', '關於', '對於', '至少', '終於', '竟然',
  '不过', '虽然', '除了', '关于', '对于', '终于', '竟然',
  // 敘事常見無意義片段
  '那個', '這種', '一種', '那種', '某種', '這件', '那件', '一件',
  // 其他常見噪音
  '既然', '後來', '立刻', '得去', '個簡短', '聲稱',
])

// ─── 動賓短語右邊界字元類（硬編碼，避免動態 RegExp 轉義問題） ──
// 包含虛詞、代詞、標點、以及單字動詞（作為下一個動賓短語的起始邊界）
const VERB_CHARS = '吃喝買賣找學練玩寫讀聽送拿帶穿開修洗煮烤炒泡沖點訂租借還存花賺付匯轉寄收換選挑試考教幫叫問查搜裝拆搬丟撿藏偷搶打踢推拉抱背扛舉放掛貼畫拍錄剪編排掃刪改記算測檢驗治醫養餵釣騎駕停挖爬游飛投報填簽請申設計买卖学练写读听带开烤冲点订借还赚汇转换选试帮问查搜装拆搬丢捡偷抢踢扛举挂贴画录剪编扫删测检验医养喂钓骑驾飞报填签请申设计'
const BOUNDARY_CLASS = '的了著過嗎呢吧啊呀哦嘛哈唉在把被讓給跟和與或但而也都就還又才只很太更最不沒是有着过吗让与还没因為所以雖然如果既然於從向對則卻因为虽然从向对却些這那每當用來去到說看想要會能这那每当用来去到说看想要会能我你他她它們们，。！？；：、…—「」『』\u201C\u201D（）\\(\\)【】《》,\\.!\\?;:\\s' + VERB_CHARS

// ─── 動賓短語模式 ──────────────────────────────────────────

/** CJK 虛詞字元集合（不應出現在賓語中的字） */
const CJK_FUNC_SET = new Set(
  '的了著過嗎呢吧啊呀哦嘛哈唉在把被讓給跟和與或但而也都就還又才只很太更最不沒是有着过吗让与还没些這那每當这那每当我你他她它們们' +
  '說看想用來去到會能可以說看想用来去到会能' +  // 泛化動詞
  '一二三四五六七八九十百千萬億個條頓件位次回種份張塊雙對' +  // 數詞/量詞
  '个条顿件种份张块双对'
)

/**
 * 精確的「單字動詞 + 1-3字賓語」模式
 * 例如：練車、吃泡麵、匯錢、買豬排飯、查市場
 * 注意：已移除「做」因為太泛化
 */
const VERB_OBJECT_RE = new RegExp(
  '(?:吃|喝|買|賣|找|學|練|用|玩|寫|讀|聽|送|拿|帶|穿|開|修|洗|煮|烤|炒|泡|沖|點|訂|租|借|還|存|花|賺|付|匯|轉|寄|收|換|選|挑|試|考|教|幫|叫|問|查|搜|裝|拆|搬|丟|撿|藏|偷|搶|打|踢|推|拉|抱|背|扛|舉|放|掛|貼|畫|拍|錄|剪|編|排|掃|刪|改|記|算|測|檢|驗|治|醫|養|餵|釣|騎|駕|停|挖|爬|游|飛|投|報|填|簽|請|申|設|計' +
  '|买|卖|学|练|写|读|听|带|穿|开|洗|烤|泡|冲|点|订|借|还|赚|汇|转|换|选|试|帮|问|查|搜|装|拆|搬|丢|捡|偷|抢|踢|扛|举|挂|贴|画|录|剪|编|扫|删|测|检|验|医|养|喂|钓|骑|驾|飞|报|填|签|请|申|设|计' +
  ')([\\u4e00-\\u9fff]{1,3})(?=[' + BOUNDARY_CLASS + ']|$)',
  'g'
)

/**
 * 多字動詞 + 賓語
 */
const COMPOUND_VERB_RE = new RegExp(
  '(?:練習|學習|準備|處理|解決|完成|停止|放棄|嘗試|打算|計劃|安排|整理|收拾|打掃|清理|檢查|確認|聯繫|通知|告訴|提醒|警告|建議|推薦|介紹|申請|報名|參加|面試|錄取|畢業|入學|辭職|跳槽' +
  '|练习|学习|准备|处理|解决|完成|停止|放弃|尝试|打算|计划|安排|整理|收拾|打扫|清理|检查|确认|联系|通知|告诉|提醒|警告|建议|推荐|介绍|申请|报名|参加|面试|录取|毕业|入学|辞职|跳槽' +
  ')([\\u4e00-\\u9fff]{1,3})(?=[' + BOUNDARY_CLASS + ']|$)',
  'g'
)

// ─── 清理函式 ──────────────────────────────────────────────

function cleanText(text: string): string {
  return text
    .replace(/<[^>]+>/g, '')
    .replace(/\*{1,2}([^*]+)\*{1,2}/g, '$1')
    .replace(/["「」『』\u201C\u201D]/g, '')
    .trim()
}

function isStopWord(word: string): boolean {
  return STOP_WORDS.has(word) || word.length < 2
}

function isNoise(word: string): boolean {
  return /^[\d\s\p{P}]+$/u.test(word)
}

/** 判斷切分片段是否為有意義的主題詞 */
function isValidSegment(seg: string): boolean {
  if (isStopWord(seg) || isNoise(seg)) return false
  // 過濾純英文/數字/符號（保留中文為主的片段）
  if (/^[a-zA-Z0-9\s/\-_.]+$/.test(seg)) return false
  // 過濾含英文的混合片段（如 it's, AI）
  if (/[a-zA-Z]/.test(seg)) return false
  // 過濾以常見副詞/連詞/泛化動詞/疊詞開頭的片段
  if (/^(?:於|來|醒|少|會|個|所以|因為|如果|雖然|既然|後來|立刻|聲稱|這種|那種|一種|層|圖|比較|表現|還|找|打|開|下|乖乖|恢復|防備|甚至|而且|然而|不過|於是|接著|況且|儘管|即使|哪怕|竟然|居然|果然|終於|總算|簡直|根本|完全|非常|特別|十分|相當|稍微|似乎|好像|大概|或許|也許|反正|畢竟|到底|究竟|難道|何必|何況|只好|只能|只得|不禁|不由|不免|不得不|本次|本來|本該)/.test(seg)) return false
  // 過濾以「得」結尾的片段（如「表現得」「嚇得」）
  if (/得$/.test(seg)) return false
  // 過濾以「見面」等常見泛化詞結尾但前面帶噪音的片段
  if (/^[一二三四五六七八九十百千萬億]/.test(seg)) return false
  return true
}

// ─── 主函式 ────────────────────────────────────────────────

/**
 * 從總結文本中提取關鍵詞
 * @param content - 總結文本
 * @returns 去重後的關鍵詞列表
 */
export function extractSummaryKeywords(content: string): string[] {
  if (!content || content.trim().length === 0) return []

  const cleaned = cleanText(content)
  /** 候選詞 → 分數（越高越好） */
  const candidates = new Map<string, number>()

  /** 安全地加入候選詞（避免子串重複，偏好高分或短詞） */
  function addCandidate(word: string, score: number) {
    if (word.length < 2) return
    for (const [existing] of candidates) {
      if (existing !== word && (existing.includes(word) || word.includes(existing))) {
        const oldScore = candidates.get(existing) ?? 0
        // 高分者勝出；同分時偏好較短（更精確）的詞
        if (score > oldScore || (score === oldScore && word.length <= existing.length)) {
          candidates.delete(existing)
          candidates.set(word, score)
        } else {
          // 既有詞分數更高，保留既有詞
          candidates.set(existing, oldScore)
        }
        return
      }
    }
    candidates.set(word, Math.max(candidates.get(word) ?? 0, score))
  }

  // ── 第一層：詞表匹配（高分 = 10） ──
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

  // ── 第一層：同義詞族匹配（高分 = 8） ──
  // 使用實際匹配到的詞，過濾停用詞（避免「之後」「以後」等時間詞污染）
  for (const [term] of termToFamilyHead) {
    if (term.length >= 2 && !STOP_WORDS.has(term) && cleaned.includes(term)) {
      addCandidate(term, 8)
    }
  }

  // ── 第二層：動賓短語（中分 = 6，賓語名詞 = 7） ──
  const verbObjects = extractVerbObjects(cleaned)
  for (const vo of verbObjects) {
    addCandidate(vo.full, 6)
    // 賓語名詞單獨加入（如「泡麵」「豬排飯」），分數略高
    if (vo.obj.length >= 2) {
      addCandidate(vo.obj, 7)
    }
  }

  // ── 第三層：功能詞切分（低分 = 3） ──
  const segments = splitByFunctionWords(cleaned)
  for (const seg of segments) {
    if (seg.length >= 2 && seg.length <= 4 && isValidSegment(seg)) {
      addCandidate(seg, 3)
    }
  }

  // 按分數排序，取前 N 個
  const sorted = [...candidates.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([word]) => word)

  return sorted.slice(0, MAX_TOTAL_KEYWORDS)
}


// ─── 輔助函式 ──────────────────────────────────────────────

/**
 * 用功能詞/虛詞/標點切分文本，返回 2-4 字的實詞片段
 * 這是核心策略：中文虛詞天然地分隔了有意義的實詞短語
 */
function splitByFunctionWords(text: string): string[] {
  const segments: string[] = []
  let current = ''

  for (const char of text) {
    if (SPLIT_SET.has(char)) {
      if (current.length >= 2 && current.length <= 4) {
        segments.push(current)
      }
      current = ''
    } else {
      current += char
      // 如果累積超過 4 字，嘗試取後 2-4 字的子串
      if (current.length > 4) {
        // 保留最後 2-4 字作為候選
        const tail = current.slice(-4)
        current = tail
      }
    }
  }
  // 處理尾部
  if (current.length >= 2 && current.length <= 4) {
    segments.push(current)
  }

  return segments
}

/** 檢查賓語是否包含虛詞字元（噪音過濾） */
function objectContainsFuncWord(obj: string): boolean {
  for (const ch of obj) {
    if (CJK_FUNC_SET.has(ch)) return true
  }
  return false
}

/** 提取動賓短語（返回完整短語和賓語名詞） */
function extractVerbObjects(text: string): Array<{ full: string; obj: string }> {
  const results: Array<{ full: string; obj: string }> = []
  const seen = new Set<string>()

  for (const re of [VERB_OBJECT_RE, COMPOUND_VERB_RE]) {
    re.lastIndex = 0
    let match: RegExpExecArray | null
    while ((match = re.exec(text)) !== null) {
      const fullMatch = match[0]?.trim()
      const obj = match[1]?.trim()
      if (fullMatch && obj && !isStopWord(obj) && !isNoise(obj) && !objectContainsFuncWord(obj)) {
        if (fullMatch.length >= 2 && fullMatch.length <= 6 && !seen.has(fullMatch)) {
          seen.add(fullMatch)
          results.push({ full: fullMatch, obj })
        }
      }
    }
  }

  return results.slice(0, 10)
}
