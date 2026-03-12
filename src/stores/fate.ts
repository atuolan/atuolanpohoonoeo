/**
 * 塔羅占卜 Pinia Store
 * 管理占卜狀態、歷史記錄（IndexedDB 持久化）
 */
import { allFateCards } from '@/data/fateCards'
import { buildFateInterpretationPrompt } from '@/data/fatePrompts'
import { getDefaultFateSpread } from '@/data/fateSpreads'
import { db } from '@/db/database'
import type {
  FateCard,
  FateDrawnCard,
  FatePhase,
  FateReading,
  FateSpread,
} from '@/types/fate'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

/** IndexedDB store 名稱（使用 gameStates 的子 key） */
const FATE_HISTORY_KEY = 'fate-readings'
const MAX_READINGS = 50

export const useFateStore = defineStore('fate', () => {
  // ===== 占卜流程狀態 =====
  const phase = ref<FatePhase>('question')
  const question = ref('')
  const spread = ref<FateSpread>(getDefaultFateSpread())
  const drawnCards = ref<FateDrawnCard[]>([])
  const revealedCount = ref(0)
  const interpretation = ref('')
  const isInterpreting = ref(false)
  const interpretError = ref<string | null>(null)

  // ===== 歷史記錄 =====
  const readings = ref<FateReading[]>([])
  const isHistoryLoaded = ref(false)

  // ===== 計算屬性 =====
  const allRevealed = computed(() => revealedCount.value >= drawnCards.value.length && drawnCards.value.length > 0)

  /** 選牌階段：洗好的牌堆（背面朝上） */
  const shuffledDeck = ref<{ card: FateCard; isReversed: boolean }[]>([])
  /** 已選的牌 index（在 shuffledDeck 中的位置） */
  const pickedIndices = ref<Set<number>>(new Set())
  /** 需要選幾張 */
  const requiredPicks = computed(() => spread.value.positions.length)
  /** 已選幾張 */
  const pickedCount = computed(() => pickedIndices.value.size)

  // ===== 占卜流程方法 =====

  /** 設定階段 */
  function goToPhase(p: FatePhase) {
    phase.value = p
  }

  /** 洗牌（不自動抽牌，進入選牌階段） */
  function shuffleAndDraw() {
    const shuffled = [...allFateCards].sort(() => Math.random() - 0.5)
    shuffledDeck.value = shuffled.map(card => ({
      card,
      isReversed: Math.random() > 0.5,
    }))
    pickedIndices.value = new Set()
    drawnCards.value = []
    revealedCount.value = 0
    phase.value = 'pick'
  }

  /** 選牌：用戶點選一張牌 */
  function pickCard(deckIndex: number) {
    if (pickedIndices.value.has(deckIndex)) return
    if (pickedCount.value >= requiredPicks.value) return

    pickedIndices.value = new Set([...pickedIndices.value, deckIndex])

    // 將選中的牌加入 drawnCards
    const picked = shuffledDeck.value[deckIndex]
    const positionIndex = pickedCount.value - 1
    const position = spread.value.positions[positionIndex]
    drawnCards.value = [
      ...drawnCards.value,
      { card: picked.card, isReversed: picked.isReversed, position },
    ]

    // 選滿後自動進入翻牌階段
    if (pickedCount.value >= requiredPicks.value) {
      revealedCount.value = 0
      phase.value = 'draw'
    }
  }

  /** 翻開下一張牌 */
  function revealNextCard() {
    if (revealedCount.value < drawnCards.value.length) {
      revealedCount.value++
      if (revealedCount.value >= drawnCards.value.length) {
        phase.value = 'reveal'
      }
    }
  }

  /** 全部翻開 */
  function revealAllCards() {
    revealedCount.value = drawnCards.value.length
    phase.value = 'reveal'
  }

  /** 開始 AI 解讀（流式） */
  async function startInterpretation() {
    isInterpreting.value = true
    interpretation.value = ''
    interpretError.value = null
    phase.value = 'interpret'

    try {
      // 動態 import 避免循環依賴
      const { useSettingsStore } = await import('@/stores/settings')
      const settingsStore = useSettingsStore()
      const taskConfig = settingsStore.getAPIForTask('fate')
      const apiSettings = taskConfig.api

      if (!apiSettings?.endpoint) {
        throw new Error('請先在設定中配置 API')
      }

      const { getAPIClient } = await import('@/api/OpenAICompatible')
      const client = getAPIClient(apiSettings)

      const prompt = buildFateInterpretationPrompt(
        question.value,
        spread.value,
        drawnCards.value,
      )

      const messages = [{ role: 'user' as const, content: prompt }]

      // 使用流式生成
      const stream = client.generateStream({
        messages,
        settings: {
          temperature: 0.7,
          maxResponseLength: 32768,
          maxContextLength: 65536,
          topP: 1,
          topK: 0,
          frequencyPenalty: 0,
          presencePenalty: 0,
          repetitionPenalty: 1,
          stopSequences: [],
          streaming: true,
          useStreamingWindow: false,
        },
        apiSettings,
      })

      for await (const event of stream) {
        if (event.type === 'token' && event.token) {
          interpretation.value += event.token
        } else if (event.type === 'error') {
          interpretError.value = event.error || '解讀失敗'
          break
        }
      }

      // 儲存占卜記錄
      if (interpretation.value) {
        const reading: FateReading = {
          id: crypto.randomUUID(),
          question: question.value,
          spread: JSON.parse(JSON.stringify(spread.value)),
          drawnCards: JSON.parse(JSON.stringify(drawnCards.value)),
          interpretation: interpretation.value,
          createdAt: Date.now(),
        }
        await saveReading(reading)
      }
    } catch (err) {
      interpretError.value = err instanceof Error ? err.message : '解讀失敗'
    } finally {
      isInterpreting.value = false
    }
  }

  /** 重置占卜 */
  function reset() {
    phase.value = 'question'
    question.value = ''
    spread.value = getDefaultFateSpread()
    drawnCards.value = []
    revealedCount.value = 0
    interpretation.value = ''
    isInterpreting.value = false
    interpretError.value = null
    shuffledDeck.value = []
    pickedIndices.value = new Set()
  }

  // ===== 歷史記錄方法 =====

  /** 載入歷史記錄 */
  async function loadHistory() {
    try {
      const stored = await db.get<FateReading[]>('gameStates', FATE_HISTORY_KEY)
      readings.value = stored || []
      isHistoryLoaded.value = true
    } catch {
      console.warn('[Fate] 載入歷史記錄失敗')
      readings.value = []
      isHistoryLoaded.value = true
    }
  }

  /** 儲存單筆記錄 */
  async function saveReading(reading: FateReading) {
    readings.value.unshift(reading)
    if (readings.value.length > MAX_READINGS) {
      readings.value = readings.value.slice(0, MAX_READINGS)
    }
    await persistHistory()
  }

  /** 刪除記錄 */
  async function deleteReading(id: string) {
    readings.value = readings.value.filter(r => r.id !== id)
    await persistHistory()
  }

  /** 清空所有記錄 */
  async function clearHistory() {
    readings.value = []
    await persistHistory()
  }

  /** 持久化到 IndexedDB */
  async function persistHistory() {
    try {
      await db.put('gameStates', JSON.parse(JSON.stringify(readings.value)), FATE_HISTORY_KEY)
    } catch {
      console.warn('[Fate] 持久化歷史記錄失敗')
    }
  }

  return {
    // 狀態
    phase,
    question,
    spread,
    drawnCards,
    revealedCount,
    interpretation,
    isInterpreting,
    interpretError,
    readings,
    isHistoryLoaded,
    shuffledDeck,
    pickedIndices,
    // 計算
    allRevealed,
    requiredPicks,
    pickedCount,
    // 方法
    goToPhase,
    shuffleAndDraw,
    pickCard,
    revealNextCard,
    revealAllCards,
    startInterpretation,
    reset,
    loadHistory,
    deleteReading,
    clearHistory,
  }
})
