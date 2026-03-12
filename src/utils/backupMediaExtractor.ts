/**
 * 備份媒體提取與去重工具
 *
 * 將 JSON 資料中的 base64 圖片提取為獨立檔案，並對相同圖片去重。
 * 供 SettingsScreen 完整匯出和 AutoBackupService 自動備份共用。
 */

// ============================================================
// 類型
// ============================================================

export interface ExtractedMedia {
  /** 檔名 → 二進位內容 */
  files: Record<string, Uint8Array>
  /** 被提取的 base64 數量（含去重命中） */
  totalExtracted: number
  /** 去重命中次數 */
  dedupeHits: number
}

// ============================================================
// 內部工具
// ============================================================

/** Base64 字串轉 Uint8Array */
function base64ToUint8Array(base64: string): Uint8Array {
  const bin = atob(base64)
  const len = bin.length
  const bytes = new Uint8Array(len)
  const chunk = 8192
  for (let i = 0; i < len; i += chunk) {
    const end = Math.min(i + chunk, len)
    for (let j = i; j < end; j++) {
      bytes[j] = bin.charCodeAt(j)
    }
  }
  return bytes
}

/** 從 DataURL 提取副檔名和二進位資料 */
function parseDataUrl(dataUrl: string): { ext: string; data: Uint8Array } | null {
  const commaIdx = dataUrl.indexOf(',')
  if (commaIdx === -1) return null
  const header = dataUrl.substring(0, commaIdx)
  const base64 = dataUrl.substring(commaIdx + 1)

  // 圖片
  const imgMatch = header.match(/^data:image\/(\w+)/)
  if (imgMatch) {
    const ext = imgMatch[1] === 'jpeg' ? 'jpg' : imgMatch[1]
    try { return { ext, data: base64ToUint8Array(base64) } } catch { return null }
  }

  // 音訊
  const audioMatch = header.match(/^data:audio\/(\w+)/)
  if (audioMatch) {
    const ext = audioMatch[1].replace('mpeg', 'mp3')
    try { return { ext, data: base64ToUint8Array(base64) } } catch { return null }
  }

  return null
}

/** 簡易 hash（用前後各 1000 字元 + 長度），足以區分不同圖片 */
function quickHash(str: string): string {
  const prefix = str.substring(0, 1000)
  const suffix = str.substring(str.length - 1000)
  return `${str.length}_${prefix}_${suffix}`
}

// ============================================================
// 主類別
// ============================================================

export class BackupMediaExtractor {
  private files: Record<string, Uint8Array> = {}
  private cache = new Map<string, string>() // hash → filename
  private index = 0
  private dedupeHits = 0
  private totalExtracted = 0

  /**
   * 提取一個 base64 DataURL，回傳媒體檔案路徑。
   * 相同內容會去重，回傳同一個路徑。
   * @param dataUrl base64 DataURL
   * @param prefix 檔名前綴，例如 'avatar_xxx' 或 'chat'
   */
  extract(dataUrl: string, prefix: string): string | null {
    if (!dataUrl || (!dataUrl.startsWith('data:image/') && !dataUrl.startsWith('data:audio/'))) {
      return null
    }

    const hash = quickHash(dataUrl)
    if (this.cache.has(hash)) {
      this.dedupeHits++
      this.totalExtracted++
      return this.cache.get(hash)!
    }

    const parsed = parseDataUrl(dataUrl)
    if (!parsed) return null

    const filename = `media/${prefix}_${this.index++}.${parsed.ext}`
    this.files[filename] = parsed.data
    this.cache.set(hash, filename)
    this.totalExtracted++
    return filename
  }

  /**
   * 提取頭像（用 id 作為檔名，更易讀）
   */
  extractAvatar(dataUrl: string, id: string): string | null {
    if (!dataUrl?.startsWith('data:image/')) return null

    const hash = quickHash(dataUrl)
    if (this.cache.has(hash)) {
      this.dedupeHits++
      this.totalExtracted++
      return this.cache.get(hash)!
    }

    const parsed = parseDataUrl(dataUrl)
    if (!parsed) return null

    const filename = `media/avatar_${id}.${parsed.ext}`
    this.files[filename] = parsed.data
    this.cache.set(hash, filename)
    this.totalExtracted++
    return filename
  }

  /** 取得結果 */
  getResult(): ExtractedMedia {
    return {
      files: this.files,
      totalExtracted: this.totalExtracted,
      dedupeHits: this.dedupeHits,
    }
  }
}

// ============================================================
// 高階函式：掃描整個備份資料物件，提取所有 base64
// ============================================================

/**
 * 掃描備份資料物件，將所有 base64 圖片提取到 media 資料夾並去重。
 * 會直接修改傳入的 data 物件（將 base64 替換為檔案路徑）。
 */
