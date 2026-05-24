<template>
  <div class="auth-screen">
    <div class="auth-container">
      <div class="auth-card">
        <!-- Logo -->
        <div class="logo">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z"/>
          </svg>
        </div>

        <h1 class="title">Aguaphone 驗證</h1>
        <p class="subtitle">請使用 Discord 驗證碼登入</p>

        <!-- 步驟說明 -->
        <div class="steps">
          <div class="step">
            <span class="step-number">1</span>
            <span class="step-text">在 Discord 伺服器中使用 <code>/aguaphone</code> 指令</span>
          </div>
          <div class="step">
            <span class="step-number">2</span>
            <span class="step-text">複製獲得的 6 位數驗證碼</span>
          </div>
          <div class="step">
            <span class="step-number">3</span>
            <span class="step-text">在下方輸入驗證碼完成驗證</span>
          </div>
        </div>

        <!-- 輸入表單 -->
        <form @submit.prevent="handleVerify" class="form">
          <div class="input-group">
            <label for="code">驗證碼</label>
            <input
              id="code"
              v-model="verificationCode"
              type="text"
              placeholder="輸入 6 位數驗證碼"
              :disabled="isVerifying || isVerifyingByOAuth"
              required
              autofocus
            />
          </div>

          <!-- 初始化讀取異常（通常是 IndexedDB 暫時不可用） -->
          <div v-if="initErrorMessage" class="init-error-message">
            <div>{{ initErrorMessage }}</div>
            <button
              type="button"
              class="retry-btn"
              :disabled="isVerifying || isVerifyingByOAuth"
              @click="handleRetryInit"
            >
              重試讀取
            </button>
          </div>

          <!-- 錯誤訊息 -->
          <div v-if="errorMessage" class="error-message">
            <div>{{ errorMessage }}</div>
            <div v-if="oauthChecks && oauthChecks.length" class="oauth-checks-detail">
              <div
                v-for="check in oauthChecks"
                :key="check.guildId"
                class="oauth-check-row"
                :class="{ passed: check.passed, failed: !check.passed }"
              >
                <span class="check-icon">{{ check.passed ? '✅' : '❌' }}</span>
                <span class="check-guild">{{ check.guildName || check.guildId }}</span>
                <span class="check-reason">
                  <template v-if="check.reason === 'not_in_guild'">未加入此社群</template>
                  <template v-else-if="check.reason === 'missing_role'">缺少必要身分組</template>
                  <template v-else-if="check.reason === 'cannot_read_member'">無法驗證身分組（Bot 不需在該社群）</template>
                  <template v-else-if="check.reason === 'cannot_read_guilds'">無法讀取社群列表（請確認已授權）</template>
                  <template v-else>驗證通過</template>
                </span>
              </div>
            </div>
          </div>

          <!-- 剩餘嘗試次數 -->
          <div v-if="remainingAttempts < 5" class="attempts-warning">
            剩餘嘗試次數：{{ remainingAttempts }}/5
          </div>

          <!-- 提交按鈕 -->
          <button
            type="submit"
            class="submit-btn"
            :disabled="isVerifying || isVerifyingByOAuth || remainingAttempts === 0"
          >
            <span v-if="!isVerifying">驗證</span>
            <span v-else>驗證中...</span>
          </button>
        </form>

        <!-- Discord OAuth 登入 -->
        <div class="oauth-section">
          <div class="divider">
            <span class="divider-text">或</span>
          </div>

          <button
            type="button"
            class="discord-btn"
            :disabled="isVerifying || isVerifyingByOAuth"
            @click="handleDiscordOAuth"
          >
            <svg class="discord-logo" viewBox="0 0 24 24" fill="currentColor">
              <path d="M20.317 4.37a19.8 19.8 0 0 0-4.885-1.515.07.07 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.6 12.6 0 0 0-.617-1.25.08.08 0 0 0-.079-.037A19.74 19.74 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.08.08 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.08.08 0 0 0 .084-.028 14.1 14.1 0 0 0 1.226-1.994.08.08 0 0 0-.041-.106 13.1 13.1 0 0 1-1.872-.892.08.08 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.07.07 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.07.07 0 0 1 .078.01q.18.149.372.292a.08.08 0 0 1-.006.127 12.3 12.3 0 0 1-1.873.892.08.08 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.08.08 0 0 0 .084.028 19.84 19.84 0 0 0 6.002-3.03.08.08 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.06.06 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
            </svg>
            <span v-if="!isVerifyingByOAuth">使用 Discord 登入</span>
            <span v-else>驗證中...</span>
          </button>

          <p class="oauth-desc">
            授權後自動檢查你在夜宵攤與游鹿小島的社群身分組權限
          </p>
        </div>

        <!-- 幫助連結 -->
        <div class="help">
          <p>如何獲取驗證碼？</p>
          <div class="help-steps">
            <p class="help-step">
              <strong>1.</strong> 加入 Discord 伺服器（夜宵攤或游鹿小島）
            </p>
            <p class="help-step">
              <strong>2.</strong> 在任意頻道輸入指令：<code>/aguaphone</code>
            </p>
            <p class="help-step">
              <strong>3.</strong> Bot 會私訊你 6 位數驗證碼
            </p>
            <p class="help-step">
              <strong>4.</strong> 在此頁面輸入驗證碼完成驗證
            </p>
          </div>
          <p class="help-description">
            本 203 號阿瓜雲小手機目前僅在夜宵攤與游鹿小島發布
          </p>
          <p class="help-description">
            如果未加入夜宵攤，可以進入游鹿小島：
          </p>
          <a
            href="https://discord.gg/deerer"
            target="_blank"
            rel="noopener noreferrer"
          >
            加入游鹿小島 Discord
          </a>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useAuthStore } from '@/stores/auth'
