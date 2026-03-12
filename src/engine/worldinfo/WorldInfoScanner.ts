/**
 * 世界書掃描器
 * 移植自 SillyTavern world-info.js checkWorldInfo 函數
 */

import type {
  WorldInfoEntry,
  Lorebook,
  WIGlobalScanData,
  WorldInfoSettings,
  WIActivatedResult,
} from '../../types/worldinfo'
import {
  ScanState,
  WorldInfoPosition,
  WIAnchorPosition,
  WorldInfoLogic,
  PromptRole,
  createDefaultWorldInfoSettings,
  DEFAULT_WI_DEPTH,
} from '../../types/worldinfo'
import { WorldInfoBuffer } from './WorldInfoBuffer'
import { WorldInfoTimedEffects } from './TimedEffects'

/**
 * 默認全局掃描數據
 */
const defaultGlobalScanData: WIGlobalScanData = {
  trigger: 'normal',
  personaDescription: '',
  characterDescription: '',
  characterPersonality: '',
  characterDepthPrompt: '',
  scenario: '',
  creatorNotes: '',
}

/**
 * 世界書掃描器選項
 */
export interface WorldInfoScannerOptions {
  /** 聊天消息（從最新到最舊） */
  chat: string[]
  /** 最大上下文大小 */
  maxContext: number
  /** 是否為試運行 */
  isDryRun?: boolean
  /** 全局掃描數據 */
  globalScanData?: WIGlobalScanData
  /** 世界書設定 */
  settings?: WorldInfoSettings
  /** Token 計數器 */
  tokenCounter?: (text: string) => Promise<number>
}

/**
 * 世界書掃描器
 */
export class WorldInfoScanner {
  private chat: string[]
  private maxContext: number
  private isDryRun: boolean
  private globalScanData: WIGlobalScanData
  private settings: WorldInfoSettings
  private tokenCounter: (text: string) => Promise<number>

  constructor(options: WorldInfoScannerOptions) {
    this.chat = options.chat
    this.maxContext = options.maxContext
    this.isDryRun = options.isDryRun ?? false
    this.globalScanData = options.globalScanData ?? defaultGlobalScanData
    this.settings = options.settings ?? createDefaultWorldInfoSettings()
    this.tokenCounter = options.tokenCounter ?? this.defaultTokenCounter
  }

  /**
   * 默認 Token 計數器（簡單估算）
   */
  private async defaultTokenCounter(text: string): Promise<number> {
    // 簡單估算：每 4 個字符約等於 1 個 token
    return Math.ceil(text.length / 4)
  }

