/**
 * 俄羅斯方塊 - 音效系統
 * 使用 Web Audio API 生成遊戲音效
 */

import { ref, watch } from 'vue'
import { db, DB_STORES } from '@/db/database'

const AUDIO_SETTINGS_KEY = 'tetris-audio-settings'

interface AudioSettings {
  enabled: boolean
  volume: number
}

let audioContext: AudioContext | null = null

function getAudioContext(): AudioContext {
  if (!audioContext) {
    const AudioContextClass =
      window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    audioContext = new AudioContextClass()
  }
  return audioContext
}

export function useTetrisAudio() {
  const settings = ref<AudioSettings>({ enabled: true, volume: 0.3 })

  // 從 IndexedDB 載入設定
  ;(async () => {
    try {
      const record = await db.get<AudioSettings>(DB_STORES.SETTINGS, AUDIO_SETTINGS_KEY)
      if (record) {
        Object.assign(settings.value, record)
      } else {
        // 嘗試從 localStorage 遷移
        const old = localStorage.getItem(AUDIO_SETTINGS_KEY)
        if (old) {
          try {
            const parsed = JSON.parse(old)
            Object.assign(settings.value, parsed)
            await db.put(DB_STORES.SETTINGS, { ...settings.value }, AUDIO_SETTINGS_KEY)
            localStorage.removeItem(AUDIO_SETTINGS_KEY)
          } catch (_e) { /* ignore */ }
        }
      }
    } catch (_e) { /* ignore */ }
  })()

  watch(settings, async (val) => {
    try { await db.put(DB_STORES.SETTINGS, { ...val }, AUDIO_SETTINGS_KEY) } catch (_e) { /* ignore */ }
  }, { deep: true })

  function playTone(frequency: number, duration: number, type: OscillatorType = 'sine'): void {
    if (!settings.value.enabled) return
    try {
      const ctx = getAudioContext()
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain); gain.connect(ctx.destination)
      osc.type = type; osc.frequency.value = frequency
      gain.gain.setValueAtTime(settings.value.volume, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration)
      osc.start(ctx.currentTime); osc.stop(ctx.currentTime + duration)
    } catch (_e) { /* ignore */ }
  }

  function playMove() { playTone(400, 0.05, 'square') }
  function playRotate() { playTone(500, 0.08, 'square') }
  function playSoftDrop() { playTone(350, 0.03, 'square') }
  function playHardDrop() { playTone(200, 0.15, 'sawtooth') }
  function playLock() { playTone(300, 0.1, 'triangle') }
  function playHold() { playTone(600, 0.1, 'sine') }

  function playClear(lines: number) {
    if (!settings.value.enabled) return
    for (let i = 0; i < lines; i++) {
      setTimeout(() => playTone(600 + i * 100, 0.2, 'sine'), i * 50)
    }
  }

  function playTetris() {
    if (!settings.value.enabled) return
    ;[523, 659, 784, 1047].forEach((freq, i) => {
      setTimeout(() => playTone(freq, 0.3, 'sine'), i * 80)
    })
  }

  function playCombo(combo: number) { playTone(700 + combo * 50, 0.1, 'sine') }

  function playLevelUp() {
    if (!settings.value.enabled) return
    ;[523, 659, 784].forEach((freq, i) => {
      setTimeout(() => playTone(freq, 0.15, 'triangle'), i * 100)
    })
  }

  function playGameOver() {
    if (!settings.value.enabled) return
    ;[392, 370, 349, 330].forEach((freq, i) => {
      setTimeout(() => playTone(freq, 0.3, 'triangle'), i * 150)
    })
  }

  function toggleAudio() { settings.value.enabled = !settings.value.enabled }
  function setVolume(v: number) { settings.value.volume = Math.max(0, Math.min(1, v)) }

  return {
    settings, playMove, playRotate, playSoftDrop, playHardDrop, playLock, playHold,
    playClear, playTetris, playCombo, playLevelUp, playGameOver, toggleAudio, setVolume,
  }
}