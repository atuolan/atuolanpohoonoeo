/**
 * 世界書時效效果管理器
 * 移植自 SillyTavern world-info.js WorldInfoTimedEffects 類
 */

import type {
  WorldInfoEntry,
  WITimedEffect,
  TimedEffectType,
} from '../../types/worldinfo'

/**
 * 計算字串哈希
 */
function getStringHash(str: string): number {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash
  }
  return Math.abs(hash)
}

/**
 * 時效效果存儲
 */
export interface TimedEffectsStorage {
  sticky: Record<string, WITimedEffect>
  cooldown: Record<string, WITimedEffect>
}

/**
 * 世界書時效效果管理器
 * 處理 sticky（黏性）、cooldown（冷卻）、delay（延遲）效果
 */
export class WorldInfoTimedEffects {
  /** 聊天消息 */
  #chat: string[]

  /** 所有條目 */
  #entries: WorldInfoEntry[]

  /** 是否為試運行 */
  #isDryRun: boolean

  /** 效果緩衝區 */
  #buffer: {
    sticky: WorldInfoEntry[]
    cooldown: WorldInfoEntry[]
    delay: WorldInfoEntry[]
  } = {
    sticky: [],
    cooldown: [],
    delay: [],
  }

  /** 持久化存儲 */
  #storage: TimedEffectsStorage

  /** 存儲回調 */
  #onStorageChange?: (storage: TimedEffectsStorage) => void

  constructor(
    chat: string[],
    entries: WorldInfoEntry[],
    isDryRun = false,
    storage?: TimedEffectsStorage,
    onStorageChange?: (storage: TimedEffectsStorage) => void
  ) {
    this.#chat = chat
    this.#entries = entries
    this.#isDryRun = isDryRun
    this.#storage = storage ?? { sticky: {}, cooldown: {} }
    this.#onStorageChange = onStorageChange
    this.#ensureStorage()
  }

  /**
   * 確保存儲結構正確
   */
  #ensureStorage(): void {
    if (!this.#storage.sticky || typeof this.#storage.sticky !== 'object') {
      this.#storage.sticky = {}
    }
    if (!this.#storage.cooldown || typeof this.#storage.cooldown !== 'object') {
      this.#storage.cooldown = {}
    }

    // 清理無效條目
    for (const type of ['sticky', 'cooldown'] as const) {
      const effects = this.#storage[type]
      for (const [key, value] of Object.entries(effects)) {
        if (!value || typeof value !== 'object') {
          delete effects[key]
        }
      }
    }
  }

  /**
   * 獲取條目的哈希值
   */
  #getEntryHash(entry: WorldInfoEntry): number {
    return getStringHash(`${entry.world ?? ''}.${entry.uid}.${entry.key.join(',')}.${entry.content}`)
  }

  /**
   * 獲取條目的唯一鍵
   */
  #getEntryKey(entry: WorldInfoEntry): string {
    return `${entry.world}.${entry.uid}`
  }

  /**
   * 創建時效效果
   */
  #createTimedEffect(type: 'sticky' | 'cooldown', entry: WorldInfoEntry, isProtected = false): WITimedEffect {
    const duration = entry[type] ?? 0
    return {
      hash: this.#getEntryHash(entry),
      start: this.#chat.length,
      end: this.#chat.length + Number(duration),
      protected: isProtected,
    }
  }

  /**
   * 保存存儲
   */
  #saveStorage(): void {
    if (this.#onStorageChange) {
      this.#onStorageChange(this.#storage)
    }
  }

  /**
   * 檢查所有時效效果
   */
  checkTimedEffects(): void {
    if (!this.#isDryRun) {
      this.#checkTimedEffectOfType('sticky')
      this.#checkTimedEffectOfType('cooldown')
    }
    this.#checkDelayEffect()
  }

  /**
   * 檢查特定類型的時效效果
   */
  #checkTimedEffectOfType(type: 'sticky' | 'cooldown'): void {
    const effects = Object.entries(this.#storage[type])

    for (const [key, value] of effects) {
      const entry = this.#entries.find(x => String(this.#getEntryHash(x)) === String(value.hash))

      // 聊天未推進且效果未受保護
      if (this.#chat.length <= Number(value.start) && !value.protected) {
        console.debug(`[WI] Removing ${type} entry ${key}: chat not advanced`)
        delete this.#storage[type][key]
        continue
      }

      // 找不到條目
      if (!entry) {
        if (this.#chat.length >= Number(value.end)) {
          console.debug(`[WI] Removing ${type} entry ${key}: entry not found and interval passed`)
          delete this.#storage[type][key]
        }
        continue
      }

      // 條目未配置此效果
      if (!entry[type]) {
        console.debug(`[WI] Removing ${type} entry ${key}: entry not configured for ${type}`)
        delete this.#storage[type][key]
        continue
      }

      // 效果已過期
      if (this.#chat.length >= Number(value.end)) {
        console.debug(`[WI] ${type} effect ended for entry ${key}`)
        delete this.#storage[type][key]

        // 黏性結束後觸發冷卻
        if (type === 'sticky' && entry.cooldown) {
          const cooldownEffect = this.#createTimedEffect('cooldown', entry, true)
          this.#storage.cooldown[key] = cooldownEffect
          this.#buffer.cooldown.push(entry)
          console.debug(`[WI] Adding cooldown for ${key} after sticky ended`)
        }

        continue
      }

      // 效果仍在生效
      this.#buffer[type].push(entry)
      console.debug(`[WI] ${type} effect active for entry ${key}`)
    }

    this.#saveStorage()
  }

  /**
   * 檢查延遲效果
   */
  #checkDelayEffect(): void {
    for (const entry of this.#entries) {
      if (!entry.delay) continue

      if (this.#chat.length < entry.delay) {
        this.#buffer.delay.push(entry)
        console.debug(`[WI] Delay effect active for entry ${entry.uid}`)
      }
    }
  }

  /**
   * 激活黏性效果
   */
  activateSticky(entry: WorldInfoEntry): void {
    if (!entry.sticky || this.#isDryRun) return

    const key = this.#getEntryKey(entry)

    // 已經在黏性狀態
    if (this.#storage.sticky[key]) return

    const effect = this.#createTimedEffect('sticky', entry, false)
    this.#storage.sticky[key] = effect
    this.#buffer.sticky.push(entry)

    console.debug(`[WI] Activated sticky for ${key}: start=${effect.start}, end=${effect.end}`)
    this.#saveStorage()
  }

  /**
   * 檢查條目是否處於延遲狀態
   */
  isDelayed(entry: WorldInfoEntry): boolean {
    return this.#buffer.delay.includes(entry)
  }

  /**
   * 檢查條目是否處於冷卻狀態
   */
  isOnCooldown(entry: WorldInfoEntry): boolean {
    return this.#buffer.cooldown.includes(entry)
  }

  /**
   * 檢查條目是否處於黏性狀態
   */
  isSticky(entry: WorldInfoEntry): boolean {
    return this.#buffer.sticky.includes(entry)
  }

  /**
   * 獲取條目的時效效果元數據
   */
  getEffectMetadata(type: TimedEffectType, entry: WorldInfoEntry): WITimedEffect | null {
    if (type === 'delay') return null

    const key = this.#getEntryKey(entry)
    return this.#storage[type][key] ?? null
  }

  /**
   * 獲取當前存儲狀態
   */
  getStorage(): TimedEffectsStorage {
    return { ...this.#storage }
  }
}