  /**
   * 執行世界書掃描
   */
  async scan(lorebooks: Lorebook[]): Promise<WIActivatedResult> {
    const buffer = new WorldInfoBuffer(this.chat, this.globalScanData, this.settings)

    console.debug(`[WI] --- START WI SCAN (on ${this.chat.length} messages, trigger = ${this.globalScanData.trigger})${this.isDryRun ? ' (DRY RUN)' : ''} ---`)

    // 計算預算
    let budget = Math.round(this.settings.budget * this.maxContext / 100) || 1
    if (this.settings.budgetCap > 0 && budget > this.settings.budgetCap) {
      console.debug(`[WI] Budget ${budget} exceeds cap ${this.settings.budgetCap}, using cap`)
      budget = this.settings.budgetCap
    }

    console.debug(`[WI] Context size: ${this.maxContext}; WI budget: ${budget}`)

    // 收集並排序所有條目
    const sortedEntries = this.getSortedEntries(lorebooks)

    // 初始化時效效果管理器
    const timedEffects = new WorldInfoTimedEffects(this.chat, sortedEntries, this.isDryRun)
    timedEffects.checkTimedEffects()

    if (sortedEntries.length === 0) {
      return this.createEmptyResult()
    }

    // 掃描狀態
    let scanState: ScanState = ScanState.INITIAL
    let currentBudget = 0
    let count = 0
    const allActivatedEntries = new Map<string, WorldInfoEntry>()
    const failedProbabilityChecks = new Set<WorldInfoEntry>()

    // 獲取延遲遞歸級別
    const availableRecursionDelayLevels = [...new Set(
      sortedEntries
        .filter(entry => entry.delayUntilRecursion)
        .map(entry => entry.delayUntilRecursion === 1 ? 1 : entry.delayUntilRecursion)
    )].sort((a, b) => a - b)

    let currentRecursionDelayLevel = availableRecursionDelayLevels.shift() ?? 0

    console.debug(`[WI] --- SEARCHING ENTRIES (on ${sortedEntries.length} entries) ---`)

    // 主掃描迴圈
    while (scanState !== ScanState.NONE) {
      // 檢查遞歸步數限制
      if (this.settings.maxRecursionSteps && this.settings.maxRecursionSteps <= count) {
        console.debug('[WI] Search stopped by reaching max recursion steps', this.settings.maxRecursionSteps)
        break
      }

      count++
      console.debug(`[WI] --- LOOP #${count} START ---`)

      let nextScanState = ScanState.NONE
      const activatedNow = new Set<WorldInfoEntry>()

      for (const entry of sortedEntries) {
        const entryKey = `${entry.world}.${entry.uid}`

        // 跳過已處理的條目
        if (failedProbabilityChecks.has(entry) || allActivatedEntries.has(entryKey)) {
          continue
        }

        // 跳過禁用的條目
        if (entry.disable) {
          continue
        }

        // 檢查生成類型觸發器
        if (Array.isArray(entry.triggers) && entry.triggers.length > 0) {
          const isTriggered = entry.triggers.includes(this.globalScanData.trigger)
          if (!isTriggered) {
            continue
          }
        }

        // 檢查延遲效果
        if (timedEffects.isDelayed(entry)) {
          continue
        }

        // 檢查冷卻效果
        if (timedEffects.isOnCooldown(entry)) {
          continue
        }

        // 檢查延遲遞歸
        if (entry.delayUntilRecursion) {
          const delayLevel = entry.delayUntilRecursion === 1 ? 1 : entry.delayUntilRecursion
          if (delayLevel > currentRecursionDelayLevel) {
            continue
          }
        }

        let isActivated = false

        // 常量條目始終激活
        if (entry.constant) {
          isActivated = true
        } else {
          // 關鍵詞匹配
          const bufferContent = buffer.get(entry, scanState)

          // 檢查主關鍵詞
          let primaryMatched = false
          if (Array.isArray(entry.key) && entry.key.length > 0) {
            for (const key of entry.key) {
              if (key && buffer.matchKeys(bufferContent, key, entry)) {
                primaryMatched = true
                break
              }
            }
          }

          if (primaryMatched) {
            // 處理選擇性邏輯
            if (entry.selective && Array.isArray(entry.keysecondary) && entry.keysecondary.length > 0) {
              isActivated = this.evaluateSelectiveLogic(entry, bufferContent, buffer)
            } else {
              isActivated = true
            }
          }
        }

        // 激活條目
        if (isActivated) {
          // 機率檢查
          if (entry.useProbability && entry.probability < 100) {
            if (Math.random() * 100 > entry.probability) {
              failedProbabilityChecks.add(entry)
              continue
            }
          }

          // Token 預算檢查
          if (!entry.ignoreBudget) {
            const tokenCount = await this.tokenCounter(entry.content)
            if (currentBudget + tokenCount > budget) {
              console.debug(`[WI] Entry ${entry.uid} exceeds budget, skipping`)
              continue
            }
            currentBudget += tokenCount
          }

          // 添加到激活列表
          allActivatedEntries.set(entryKey, entry)
          activatedNow.add(entry)

          // 處理黏性效果
          if (!this.isDryRun && entry.sticky) {
            timedEffects.activateSticky(entry)
          }

          // 遞歸掃描
          if (this.settings.recursive && !entry.preventRecursion && !entry.excludeRecursion) {
            buffer.addRecurse(entry.content)
            nextScanState = ScanState.RECURSION
          }

          console.debug(`[WI] Entry ${entry.uid} activated`)
        }
      }

      // 更新掃描狀態
      if (nextScanState === ScanState.RECURSION && buffer.hasRecurse()) {
        // 檢查是否需要進入下一個延遲遞歸級別
        if (availableRecursionDelayLevels.length > 0) {
          currentRecursionDelayLevel = availableRecursionDelayLevels.shift()!
        }
      }

      scanState = nextScanState

      // 最小激活數檢查
      if (
        scanState === ScanState.NONE &&
        this.settings.minActivations > 0 &&
        allActivatedEntries.size < this.settings.minActivations &&
        buffer.getDepth() < this.settings.minActivationsDepthMax
      ) {
        buffer.advanceScan()
        scanState = ScanState.MIN_ACTIVATIONS
      }
    }

    console.debug(`[WI] --- END WI SCAN (activated ${allActivatedEntries.size} entries) ---`)

    // 調試：輸出所有激活條目的詳細信息
    if (allActivatedEntries.size > 0) {
      console.group('[WI] Activated entries details:')
      for (const [key, entry] of allActivatedEntries) {
        console.log(`  ${key}: position=${entry.position} (type: ${typeof entry.position}), depth=${entry.depth}, constant=${entry.constant}, content length=${entry.content?.length || 0}`)
      }
      console.groupEnd()
    }

    // 按位置分類結果
    return this.categorizeResults(allActivatedEntries)
  }

