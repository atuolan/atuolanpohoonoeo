/**
 * 嵌入引擎抽象層
 * 統一 local（本地 Web Worker 推理）與 api（遠端 OpenAI 相容 API）兩種嵌入模式
 * 根據 settings.embeddingMode 自動委派至對應的嵌入器
 */

import { EmbeddingApiClient } from '@/api/EmbeddingApi'
import type { EmbeddingApiSettings } from '@/api/EmbeddingApi'
import { useSettingsStore } from '@/stores/settings'
import { LocalEmbedder } from '@/services/localEmbedder'

// ─── 嵌入器介面 ─────────────────────────────────────────────

/** 嵌入器統一介面 */
export interface Embedder {
  /** 單文本嵌入 */
  embed(text: string): Promise<Float32Array>
  /** 批量嵌入 */
  embedBatch(texts: string[]): Promise<Float32Array[]>
  /** 釋放資源（可選） */
  dispose?(): Promise<void>
}

// ─── 遠端嵌入器（包裝現有 EmbeddingApiClient） ──────────────

/** 遠端嵌入器，將 EmbeddingApiClient 的 number[] 轉為 Float32Array */
class RemoteEmbedder implements Embedder {
  async embed(text: string): Promise<Float32Array> {
    const client = this.createClient()
    const result = await client.embed(text)
    return new Float32Array(result)
  }

  async embedBatch(texts: string[]): Promise<Float32Array[]> {
    if (texts.length === 0) return []
    const client = this.createClient()
    const results = await client.embedBatch(texts)
    return results.map((r) => new Float32Array(r))
  }

  /** 每次呼叫取最新設定，依照專案慣例在函式內部呼叫 useSettingsStore() */
  private createClient(): EmbeddingApiClient {
    const settingsStore = useSettingsStore()
    const config = settingsStore.effectiveEmbeddingAPI as EmbeddingApiSettings
    return new EmbeddingApiClient(config)
  }
}

// ─── 嵌入引擎（單例） ──────────────────────────────────────

/** 進度回呼型別 */
export type EmbeddingProgressCallback = (info: { status: string; progress?: number; file?: string }) => void

class EmbeddingEngine {
  private localEmbedder: LocalEmbedder | null = null
  private remoteEmbedder: RemoteEmbedder | null = null
  private progressCallback: EmbeddingProgressCallback | null = null

  /** 設定本地模型下載進度回呼 */
  setProgressCallback(cb: EmbeddingProgressCallback | null): void {
    this.progressCallback = cb
  }

  /** 單文本嵌入 */
  async embed(text: string): Promise<Float32Array> {
    const embedder = this.getEmbedder()
    return embedder.embed(text)
  }

  /** 批量嵌入 */
  async embedBatch(texts: string[]): Promise<Float32Array[]> {
    if (texts.length === 0) return []
    const embedder = this.getEmbedder()
    return embedder.embedBatch(texts)
  }

  /** 釋放本地模型資源 */
  async dispose(): Promise<void> {
    if (this.localEmbedder) {
      await this.localEmbedder.dispose()
      this.localEmbedder = null
    }
  }

  /** 根據設定取得對應的嵌入器 */
  private getEmbedder(): Embedder {
    const settingsStore = useSettingsStore()
    const mode = settingsStore.embeddingMode ?? 'local'

    if (mode === 'local') {
      if (!this.localEmbedder) {
        this.localEmbedder = new LocalEmbedder((info) => {
          this.progressCallback?.(info)
        })
      }
      return this.localEmbedder
    } else {
      if (!this.remoteEmbedder) {
        this.remoteEmbedder = new RemoteEmbedder()
      }
      return this.remoteEmbedder
    }
  }
}

/** 模組級單例 */
export const embeddingEngine = new EmbeddingEngine()
