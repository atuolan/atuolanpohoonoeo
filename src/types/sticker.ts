// 表情包類型定義

export interface StickerItem {
  id: string
  name: string
  url: string
  keywords?: string[]
  isCustom?: boolean
}

export interface StickerCategory {
  id: string
  name: string
  icon: string
  isCustom?: boolean
  stickers: StickerItem[]
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