import type { GuildCheckResult } from '@/types/auth'

const authStore = useAuthStore()

const verificationCode = ref('')
const isVerifying = ref(false)
const errorMessage = ref('')
const isVerifyingByOAuth = ref(false)
const oauthChecks = ref<GuildCheckResult[] | null>(null)

const remainingAttempts = computed(() => authStore.remainingAttempts)
const initErrorMessage = computed(() => authStore.initError)

async function handleVerify() {
  if (!verificationCode.value) {
    errorMessage.value = '請輸入驗證碼'
    return
  }

  isVerifying.value = true
  errorMessage.value = ''

  // 如果不是純 6 位數字，嘗試好友內置驗證碼或管理員身分代碼
  const input = verificationCode.value.trim()
  if (!/^\d{6}$/.test(input)) {
    const friendResult = await authStore.friendBypass(input)
    if (friendResult.success) {
      errorMessage.value = ''
      setTimeout(() => { window.location.reload() }, 500)
      isVerifying.value = false
      return
    }
    const adminResult = await authStore.adminBypass(input)
    if (adminResult.success) {
      errorMessage.value = ''
      setTimeout(() => { window.location.reload() }, 500)
      isVerifying.value = false
      return
    }
    // 不是管理員密碼，提示格式錯誤
    errorMessage.value = '驗證碼必須是 6 位數'
    isVerifying.value = false
    return
  }

  const result = await authStore.verifyCode(input)

  isVerifying.value = false

  if (result.success) {
    errorMessage.value = ''
    setTimeout(() => {
      window.location.reload()
    }, 500)
  } else {
    errorMessage.value = result.message
    if (remainingAttempts.value === 0) {
      errorMessage.value = '嘗試次數已用完，請重新整理頁面'
    }
    verificationCode.value = ''
  }
}

async function handleDiscordOAuth() {
  isVerifyingByOAuth.value = true
  errorMessage.value = ''
  oauthChecks.value = null

  try {
    const result = await authStore.verifyByDiscord()
    if (result.success) {
      errorMessage.value = ''
      oauthChecks.value = null
      setTimeout(() => {
        window.location.reload()
      }, 500)
    } else {
      errorMessage.value = result.message
      if (result.oauthResult?.checks) {
        oauthChecks.value = result.oauthResult.checks
      }
    }
  } catch (e) {
    errorMessage.value = 'Discord 驗證過程發生錯誤，請重試'
    console.error('[AuthScreen] Discord OAuth 錯誤:', e)
  } finally {
    isVerifyingByOAuth.value = false
  }
}

