/**
 * 內容雜湊工具
 * 使用 Web Crypto API 計算 SHA-256 雜湊，用於偵測總結/日記內容變更
 */

/**
 * 計算文本的 SHA-256 雜湊值
 * @param text - 要計算雜湊的文本
 * @returns hex 編碼的 SHA-256 摘要
 */
export async function contentHash(text: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(text)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}
