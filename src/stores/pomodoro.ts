/**
 * 番茄鐘 Store
 * 管理任務列表、計時器狀態、AI 互動
 */

import { getAPIClient } from '@/api/OpenAICompatible'
import type { APIMessage } from '@/api/OpenAICompatible'
import {
  getEncouragementPromptCountdown,
  getEncouragementPromptStopwatch,
  getPokePromptCountdown,
  getPokePromptStopwatch,
  getResumePrompt,
  POKE_LIMIT_MESSAGE,
} from '@/data/defaultPrompts/pomodoro'
import type {
  PomodoroInteraction,
  PomodoroTask,
} from '@/types/pomodoro'
import { createPomodoroTask } from '@/types/pomodoro'
import { defineStore } from 'pinia'
import { computed, ref, shallowRef } from 'vue'

export const usePomodoroStore = defineStore('pomodoro', () => {
  // ===== 任務列表（持久化到 localStorage） =====
  const tasks = ref<PomodoroTask[]>([])

  // ===== 當前 Session 狀態（純記憶體） =====
  const activeTask = shallowRef<PomodoroTask | null>(null)
  const elapsedSeconds = ref(0)
  const remainingSeconds = ref(0)
  const isPaused = ref(true)
  const pokeCount = ref(0)
  const isInterrupted = ref(false)
  const sessionHistory = ref<PomodoroInteraction[]>([])

  // AI 訊息氣泡
  const aiMessage = ref('')
  const aiMessageVisible = ref(false)
  const aiLoading = ref(false)

  // 計時器 interval
  let timerInterval: ReturnType<typeof setInterval> | null = null
  // 防止鼓勵和互動撞車的 timeout
  let interruptTimeout: ReturnType<typeof setTimeout> | null = null

  // ===== Getters =====

  const isRunning = computed(() => activeTask.value !== null && !isPaused.value)

  const displayTime = computed(() => {
    const secs = activeTask.value?.mode === 'countdown'
      ? remainingSeconds.value
      : elapsedSeconds.value
    const h = Math.floor(secs / 3600)
    const m = Math.floor((secs % 3600) / 60)
    const s = secs % 60
    if (h > 0) {
      return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    }
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  })

  const elapsedMinutes = computed(() => Math.floor(elapsedSeconds.value / 60))

  // ===== 持久化 =====

  function loadTasks() {
    try {
      const raw = localStorage.getItem('aguaphone_pomodoro_tasks')
      if (raw) tasks.value = JSON.parse(raw)
    } catch (e) {
      console.error('[Pomodoro] 載入任務失敗:', e)
    }
  }

  function saveTasks() {
    try {
      localStorage.setItem('aguaphone_pomodoro_tasks', JSON.stringify(tasks.value))
    } catch (e) {
      console.error('[Pomodoro] 儲存任務失敗:', e)
    }
  }

  // ===== 任務 CRUD =====

  function addTask(
    name: string,
    mode: 'countdown' | 'stopwatch',
    durationMinutes: number,
    settings?: Partial<PomodoroTask['settings']>,
  ) {
    const task = createPomodoroTask(name, mode, durationMinutes, settings)
    tasks.value.push(task)
    saveTasks()
    return task
  }

  function removeTask(id: string) {
    tasks.value = tasks.value.filter(t => t.id !== id)
    saveTasks()
  }

  function updateTaskSettings(id: string, settings: Partial<PomodoroTask['settings']>) {
    const task = tasks.value.find(t => t.id === id)
    if (task) {
      Object.assign(task.settings, settings)
      saveTasks()
    }
  }

  // ===== 計時器控制 =====

  function startSession(task: PomodoroTask) {
    // 清理舊 session
    stopTimer()
    activeTask.value = task
    elapsedSeconds.value = 0
    pokeCount.value = 0
    isInterrupted.value = false
    sessionHistory.value = []
    aiMessage.value = ''
    aiMessageVisible.value = false

    if (task.mode === 'countdown') {
      remainingSeconds.value = task.durationMinutes * 60
    } else {
      remainingSeconds.value = 0
    }

    isPaused.value = true // 等用戶按開始
  }

  function startTimer() {
    if (timerInterval || !activeTask.value) return

    // 如果是從暫停恢復且已經有進度，觸發 AI resume
    if (isPaused.value && elapsedSeconds.value > 0) {
      requestAIReply('resume')
    }

    isPaused.value = false
    isInterrupted.value = false

    timerInterval = setInterval(() => {
      if (!activeTask.value) return

      if (activeTask.value.mode === 'countdown') {
        remainingSeconds.value--
      } else {
        remainingSeconds.value++
      }
      elapsedSeconds.value++

      // 定時鼓勵檢查
      const interval = activeTask.value.settings.encouragementIntervalMin
      if (
        interval > 0
        && elapsedSeconds.value > 0
        && elapsedSeconds.value % (interval * 60) === 0
        && !isInterrupted.value
      ) {
        requestAIReply('encouragement')
      }

      // 倒計時結束
      if (activeTask.value.mode === 'countdown' && remainingSeconds.value <= 0) {
        stopTimer()
      }
    }, 1000)
  }

  function pauseTimer() {
    isInterrupted.value = true
    isPaused.value = true
    if (timerInterval) {
      clearInterval(timerInterval)
      timerInterval = null
    }
  }

  function stopTimer() {
    if (timerInterval) {
      clearInterval(timerInterval)
      timerInterval = null
    }
    if (interruptTimeout) {
      clearTimeout(interruptTimeout)
      interruptTimeout = null
    }
    isPaused.value = true
  }

  function giveUp() {
    stopTimer()
    activeTask.value = null
  }

  /** 倒計時結束時是否已完成 */
  const isCompleted = computed(() => {
    return (
      activeTask.value?.mode === 'countdown'
      && remainingSeconds.value <= 0
      && elapsedSeconds.value > 0
    )
  })

  // ===== AI 互動 =====

  function handlePoke() {
    if (isPaused.value || !timerInterval || !activeTask.value) return

    isInterrupted.value = true
    pokeCount.value++

    const limit = activeTask.value.settings.pokeLimit
    if (pokeCount.value > limit) {
      aiMessage.value = POKE_LIMIT_MESSAGE
      aiMessageVisible.value = true
    } else {
      requestAIReply('poke')
    }
  }

  async function requestAIReply(promptType: 'encouragement' | 'poke' | 'resume') {
    const task = activeTask.value
    if (!task || !task.settings.boundCharId) return

    // 取得角色資料（延遲 import 避免循環依賴）
    const { useCharactersStore } = await import('@/stores/characters')
    const { useSettingsStore } = await import('@/stores/settings')
    const { useUserStore } = await import('@/stores/user')

    const charactersStore = useCharactersStore()
    const settingsStore = useSettingsStore()
    const userStore = useUserStore()

    const character = charactersStore.characters.find(c => c.id === task.settings.boundCharId)
    if (!character) return

    const charName = character.nickname || character.data.name

    // 取得用戶人設（優先使用任務綁定的，否則用當前預設）
    const selectedPersonaId = task.settings.userPersonaId
    const persona = selectedPersonaId
      ? userStore.personas.find((p: { id: string }) => p.id === selectedPersonaId)
      : null
    const userName = persona?.name || userStore.currentName || '用戶'
    const userDesc = persona?.description || ''
    const elapsed = Math.floor(elapsedSeconds.value / 60)
    const remaining = Math.round(remainingSeconds.value / 60)

    // 構建 prompt
    let userPrompt: string
    switch (promptType) {
      case 'encouragement':
        userPrompt = task.mode === 'countdown'
          ? getEncouragementPromptCountdown(charName, task.name, elapsed, remaining)
          : getEncouragementPromptStopwatch(charName, task.name, elapsed)
        break
      case 'poke':
        userPrompt = task.mode === 'countdown'
          ? getPokePromptCountdown(charName, task.name, elapsed, remaining, pokeCount.value)
          : getPokePromptStopwatch(charName, task.name, elapsed, pokeCount.value)
        break
      case 'resume':
        userPrompt = getResumePrompt(charName, task.name)
        break
    }

    // 附加互動歷史
    if (sessionHistory.value.length > 0) {
      const historyText = sessionHistory.value.map(item => {
        return item.role === 'user'
          ? `[${userName}的動作：${item.content}]`
          : `[${charName}的回覆：${item.content}]`
      }).join('\n')
      userPrompt += `\n\n【本次專注期間的簡短互動歷史】\n${historyText}\n\n請基於以上歷史，繼續你的下一句回應。`
    }

    // 構建 system prompt
    const charPersona = character.data.description || character.data.personality || ''
    let systemPrompt = `你正在扮演角色。你的名字是${charName}。`
    if (charPersona) systemPrompt += `\n\n【你的角色設定】\n${charPersona}`
    systemPrompt += `\n\n【用戶資訊】\n用戶的名字是${userName}。`
    if (userDesc) systemPrompt += `\n用戶的描述：${userDesc}`

    const messages: APIMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ]

    aiLoading.value = true
    aiMessageVisible.value = true
    aiMessage.value = ''

    try {
      const client = getAPIClient()

      const result = await client.generate({
        messages,
        settings: {
          maxContextLength: 8000,
          maxResponseLength: 500,
          topP: 1,
          topK: 0,
          temperature: 0.8,
          frequencyPenalty: 0,
          presencePenalty: 0,
          repetitionPenalty: 1,
          stopSequences: [],
          streaming: false,
          useStreamingWindow: false,
        },
        apiSettings: settingsStore.api as any,
      })

      const reply = result.content.trim()
      aiMessage.value = reply

      // 記錄互動歷史（FIFO，最多 8 條）
      sessionHistory.value.push(
        { type: promptType, role: 'user', content: promptType, timestamp: Date.now() },
        { type: promptType, role: 'assistant', content: reply, timestamp: Date.now() },
      )
      if (sessionHistory.value.length > 8) {
        sessionHistory.value.splice(0, 2)
      }

      // poke 後 10 秒恢復 isInterrupted
      if (promptType === 'poke') {
        if (interruptTimeout) clearTimeout(interruptTimeout)
        interruptTimeout = setTimeout(() => {
          isInterrupted.value = false
        }, 10000)
      }
    } catch (e) {
      console.error('[Pomodoro] AI 回覆失敗:', e)
      aiMessage.value = '取得回應失敗，請檢查網路或 API 設定。'
    } finally {
      aiLoading.value = false
    }
  }

  // ===== 初始化 =====
  loadTasks()

  return {
    // 任務列表
    tasks,
    addTask,
    removeTask,
    updateTaskSettings,

    // Session 狀態
    activeTask,
    elapsedSeconds,
    remainingSeconds,
    isPaused,
    pokeCount,
    isCompleted,
    isRunning,
    displayTime,
    elapsedMinutes,

    // 計時器控制
    startSession,
    startTimer,
    pauseTimer,
    stopTimer,
    giveUp,

    // AI 互動
    aiMessage,
    aiMessageVisible,
    aiLoading,
    handlePoke,
  }
})
