// 驗證系統類型定義

export interface AuthState {
  isAuthenticated: boolean
  discordUserId: string | null
  discordUsername: string | null
  discordDisplayName?: string | null
  authenticatedAt: number | null
  expiresAt: number | null
}

export interface VerificationResponse {
  success: boolean
  message: string
  userId?: string
  username?: string
  displayName?: string
  expiresIn?: number
}

export interface DeviceInfo {
  fingerprint: string
  browser: string
  os: string
  screen?: string
  timezone?: string
  language?: string
  ip?: string
}
