import { ref } from 'vue'

function toScreenshotProxyUrl(url: string): string {
  if (!url || url.startsWith('data:') || url.startsWith('blob:')) return url
  // 如果已經是代理 URL，不要重複代理
  if (url.includes('nai-proxy.aguacloud.uk/image-proxy') || url.includes('/image-proxy?url=')) {
    return url
  }
  const base = import.meta.env.DEV ? "" : "https://nai-proxy.aguacloud.uk"
  return `${base}/image-proxy?url=${encodeURIComponent(url)}`
}

function copyVueScopedAttributes(source: HTMLElement | null, target: HTMLElement): void {
  if (!source) return
  for (const attr of Array.from(source.attributes)) {
    if (attr.name.startsWith('data-v-')) {
      target.setAttribute(attr.name, attr.value)
    }
  }
}

function hydrateClonedImages(source: HTMLElement, clone: HTMLElement): void {
  const sourceImages = Array.from(source.querySelectorAll<HTMLImageElement>('img'))
  const clonedImages = Array.from(clone.querySelectorAll<HTMLImageElement>('img'))
  clonedImages.forEach((img, index) => {
    const sourceImg = sourceImages[index]
    const resolvedSrc =
      sourceImg?.currentSrc ||
      sourceImg?.src ||
      sourceImg?.dataset.originalUrl ||
      img.currentSrc ||
      img.src ||
      img.dataset.originalUrl ||
      ''
    const rasterized = sourceImg ? rasterizeLoadedImageElement(sourceImg) : null
    if (rasterized) {
      img.src = rasterized
    } else if (resolvedSrc) {
      img.src = resolvedSrc
    }
    img.loading = 'eager'
    img.decoding = 'sync'
  })
}

async function waitForImages(container: HTMLElement): Promise<void> {
  const images = Array.from(container.querySelectorAll<HTMLImageElement>('img'))
  await Promise.all(
    images.map(async (img) => {
      if (!img.src && img.dataset.originalUrl) {
        img.src = img.dataset.originalUrl
      }
      if (!img.src) return
      try {
        if (typeof img.decode === 'function') {
          await img.decode()
          return
        }
      } catch {
        // fall through to load/error listener
      }
      if (img.complete && img.naturalWidth > 0) return
      await new Promise<void>((resolve) => {
        const done = () => {
          img.removeEventListener('load', done)
          img.removeEventListener('error', done)
          resolve()
        }
        img.addEventListener('load', done)
        img.addEventListener('error', done)
        if (img.complete) resolve()
      })
    }),
  )
}

async function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('image load failed'))
    img.src = src
  })
}

async function rasterizeImageDataUrl(dataUrl: string): Promise<string> {
  const img = await loadImage(dataUrl)
  const canvas = document.createElement('canvas')
  canvas.width = img.naturalWidth || img.width
  canvas.height = img.naturalHeight || img.height
  const ctx = canvas.getContext('2d')
  if (!ctx || !canvas.width || !canvas.height) return dataUrl
  ctx.drawImage(img, 0, 0)
  return canvas.toDataURL('image/png')
}

function rasterizeLoadedImageElement(img: HTMLImageElement): string | null {
  if (!img.complete || !img.naturalWidth || !img.naturalHeight) return null
  const width = img.naturalWidth
  const height = img.naturalHeight
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  try {
    ctx.drawImage(img, 0, 0, width, height)
    return canvas.toDataURL('image/png')
  } catch {
    return null
  }
}

export interface ScreenshotOptions {
  /** 輸出格式 */
  format: 'png' | 'jpeg'
  /** JPEG 品質 0-1 */
  quality: number
  /** 縮放倍率 */
  scale: number
  /** 背景色，null 為透明 */
  backgroundColor: string | null
  /** 是否加浮水印 */
  watermark: boolean
  /** 浮水印文字 */
  watermarkText: string
}

const defaultOptions: ScreenshotOptions = {
  format: 'png',
  quality: 0.92,
  scale: 2,
  backgroundColor: null,
  watermark: false,
  watermarkText: '',
}

