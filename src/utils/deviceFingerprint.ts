// 設備指紋收集工具
// 用於識別和追蹤設備

export interface DeviceFingerprint {
  fingerprint: string
  browser: string
  os: string
  screen: string
  timezone: string
  language: string
  platform: string
  hardwareConcurrency: number
  deviceMemory?: number
  colorDepth: number
  pixelRatio: number
  touchSupport: boolean
  canvas?: string
  webgl?: string
}

export class DeviceFingerprintCollector {
  // 生成設備指紋
  static async generate(): Promise<DeviceFingerprint> {
    const components = await this.collectComponents()
    const fingerprint = await this.hash(JSON.stringify(components))

    return {
      fingerprint,
      ...components,
    }
  }

  // 收集設備信息
  private static async collectComponents() {
    return {
      browser: this.getBrowser(),
      os: this.getOS(),
      screen: this.getScreen(),
      timezone: this.getTimezone(),
      language: this.getLanguage(),
      platform: this.getPlatform(),
      hardwareConcurrency: this.getHardwareConcurrency(),
      deviceMemory: this.getDeviceMemory(),
      colorDepth: this.getColorDepth(),
      pixelRatio: this.getPixelRatio(),
      touchSupport: this.getTouchSupport(),
      canvas: await this.getCanvasFingerprint(),
      webgl: await this.getWebGLFingerprint(),
    }
  }

  // 獲取瀏覽器信息
  private static getBrowser(): string {
    const ua = navigator.userAgent
    if (ua.includes('Firefox')) return 'Firefox'
    if (ua.includes('Chrome')) return 'Chrome'
    if (ua.includes('Safari')) return 'Safari'
    if (ua.includes('Edge')) return 'Edge'
    if (ua.includes('Opera')) return 'Opera'
    return 'Unknown'
  }

  // 獲取操作系統
  private static getOS(): string {
    const ua = navigator.userAgent
    if (ua.includes('Windows')) return 'Windows'
    if (ua.includes('Mac')) return 'macOS'
    if (ua.includes('Linux')) return 'Linux'
    if (ua.includes('Android')) return 'Android'
    if (ua.includes('iOS')) return 'iOS'
    return 'Unknown'
  }

  // 獲取屏幕信息
  private static getScreen(): string {
    return `${screen.width}x${screen.height}`
  }

  // 獲取時區
  private static getTimezone(): string {
    return Intl.DateTimeFormat().resolvedOptions().timeZone
  }

  // 獲取語言
  private static getLanguage(): string {
    return navigator.language
  }

  // 獲取平台
  private static getPlatform(): string {
    return navigator.platform
  }

  // 獲取 CPU 核心數
  private static getHardwareConcurrency(): number {
    return navigator.hardwareConcurrency || 0
  }

  // 獲取設備內存（GB）
  private static getDeviceMemory(): number | undefined {
    return (navigator as any).deviceMemory
  }

  // 獲取色深
  private static getColorDepth(): number {
    return screen.colorDepth
  }

  // 獲取像素比
  private static getPixelRatio(): number {
    return window.devicePixelRatio
  }

  // 檢測觸控支持
  private static getTouchSupport(): boolean {
    return 'ontouchstart' in window || navigator.maxTouchPoints > 0
  }

  // Canvas 指紋
  private static async getCanvasFingerprint(): Promise<string> {
    try {
      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d')
      if (!ctx) return ''

      canvas.width = 200
      canvas.height = 50

      // 繪製文字
      ctx.textBaseline = 'top'
      ctx.font = '14px Arial'
      ctx.fillStyle = '#f60'
      ctx.fillRect(125, 1, 62, 20)
      ctx.fillStyle = '#069'
      ctx.fillText('Aguaphone 🔐', 2, 15)
      ctx.fillStyle = 'rgba(102, 204, 0, 0.7)'
      ctx.fillText('Aguaphone 🔐', 4, 17)

      return canvas.toDataURL().slice(-50) // 只取最後 50 個字符
    } catch (e) {
      return ''
    }
  }

  // WebGL 指紋
  private static async getWebGLFingerprint(): Promise<string> {
    try {
      const canvas = document.createElement('canvas')
      const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl')
      if (!gl) return ''

      const debugInfo = (gl as any).getExtension('WEBGL_debug_renderer_info')
      if (!debugInfo) return ''

      const vendor = gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL)
      const renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)

      return `${vendor}|${renderer}`.slice(0, 50)
    } catch (e) {
      return ''
    }
  }

  // 生成 hash（支援非安全上下文的 fallback）
  private static async hash(str: string): Promise<string> {
    // crypto.subtle 只在安全上下文（HTTPS / localhost）可用
    if (typeof crypto !== 'undefined' && crypto.subtle) {
      const encoder = new TextEncoder()
      const data = encoder.encode(str)
      const hashBuffer = await crypto.subtle.digest('SHA-256', data)
      const hashArray = Array.from(new Uint8Array(hashBuffer))
      return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
    }

    // Fallback: 簡易 hash（非加密用途，僅用於指紋識別）
    return this.simpleHash(str)
  }

  // 簡易 hash fallback（djb2 變體，產生 hex 字串）
  private static simpleHash(str: string): string {
    let h1 = 0xdeadbeef
    let h2 = 0x41c6ce57
    for (let i = 0; i < str.length; i++) {
      const ch = str.charCodeAt(i)
      h1 = Math.imul(h1 ^ ch, 2654435761)
      h2 = Math.imul(h2 ^ ch, 1597334677)
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507)
    h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909)
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507)
    h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909)
    const combined = 4294967296 * (2097151 & h2) + (h1 >>> 0)
    return combined.toString(16).padStart(16, '0')
  }

  // 獲取簡化的設備信息（用於顯示）
  static getSimpleInfo(): string {
    const browser = this.getBrowser()
    const os = this.getOS()
    const screen = this.getScreen()
    return `${browser} on ${os} (${screen})`
  }
}