export function extractAllMediaFromBackupData(data: any): ExtractedMedia {
  const extractor = new BackupMediaExtractor()

  // 1. 角色頭像
  if (Array.isArray(data.characters)) {
    for (const char of data.characters) {
      const f = extractor.extractAvatar(char.avatar, char.id)
      if (f) char.avatar = f
    }
  }

  // 2. 使用者角色頭像
  if (data.userData?.personas && Array.isArray(data.userData.personas)) {
    for (const persona of data.userData.personas) {
      const f = extractor.extractAvatar(persona.avatar, persona.id || `persona_${Date.now()}`)
      if (f) persona.avatar = f
    }
  }

  // 3. 聊天訊息圖片
  if (Array.isArray(data.chats)) {
    for (const chat of data.chats) {
      if (!Array.isArray(chat.messages)) continue
      for (const msg of chat.messages) {
        if (msg.imageUrl?.startsWith('data:image/')) {
          const f = extractor.extract(msg.imageUrl, 'chat')
          if (f) msg.imageUrl = f
        }
        if (msg.imageData?.startsWith('data:image/')) {
          const f = extractor.extract(msg.imageData, 'chat_data')
          if (f) msg.imageData = f
        }
      }
      // 聊天桌布
      if (chat.appearance?.wallpaper?.type === 'image' &&
          chat.appearance.wallpaper.value?.startsWith('data:image/')) {
        const f = extractor.extract(chat.appearance.wallpaper.value, `chat_wallpaper`)
        if (f) chat.appearance.wallpaper.value = f
      }
    }
  }

  // 4. QZone 貼文
  if (Array.isArray(data.qzonePosts)) {
    for (let i = 0; i < data.qzonePosts.length; i++) {
      const post = data.qzonePosts[i]
      // 作者頭像
      if (post.avatar?.startsWith('data:image/')) {
        const f = extractor.extractAvatar(post.avatar, post.authorId || `qzone_author_${i}`)
        if (f) post.avatar = f
      }
      // 貼文圖片
      if (Array.isArray(post.images)) {
        for (let j = 0; j < post.images.length; j++) {
          if (typeof post.images[j] === 'string' && post.images[j].startsWith('data:image/')) {
            const f = extractor.extract(post.images[j], `qzone_${i}`)
            if (f) post.images[j] = f
          }
        }
      }
      // 留言頭像
      if (Array.isArray(post.comments)) {
        for (let k = 0; k < post.comments.length; k++) {
          const comment = post.comments[k]
          if (comment.avatar?.startsWith('data:image/')) {
            const f = extractor.extractAvatar(comment.avatar, comment.authorId || `comment_${i}_${k}`)
            if (f) comment.avatar = f
          }
        }
      }
    }
  }

  // 5. 主題桌布
  if (Array.isArray(data.themes)) {
    for (let i = 0; i < data.themes.length; i++) {
      const theme = data.themes[i]
      if (theme.wallpaperStyle?.type === 'image' &&
          theme.wallpaperStyle.value?.startsWith('data:image/')) {
        const f = extractor.extract(theme.wallpaperStyle.value, `theme_wallpaper_${i}`)
        if (f) theme.wallpaperStyle.value = f
      }
    }
  }

  // 6. 自訂鈴聲
  if (data.settings && typeof data.settings === 'object') {
    const audioUrl = (data.settings as any)?.incomingCallRingtone?.customAudioDataUrl
    if (typeof audioUrl === 'string' && audioUrl.startsWith('data:audio/')) {
      const f = extractor.extract(audioUrl, 'custom_ringtone')
      if (f) (data.settings as any).incomingCallRingtone.customAudioDataUrl = f
    }
  }

  // 7. oldSettings（theater-posts 等含有 base64 的 key-value）
  if (Array.isArray(data.oldSettings)) {
    for (const item of data.oldSettings) {
      if (!item.value) continue
      scanAndReplaceBase64InValue(item, 'value', extractor, `setting_${item.key || 'unknown'}`)
    }
  }

  // 8. canvasLayout（白板佈局中的 base64 圖片）
  if (data.canvasLayout) {
    scanAndReplaceBase64InValue(data, 'canvasLayout', extractor, 'canvas')
  }

  // 9. gameStates
  if (Array.isArray(data.gameStates)) {
    for (const gs of data.gameStates) {
      if (gs.value) {
        scanAndReplaceBase64InValue(gs, 'value', extractor, `game_${gs.key || 'unknown'}`)
      }
    }
  }

  // 10. stickers（貼圖可能含 base64）
  if (Array.isArray(data.stickers)) {
    for (const stickerGroup of data.stickers) {
      if (Array.isArray(stickerGroup.stickers)) {
        for (let i = 0; i < stickerGroup.stickers.length; i++) {
          const s = stickerGroup.stickers[i]
          if (typeof s.url === 'string' && s.url.startsWith('data:image/')) {
            const f = extractor.extract(s.url, `sticker_${stickerGroup.id || 'group'}`)
            if (f) s.url = f
          }
        }
      }
    }
  }

  return extractor.getResult()
}

// ============================================================
// 深度掃描：遞迴掃描任意 JSON 值中的 base64 字串並替換
// ============================================================

/**
 * 遞迴掃描 obj[key] 中所有字串值，將 base64 DataURL 提取為媒體檔案。
 * 直接修改原物件。
 */
function scanAndReplaceBase64InValue(
  obj: any,
  key: string | number,
  extractor: BackupMediaExtractor,
  prefix: string,
): void {
  const val = obj[key]
  if (val === null || val === undefined) return

  if (typeof val === 'string') {
    if (val.startsWith('data:image/') && val.length > 200) {
      const f = extractor.extract(val, prefix)
      if (f) obj[key] = f
    }
    return
  }

  if (Array.isArray(val)) {
    for (let i = 0; i < val.length; i++) {
      scanAndReplaceBase64InValue(val, i, extractor, prefix)
    }
    return
  }

  if (typeof val === 'object') {
    for (const k of Object.keys(val)) {
      scanAndReplaceBase64InValue(val, k, extractor, prefix)
    }
  }
}