async function handleRetryInit() {
  isVerifying.value = true
  errorMessage.value = ''
  try {
    await authStore.retryInitialize()
  } finally {
    isVerifying.value = false
  }
}
</script>

<style scoped lang="scss">
.auth-screen {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #7dd3a8;
  padding: 20px;
  padding-top: max(20px, var(--safe-top, 0px));
  overflow-y: auto;
}

.auth-container {
  width: 100%;
  max-width: 480px;
  margin: auto;
}

.auth-card {
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(10px);
  border-radius: 24px;
  padding: 40px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  max-height: calc(100vh - 40px);
  overflow-y: auto;
  
  /* 自定義滾動條 */
  &::-webkit-scrollbar {
    width: 8px;
  }
  
  &::-webkit-scrollbar-track {
    background: rgba(0, 0, 0, 0.05);
    border-radius: 4px;
  }
  
  &::-webkit-scrollbar-thumb {
    background: rgba(125, 211, 168, 0.5);
    border-radius: 4px;
    
    &:hover {
      background: rgba(125, 211, 168, 0.7);
    }
  }
}

/* 響應式調整 */
@media (max-height: 700px) {
  .auth-card {
    padding: 30px;
  }
  
  .logo {
    width: 48px !important;
    height: 48px !important;
    margin-bottom: 16px !important;
  }
  
  .title {
    font-size: 24px !important;
    margin-bottom: 8px !important;
  }
  
  .subtitle {
    margin-bottom: 20px !important;
  }
  
  .steps {
    padding: 16px !important;
    margin-bottom: 20px !important;
  }
}

@media (max-height: 600px) {
  .auth-card {
    padding: 20px;
  }
  
  .steps {
    display: none; /* 小屏幕隱藏步驟說明 */
  }
}

.logo {
  width: 64px;
  height: 64px;
  margin: 0 auto 24px;
  color: #7dd3a8;

  svg {
    width: 100%;
    height: 100%;
  }
}

.title {
  font-size: 28px;
  font-weight: 700;
  text-align: center;
  color: #1a202c;
  margin: 0 0 8px;
}

.subtitle {
  font-size: 14px;
  text-align: center;
  color: #718096;
  margin: 0 0 32px;
}

.steps {
  background: #f7fafc;
  border-radius: 12px;
  padding: 20px;
  margin-bottom: 32px;
}

.step {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;

  &:last-child {
    margin-bottom: 0;
  }
}

.step-number {
  flex-shrink: 0;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #7dd3a8;
  color: white;
  border-radius: 50%;
  font-size: 12px;
  font-weight: 600;
}

.step-text {
  font-size: 13px;
  color: #4a5568;
  line-height: 1.5;

  code {
    background: #e2e8f0;
    padding: 2px 6px;
    border-radius: 4px;
    font-family: 'Courier New', monospace;
    font-size: 12px;
  }
}

.form {
  margin-bottom: 24px;
}

.input-group {
  margin-bottom: 20px;

  label {
    display: block;
    font-size: 14px;
    font-weight: 600;
    color: #2d3748;
    margin-bottom: 8px;
  }

  input {
    width: 100%;
    padding: 12px 16px;
    font-size: 15px;
    border: 2px solid #e2e8f0;
    border-radius: 12px;
    background: white;
    transition: all 0.2s;

    &:focus {
      outline: none;
      border-color: #7dd3a8;
      box-shadow: 0 0 0 3px rgba(125, 211, 168, 0.1);
    }

    &:disabled {
      background: #f7fafc;
      cursor: not-allowed;
    }

    &::placeholder {
      color: #a0aec0;
    }
  }
}

.error-message {
  padding: 12px 16px;
  background: #fff5f5;
  border: 1px solid #fc8181;
  border-radius: 8px;
  color: #c53030;
  font-size: 14px;
  margin-bottom: 16px;
}

