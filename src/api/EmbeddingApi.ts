/**
 * OpenAI 相容 Embedding API 客戶端
 * 負責將文本轉換為向量嵌入，支援單文本和批量嵌入
 */

/** AI API 代理專用子域名（灰雲 DNS only，繞過 Cloudflare 100s timeout） */
const AI_PROXY_HOST = 'https://api-203.aguacloud.uk'

// ─── 介面定義 ───────────────────────────────────────────────

/** Embedding API 設定 */
export interface EmbeddingApiSettings {
  /** API 端點 URL，例如 "https://api.openai.com/v1" */
  endpoint: string
  /** API 金鑰 */
  apiKey: string
  /** 模型名稱，例如 "text-embedding-3-small" */
  model: string
  /** 是否直連（跳過代理） */
  directConnect?: boolean
}

/** 單筆嵌入結果 */
export interface EmbeddingResult {
  embedding: number[]
  index: number
}

/** Embedding API 回應 */
export interface EmbeddingResponse {
  data: EmbeddingResult[]
  model: string
  usage: { prompt_tokens: number; total_tokens: number }
}

// ─── 錯誤類別 ───────────────────────────────────────────────

/** 設定缺失錯誤（API key 或 endpoint 未設定） */
export class MissingConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'MissingConfigError'
  }
}

// ─── 客戶端實作 ─────────────────────────────────────────────

export class EmbeddingApiClient {
  private settings: EmbeddingApiSettings

  constructor(settings: EmbeddingApiSettings) {
    this.settings = settings
  }

  /**
   * 單文本嵌入
   * @param text - 要嵌入的文本
   * @param signal - 可選的 AbortSignal
   * @returns 嵌入向量（number[]）
   */
  async embed(text: string, signal?: AbortSignal): Promise<number[]> {
    this.validateConfig()

    const url = this.getEndpoint()
    const response = await fetch(url, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({
        model: this.settings.model,
        input: text,
      }),
      signal,
    })

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '')
      throw new Error(
        `Embedding API 錯誤 (HTTP ${response.status}): ${errorBody || response.statusText}`,
      )
    }

    const result: EmbeddingResponse = await response.json()
    return result.data[0].embedding
  }

  /**
   * 批量嵌入，保持輸入順序
   * 自動分批處理，避免超過 API 的 batch size 上限
   * @param texts - 要嵌入的文本陣列
   * @param signal - 可選的 AbortSignal
   * @param batchSize - 每批最大數量（預設 16，保守值以相容各家 API）
   * @returns 嵌入向量陣列，順序與輸入一致
   */
  async embedBatch(texts: string[], signal?: AbortSignal, batchSize = 16): Promise<number[][]> {
    this.validateConfig()

    if (texts.length === 0) return []

    // 分批處理
    const allResults: number[][] = new Array(texts.length)
    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize)
      const url = this.getEndpoint()
      const response = await fetch(url, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({
          model: this.settings.model,
          input: batch,
        }),
        signal,
      })

      if (!response.ok) {
        const errorBody = await response.text().catch(() => '')
        throw new Error(
          `Embedding API 錯誤 (HTTP ${response.status}): ${errorBody || response.statusText}`,
        )
      }

      const result: EmbeddingResponse = await response.json()
      const sorted = [...result.data].sort((a, b) => a.index - b.index)
      sorted.forEach((item, j) => {
        allResults[i + j] = item.embedding
      })

      console.log(`[Embedding API] 批次 ${Math.floor(i / batchSize) + 1}/${Math.ceil(texts.length / batchSize)} 完成（${batch.length} 條）`)
    }

    return allResults
  }

  /**
   * 將外部 API URL 轉為代理路徑（複用 /ai-proxy/ 邏輯）
   * 走灰雲子域名繞過 Cloudflare timeout 限制
   */
  private toProxyUrl(url: string): string {
    if (this.settings.directConnect) return url
    if (typeof window === 'undefined') return url

    try {
      const parsed = new URL(url, window.location.origin)

      // 同源請求不需要代理
      if (parsed.origin === window.location.origin) {
        // 若同源 URL 包含 /ai-proxy/，重導到灰雲子域名
        if (parsed.pathname.startsWith('/ai-proxy')) {
          console.warn(`[Embedding API] 偵測到請求走主域名代理路徑，重導到灰雲子域名: ${url}`)
          return `${AI_PROXY_HOST}${parsed.pathname}`
        }
        return url
      }

      // 外部 URL 走代理
      const prefix = parsed.protocol === 'http:' ? '/ai-proxy-http/' : '/ai-proxy/'
      return `${AI_PROXY_HOST}${prefix}${parsed.host}${parsed.pathname}`
    } catch {
      return url
    }
  }

  /**
   * 獲取完整的 Embedding API 端點 URL
   */
  private getEndpoint(): string {
    let endpoint = this.settings.endpoint

    // 確保以 /embeddings 結尾
    if (!endpoint.endsWith('/embeddings')) {
      if (!endpoint.endsWith('/')) {
        endpoint += '/'
      }
      endpoint += 'embeddings'
    }

    return this.toProxyUrl(endpoint)
  }

  /**
   * 建構請求標頭
   */
  private getHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.settings.apiKey}`,
    }
  }

  /**
   * 驗證設定是否完整，缺少時同步拋出 MissingConfigError
   */
  private validateConfig(): void {
    if (!this.settings.apiKey) {
      throw new MissingConfigError('Embedding API key 未設定')
    }
    if (!this.settings.endpoint) {
      throw new MissingConfigError('Embedding API endpoint 未設定')
    }
  }
}
