/**
 * 備份媒體提取與去重工具
 *
 * 將 JSON 資料中的 base64 圖片提取為獨立檔案，並對相同圖片去重。
 * 供 SettingsScreen 完整匯出和 AutoBackupService 自動備份共用。
 */

import { getChatImage, isChatImageRef } from '../db/operations'

// ============================================================
// 類型
// ============================================================

export interface ExtractedMedia {
  /** 檔名 → 二進位內容（有 sink 時為空物件，資料已即時寫出） */
  files: Record<string, Uint8Array>
  /** 被提取的 base64 數量（含去重命中） */
  totalExtracted: number
  /** 去重命中次數 */
  dedupeHits: number
}

/**
 * 媒體即時寫出函式。提供時 extractor 不會在記憶體累積 files，
 * 每份媒體一產生就交給 sink 寫出後釋放。
 */
export type MediaSink = (filename: string, data: Uint8Array) => Promise<void>

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

function getImageExtensionFromMimeType(mimeType?: string): string {
  const normalized = (mimeType || 'image/png').toLowerCase().split(';')[0]
  const subtype = normalized.split('/')[1] || 'png'
  return subtype === 'jpeg' ? 'jpg' : subtype
}

/**
 * 對已解碼的二進位內容算固定長度摘要，作為去重 key。
 *
 * 不可以用 base64 字串的切片當 key：V8 的 `substring()` 會產生
 * SlicedString，抓住整個母字串不放，於是每張圖片的完整 base64 都被
 * 去重快取留在 heap 裡（實測 64 MiB 圖片殘留約 86.7 MiB），媒體已經
 * 寫出也不會釋放。改成數值摘要後快取只留固定長度的字串。
 */
async function hashBytes(ext: string, data: Uint8Array): Promise<string> {
  const subtle = globalThis.crypto?.subtle
  if (subtle) {
    try {
      // 複製一份：部分實作會 detach 傳入的 buffer
      const digest = await subtle.digest('SHA-256', data.slice().buffer)
      const view = new Uint8Array(digest)
      let hex = ''
      for (let i = 0; i < view.length; i++) {
        hex += view[i].toString(16).padStart(2, '0')
      }
      return `${ext}:${data.length}:${hex}`
    } catch {
      // 落到下方 FNV
    }
  }

  // Fallback：FNV-1a ×4（不同 offset basis）湊成 128 bit
  let h0 = 0x811c9dc5
  let h1 = 0x01000193
  let h2 = 0x811c9dc5 ^ 0x5bf03635
  let h3 = 0x01000193 ^ 0x9e3779b9
  for (let i = 0; i < data.length; i++) {
    const b = data[i]
    h0 = Math.imul(h0 ^ b, 0x01000193)
    h1 = Math.imul(h1 ^ b, 0x85ebca6b)
    h2 = Math.imul(h2 ^ b, 0xc2b2ae35)
    h3 = Math.imul(h3 ^ b, 0x27d4eb2f)
  }
  const part = (n: number) => (n >>> 0).toString(16).padStart(8, '0')
  return `${ext}:${data.length}:${part(h0)}${part(h1)}${part(h2)}${part(h3)}`
}