.init-error-message {
  padding: 12px 16px;
  background: #fffaf0;
  border: 1px solid #f6ad55;
  border-radius: 8px;
  color: #9c4221;
  font-size: 14px;
  margin-bottom: 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.retry-btn {
  border: 1px solid #f6ad55;
  background: white;
  color: #9c4221;
  padding: 6px 10px;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
}

.attempts-warning {
  padding: 12px 16px;
  background: #fffaf0;
  border: 1px solid #f6ad55;
  border-radius: 8px;
  color: #c05621;
  font-size: 14px;
  margin-bottom: 16px;
  text-align: center;
}

.submit-btn {
  width: 100%;
  padding: 14px;
  font-size: 16px;
  font-weight: 600;
  color: white;
  background: #7dd3a8;
  border: none;
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.2s;

  &:hover:not(:disabled) {
    transform: translateY(-2px);
    box-shadow: 0 8px 20px rgba(125, 211, 168, 0.4);
    background: #6bc299;
  }

  &:active:not(:disabled) {
    transform: translateY(0);
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}

.help {
  text-align: center;
  padding-top: 24px;
  border-top: 1px solid #e2e8f0;

  p {
    font-size: 14px;
    color: #718096;
    margin: 0 0 8px;
    font-weight: 600;
  }

  .help-steps {
    background: #f7fafc;
    border-radius: 12px;
    padding: 16px;
    margin: 16px 0;
    text-align: left;
  }

  .help-step {
    font-size: 13px;
    color: #4a5568;
    line-height: 1.6;
    margin: 0 0 10px;
    font-weight: 400;

    &:last-child {
      margin-bottom: 0;
    }

    strong {
      color: #7dd3a8;
      font-weight: 700;
      margin-right: 4px;
    }

    code {
      background: #e2e8f0;
      padding: 2px 8px;
      border-radius: 4px;
      font-family: 'Courier New', monospace;
      font-size: 13px;
      color: #7dd3a8;
      font-weight: 600;
    }
  }

  .help-description {
    font-size: 13px;
    color: #4a5568;
    line-height: 1.6;
    margin: 0 0 6px;
    font-weight: 400;
  }

  a {
    display: inline-block;
    font-size: 14px;
    font-weight: 600;
    color: white;
    text-decoration: none;
    margin-top: 12px;
    padding: 10px 20px;
    background: #7dd3a8;
    border-radius: 8px;
    transition: all 0.2s;

    &:hover {
      background: #6bc299;
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(125, 211, 168, 0.4);
    }
  }
}

// ── Discord OAuth 區塊樣式 ──

.oauth-section {
  margin-top: 0;
  margin-bottom: 24px;
}

.divider {
  display: flex;
  align-items: center;
  margin: 20px 0;

  &::before,
  &::after {
    content: '';
    flex: 1;
    height: 1px;
    background: #e2e8f0;
  }

  .divider-text {
    padding: 0 16px;
    font-size: 13px;
    color: #a0aec0;
    font-weight: 500;
  }
}

.discord-btn {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 14px;
  font-size: 16px;
  font-weight: 600;
  color: white;
  background: #5865f2;
  border: none;
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.2s;
  margin-bottom: 10px;

  .discord-logo {
    width: 24px;
    height: 24px;
    flex-shrink: 0;
  }

  &:hover:not(:disabled) {
    transform: translateY(-2px);
    box-shadow: 0 8px 20px rgba(88, 101, 242, 0.4);
    background: #4752c4;
  }

  &:active:not(:disabled) {
    transform: translateY(0);
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}

.oauth-desc {
  font-size: 12px;
  color: #a0aec0;
  text-align: center;
  margin: 0;
  font-weight: 400;
  line-height: 1.5;
}

.oauth-checks-detail {
  margin-top: 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.oauth-check-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  padding: 6px 10px;
  border-radius: 6px;

  &.passed {
    background: rgba(72, 187, 120, 0.1);
    .check-reason {
      color: #276749;
    }
  }

  &.failed {
    background: rgba(245, 101, 101, 0.1);
    .check-reason {
      color: #9b2c2c;
    }
  }

  .check-icon {
    flex-shrink: 0;
    font-size: 14px;
  }

  .check-guild {
    font-weight: 600;
    color: #2d3748;
    flex-shrink: 0;
  }

  .check-reason {
    color: #718096;
    line-height: 1.4;
  }
}
</style>
