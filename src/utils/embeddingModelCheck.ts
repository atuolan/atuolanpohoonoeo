/**
 * 嵌入模型快取檢測工具
 * 檢查 HuggingFace Transformers.js 的模型是否已下載到瀏覽器 Cache API
 * Transformers.js 使用 Cache API 儲存模型檔案，快取名稱為 'transformers-cache'
 */

/** 預設模型 ID（與 localEmbedder.ts 保持一致） */
const DEFAULT_MODEL = 'onnx-community/bge-small-zh-v1.5-ONNX'

/**
 * 檢查本地嵌入模型是否已快取
 * 透過 Cache API 檢查 transformers-cache 中是否有該模型的 .onnx 檔案
 */
export async function isEmbeddingModelCached(): Promise<boolean> {
  try {
    if (!('caches' in self)) return false

    const cache = await caches.open('transformers-cache')
    const keys = await cache.keys()

    // 檢查是否有包含模型名稱的 .onnx 檔案（模型的核心權重檔）
    return keys.some((req) => {
      const url = req.url
      return url.includes(DEFAULT_MODEL) && url.includes('.onnx')
    })
  } catch {
    // Cache API 不可用或存取失敗，視為未快取
    return false
  }
}
