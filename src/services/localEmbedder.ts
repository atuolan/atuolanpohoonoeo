/**
 * 本地嵌入器
 * 管理 Web Worker 生命週期，封裝 postMessage 通訊為 Promise 介面
 * 懶初始化：首次 embed() 呼叫時才載入模型
 */

import type { Embedder } from '@/services/embeddingEngine'

// ─── 常數 ───────────────────────────────────────────────────

/** 預設模型（onnx-community 轉換的 ONNX 版本，~30MB q8） */
const DEFAULT_MODEL = 'onnx-community/bge-small-zh-v1.5-ONNX'
const DEFAULT_DTYPE = 'q8'

// ─── 型別 ───────────────────────────────────────────────────

type ProgressCallback = (info: { status: string; progress?: number; file?: string }) => void

interface PendingRequest {
  resolve: (value: any) => void
  reject: (reason: any) => void
}

// ─── 實作 ───────────────────────────────────────────────────

export class LocalEmbedder implements Embedder {
  private worker: Worker | null = null
  private pendingRequests = new Map<string, PendingRequest>()
  private dimensions = 0
  private ready = false
  private initPromise: Promise<void> | null = null
  private requestCounter = 0
  private onProgress: ProgressCallback | null

  constructor(onProgress?: ProgressCallback) {
    this.onProgress = onProgress ?? null
  }

  /** 單文本嵌入 */
  async embed(text: string): Promise<Float32Array> {
    const results = await this.embedBatch([text])
    return results[0]
  }

  /** 批量嵌入 */
  async embedBatch(texts: string[]): Promise<Float32Array[]> {
    if (texts.length === 0) return []
    await this.ensureReady()

    const result = await this.sendRequest('embed', { texts })
    return (result.vectors as number[][]).map((v) => new Float32Array(v))
  }

  /** 釋放模型資源並終止 Worker */
  async dispose(): Promise<void> {
    if (!this.worker) return

    try {
      await this.sendRequest('dispose', {})
    } catch {
      /* 忽略 */
    }

    this.worker.terminate()
    this.worker = null
    this.ready = false
    this.initPromise = null
    this.pendingRequests.clear()
    console.log('[本地嵌入] Worker 已終止')
  }

  // ─── 私有方法 ─────────────────────────────────────────────

  /** 確保 Worker 已初始化並載入模型 */
  private async ensureReady(): Promise<void> {
    if (this.ready) return
    if (this.initPromise) return this.initPromise

    this.initPromise = this.initialize()
    return this.initPromise
  }

  /** 初始化 Worker 並載入模型 */
  private async initialize(): Promise<void> {
    // 建立 Worker（使用 Vite 的 ?worker&url 語法）
    this.worker = new Worker(
      new URL('@/workers/embeddingWorker.ts', import.meta.url),
      { type: 'module' },
    )

    // 監聽 Worker 訊息
    this.worker.onmessage = (e: MessageEvent) => {
      this.handleMessage(e.data)
    }

    this.worker.onerror = (e: ErrorEvent) => {
      console.error('[本地嵌入] Worker 錯誤:', e.message)
    }

    // 發送 init 指令並等待 ready
    return new Promise<void>((resolve, reject) => {
      const id = this.nextId()

      // 暫存 ready 回呼
      const onReady = (dimensions: number) => {
        this.dimensions = dimensions
        this.ready = true
        console.log(`[本地嵌入] 模型就緒，維度: ${dimensions}`)
        resolve()
      }

      // 暫存 error 回呼
      const onError = (message: string) => {
        reject(new Error(`[本地嵌入] 初始化失敗: ${message}`))
      }

      // 臨時覆寫 message handler 以捕獲 ready/error
      const originalHandler = this.worker!.onmessage
      this.worker!.onmessage = (e: MessageEvent) => {
        const msg = e.data
        if (msg.type === 'ready') {
          this.worker!.onmessage = originalHandler
          onReady(msg.dimensions)
        } else if (msg.type === 'error' && !msg.id) {
          this.worker!.onmessage = originalHandler
          onError(msg.message)
        } else if (msg.type === 'progress') {
          this.onProgress?.(msg.data)
        } else {
          // 其他訊息交給正常 handler
          this.handleMessage(msg)
        }
      }

      this.worker!.postMessage({
        type: 'init',
        id,
        data: { model: DEFAULT_MODEL, dtype: DEFAULT_DTYPE },
      })
    })
  }

  /** 處理 Worker 回傳訊息 */
  private handleMessage(msg: any): void {
    if (msg.type === 'progress') {
      this.onProgress?.(msg.data)
      return
    }

    if (msg.type === 'result' || msg.type === 'disposed') {
      const pending = this.pendingRequests.get(msg.id)
      if (pending) {
        this.pendingRequests.delete(msg.id)
        pending.resolve(msg)
      }
      return
    }

    if (msg.type === 'error' && msg.id) {
      const pending = this.pendingRequests.get(msg.id)
      if (pending) {
        this.pendingRequests.delete(msg.id)
        pending.reject(new Error(msg.message))
      }
      return
    }
  }

  /** 發送請求至 Worker 並等待回應 */
  private sendRequest(type: string, data: any): Promise<any> {
    return new Promise((resolve, reject) => {
      const id = this.nextId()
      this.pendingRequests.set(id, { resolve, reject })
      this.worker!.postMessage({ type, id, data })
    })
  }

  /** 產生唯一請求 ID */
  private nextId(): string {
    return `req_${++this.requestCounter}_${Date.now()}`
  }
}
