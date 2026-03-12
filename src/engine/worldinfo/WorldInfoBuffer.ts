/**
 * 世界書掃描緩衝區
 * 移植自 SillyTavern world-info.js WorldInfoBuffer 類
 */

import type {
  WorldInfoEntry,
  WIGlobalScanData,
  ScanState,
  WorldInfoSettings,
} from '../../types/worldinfo'
import {
  ScanState as ScanStateEnum,
  MAX_SCAN_DEPTH,
} from '../../types/worldinfo'

/**
 * 解析正則字串
 * 支持 /pattern/flags 格式
 */
function parseRegexFromString(str: string): RegExp | null {
  const match = str.match(/^\/(.+)\/([gimsuvy]*)$/)
  if (match) {
    try {
      return new RegExp(match[1], match[2])
    } catch {
      return null
    }
  }
  return null
}

/**
 * 轉義正則特殊字符
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * 世界書掃描緩衝區
 * 管理聊天消息和遞歸掃描的文本緩衝
 */
export class WorldInfoBuffer {
  /** 外部強制激活的條目 */
  static externalActivations = new Map<string, WorldInfoEntry>()

  /** 全局掃描數據 */
  #globalScanData: WIGlobalScanData

  /** 深度緩衝區（按深度排序的消息） */
  #depthBuffer: string[] = []

  /** 遞歸緩衝區（遞歸掃描添加的字串） */
  #recurseBuffer: string[] = []

  /** 注入緩衝區（提示注入的字串） */
  #injectBuffer: string[] = []

  /** 深度偏移 */
  #skew = 0

  /** 起始深度 */
  #startDepth = 0

  /** 全局設定 */
  #settings: WorldInfoSettings

  constructor(
    messages: string[],
    globalScanData: WIGlobalScanData,
    settings: WorldInfoSettings
  ) {
    this.#globalScanData = globalScanData
    this.#settings = settings
    this.#initDepthBuffer(messages)
  }

