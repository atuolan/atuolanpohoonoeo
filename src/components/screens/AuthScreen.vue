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
              :disabled="isVerifying"
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
              :disabled="isVerifying"
              @click="handleRetryInit"
            >
              重試讀取
            </button>
          </div>

          <!-- 錯誤訊息 -->
          <div v-if="errorMessage" class="error-message">
            {{ errorMessage }}
          </div>

          <!-- 剩餘嘗試次數 -->
          <div v-if="remainingAttempts < 5" class="attempts-warning">
            剩餘嘗試次數：{{ remainingAttempts }}/5
          </div>

          <!-- 提交按鈕 -->
          <button
            type="submit"
            class="submit-btn"
            :disabled="isVerifying || remainingAttempts === 0"
          >
            <span v-if="!isVerifying">驗證</span>
            <span v-else>驗證中...</span>
          </button>
        </form>

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

const authStore = useAuthStore()

const verificationCode = ref('')
const isVerifying = ref(false)
const errorMessage = ref('')

const remainingAttempts = computed(() => authStore.remainingAttempts)
const initErrorMessage = computed(() => authStore.initError)

async function handleVerify() {
  if (!verificationCode.value) {
    errorMessage.value = '請輸入驗證碼'
    return
  }

  isVerifying.value = true
  errorMessage.value = ''

  // 如果不是純 6 位數字，嘗試管理員身分代碼
  const input = verificationCode.value.trim()
  if (!/^\d{6}$/.test(input)) {
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
</style>
