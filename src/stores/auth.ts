// 驗證狀態管理
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { AuthService } from '@/services/AuthService'
import { CodeProtection } from '@/utils/codeProtection'
import type { AuthState, DiscordOAuthResult } from '@/types/auth'

export const useAuthStore = defineStore('auth', () => {
  const authState = ref<AuthState | null>(AuthService.getCachedAuthStateSync())
  const verificationAttempts = ref(0)
  const maxAttempts = 5
  const initError = ref<string | null>(null)
  const isInitializing = ref(false)
  const isInitialized = ref(false)

  async function sleep(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms))
  }

  // 初始化：從 IndexedDB 恢復狀態（含重試，改善行動端暫時性存儲失效）
  async function initialize() {
    if (isInitializing.value) return
    isInitializing.value = true
    initError.value = null

    try {
      // 檢查網址列是否有 OAuth 回傳的參數 (同分頁跳轉 fallback)
      const urlParams = new URLSearchParams(window.location.search)
      const authResultRaw = urlParams.get('auth_result')
      const discordUserId = urlParams.get('discord_user_id')
      const discordUsername = urlParams.get('discord_username')
      const discordDisplayName = urlParams.get('discord_display_name')
      const discordError = urlParams.get('discord_error')

      if (authResultRaw || discordError) {
        try {
          if (discordError) {
            console.error('[Auth] Discord OAuth 錯誤:', decodeURIComponent(discordError))
          } else if (authResultRaw) {
            const authResult = JSON.parse(decodeURIComponent(authResultRaw))
            if (authResult.success && discordUserId && discordUsername && discordDisplayName) {
              // 驗證成功，儲存狀態
              await AuthService.saveAuthState(discordUserId, discordUsername, discordDisplayName)
              console.log('[Auth] 從 URL 參數恢復驗證狀態成功')
            }
          }
        } catch (e) {
          console.error('[Auth] 解析 URL 驗證參數失敗:', e)
        } finally {
          // 清除網址列參數，避免重新整理時再次觸發
          const newUrl = window.location.pathname
          window.history.replaceState({}, document.title, newUrl)
        }
      }

      const maxRetries = 3
      let lastError: unknown = null

      for (let i = 0; i < maxRetries; i++) {
        try {
          authState.value = await AuthService.getAuthState()
          lastError = null
          break
        } catch (e) {
          lastError = e
          console.error(`[Auth] 初始化讀取驗證狀態失敗（第 ${i + 1}/${maxRetries} 次）:`, e)

          if (i < maxRetries - 1) {
            // 400ms / 800ms 退避
            await sleep(400 * (i + 1))
          }
        }
      }

      if (lastError) {
        initError.value = '讀取驗證狀態失敗（行動端儲存暫時不可用），請點擊「重試讀取」'
        // 不主動覆寫 authState，避免把「暫時異常」誤判成「已登出」
      }

      // 如果已驗證，添加水印
      if (
        authState.value?.isAuthenticated &&
        authState.value.discordDisplayName
      ) {
        CodeProtection.addWatermark(authState.value.discordDisplayName)
      }
    } finally {
      isInitialized.value = true
      isInitializing.value = false
    }
  }

  // 驗證 TOTP 碼（通過 API）
  async function verifyCode(
    code: string
  ): Promise<{ success: boolean; message: string }> {
    if (verificationAttempts.value >= maxAttempts) {
      return {
        success: false,
        message: '嘗試次數已用完，請重新整理頁面',
      }
    }

    verificationAttempts.value++
    initError.value = null

    const result = await AuthService.verifyTOTP(code)

    if (result.success && result.userId && result.username) {
      await AuthService.saveAuthState(
        result.userId,
        result.username,
        result.displayName || result.username
      )
      authState.value = await AuthService.getAuthState()
      verificationAttempts.value = 0

      // 添加水印
      if (authState.value?.discordDisplayName) {
        CodeProtection.addWatermark(authState.value.discordDisplayName)
      }

      return {
        success: true,
        message: '驗證成功',
      }
    }

    return {
      success: false,
      message: result.message || '驗證失敗',
    }
  }

  // 透過 Discord OAuth2 驗證（跨社群身分組檢查）
  async function verifyByDiscord(): Promise<{
    success: boolean;
    message: string;
    oauthResult?: DiscordOAuthResult;
  }> {
    initError.value = null;
    const result = await AuthService.verifyByDiscordOAuth();

    if (result.success && result.userId && result.username) {
      await AuthService.saveAuthState(
        result.userId,
        result.username,
        result.displayName || result.username,
      );
      authState.value = await AuthService.getAuthState();

      if (authState.value?.discordDisplayName) {
        CodeProtection.addWatermark(authState.value.discordDisplayName);
      }

      return {
        success: true,
        message: "驗證成功",
        oauthResult: result.oauthResult,
      };
    }

    return {
      success: false,
      message: result.message || "驗證失敗",
      oauthResult: result.oauthResult,
    };
  }

  // 登出
  async function logout() {
    await AuthService.clearAuth()
    authState.value = null
    verificationAttempts.value = 0

    // 移除水印
    CodeProtection.removeWatermark()
  }

  // 好友專用內置驗證碼（非管理員權限）
  async function friendBypass(code: string): Promise<{ success: boolean; message: string }> {
    if (code !== 'friendUSED') {
      return { success: false, message: '' }
    }
    await AuthService.saveAuthState('friend', 'friend', '好友')
    authState.value = await AuthService.getAuthState()
    verificationAttempts.value = 0
    CodeProtection.addWatermark('好友')
    return { success: true, message: '好友驗證成功' }
  }

  // 管理員身分代碼直接登入（跳過 TOTP）
  async function adminBypass(password: string): Promise<{ success: boolean; message: string }> {
    // 延遲導入避免 Pinia store 初始化順序問題
    const { useAdminStore } = await import('@/stores/admin')
    const adminStore = useAdminStore()
    const ok = await adminStore.login(password)
    if (!ok) {
      return { success: false, message: '' } // 不是管理員密碼，靜默失敗
    }

    // 管理員驗證成功，直接保存 auth 狀態
    await AuthService.saveAuthState('admin', 'admin', '管理員')
    authState.value = await AuthService.getAuthState()
    verificationAttempts.value = 0

    CodeProtection.addWatermark('管理員')
    return { success: true, message: '管理員驗證成功' }
  }

  // 計算屬性
  const isAuthenticated = computed(
    () => authState.value?.isAuthenticated ?? false
  )
  const discordUserId = computed(() => authState.value?.discordUserId ?? null)
  const discordUsername = computed(
    () => authState.value?.discordUsername ?? null
  )
  const discordDisplayName = computed(
    () => authState.value?.discordDisplayName ?? null
  )
  const remainingAttempts = computed(() =>
    Math.max(0, maxAttempts - verificationAttempts.value)
  )
  const hasResolvedAuthState = computed(
    () => isInitialized.value || authState.value?.isAuthenticated === true
  )

  return {
    authState,
    isAuthenticated,
    discordUserId,
    discordUsername,
    discordDisplayName,
    remainingAttempts,
    initError,
    isInitializing,
    isInitialized,
    hasResolvedAuthState,
    initialize,
    retryInitialize: initialize,
    verifyCode,
    verifyByDiscord,
    adminBypass,
    friendBypass,
    logout,
  }
})
