<script setup lang="ts">
import PomodoroSettingsPanel from '@/components/panels/PomodoroSettingsPanel.vue'
import { useAmbientSound, AMBIENT_CHANNELS } from '@/composables/useAmbientSound'
import { useCharactersStore } from '@/stores/characters'
import { usePomodoroStore } from '@/stores/pomodoro'
import {
  ChevronLeft,
  Pause,
  Play,
  Settings,
  Volume2,
  X,
} from 'lucide-vue-next'
import { computed, onBeforeUnmount, ref, watch } from 'vue'

const emit = defineEmits<{
  back: []
  complete: []
}>()

const pomodoroStore = usePomodoroStore()
const charactersStore = useCharactersStore()

// 設定面板
const showSettings = ref(false)

// 白噪音
const { channels, toggleChannel, setVolume, stopAll: stopAllAmbient, isAnyPlaying } = useAmbientSound()
const showAmbientPanel = ref(false)

// 綁定角色資訊
const boundChar = computed(() => {
  const charId = pomodoroStore.activeTask?.settings.boundCharId
  if (!charId) return null
  return charactersStore.characters.find(c => c.id === charId) ?? null
})

const charAvatar = computed(() => {
  return boundChar.value?.avatar || ''
})

const charName = computed(() => {
  if (!boundChar.value) return ''
  return boundChar.value.nickname || boundChar.value.data.name
})

// 專注背景（優先自訂，否則用預設）
const DEFAULT_BG = '/audio/ambient/pomodoro-default-bg.jpg'
const focusBg = computed(() => {
  return pomodoroStore.activeTask?.settings.focusBackground || DEFAULT_BG
})

// 自訂顏色
const customColors = computed(() => {
  const s = pomodoroStore.activeTask?.settings
  return {
    '--pomo-timer-color': s?.timerColor || '#ffffff',
    '--pomo-text-color': s?.textColor || 'rgba(255,255,255,0.9)',
    '--pomo-button-color': s?.buttonColor || '',
  }
})

// 監聽完成狀態
watch(() => pomodoroStore.isCompleted, (completed) => {
  if (completed) {
    emit('complete')
  }
})

function handleGiveUp() {
  if (confirm('確定要放棄當前任務嗎？')) {
    pomodoroStore.giveUp()
    emit('back')
  }
}

// 離開時停止計時器
onBeforeUnmount(() => {
  // 不自動 giveUp，讓用戶可以返回繼續
})
</script>

