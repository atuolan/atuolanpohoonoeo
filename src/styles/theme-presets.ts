import type { ThemeConfig, ColorConfig, FontConfig, WallpaperConfig, IconConfig, AnimationConfig } from '@/types'

// ============================================================
// 預設主題配置
// ============================================================

interface ThemePresetConfig {
  name: string
  colors: ColorConfig
  fonts: FontConfig
  wallpaper: WallpaperConfig
  icons: IconConfig
  animations: AnimationConfig
}

/**
 * 可愛風主題 - 薄荷綠配淺粉、馬卡龍色系
 */
const cuteTheme: ThemePresetConfig = {
  name: '可愛風',
  colors: {
    primary: '#7dd3a8',           // 柔和薄荷綠（由 C7FCBB 調深一點增加對比度）
    secondary: '#a8e6cf',         // 淡薄荷綠
    background: 'rgba(255, 245, 248, 0.95)',  // 淺粉背景
    surface: 'rgba(255, 255, 255, 0.85)',
    textPrimary: '#4a5568',       // 深灰偏冷
    textSecondary: '#718096',
    bubbleUserBg: '#d4f5e9',      // 淡薄荷綠氣泡
    bubbleCharBg: '#fff5f8',      // 淡粉色氣泡
    bubbleUserBlur: 'rgba(199, 252, 187, 0.4)',
    bubbleCharBlur: 'rgba(255, 228, 236, 0.4)'
  },
  fonts: {
    family: "'Noto Sans TC', 'PingFang TC', sans-serif",
    sizeBase: 15,
    weightNormal: 400,
    weightBold: 600
  },
  wallpaper: {
    type: 'gradient',
    value: 'linear-gradient(135deg, #fff5f8 0%, #ffe4ec 50%, #ffd6e7 100%)',
    blur: 0,
    opacity: 1
  },
  icons: {
    pack: 'default',
    size: 48,
    radius: 16
  },
  animations: {
    transitionFast: '0.15s cubic-bezier(0.4, 0, 0.2, 1)',
    transitionNormal: '0.3s cubic-bezier(0.4, 0, 0.2, 1)',
    transitionSlow: '0.5s cubic-bezier(0.4, 0, 0.2, 1)',
    enableAnimations: true
  }
}

/**
 * 霓虹風主題 - 暗色背景、發光效果、科技感
 */
const neonTheme: ThemePresetConfig = {
  name: '霓虹風',
  colors: {
    primary: '#00f5ff',
    secondary: '#ff00ff',
    background: 'rgba(10, 10, 20, 0.98)',
    surface: 'rgba(20, 20, 40, 0.9)',
    textPrimary: '#ffffff',
    textSecondary: '#a0a0c0',
    bubbleUserBg: 'rgba(0, 245, 255, 0.15)',
    bubbleCharBg: 'rgba(255, 0, 255, 0.15)',
    bubbleUserBlur: 'rgba(0, 245, 255, 0.1)',
    bubbleCharBlur: 'rgba(255, 0, 255, 0.1)'
  },
  fonts: {
    family: "'Noto Sans TC', 'SF Pro Display', monospace",
    sizeBase: 14,
    weightNormal: 400,
    weightBold: 700
  },
  wallpaper: {
    type: 'gradient',
    value: 'linear-gradient(135deg, #0a0a14 0%, #1a1a2e 50%, #16213e 100%)',
    blur: 0,
    opacity: 1
  },
  icons: {
    pack: 'neon',
    size: 44,
    radius: 12
  },
  animations: {
    transitionFast: '0.1s ease-out',
    transitionNormal: '0.25s ease-out',
    transitionSlow: '0.4s ease-out',
    enableAnimations: true
  }
}

/**
 * 玻璃態主題 - 毛玻璃效果、透明感、現代簡約
 */
const glassTheme: ThemePresetConfig = {
  name: '玻璃態',
  colors: {
    primary: '#6366f1',
    secondary: '#a855f7',
    background: 'rgba(255, 255, 255, 0.1)',
    surface: 'rgba(255, 255, 255, 0.25)',
    textPrimary: '#1f2937',
    textSecondary: '#6b7280',
    bubbleUserBg: 'rgba(99, 102, 241, 0.2)',
    bubbleCharBg: 'rgba(255, 255, 255, 0.4)',
    bubbleUserBlur: 'rgba(99, 102, 241, 0.1)',
    bubbleCharBlur: 'rgba(255, 255, 255, 0.2)'
  },
  fonts: {
    family: "'Noto Sans TC', 'SF Pro Text', sans-serif",
    sizeBase: 15,
    weightNormal: 400,
    weightBold: 600
  },
  wallpaper: {
    type: 'gradient',
    value: 'linear-gradient(135deg, #667eea 0%, #764ba2 50%, #f093fb 100%)',
    blur: 20,
    opacity: 0.8
  },
  icons: {
    pack: 'glass',
    size: 46,
    radius: 14
  },
  animations: {
    transitionFast: '0.15s ease',
    transitionNormal: '0.3s ease',
    transitionSlow: '0.5s ease',
    enableAnimations: true
  }
}

