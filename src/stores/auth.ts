// 驗證狀態管理
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { AuthService } from '@/services/AuthService'
import { CodeProtection } from '@/utils/codeProtection'
import type { AuthState } from '@/types/auth'

export const useAuthStore = defineStore('auth', () => {
  const authState = ref<AuthState | null>(null)
  const verificationAttempts = ref(0)
  const maxAttempts = 5
  const initError = ref<string | null>(null)

  async function sleep(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms))
  }

  // 初始化：從 IndexedDB 恢復狀態（含重試，改善行動端暫時性存儲失效）
  async function initialize() {
    initError.value = null

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

  // 登出
  async function logout() {
    await AuthService.clearAuth()
    authState.value = null
    verificationAttempts.value = 0

    // 移除水印
    CodeProtection.removeWatermark()
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

  return {
    authState,
    isAuthenticated,
    discordUserId,
    discordUsername,
    discordDisplayName,
    remainingAttempts,
    initError,
    initialize,
    retryInitialize: initialize,
    verifyCode,
    adminBypass,
    logout,
  }
})