function isRawBase64ImageData(str: string | undefined): boolean {
  if (!str) return false
  if (
    str.startsWith('data:') ||
    str.startsWith('http') ||
    str.startsWith('blob:') ||
    str.startsWith('media/')
  ) {
    return false
  }
  const normalized = str.replace(/\s+/g, '')
  if (normalized.length < 256 || normalized.length % 4 !== 0) return false
  return /^[A-Za-z0-9+/=]+$/.test(normalized)
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
  private sink?: MediaSink

  /**
   * @param sink 可選的即時寫出函式。提供時媒體不留在記憶體中，
   *             `getResult().files` 會是空物件。
   */
  constructor(sink?: MediaSink) {
    this.sink = sink
  }

  private async storeParsedMedia(hash: string, filename: string, data: Uint8Array): Promise<string> {
    if (this.cache.has(hash)) {
      this.dedupeHits++
      this.totalExtracted++
      return this.cache.get(hash)!
    }

    if (this.sink) {
      await this.sink(filename, data)
    } else {
      this.files[filename] = data
    }
    this.cache.set(hash, filename)
    this.totalExtracted++
    return filename
  }

  /**
   * 提取一個 base64 DataURL，回傳媒體檔案路徑。
   * 相同內容會去重，回傳同一個路徑。
   * @param dataUrl base64 DataURL
   * @param prefix 檔名前綴，例如 'avatar_xxx' 或 'chat'
   */
  async extract(dataUrl: string, prefix: string): Promise<string | null> {
    if (!dataUrl || (!dataUrl.startsWith('data:image/') && !dataUrl.startsWith('data:audio/'))) {
      return null
    }

    const parsed = parseDataUrl(dataUrl)
    if (!parsed) return null

    const hash = await hashBytes(parsed.ext, parsed.data)
    const filename = `media/${prefix}_${this.index++}.${parsed.ext}`
    return this.storeParsedMedia(hash, filename, parsed.data)
  }

  async extractRawImageBase64(base64: string, prefix: string, mimeType?: string): Promise<string | null> {
    if (!isRawBase64ImageData(base64)) return null

    const normalized = base64.replace(/\s+/g, '')
    try {
      const ext = getImageExtensionFromMimeType(mimeType)
      const data = base64ToUint8Array(normalized)
      const hash = await hashBytes(ext, data)
      const filename = `media/${prefix}_${this.index++}.${ext}`
      return this.storeParsedMedia(hash, filename, data)
    } catch {
      return null
    }
  }

  /**
   * 提取頭像（用 id 作為檔名，更易讀）
   */
  async extractAvatar(dataUrl: string, id: string): Promise<string | null> {
    if (!dataUrl?.startsWith('data:image/')) return null

    const parsed = parseDataUrl(dataUrl)
    if (!parsed) return null

    const hash = await hashBytes(parsed.ext, parsed.data)
    const filename = `media/avatar_${id}.${parsed.ext}`
    return this.storeParsedMedia(hash, filename, parsed.data)
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

export async function extractMediaFromChatBackupData(
  chat: any,
  extractor: BackupMediaExtractor,
): Promise<void> {
  if (!chat || typeof chat !== 'object') return

  if (Array.isArray(chat.messages)) {
    for (const msg of chat.messages) {
      if (msg.imageUrl?.startsWith('data:image/')) {
        const f = await extractor.extract(msg.imageUrl, 'chat')
        if (f) msg.imageUrl = f
      }
      if (msg.imageData?.startsWith('data:image/')) {
        const f = await extractor.extract(msg.imageData, 'chat_data')
        if (f) msg.imageData = f
      } else if (isRawBase64ImageData(msg.imageData)) {
        const f = await extractor.extractRawImageBase64(msg.imageData, 'chat_data', msg.imageMimeType)
        if (f) msg.imageData = f
      }
    }
  }

  if (
    chat.appearance?.wallpaper?.type === 'image' &&
    chat.appearance.wallpaper.value?.startsWith('data:image/')
  ) {
    const f = await extractor.extract(chat.appearance.wallpaper.value, 'chat_wallpaper')
    if (f) chat.appearance.wallpaper.value = f
  }

  if (typeof chat.charAvatarOverride === 'string') {
    await scanAndReplaceBase64InValue(chat, 'charAvatarOverride', extractor, `chat_char_avatar_${chat.id || 'unknown'}`)
  }

  if (typeof chat.userAvatarOverride === 'string') {
    await scanAndReplaceBase64InValue(chat, 'userAvatarOverride', extractor, `chat_user_avatar_${chat.id || 'unknown'}`)
  }

  if (Array.isArray(chat.coupleAvatarLibrary)) {
    await scanAndReplaceBase64InValue(chat, 'coupleAvatarLibrary', extractor, `chat_couple_${chat.id || 'unknown'}`)
  }
}

/**
 * 掃描備份資料物件，將所有 base64 圖片提取到 media 資料夾並去重。
 * 會直接修改傳入的 data 物件（將 base64 替換為檔案路徑）。
 */
export async function extractAllMediaFromBackupData(data: any, sharedExtractor?: BackupMediaExtractor): Promise<ExtractedMedia> {
  const extractor = sharedExtractor ?? new BackupMediaExtractor()

  // 1. 角色頭像
  if (Array.isArray(data.characters)) {
    for (const char of data.characters) {
      const f = await extractor.extractAvatar(char.avatar, char.id)
      if (f) char.avatar = f
    }
  }

  // 2. 使用者角色頭像
  if (data.userData?.personas && Array.isArray(data.userData.personas)) {
    for (const persona of data.userData.personas) {
      const f = await extractor.extractAvatar(persona.avatar, persona.id || `persona_${Date.now()}`)
      if (f) persona.avatar = f
    }
  }

  // 3. 聊天訊息圖片
  if (Array.isArray(data.chats)) {
    for (const chat of data.chats) {
      await extractMediaFromChatBackupData(chat, extractor)
    }
  }

  // 4. QZone 貼文
  if (Array.isArray(data.qzonePosts)) {
    for (let i = 0; i < data.qzonePosts.length; i++) {
      const post = data.qzonePosts[i]
      // 作者頭像
      if (post.avatar?.startsWith('data:image/')) {
        const f = await extractor.extractAvatar(post.avatar, post.authorId || `qzone_author_${i}`)
        if (f) post.avatar = f
      }
      // 貼文圖片
      if (Array.isArray(post.images)) {
        for (let j = 0; j < post.images.length; j++) {
          if (typeof post.images[j] === 'string' && post.images[j].startsWith('data:image/')) {
            const f = await extractor.extract(post.images[j], `qzone_${i}`)
            if (f) post.images[j] = f
          }
        }
      }
      // 留言頭像
      if (Array.isArray(post.comments)) {
        for (let k = 0; k < post.comments.length; k++) {
          const comment = post.comments[k]
          if (comment.avatar?.startsWith('data:image/')) {
            const f = await extractor.extractAvatar(comment.avatar, comment.authorId || `comment_${i}_${k}`)
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
        const f = await extractor.extract(theme.wallpaperStyle.value, `theme_wallpaper_${i}`)
        if (f) theme.wallpaperStyle.value = f
      }
    }
  }

  // 6. 自訂鈴聲
  if (data.settings && typeof data.settings === 'object') {
    const audioUrl = (data.settings as any)?.incomingCallRingtone?.customAudioDataUrl
    if (typeof audioUrl === 'string' && audioUrl.startsWith('data:audio/')) {
      const f = await extractor.extract(audioUrl, 'custom_ringtone')
      if (f) (data.settings as any).incomingCallRingtone.customAudioDataUrl = f
    }
  }

  // 7. oldSettings（theater-posts 等含有 base64 的 key-value）
  if (Array.isArray(data.oldSettings)) {
    for (const item of data.oldSettings) {
      if (!item.value) continue
      await scanAndReplaceBase64InValue(item, 'value', extractor, `setting_${item.key || 'unknown'}`)
    }
  }

  // 8. canvasLayout（白板佈局中的 base64 圖片）
  if (data.canvasLayout) {
    await scanAndReplaceBase64InValue(data, 'canvasLayout', extractor, 'canvas')
  }

  // 9. gameStates
  if (Array.isArray(data.gameStates)) {
    for (const gs of data.gameStates) {
      if (gs.value) {
        await scanAndReplaceBase64InValue(gs, 'value', extractor, `game_${gs.key || 'unknown'}`)
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
            const f = await extractor.extract(s.url, `sticker_${stickerGroup.id || 'group'}`)
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
async function scanAndReplaceBase64InValue(
  obj: any,
  key: string | number,
  extractor: BackupMediaExtractor,
  prefix: string,
): Promise<void> {
  const val = obj[key]
  if (val === null || val === undefined) return

  if (typeof val === 'string') {
    if (val.startsWith('data:image/') && val.length > 200) {
      const f = await extractor.extract(val, prefix)
      if (f) obj[key] = f
    } else if (isRawBase64ImageData(val)) {
      const f = await extractor.extractRawImageBase64(val, prefix)
      if (f) obj[key] = f
    }
    return
  }

  if (Array.isArray(val)) {
    for (let i = 0; i < val.length; i++) {
      await scanAndReplaceBase64InValue(val, i, extractor, prefix)
    }
    return
  }

  if (typeof val === 'object') {
    for (const k of Object.keys(val)) {
      await scanAndReplaceBase64InValue(val, k, extractor, prefix)
    }
  }
}

async function replaceChatImageRefsInValue(
  obj: any,
  key: string | number,
): Promise<void> {
  const val = obj[key]
  if (val === null || val === undefined) return

  if (typeof val === 'string') {
    if (isChatImageRef(val)) {
      const resolved = await getChatImage(val)
      if (resolved) obj[key] = resolved
    }
    return
  }

  if (Array.isArray(val)) {
    for (let i = 0; i < val.length; i++) {
      await replaceChatImageRefsInValue(val, i)
    }
    return
  }

  if (typeof val === 'object') {
    for (const k of Object.keys(val)) {
      await replaceChatImageRefsInValue(val, k)
    }
  }
}

export async function normalizeChatBackupMediaSources(chat: any): Promise<void> {
  if (!chat || typeof chat !== 'object') return

  if (typeof chat.charAvatarOverride === 'string') {
    await replaceChatImageRefsInValue(chat, 'charAvatarOverride')
  }

  if (typeof chat.userAvatarOverride === 'string') {
    await replaceChatImageRefsInValue(chat, 'userAvatarOverride')
  }

  if (Array.isArray(chat.coupleAvatarLibrary)) {
    await replaceChatImageRefsInValue(chat, 'coupleAvatarLibrary')
  }
}