<template>
  <div
    class="pomodoro-focus-screen"
    :style="{
      ...(focusBg ? { backgroundImage: `url(${focusBg})`, backgroundSize: 'cover', backgroundPosition: 'center' } : {}),
      ...customColors,
    }"
  >
    <!-- 背景遮罩（有背景圖時加暗） -->
    <div v-if="focusBg" class="bg-overlay" />

    <!-- 頂部導航 -->
    <div class="header">
      <button class="header-btn" @click="handleGiveUp">
        <ChevronLeft :size="22" />
      </button>
      <span class="header-title">專注中</span>
      <button class="header-btn" @click="showSettings = true">
        <Settings :size="20" />
      </button>
    </div>

    <!-- 主體內容 -->
    <div class="focus-body">
      <!-- 任務名稱 -->
      <div class="task-title">{{ pomodoroStore.activeTask?.name }}</div>

      <!-- 計時器 -->
      <div class="timer-display">{{ pomodoroStore.displayTime }}</div>

      <!-- 模式標籤 -->
      <div class="mode-label">
        {{ pomodoroStore.activeTask?.mode === 'countdown' ? '倒計時' : '正計時' }}
      </div>

      <!-- 已專注時間 -->
      <div class="elapsed-label">
        已專注 {{ pomodoroStore.elapsedMinutes }} 分鐘
      </div>
    </div>

    <!-- AI 訊息氣泡 -->
    <div class="ai-section">
      <Transition name="bubble">
        <div v-if="pomodoroStore.aiMessageVisible" class="ai-bubble">
          <p v-if="pomodoroStore.aiLoading" class="typing">
            對方正在輸入中<span class="dots"><span>.</span><span>.</span><span>.</span></span>
          </p>
          <p v-else>{{ pomodoroStore.aiMessage }}</p>
        </div>
      </Transition>

      <!-- 角色頭像（可戳） -->
      <div
        v-if="boundChar"
        class="char-avatar-wrapper"
        @click="pomodoroStore.handlePoke()"
      >
        <img
          v-if="charAvatar"
          :src="charAvatar"
          :alt="charName"
          class="char-avatar"
        />
        <div v-else class="char-avatar placeholder">
          {{ charName.charAt(0) }}
        </div>
        <span class="char-name-label">{{ charName }}</span>
      </div>
    </div>

    <!-- 底部控制 -->
    <div class="controls">
      <button class="control-btn give-up" @click="handleGiveUp">
        <X :size="24" />
      </button>

      <button
        v-if="pomodoroStore.isPaused"
        class="control-btn primary"
        @click="pomodoroStore.startTimer()"
      >
        <Play :size="28" />
      </button>
      <button
        v-else
        class="control-btn primary"
        @click="pomodoroStore.pauseTimer()"
      >
        <Pause :size="28" />
      </button>

      <button
        class="control-btn ambient-toggle"
        :class="{ active: isAnyPlaying() }"
        @click="showAmbientPanel = !showAmbientPanel"
      >
        <Volume2 :size="20" />
      </button>
    </div>

    <!-- 白噪音面板（底部滑出 overlay） -->
    <Transition name="slide-up">
      <div v-if="showAmbientPanel" class="ambient-overlay" @click.self="showAmbientPanel = false">
        <div class="ambient-sheet">
          <div class="sheet-handle" />
          <div class="sheet-header">
            <h3>環境音效</h3>
            <span class="playing-count" v-if="isAnyPlaying()">
              {{ AMBIENT_CHANNELS.filter(c => channels[c.id]?.playing).length }} 個播放中
            </span>
          </div>
          <div class="sheet-body">
            <div class="ambient-grid">
              <button
                v-for="ch in AMBIENT_CHANNELS"
                :key="ch.id"
                class="ambient-chip"
                :class="{ active: channels[ch.id]?.playing }"
                @click="toggleChannel(ch.id)"
              >
                <span class="chip-emoji">{{ ch.emoji }}</span>
                <span class="chip-label">{{ ch.label }}</span>
              </button>
            </div>
            <!-- 正在播放的頻道音量控制 -->
            <div v-if="AMBIENT_CHANNELS.some(c => channels[c.id]?.playing)" class="volume-section">
              <div
                v-for="ch in AMBIENT_CHANNELS.filter(c => channels[c.id]?.playing)"
                :key="'vol-' + ch.id"
                class="volume-row"
              >
                <span class="vol-label">{{ ch.emoji }} {{ ch.label }}</span>
                <input
                  type="range"
                  min="0"
                  max="100"
                  :value="Math.round((channels[ch.id]?.volume ?? 0.5) * 100)"
                  class="vol-slider"
                  @input="(e: Event) => setVolume(ch.id, parseInt((e.target as HTMLInputElement).value) / 100)"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </Transition>

    <!-- 設定面板 -->
    <PomodoroSettingsPanel
      v-if="showSettings"
      @close="showSettings = false"
    />
  </div>
</template>

