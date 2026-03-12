import { ref } from 'vue'

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
   */
  async function convertImagesToBase64(container: HTMLElement): Promise<void> {
    const images = container.querySelectorAll('img')
    await Promise.all(
      Array.from(images).map(async (img) => {
        if (!img.src || img.src.startsWith('data:')) return
        try {
          const res = await fetch(img.src)
          const blob = await res.blob()
          const base64 = await new Promise<string>((resolve) => {
            const reader = new FileReader()
            reader.onloadend = () => resolve(reader.result as string)
            reader.readAsDataURL(blob)
          })
          img.src = base64
        } catch {
          // 圖片轉換失敗就跳過
        }
      }),
    )
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
      // 先處理跨域圖片
      await convertImagesToBase64(el)
      await new Promise((r) => setTimeout(r, 200))

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

    try {
      // 建立臨時容器
      const tempContainer = document.createElement('div')
      tempContainer.style.cssText = `
        position: fixed;
        left: -9999px;
        top: 0;
        width: ${chatContainer.offsetWidth}px;
        padding: 12px;
        background: ${opts.backgroundColor || '#f5f5f5'};
      `
      document.body.appendChild(tempContainer)

      // 按順序 clone 選中的消息
      for (const msgId of messageIds) {
        const el = chatContainer.querySelector(
          `[data-message-id="${msgId}"]`,
        ) as HTMLElement
        if (el) {
          const clone = el.cloneNode(true) as HTMLElement
          clone
            .querySelectorAll('.message-menu, .menu-backdrop')
            .forEach((m) => m.remove())
          tempContainer.appendChild(clone)
        }
      }

      const dataUrl = await captureElement(tempContainer, opts)
      document.body.removeChild(tempContainer)
      return dataUrl
    } catch (e: any) {
      error.value = e?.message || '批量截圖失敗'
      throw e
    } finally {
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