/**
 * 自定義主題（以可愛風為基礎）
 */
const customTheme: ThemePresetConfig = {
  ...cuteTheme,
  name: '自定義'
}

// ============================================================
// 導出主題映射
// ============================================================

export const defaultThemes: Record<string, ThemePresetConfig> = {
  cute: cuteTheme,
  neon: neonTheme,
  glass: glassTheme,
  custom: customTheme
}

// ============================================================
// DOM 操作
// ============================================================

/**
 * 將主題配置應用到 DOM
 */
export function applyThemeToDOM(theme: ThemeConfig): void {
  const root = document.documentElement

  // 應用顏色變數
  root.style.setProperty('--theme-primary', theme.colors.primary)
  root.style.setProperty('--theme-secondary', theme.colors.secondary)
  root.style.setProperty('--theme-background', theme.colors.background)
  root.style.setProperty('--theme-surface', theme.colors.surface)
  root.style.setProperty('--theme-text-primary', theme.colors.textPrimary)
  root.style.setProperty('--theme-text-secondary', theme.colors.textSecondary)
  root.style.setProperty('--bubble-user-bg', theme.colors.bubbleUserBg)
  root.style.setProperty('--bubble-char-bg', theme.colors.bubbleCharBg)
  root.style.setProperty('--bubble-user-blur', theme.colors.bubbleUserBlur)
  root.style.setProperty('--bubble-char-blur', theme.colors.bubbleCharBlur)

  // 應用字體變數
  root.style.setProperty('--font-family', theme.fonts.family)
  root.style.setProperty('--font-size-base', `${theme.fonts.sizeBase}px`)
  root.style.setProperty('--font-weight-normal', theme.fonts.weightNormal.toString())
  root.style.setProperty('--font-weight-bold', theme.fonts.weightBold.toString())

  // 應用壁紙
  root.style.setProperty('--wallpaper-type', theme.wallpaper.type)
  root.style.setProperty('--wallpaper-value', theme.wallpaper.value)
  root.style.setProperty('--wallpaper-blur', `${theme.wallpaper.blur}px`)
  root.style.setProperty('--wallpaper-opacity', theme.wallpaper.opacity.toString())

  // 應用圖標配置
  root.style.setProperty('--icon-size', `${theme.icons.size}px`)
  root.style.setProperty('--icon-radius', `${theme.icons.radius}px`)

  // 應用動畫配置
  root.style.setProperty('--transition-fast', theme.animations.transitionFast)
  root.style.setProperty('--transition-normal', theme.animations.transitionNormal)
  root.style.setProperty('--transition-slow', theme.animations.transitionSlow)

  // 設置主題類名
  root.setAttribute('data-theme', theme.preset)
  
  // 動畫開關
  if (!theme.animations.enableAnimations) {
    root.classList.add('reduce-motion')
  } else {
    root.classList.remove('reduce-motion')
  }

  console.log(`[Theme] 已應用主題: ${theme.name} (${theme.preset})`)
}

/**
 * 獲取計算後的 CSS 變數值
 */
export function getCSSVariable(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

/**
 * 生成隨機主題顏色（用於創意模式）
 */
export function generateRandomColors(): ColorConfig {
  const hue = Math.floor(Math.random() * 360)
  const primary = `hsl(${hue}, 70%, 60%)`
  const secondary = `hsl(${(hue + 30) % 360}, 65%, 55%)`
  
  return {
    primary,
    secondary,
    background: `hsla(${hue}, 30%, 95%, 0.95)`,
    surface: `hsla(${hue}, 20%, 98%, 0.8)`,
    textPrimary: `hsl(${hue}, 20%, 20%)`,
    textSecondary: `hsl(${hue}, 15%, 45%)`,
    bubbleUserBg: `hsla(${hue}, 60%, 90%, 0.9)`,
    bubbleCharBg: 'rgba(255, 255, 255, 0.9)',
    bubbleUserBlur: `hsla(${hue}, 50%, 85%, 0.4)`,
    bubbleCharBlur: 'rgba(255, 255, 255, 0.4)'
  }
}