  /**
   * 評估選擇性邏輯
   */
  private evaluateSelectiveLogic(
    entry: WorldInfoEntry,
    bufferContent: string,
    buffer: WorldInfoBuffer
  ): boolean {
    const secondaryKeys = entry.keysecondary || []
    let secondaryMatched = 0
    let secondaryTotal = secondaryKeys.length

    for (const key of secondaryKeys) {
      if (key && buffer.matchKeys(bufferContent, key, entry)) {
        secondaryMatched++
      }
    }

    switch (entry.selectiveLogic) {
      case WorldInfoLogic.AND_ANY:
        // 主關鍵詞 AND 任一次要關鍵詞
        return secondaryMatched > 0

      case WorldInfoLogic.NOT_ALL:
        // 主關鍵詞 AND NOT 全部次要關鍵詞
        return secondaryMatched < secondaryTotal

      case WorldInfoLogic.NOT_ANY:
        // 主關鍵詞 AND NOT 任一次要關鍵詞
        return secondaryMatched === 0

      case WorldInfoLogic.AND_ALL:
        // 主關鍵詞 AND 全部次要關鍵詞
        return secondaryMatched === secondaryTotal

      default:
        return true
    }
  }

  /**
   * 獲取排序後的條目
   */
  private getSortedEntries(lorebooks: Lorebook[]): WorldInfoEntry[] {
    const allEntries: WorldInfoEntry[] = []

    for (const lorebook of lorebooks) {
      for (const entry of lorebook.entries) {
        // 添加世界書名稱引用
        allEntries.push({
          ...entry,
          world: lorebook.name,
        })
      }
    }

    // 按 order 降序排序（越大越優先）
    return allEntries.sort((a, b) => b.order - a.order)
  }

  /**
   * 按位置分類結果
   */
  private categorizeResults(activatedEntries: Map<string, WorldInfoEntry>): WIActivatedResult {
    const result: WIActivatedResult = {
      worldInfoBefore: '',
      worldInfoAfter: '',
      WIDepthEntries: [],
      EMEntries: [],
      ANBeforeEntries: [],
      ANAfterEntries: [],
      outletEntries: {},
      allActivatedEntries: new Set(activatedEntries.values()),
    }

    const beforeEntries: string[] = []
    const afterEntries: string[] = []

    // 按 order 降序處理
    const sortedEntries = [...activatedEntries.values()].sort((a, b) => b.order - a.order)

    console.debug(`[WI] Categorizing ${sortedEntries.length} activated entries`)

    for (const entry of sortedEntries) {
      if (!entry.content) {
        console.debug(`[WI] Entry ${entry.uid} has no content, skipping`)
        continue
      }

      // 標準化 position 值（支持字符串和數字兩種格式）
      const normalizedPosition = this.normalizePosition(entry.position)

      console.debug(`[WI] Entry ${entry.uid}: position=${entry.position} -> normalized=${normalizedPosition}, depth=${entry.depth}, content preview: ${entry.content.substring(0, 50)}...`)

      switch (normalizedPosition) {
        case WorldInfoPosition.BEFORE_CHAR:
          console.debug(`[WI] Entry ${entry.uid} -> BEFORE_CHAR`)
          beforeEntries.unshift(entry.content)
          break

        case WorldInfoPosition.AFTER_CHAR:
          console.debug(`[WI] Entry ${entry.uid} -> AFTER_CHAR`)
          afterEntries.unshift(entry.content)
          break

        case WorldInfoPosition.EM_TOP:
          console.debug(`[WI] Entry ${entry.uid} -> EM_TOP`)
          result.EMEntries.unshift({
            position: WIAnchorPosition.BEFORE,
            content: entry.content,
          })
          break

        case WorldInfoPosition.EM_BOTTOM:
          console.debug(`[WI] Entry ${entry.uid} -> EM_BOTTOM`)
          result.EMEntries.unshift({
            position: WIAnchorPosition.AFTER,
            content: entry.content,
          })
          break

        case WorldInfoPosition.AN_TOP:
          console.debug(`[WI] Entry ${entry.uid} -> AN_TOP`)
          result.ANBeforeEntries.unshift({
            position: WIAnchorPosition.BEFORE,
            content: entry.content,
          })
          break

        case WorldInfoPosition.AN_BOTTOM:
          console.debug(`[WI] Entry ${entry.uid} -> AN_BOTTOM`)
          result.ANAfterEntries.unshift({
            position: WIAnchorPosition.AFTER,
            content: entry.content,
          })
          break

        case WorldInfoPosition.AT_DEPTH:
          console.debug(`[WI] Entry ${entry.uid} -> AT_DEPTH (depth=${entry.depth ?? DEFAULT_WI_DEPTH})`)
          result.WIDepthEntries.unshift({
            depth: entry.depth ?? DEFAULT_WI_DEPTH,
            role: entry.role ?? PromptRole.SYSTEM,
            content: entry.content,
          })
          break

        case WorldInfoPosition.OUTLET:
          console.debug(`[WI] Entry ${entry.uid} -> OUTLET (${entry.outletName})`)
          if (entry.outletName) {
            if (!result.outletEntries[entry.outletName]) {
              result.outletEntries[entry.outletName] = []
            }
            result.outletEntries[entry.outletName].unshift(entry.content)
          }
          break

        default:
          console.warn(`[WI] Entry ${entry.uid} has unknown position: ${entry.position}, treating as BEFORE_CHAR`)
          beforeEntries.unshift(entry.content)
          break
      }
    }

    result.worldInfoBefore = beforeEntries.join('\n')
    result.worldInfoAfter = afterEntries.join('\n')

    console.debug(`[WI] Categorization complete: before=${beforeEntries.length}, after=${afterEntries.length}, depth=${result.WIDepthEntries.length}, EM=${result.EMEntries.length}, AN=${result.ANBeforeEntries.length + result.ANAfterEntries.length}`)

    return result
  }

