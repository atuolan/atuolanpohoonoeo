// 表情包類型定義

export interface StickerItem {
  id: string
  name: string
  url: string
  keywords?: string[]
  emotion?: string
  isCustom?: boolean
  pinnedAt?: number
}

export interface StickerCategory {
  id: string
  name: string
  icon: string
  /** 分類內容最後修改時間，用於避免較舊的同步資料覆蓋本機刪除結果。 */
  updatedAt?: number
  isCustom?: boolean
  isDefaultPack?: boolean
  stickers: StickerItem[]
  /**
   * 使用者主動刪除的「預設表情」名稱清單（僅預設表情包分類使用）。
   * 用來避免重啟後 syncDefaultStickers 又把已刪除的預設表情補回來。
   */
  removedDefaultStickerNames?: string[]
}

// 系統 Emoji（Unicode）
export interface EmojiItem {
  id: string
  char: string
  name: string
  keywords?: string[]
}

export interface EmojiCategory {
  id: string
  name: string
  icon: string
  emojis: EmojiItem[]
}