  /**
   * 初始化深度緩衝區
   */
  #initDepthBuffer(messages: string[]): void {
    for (let depth = 0; depth < MAX_SCAN_DEPTH; depth++) {
      if (messages[depth]) {
        this.#depthBuffer[depth] = messages[depth].trim()
      }
      if (depth === messages.length - 1) {
        break
      }
    }
  }

  /**
   * 根據條目設定轉換字串（大小寫）
   */
  #transformString(str: string, entry: WorldInfoEntry): string {
    const caseSensitive = entry.caseSensitive ?? this.#settings.caseSensitive
    return caseSensitive ? str : str.toLowerCase()
  }

  /**
   * 獲取掃描內容
   * 返回指定深度範圍內的所有文本
   */
  get(entry: WorldInfoEntry, scanState: ScanStateEnum): string {
    let depth = entry.scanDepth ?? this.getDepth()

    if (depth <= this.#startDepth) {
      return ''
    }

    if (depth < 0) {
      console.error(`[WI] Invalid WI scan depth ${depth}. Must be >= 0`)
      return ''
    }

    if (depth > MAX_SCAN_DEPTH) {
      console.warn(`[WI] Invalid WI scan depth ${depth}. Truncating to ${MAX_SCAN_DEPTH}`)
      depth = MAX_SCAN_DEPTH
    }

    const MATCHER = '\x01'
    const JOINER = '\n' + MATCHER
    let result = MATCHER + this.#depthBuffer.slice(this.#startDepth, depth).join(JOINER)

    // 添加全局掃描數據（如果條目啟用了對應的匹配選項）
    if (entry.matchPersonaDescription && this.#globalScanData.personaDescription) {
      result += JOINER + this.#globalScanData.personaDescription
    }
    if (entry.matchCharacterDescription && this.#globalScanData.characterDescription) {
      result += JOINER + this.#globalScanData.characterDescription
    }
    if (entry.matchCharacterPersonality && this.#globalScanData.characterPersonality) {
      result += JOINER + this.#globalScanData.characterPersonality
    }
    if (entry.matchCharacterDepthPrompt && this.#globalScanData.characterDepthPrompt) {
      result += JOINER + this.#globalScanData.characterDepthPrompt
    }
    if (entry.matchScenario && this.#globalScanData.scenario) {
      result += JOINER + this.#globalScanData.scenario
    }
    if (entry.matchCreatorNotes && this.#globalScanData.creatorNotes) {
      result += JOINER + this.#globalScanData.creatorNotes
    }

    // 添加注入緩衝區
    if (this.#injectBuffer.length > 0) {
      result += JOINER + this.#injectBuffer.join(JOINER)
    }

    // 最小激活數不應包含遞歸緩衝區
    if (this.#recurseBuffer.length > 0 && scanState !== ScanStateEnum.MIN_ACTIVATIONS) {
      result += JOINER + this.#recurseBuffer.join(JOINER)
    }

    return result
  }

  /**
   * 匹配關鍵詞
   */
  matchKeys(haystack: string, needle: string, entry: WorldInfoEntry): boolean {
    // 如果是正則表達式格式
    const keyRegex = parseRegexFromString(needle)
    if (keyRegex) {
      return keyRegex.test(haystack)
    }

    // 普通文本匹配
    haystack = this.#transformString(haystack, entry)
    const transformedString = this.#transformString(needle, entry)
    const matchWholeWords = entry.matchWholeWords ?? this.#settings.matchWholeWords

    if (matchWholeWords) {
      const keyWords = transformedString.split(/\s+/)

      if (keyWords.length > 1) {
        return haystack.includes(transformedString)
      } else {
        // 使用自定義邊界以包含標點符號和其他非字母數字字符
        const regex = new RegExp(`(?:^|\\W)(${escapeRegex(transformedString)})(?:$|\\W)`)
        return regex.test(haystack)
      }
    } else {
      return haystack.includes(transformedString)
    }
  }

  /**
   * 添加遞歸內容
   */
  addRecurse(message: string): void {
    this.#recurseBuffer.push(message)
  }

  /**
   * 添加注入內容
   */
  addInject(message: string): void {
    this.#injectBuffer.push(message)
  }

  /**
   * 檢查是否有遞歸內容
   */
  hasRecurse(): boolean {
    return this.#recurseBuffer.length > 0
  }

  /**
   * 推進掃描深度
   */
  advanceScan(): void {
    this.#skew++
  }

  /**
   * 獲取當前深度
   */
  getDepth(): number {
    return this.#settings.depth + this.#skew
  }

  /**
   * 獲取外部激活的條目版本
   */
  getExternallyActivated(entry: WorldInfoEntry): WorldInfoEntry | undefined {
    return WorldInfoBuffer.externalActivations.get(`${entry.world}.${entry.uid}`)
  }

  /**
   * 重置外部效果
   */
  resetExternalEffects(): void {
    WorldInfoBuffer.externalActivations = new Map()
  }

  /**
   * 獲取條目的匹配分數
   */
  getScore(entry: WorldInfoEntry, scanState: ScanStateEnum): number {
    const bufferState = this.get(entry, scanState)
    let numberOfPrimaryKeys = 0
    let numberOfSecondaryKeys = 0
    let primaryScore = 0
    let secondaryScore = 0

    // 計算主關鍵詞分數
    if (Array.isArray(entry.key)) {
      numberOfPrimaryKeys = entry.key.length
      for (const key of entry.key) {
        if (this.matchKeys(bufferState, key, entry)) {
          primaryScore++
        }
      }
    }

    // 計算次要關鍵詞分數
    if (Array.isArray(entry.keysecondary)) {
      numberOfSecondaryKeys = entry.keysecondary.length
      for (const key of entry.keysecondary) {
        if (this.matchKeys(bufferState, key, entry)) {
          secondaryScore++
        }
      }
    }

    // 沒有關鍵詞 = 沒有分數
    if (!numberOfPrimaryKeys) {
      return 0
    }

    // 只有正向邏輯影響分數
    if (numberOfSecondaryKeys > 0) {
      switch (entry.selectiveLogic) {
        // AND_ANY: 加總兩個分數
        case 0: // WorldInfoLogic.AND_ANY
          return primaryScore + secondaryScore
        // AND_ALL: 只有當所有次要關鍵詞都匹配時才加總
        case 3: // WorldInfoLogic.AND_ALL
          return secondaryScore === numberOfSecondaryKeys
            ? primaryScore + secondaryScore
            : primaryScore
      }
    }

    return primaryScore
  }
}