  /**
   * 標準化 position 值
   * 支持字符串和數字兩種格式
   */
  private normalizePosition(position: WorldInfoPosition | string | number | undefined): WorldInfoPosition {
    // 如果已經是數字，直接返回
    if (typeof position === 'number') {
      return position as WorldInfoPosition
    }

    // 字符串映射表
    const stringToPosition: Record<string, WorldInfoPosition> = {
      // 標準格式
      'before_char': WorldInfoPosition.BEFORE_CHAR,
      'after_char': WorldInfoPosition.AFTER_CHAR,
      'an_top': WorldInfoPosition.AN_TOP,
      'an_bottom': WorldInfoPosition.AN_BOTTOM,
      'at_depth': WorldInfoPosition.AT_DEPTH,
      'em_top': WorldInfoPosition.EM_TOP,
      'em_bottom': WorldInfoPosition.EM_BOTTOM,
      'outlet': WorldInfoPosition.OUTLET,
      // 舊版格式兼容
      'top': WorldInfoPosition.BEFORE_CHAR,  // 系統頂部 -> 角色前
      'bottom': WorldInfoPosition.AT_DEPTH,   // 底部 -> 深度插入
      'before_example': WorldInfoPosition.EM_TOP,
      'after_example': WorldInfoPosition.EM_BOTTOM,
      'before_scenario': WorldInfoPosition.BEFORE_CHAR,
      'after_scenario': WorldInfoPosition.AFTER_CHAR,
      // SillyTavern 格式
      '0': WorldInfoPosition.BEFORE_CHAR,
      '1': WorldInfoPosition.AFTER_CHAR,
      '2': WorldInfoPosition.AN_TOP,
      '3': WorldInfoPosition.AN_BOTTOM,
      '4': WorldInfoPosition.AT_DEPTH,
      '5': WorldInfoPosition.EM_TOP,
      '6': WorldInfoPosition.EM_BOTTOM,
      '7': WorldInfoPosition.OUTLET,
    }

    if (typeof position === 'string') {
      const normalized = stringToPosition[position.toLowerCase()]
      if (normalized !== undefined) {
        return normalized
      }
    }

    // 默認返回 BEFORE_CHAR
    console.warn(`[WI] Unknown position value: ${position}, defaulting to BEFORE_CHAR`)
    return WorldInfoPosition.BEFORE_CHAR
  }

  /**
   * 創建空結果
   */
  private createEmptyResult(): WIActivatedResult {
    return {
      worldInfoBefore: '',
      worldInfoAfter: '',
      WIDepthEntries: [],
      EMEntries: [],
      ANBeforeEntries: [],
      ANAfterEntries: [],
      outletEntries: {},
      allActivatedEntries: new Set(),
    }
  }
}