export function useScreenshot() {
  const isCapturing = ref(false)
  const previewDataUrl = ref<string | null>(null)
  const error = ref<string | null>(null)

  /**
   * 將外部圖片轉為 base64（解決跨域問題）
   * 對外部 HTTP(S) URL 使用本地 /ai-proxy/ 代理繞過 CORS 限制
   */
  async function convertImagesToBase64(container: HTMLElement): Promise<void> {
    const images = container.querySelectorAll('img')
    await Promise.all(
      Array.from(images).map(async (img) => {
        if (!img.src && img.dataset.originalUrl) {
          img.src = img.dataset.originalUrl
        }
        if (!img.src || img.src.startsWith('data:')) return
        try {
          let res: Response | null = null
          let fetchUrl = img.src

          // 先嘗試直接 fetch，如果失敗（例如 CORS 錯誤）再嘗試使用代理
          try {
            res = await fetch(fetchUrl)
            if (!res.ok) throw new Error(`HTTP ${res.status}`)
          } catch (e) {
            // 外部 HTTP(S) URL 使用代理，避免 CORS 失敗（表情包、頭像等）
            if (img.src.startsWith('http://') || img.src.startsWith('https://')) {
              fetchUrl = toScreenshotProxyUrl(img.src)
              res = await fetch(fetchUrl)
              if (!res.ok) throw new Error(`HTTP ${res.status}`)
            } else {
              throw e
            }
          }

          if (!res) return

          const blob = await res.blob()
          const base64 = await new Promise<string>((resolve) => {
            const reader = new FileReader()
            reader.onloadend = () => resolve(reader.result as string)
            reader.readAsDataURL(blob)
          })
          const rasterized = await rasterizeImageDataUrl(base64)
          // 等待新 src 載入完成後再繼續（避免 naturalWidth/naturalHeight 未更新）
          await new Promise<void>((resolve) => {
            const prev = img.src
            img.src = rasterized
            if (img.complete && img.src === rasterized) { resolve(); return }
            const onDone = () => { img.removeEventListener('load', onDone); img.removeEventListener('error', onDone); resolve() }
            img.addEventListener('load', onDone)
            img.addEventListener('error', onDone)
            // 防止因瀏覽器快取直接 complete 導致事件不觸發
            if (img.complete) { resolve() }
            void prev
          })
        } catch (e) {
          console.warn('[useScreenshot] 圖片轉換 base64 失敗:', img.src, e)
          // 圖片轉換失敗就跳過
        }
      }),
    )
  }

  /**
   * 修復 html2canvas 不支援 object-fit: cover / contain 的問題
   * 預先將這些圖片手動繪製到 canvas，以正確的裁切方式替換 img.src
   * 回傳還原函式陣列，截圖完成後呼叫以恢復原始狀態
   */
  async function fixObjectFitImages(container: HTMLElement): Promise<Array<() => void>> {
    const restores: Array<() => void> = []
    const images = Array.from(container.querySelectorAll<HTMLImageElement>('img'))

    await Promise.all(images.map(async (img) => {
      if (!img.complete || !img.naturalWidth || !img.naturalHeight) return
      const fit = window.getComputedStyle(img).objectFit
      if (fit !== 'cover' && fit !== 'contain') return

      if (!img.src.startsWith('data:')) {
        try {
          const currentUrl = img.currentSrc || img.src
          if (currentUrl && !currentUrl.startsWith('blob:')) {
            img.src = toScreenshotProxyUrl(currentUrl)
            await new Promise<void>((resolve) => {
              const onDone = () => {
                img.removeEventListener('load', onDone)
                img.removeEventListener('error', onDone)
                resolve()
              }
              img.addEventListener('load', onDone)
              img.addEventListener('error', onDone)
              if (img.complete) resolve()
            })
          }
        } catch {
          return
        }
      }

      const dw = img.offsetWidth || img.clientWidth
      const dh = img.offsetHeight || img.clientHeight
      if (!dw || !dh) return

      const nw = img.naturalWidth
      const nh = img.naturalHeight

      const canvas = document.createElement('canvas')
      canvas.width = dw
      canvas.height = dh
      const ctx = canvas.getContext('2d')
      if (!ctx) return

      if (fit === 'cover') {
        const scale = Math.max(dw / nw, dh / nh)
        const scaledW = nw * scale
        const scaledH = nh * scale
        const dx = (dw - scaledW) / 2
        const dy = (dh - scaledH) / 2
        ctx.drawImage(img, dx, dy, scaledW, scaledH)
      } else {
        const scale = Math.min(dw / nw, dh / nh)
        const scaledW = nw * scale
        const scaledH = nh * scale
        const dx = (dw - scaledW) / 2
        const dy = (dh - scaledH) / 2
        ctx.drawImage(img, dx, dy, scaledW, scaledH)
      }

      try {
        const dataUrl = canvas.toDataURL('image/png')
        const originalSrc = img.src
        const originalStyle = img.style.cssText
        img.src = dataUrl
        img.style.objectFit = 'fill'
        restores.push(() => {
          img.src = originalSrc
          img.style.cssText = originalStyle
        })
      } catch {
        // 如果圖片仍然 tainted，跳過 object-fit 修復，避免整個截圖流程失敗
      }
    }))

    return restores
  }

  /**
   * 對單個 DOM 元素截圖，回傳 data URL
   */
  async function captureElement(
    el: HTMLElement,
    opts: Partial<ScreenshotOptions> = {},
  ): Promise<string> {
    const options = { ...defaultOptions, ...opts }
    isCapturing.value = true
    error.value = null

    try {
      // 先處理跨域圖片（轉為 base64）
      await convertImagesToBase64(el)
      // 修復 html2canvas 不支援 object-fit: cover/contain（頭像、圖片壓縮問題）
      const restores = await fixObjectFitImages(el)
      await new Promise((r) => setTimeout(r, 100))

      // 動態載入 html2canvas
      const html2canvas = (await import('html2canvas')).default

      const canvas = await html2canvas(el, {
        backgroundColor: options.backgroundColor,
        scale: options.scale,
        logging: false,
        useCORS: false, // 已轉為 base64，不需要 CORS
        allowTaint: false,
        foreignObjectRendering: false,
        imageTimeout: 0,
      })

      // 恢復 object-fit 圖片原始狀態
      restores.forEach((fn) => fn())

      let dataUrl: string
      if (options.format === 'jpeg') {
        dataUrl = canvas.toDataURL('image/jpeg', options.quality)
      } else {
        dataUrl = canvas.toDataURL('image/png')
      }

      // 加浮水印
      if (options.watermark && options.watermarkText) {
        dataUrl = await addWatermark(dataUrl, options.watermarkText)
      }

      previewDataUrl.value = dataUrl
      return dataUrl
    } catch (e: any) {
      error.value = e?.message || '截圖失敗'
      throw e
    } finally {
      isCapturing.value = false
    }
  }

  /**
   * 對多條消息截圖：clone 選中的消息到臨時容器再截圖
   */
  async function captureMessages(
    messageIds: string[],
    chatContainer: HTMLElement,
    opts: Partial<ScreenshotOptions> = {},
  ): Promise<string> {
    isCapturing.value = true
    error.value = null
    let tempRoot: HTMLElement | null = null

    try {
      const chatScreen = chatContainer.closest('.chat-screen') as HTMLElement | null
      const sourceList = chatContainer.querySelector('.messages-list') as HTMLElement | null
      const sourceContainerStyle = window.getComputedStyle(chatContainer)
      const sourceListStyle = sourceList ? window.getComputedStyle(sourceList) : null
      tempRoot = document.createElement('div')
      tempRoot.className = chatScreen?.className || 'chat-screen'
      copyVueScopedAttributes(chatScreen, tempRoot)
      tempRoot.style.cssText = `
        position: fixed;
        left: -9999px;
        top: 0;
        width: ${chatContainer.offsetWidth}px;
        background: ${opts.backgroundColor || '#f5f5f5'};
        overflow: visible;
        pointer-events: none;
      `
      tempRoot.setAttribute('data-screenshot-root', 'true')
      if (chatScreen) {
        tempRoot.style.cssText += chatScreen.style.cssText
      }

      const tempContainer = document.createElement('main')
      tempContainer.className = chatContainer.className
      copyVueScopedAttributes(chatContainer, tempContainer)
      tempContainer.style.cssText = chatContainer.style.cssText
      tempContainer.style.width = `${chatContainer.offsetWidth}px`
      tempContainer.style.height = 'auto'
      tempContainer.style.minHeight = '0'
      tempContainer.style.overflow = 'visible'
      tempContainer.style.background = opts.backgroundColor || sourceContainerStyle.backgroundColor || '#f5f5f5'

      const tempList = document.createElement('div')
      tempList.className = sourceList?.className || 'messages-list'
      copyVueScopedAttributes(sourceList, tempList)
      tempList.style.cssText = sourceList?.style.cssText || ''
      tempList.style.minHeight = '0'
      tempList.style.paddingTop = sourceListStyle?.paddingTop || '16px'
      tempList.style.paddingRight = sourceListStyle?.paddingRight || '16px'
      tempList.style.paddingBottom = sourceListStyle?.paddingBottom || '16px'
      tempList.style.paddingLeft = sourceListStyle?.paddingLeft || '16px'
      tempList.style.display = 'flex'
      tempList.style.flexDirection = 'column'
      tempList.style.gap = sourceListStyle?.gap || '12px'

      tempContainer.appendChild(tempList)
      tempRoot.appendChild(tempContainer)
      document.body.appendChild(tempRoot)

      // 按順序 clone 選中的消息
      for (const msgId of messageIds) {
        const el = chatContainer.querySelector(
          `[data-message-id="${msgId}"]`,
        ) as HTMLElement
        if (el) {
          const clone = el.cloneNode(true) as HTMLElement
          hydrateClonedImages(el, clone)
          clone
            .querySelectorAll('.message-menu, .menu-backdrop')
            .forEach((m) => m.remove())
          tempList.appendChild(clone)
        }
      }

      await waitForImages(tempList)
      const dataUrl = await captureElement(tempContainer, opts)
      tempRoot.remove()
      tempRoot = null
      return dataUrl
    } catch (e: any) {
      error.value = e?.message || '批量截圖失敗'
      throw e
    } finally {
      tempRoot?.remove()
      isCapturing.value = false
    }
  }

  /**
   * 在圖片上加浮水印
   */
  async function addWatermark(
    dataUrl: string,
    text: string,
  ): Promise<string> {
    return new Promise((resolve) => {
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        canvas.width = img.width
        canvas.height = img.height
        const ctx = canvas.getContext('2d')!
        ctx.drawImage(img, 0, 0)

        ctx.font = `${Math.max(12, img.width / 40)}px sans-serif`
        ctx.fillStyle = 'rgba(128, 128, 128, 0.3)'
        ctx.textAlign = 'right'
        ctx.textBaseline = 'bottom'
        ctx.fillText(text, img.width - 16, img.height - 12)

        resolve(canvas.toDataURL('image/png'))
      }
      img.src = dataUrl
    })
  }

  /**
   * 下載截圖
   */
  function downloadScreenshot(dataUrl: string, filename?: string) {
    const ext = dataUrl.startsWith('data:image/jpeg') ? 'jpg' : 'png'
    const name = filename || `chat-screenshot-${Date.now()}.${ext}`
    const link = document.createElement('a')
    link.href = dataUrl
    link.download = name
    link.click()
  }

  /**
   * 使用 Web Share API 分享（移動端）
   */
  async function shareScreenshot(
    dataUrl: string,
    title = '聊天截圖',
  ): Promise<boolean> {
    try {
      const res = await fetch(dataUrl)
      const blob = await res.blob()
      const ext = blob.type === 'image/jpeg' ? 'jpg' : 'png'
      const file = new File([blob], `screenshot.${ext}`, { type: blob.type })

      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title })
        return true
      }
    } catch {
      // 分享取消或不支援
    }
    return false
  }

  function clearPreview() {
    previewDataUrl.value = null
    error.value = null
  }

  return {
    isCapturing,
    previewDataUrl,
    error,
    captureElement,
    captureMessages,
    downloadScreenshot,
    shareScreenshot,
    clearPreview,
  }
}
