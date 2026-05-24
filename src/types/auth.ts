// 驗證系統類型定義

export interface AuthState {
  isAuthenticated: boolean
  discordUserId: string | null
  discordUsername: string | null
  discordDisplayName?: string | null
  authenticatedAt: number | null
  expiresAt: number | null
  /** 協議版本號：部署時遞增可強制所有用戶重新驗證 */
  authProtocolVersion?: number
}

export interface VerificationResponse {
  success: boolean
  message: string
  userId?: string
  username?: string
  displayName?: string
  expiresIn?: number
}

export interface GuildCheckResult {
  guildId: string
  guildName?: string
  passed: boolean
  reason: string | null  // null = passed, 'not_in_guild' | 'missing_role' | 'cannot_read_member'
  requiredRoleId?: string
  userRoles?: string[]
}

export interface DiscordOAuthResult {
  success: boolean
  message: string
  checks: GuildCheckResult[]
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