<style lang="scss" scoped>
.pomodoro-focus-screen {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--color-background, #fff);
  color: var(--color-text, #333);
  position: relative;
  overflow: hidden;

  // 裝飾性背景
  &::before {
    content: '';
    position: absolute;
    top: -30%;
    right: -20%;
    width: 60%;
    height: 60%;
    background: radial-gradient(circle, var(--color-primary-light, #FFB6C8) 0%, transparent 70%);
    opacity: 0.15;
    pointer-events: none;
    z-index: 0;
  }

  &::after {
    content: '';
    position: absolute;
    bottom: -20%;
    left: -15%;
    width: 50%;
    height: 50%;
    background: radial-gradient(circle, var(--color-secondary, #FFD1DC) 0%, transparent 70%);
    opacity: 0.12;
    pointer-events: none;
    z-index: 0;
  }
}

.bg-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.35);
  backdrop-filter: blur(2px);
  z-index: 0;
}

// 有自訂背景圖時隱藏裝飾性漸層
.pomodoro-focus-screen[style*="background-image"] {
  &::before, &::after { display: none; }
}

.header, .focus-body, .ai-section, .controls {
  position: relative;
  z-index: 1;
}

.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  padding-top: max(12px, var(--safe-top, 0px));

  .header-btn {
    background: var(--color-surface, rgba(255,255,255,0.6));
    backdrop-filter: blur(8px);
    border: 1px solid var(--color-border, rgba(0,0,0,0.06));
    color: var(--color-text, #333);
    padding: 8px;
    border-radius: 12px;
    cursor: pointer;
    display: flex;
    transition: all 0.15s;
    &:hover { background: var(--color-surface-hover, rgba(0, 0, 0, 0.05)); }
  }

  .header-title {
    font-size: 15px;
    font-weight: 500;
    color: var(--color-text-secondary, #888);
  }
}

// 有背景圖時 header 按鈕樣式
.pomodoro-focus-screen[style*="background-image"] {
  .header .header-btn {
    background: rgba(0, 0, 0, 0.3);
    backdrop-filter: blur(8px);
    border-color: rgba(255, 255, 255, 0.1);
    color: #fff;
  }
  .header .header-title { color: rgba(255, 255, 255, 0.8); }
  .controls .control-btn.give-up { color: rgba(255, 255, 255, 0.7); }
  .controls .control-btn.ambient-toggle { color: rgba(255, 255, 255, 0.7); }
  .char-name-label { color: rgba(255, 255, 255, 0.6); }
}

.focus-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 0 20px;
  min-height: 0;
  overflow: hidden;
}

.task-title {
  font-size: 20px;
  font-weight: 500;
  margin-bottom: 24px;
  color: var(--pomo-text-color, var(--color-text-secondary, #666));
}

.timer-display {
  font-size: 76px;
  font-weight: 700;
  line-height: 1;
  letter-spacing: -3px;
  color: var(--pomo-timer-color, var(--color-text, #333));
  font-variant-numeric: tabular-nums;
  text-shadow: 0 2px 20px rgba(0, 0, 0, 0.3);
}

.mode-label {
  font-size: 14px;
  color: var(--pomo-text-color, var(--color-text-muted, #aaa));
  margin-top: 10px;
  opacity: 0.8;
}

.elapsed-label {
  font-size: 13px;
  color: var(--pomo-text-color, var(--color-text-muted, #bbb));
  margin-top: 12px;
  background: rgba(0, 0, 0, 0.35);
  padding: 4px 14px;
  border-radius: 20px;
  backdrop-filter: blur(4px);
}

// AI 互動區域
.ai-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 0 20px 16px;
  gap: 12px;
  flex-shrink: 0;
}

.ai-bubble {
  background: var(--color-surface, #f0f0f0);
  border: 1px solid var(--color-border, rgba(0,0,0,0.06));
  border-radius: 16px;
  padding: 12px 18px;
  max-width: 300px;
  max-height: 120px;
  overflow-y: auto;
  text-align: center;
  font-size: 14px;
  line-height: 1.5;
  color: var(--color-text, #333);
  box-shadow: 0 4px 16px var(--color-shadow, rgba(0, 0, 0, 0.06));
  position: relative;

  &::after {
    content: '';
    position: absolute;
    bottom: -8px;
    left: 50%;
    transform: translateX(-50%);
    border-left: 8px solid transparent;
    border-right: 8px solid transparent;
    border-top: 8px solid var(--color-surface, #f0f0f0);
  }

  p { margin: 0; }

  .typing {
    .dots span {
      animation: blink 1.4s infinite;
      &:nth-child(2) { animation-delay: 0.2s; }
      &:nth-child(3) { animation-delay: 0.4s; }
    }
  }
}

@keyframes blink {
  0%, 20% { opacity: 0; }
  50% { opacity: 1; }
  100% { opacity: 0; }
}

.bubble-enter-active { transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1); }
.bubble-leave-active { transition: all 0.2s ease; }
.bubble-enter-from { opacity: 0; transform: translateY(10px) scale(0.95); }
.bubble-leave-to { opacity: 0; transform: translateY(5px) scale(0.98); }

.char-avatar-wrapper {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  cursor: pointer;
  transition: transform 0.15s;

  &:active { transform: scale(0.92); }
}

.char-avatar {
  width: 52px;
  height: 52px;
  border-radius: 50%;
  object-fit: cover;
  border: 2px solid var(--color-primary-light, #eee);
  box-shadow: 0 2px 12px var(--color-shadow, rgba(0,0,0,0.08));

  &.placeholder {
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--color-primary, #6366f1);
    color: #fff;
    font-size: 20px;
    font-weight: 600;
    border-color: var(--color-primary, #6366f1);
  }
}

.char-name-label {
  font-size: 11px;
  color: var(--color-text-muted, #999);
}

// 底部控制
.controls {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 32px;
  padding: 20px 0 calc(20px + env(safe-area-inset-bottom));
  flex-shrink: 0;
}

.control-btn {
  background: none;
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  transition: all 0.15s;

  &.give-up {
    width: 44px;
    height: 44px;
    color: var(--color-text-muted, #999);
    &:hover { background: rgba(0, 0, 0, 0.05); color: var(--color-error, #ef4444); }
  }

  &.primary {
    width: 64px;
    height: 64px;
    background: var(--pomo-button-color, var(--color-primary, #6366f1));
    color: #fff;
    box-shadow: 0 6px 24px rgba(0, 0, 0, 0.25);
    &:hover { transform: scale(1.06); }
    &:active { transform: scale(0.95); }
  }

  &.ambient-toggle {
    width: 44px;
    height: 44px;
    color: var(--color-text-muted, #999);
    &.active { color: var(--color-primary, #6366f1); }
    &:hover { background: rgba(0, 0, 0, 0.05); }
  }
}

// 白噪音 overlay
.ambient-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.3);
  z-index: 100;
  display: flex;
  align-items: flex-end;
  justify-content: center;
}

.ambient-sheet {
  background: var(--color-surface, #fff);
  border-radius: 20px 20px 0 0;
  width: 100%;
  max-width: 480px;
  max-height: 55vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 -8px 30px rgba(0, 0, 0, 0.12);
}

.sheet-handle {
  width: 36px;
  height: 4px;
  background: var(--color-border, #ddd);
  border-radius: 2px;
  margin: 10px auto 0;
}

.sheet-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 20px 8px;

  h3 {
    margin: 0;
    font-size: 16px;
    font-weight: 600;
    color: var(--color-text, #333);
  }

  .playing-count {
    font-size: 12px;
    color: var(--color-primary, #6366f1);
    font-weight: 500;
  }
}

.sheet-body {
  flex: 1;
  overflow-y: auto;
  padding: 8px 16px 20px;
}

.ambient-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: center;
  margin-bottom: 8px;
}

.ambient-chip {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 12px;
  border: 1px solid var(--color-border, #e0e0e0);
  border-radius: 20px;
  background: var(--color-surface, rgba(255,255,255,0.7));
  backdrop-filter: blur(4px);
  color: var(--color-text, #555);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s;

  .chip-emoji { font-size: 14px; }

  &.active {
    background: var(--color-primary, #6366f1);
    color: #fff;
    border-color: var(--color-primary, #6366f1);
    box-shadow: 0 2px 8px var(--color-shadow, rgba(0,0,0,0.1));
  }

  &:hover:not(.active) {
    border-color: var(--color-primary, #6366f1);
  }
}

.volume-section {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--color-border, #eee);
}

.volume-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 0;

  .vol-label {
    font-size: 11px;
    color: var(--color-text-secondary, #888);
    min-width: 60px;
  }

  .vol-slider {
    flex: 1;
    height: 4px;
    -webkit-appearance: none;
    appearance: none;
    background: var(--color-border, #e0e0e0);
    border-radius: 2px;
    outline: none;

    &::-webkit-slider-thumb {
      -webkit-appearance: none;
      width: 14px;
      height: 14px;
      border-radius: 50%;
      background: var(--color-primary, #6366f1);
      cursor: pointer;
    }

    &::-moz-range-thumb {
      width: 14px;
      height: 14px;
      border-radius: 50%;
      background: var(--color-primary, #6366f1);
      border: none;
      cursor: pointer;
    }
  }
}

.slide-up-enter-active { transition: all 0.25s ease-out; }
.slide-up-leave-active { transition: all 0.2s ease-in; }
.slide-up-enter-from { opacity: 0; transform: translateY(12px); }
.slide-up-leave-to { opacity: 0; transform: translateY(8px); }
</style>
