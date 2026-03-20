/**
 * 本地嵌入 Web Worker
 * 使用 @huggingface/transformers 在背景執行緒中執行 bge-small-zh-v1.5 模型推理
 * 通訊協議：主執行緒透過 postMessage 傳送 init/embed/dispose 指令
 */

/* eslint-disable no-restricted-globals */

let pipeline: any = null
let extractor: any = null
let dimensions = 0

self.onmessage = async (e: MessageEvent) => {
  const { type, id, data } = e.data

  try {
    switch (type) {
      case 'init': {
        // 動態載入 Transformers.js（從 CDN，避免打包進主 bundle）
        self.postMessage({ type: 'progress', data: { status: 'initiate', file: 'transformers.js', progress: 0 } })
        const module = await import(
          /* @vite-ignore */
          'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3'
        )
        pipeline = module.pipeline
        module.env.allowLocalModels = false

        // 初始化 feature-extraction pipeline（下載模型檔案）
        extractor = await pipeline('feature-extraction', data.model, {
          dtype: data.dtype || 'q8',
          device: 'wasm',
          progress_callback: (info: any) => {
            self.postMessage({ type: 'progress', data: info })
          },
        })

        // 通知主執行緒：模型已載入，正在進行首次推理（WASM 編譯）
        self.postMessage({ type: 'progress', data: { status: 'warmup', file: 'WASM 首次編譯中...', progress: 100 } })

        // 探測輸出維度（首次推理會觸發 WASM 編譯，可能需要數秒）
        const probe = await extractor('test', { pooling: 'cls', normalize: true })
        dimensions = probe.dims[probe.dims.length - 1]
        self.postMessage({ type: 'ready', dimensions })
        break
      }

      case 'embed': {
        if (!extractor) {
          self.postMessage({ type: 'error', id, message: '模型未初始化' })
          return
        }
        const texts: string[] = data.texts
        const output = await extractor(texts, { pooling: 'cls', normalize: true })

        // 將連續的 Float32 數據切片為逐筆向量
        const vectors: number[][] = []
        for (let i = 0; i < texts.length; i++) {
          vectors.push(
            Array.from(output.data.slice(i * dimensions, (i + 1) * dimensions)),
          )
        }
        self.postMessage({ type: 'result', id, vectors })
        break
      }

      case 'dispose': {
        if (extractor) {
          try {
            await extractor.dispose()
          } catch {
            /* 忽略釋放錯誤 */
          }
          extractor = null
          pipeline = null
        }
        self.postMessage({ type: 'disposed' })
        break
      }
    }
  } catch (err: any) {
    self.postMessage({
      type: 'error',
      id,
      message: err?.message || String(err),
    })
  }
}
