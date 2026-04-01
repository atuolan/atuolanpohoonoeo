/**
 * 神諭卡（Oracle Card）Pinia Store
 * 管理神諭牌占卜狀態、歷史記錄（IndexedDB 持久化）
 */
import { ORACLE_CARDS } from '@/data/oracleCards'
import { buildOracleInterpretationPrompt } from '@/data/oraclePrompts'
import { ORACLE_SPREADS } from '@/data/oracleSpreads'
import { db } from '@/db/database'
import type {
  OracleCard,
  OracleDrawnCard,
  OraclePhase,
  OracleReading,
  OracleSpread,
} from '@/types/oracle'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

/** IndexedDB key */
const ORACLE_HISTORY_KEY = 'oracle-readings'
const MAX_READINGS = 50

export const useOracleStore = defineStore('oracle', () => {
  // ===== 占卜流程狀態 =====
  const phase = ref<OraclePhase>('home')
  const question = ref('')
  const intention = ref('')
  const spread = ref<OracleSpread>(ORACLE_SPREADS[0])
  const drawnCards = ref<OracleDrawnCard[]>([])
  const revealedCount = ref(0)
  const interpretation = ref('')
  const isInterpreting = ref(false)
  const interpretError = ref<string | null>(null)

  // ===== 洗牌狀態 =====
  /** 洗好的牌堆（背面朝上） */
  const shuffledDeck = ref<OracleCard[]>([])
  /** 已選的牌 index */
  const pickedIndices = ref<Set<number>>(new Set())

  // ===== 歷史記錄 =====
  const readings = ref<OracleReading[]>([])
  const isHistoryLoaded = ref(false)

  // ===== 計算屬性 =====
  const requiredPicks = computed(() => spread.value.positions.length)
  const pickedCount = computed(() => pickedIndices.value.size)
  const allRevealed = computed(
    () => revealedCount.value >= drawnCards.value.length && drawnCards.value.length > 0,
  )
  const currentDrawnCard = computed(() =>
    drawnCards.value.length > 0 ? drawnCards.value[revealedCount.value - 1] : null,
  )

  // ===== 流程控制 =====

  /** 切換階段 */
  function goToPhase(p: OraclePhase) {
    phase.value = p
  }

  /** 設定意圖並進入牌陣選擇 */
  function setIntention(q: string, intent: string) {
    question.value = q
    intention.value = intent
    phase.value = 'spread'
  }

  /** 選擇牌陣並進入洗牌 */
  function selectSpread(s: OracleSpread) {
    spread.value = s
    phase.value = 'shuffle'
    shuffleDeck()
  }

  /** 洗牌（可多次呼叫） */
  function shuffleDeck() {
    shuffledDeck.value = [...ORACLE_CARDS].sort(() => Math.random() - 0.5)
    pickedIndices.value = new Set()
    drawnCards.value = []
    revealedCount.value = 0
  }

  /** 確認洗牌完畢，進入抽牌階段 */
  function confirmShuffle() {
    phase.value = 'draw'
  }

  /** 抽牌：點選一張牌 */
  function pickCard(deckIndex: number) {
    if (pickedIndices.value.has(deckIndex)) return
    if (pickedCount.value >= requiredPicks.value) return

    pickedIndices.value = new Set([...pickedIndices.value, deckIndex])

    const card = shuffledDeck.value[deckIndex]
    const positionIndex = pickedCount.value - 1
    const position = spread.value.positions[positionIndex]

    drawnCards.value = [
      ...drawnCards.value,
      { card, position },
    ]

    // 選滿後自動進入揭示階段
    if (pickedCount.value >= requiredPicks.value) {
      revealedCount.value = 0
      phase.value = 'reveal'
    }
  }

  /** 翻開下一張牌 */
  function revealNextCard() {
    if (revealedCount.value < drawnCards.value.length) {
      revealedCount.value++
    }
  }

  /** 全部翻開 */
  function revealAllCards() {
    revealedCount.value = drawnCards.value.length
  }

  /** 開始 AI 解讀（流式） */
  async function startInterpretation() {
    isInterpreting.value = true
    interpretation.value = ''
    interpretError.value = null
    phase.value = 'interpret'

    try {
      const { useSettingsStore } = await import('@/stores/settings')
      const settingsStore = useSettingsStore()
      const taskConfig = settingsStore.getAPIForTask('fate')
      const apiSettings = taskConfig.api

      if (!apiSettings?.endpoint) {
        throw new Error('請先在設定中配置 API')
      }

      const { getAPIClient } = await import('@/api/OpenAICompatible')
      const client = getAPIClient(apiSettings)

      const prompt = buildOracleInterpretationPrompt(
        question.value,
        intention.value,
        spread.value,
        drawnCards.value,
      )

      const messages = [{ role: 'user' as const, content: prompt }]

      const stream = client.generateStream({
        messages,
        settings: {
          temperature: 0.75,
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
        const reading: OracleReading = {
          id: crypto.randomUUID(),
          question: question.value,
          intention: intention.value,
          spread: JSON.parse(JSON.stringify(spread.value)),
          drawnCards: JSON.parse(JSON.stringify(drawnCards.value)),
          interpretation: interpretation.value,
          createdAt: Date.now(),
          type: 'oracle',
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
    phase.value = 'home'
    question.value = ''
    intention.value = ''
    spread.value = ORACLE_SPREADS[0]
    drawnCards.value = []
    revealedCount.value = 0
    interpretation.value = ''
    isInterpreting.value = false
    interpretError.value = null
    shuffledDeck.value = []
    pickedIndices.value = new Set()
  }

  // ===== 歷史記錄 =====

  async function loadHistory() {
    try {
      const stored = await db.get<OracleReading[]>('gameStates', ORACLE_HISTORY_KEY)
      readings.value = stored || []
      isHistoryLoaded.value = true
    } catch {
      console.warn('[Oracle] 載入歷史記錄失敗')
      readings.value = []
      isHistoryLoaded.value = true
    }
  }

  async function saveReading(reading: OracleReading) {
    readings.value.unshift(reading)
    if (readings.value.length > MAX_READINGS) {
      readings.value = readings.value.slice(0, MAX_READINGS)
    }
    await persistHistory()
  }

  async function deleteReading(id: string) {
    readings.value = readings.value.filter(r => r.id !== id)
    await persistHistory()
  }

  async function clearHistory() {
    readings.value = []
    await persistHistory()
  }

  async function persistHistory() {
    try {
      await db.put(
        'gameStates',
        JSON.parse(JSON.stringify(readings.value)),
        ORACLE_HISTORY_KEY,
      )
    } catch {
      console.warn('[Oracle] 持久化歷史記錄失敗')
    }
  }

  return {
    // 狀態
    phase,
    question,
    intention,
    spread,
    drawnCards,
    revealedCount,
    interpretation,
    isInterpreting,
    interpretError,
    shuffledDeck,
    pickedIndices,
    readings,
    isHistoryLoaded,
    // 計算屬性
    requiredPicks,
    pickedCount,
    allRevealed,
    currentDrawnCard,
    // 方法
    goToPhase,
    setIntention,
    selectSpread,
    shuffleDeck,
    confirmShuffle,
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
