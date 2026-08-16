/**
 * 雷諾曼牌 Pinia Store
 */
import { allLenormandCards } from "@/data/lenormandCards";
import { buildLenormandInterpretationPrompt } from "@/data/lenormandPrompts";
import {
  getDefaultLenormandSpread,
  lenormandSpreads,
} from "@/data/lenormandSpreads";
import { db } from "@/db/database";
import { pickGenerationToggles } from "@/utils/generationToggles";
import type {
  LenormandCard,
  LenormandDrawnCard,
  LenormandPhase,
  LenormandReading,
  LenormandSpread,
} from "@/types/lenormand";
import { defineStore } from "pinia";
import { computed, ref } from "vue";

const LENORMAND_HISTORY_KEY = "lenormand-readings";
const MAX_READINGS = 50;

function fisherYatesShuffle<T>(items: T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export const useLenormandStore = defineStore("lenormand", () => {
  // ===== 占卜流程狀態 =====
  const phase = ref<LenormandPhase>("question");
  const question = ref("");
  const spread = ref<LenormandSpread>(getDefaultLenormandSpread());
  const drawnCards = ref<LenormandDrawnCard[]>([]);
  const revealedCount = ref(0);
  const interpretation = ref("");
  const isInterpreting = ref(false);
  const interpretError = ref<string | null>(null);

  // ===== 洗牌狀態 =====
  const shuffledDeck = ref<LenormandCard[]>([]);
  const pickedIndices = ref<Set<number>>(new Set());
  const isShuffling = ref(false);
  const shuffleCount = ref(0);

  // ===== 歷史記錄 =====
  const readings = ref<LenormandReading[]>([]);
  const isHistoryLoaded = ref(false);

  // ===== 計算屬性 =====
  const requiredPicks = computed(() => spread.value.positions.length);
  const pickedCount = computed(() => pickedIndices.value.size);
  const allRevealed = computed(
    () => revealedCount.value >= drawnCards.value.length && drawnCards.value.length > 0,
  );

  // ===== 方法 =====

  function goToPhase(p: LenormandPhase) {
    phase.value = p;
  }

  function selectSpread(s: LenormandSpread) {
    spread.value = s;
  }

  /** 洗牌 */
  function shuffleDeck() {
    if (isShuffling.value) return;
    isShuffling.value = true;
    setTimeout(() => {
      shuffledDeck.value = fisherYatesShuffle(allLenormandCards);
      pickedIndices.value = new Set();
      drawnCards.value = [];
      revealedCount.value = 0;
      shuffleCount.value++;
      isShuffling.value = false;
    }, 1200);
  }

  /** 確認洗牌，進入選牌 */
  function confirmShuffle() {
    phase.value = "pick";
  }

  /** 選牌 */
  function pickCard(deckIndex: number) {
    if (pickedIndices.value.has(deckIndex)) return;
    if (pickedCount.value >= requiredPicks.value) return;

    pickedIndices.value = new Set([...pickedIndices.value, deckIndex]);

    const card = shuffledDeck.value[deckIndex];
    const positionIndex = pickedCount.value - 1;
    const position = spread.value.positions[positionIndex];
    drawnCards.value = [...drawnCards.value, { card, position }];

    if (pickedCount.value >= requiredPicks.value) {
      revealedCount.value = 0;
      phase.value = "reveal";
    }
  }

  function revealNextCard() {
    if (revealedCount.value < drawnCards.value.length) {
      revealedCount.value++;
      if (revealedCount.value >= drawnCards.value.length) {
        phase.value = "result";
      }
    }
  }

  function revealAllCards() {
    revealedCount.value = drawnCards.value.length;
    phase.value = "result";
  }

  /** 開始 AI 解讀 */
  async function startInterpretation() {
    if (!drawnCards.value.length) return;

    isInterpreting.value = true;
    interpretation.value = "";
    interpretError.value = null;
    phase.value = "interpret";

    try {
      const { useSettingsStore } = await import("@/stores/settings");
      const settingsStore = useSettingsStore();
      const taskConfig = settingsStore.getAPIForTask("fate");
      const apiSettings = taskConfig.api;

      if (!apiSettings?.endpoint) {
        throw new Error("請先在設定中配置 API");
      }

      const { OpenAICompatibleClient } = await import("@/api/OpenAICompatible");
      const client = new OpenAICompatibleClient({
        ...apiSettings,
        lastPromptRoleOverride: "none",
      });

      const prompt = buildLenormandInterpretationPrompt(
        question.value,
        spread.value,
        drawnCards.value,
      );

      const stream = client.generateStream({
        messages: [{ role: "user" as const, content: prompt }],
        settings: {
          temperature: taskConfig.generation.temperature,
          maxResponseLength: taskConfig.generation.maxTokens,
          maxContextLength: taskConfig.generation.maxContextLength,
          topP: taskConfig.generation.topP,
          frequencyPenalty: taskConfig.generation.frequencyPenalty,
          presencePenalty: taskConfig.generation.presencePenalty,
          repetitionPenalty: 1,
          stopSequences: [],
          streaming: true,
          useStreamingWindow: false,
          ...pickGenerationToggles(taskConfig.generation),
        },
        apiSettings,
      });

      for await (const event of stream) {
        if (event.type === "token" && event.token) {
          interpretation.value += event.token;
        } else if (event.type === "error") {
          interpretError.value = event.error || "解讀失敗";
          break;
        }
      }

      if (interpretation.value) {
        const reading: LenormandReading = {
          id: crypto.randomUUID(),
          question: question.value,
          spread: JSON.parse(JSON.stringify(spread.value)),
          drawnCards: JSON.parse(JSON.stringify(drawnCards.value)),
          interpretation: interpretation.value,
          createdAt: Date.now(),
        };
        await saveReading(reading);
      }
    } catch (err) {
      interpretError.value = err instanceof Error ? err.message : "解讀失敗";
    } finally {
      isInterpreting.value = false;
    }
  }

  /** 重置 */
  function reset() {
    phase.value = "question";
    question.value = "";
    spread.value = getDefaultLenormandSpread();
    drawnCards.value = [];
    revealedCount.value = 0;
    interpretation.value = "";
    isInterpreting.value = false;
    interpretError.value = null;
    shuffledDeck.value = [];
    pickedIndices.value = new Set();
    shuffleCount.value = 0;
  }

  /** 輸入式抽牌：根據牌號直接抽取指定的牌 */
  function drawCardsByInput(cardNumbers: number[]): {
    success: boolean;
    error?: string;
    drawnCards?: LenormandDrawnCard[];
  } {
    // 驗證輸入
    if (!cardNumbers || cardNumbers.length === 0) {
      return { success: false, error: "請輸入至少一個牌號" };
    }

    // 檢查是否有重複
    const uniqueNumbers = new Set(cardNumbers);
    if (uniqueNumbers.size !== cardNumbers.length) {
      return { success: false, error: "輸入的牌號有重複，請確保每個牌號只出現一次" };
    }

    // 驗證牌號範圍（1-36）
    const invalidNumbers = cardNumbers.filter((n) => n < 1 || n > 36);
    if (invalidNumbers.length > 0) {
      return {
        success: false,
        error: `牌號必須在 1-36 之間，無效的牌號：${invalidNumbers.join(", ")}`,
      };
    }

    // 檢查數量是否符合牌陣要求
    if (cardNumbers.length !== spread.value.positions.length) {
      return {
        success: false,
        error: `當前牌陣需要 ${spread.value.positions.length} 張牌，但您輸入了 ${cardNumbers.length} 個牌號`,
      };
    }

    // 如果在 shuffle 階段，先執行洗牌（同步版本，直接洗牌不等待動畫）
    if (phase.value === "shuffle") {
      shuffledDeck.value = fisherYatesShuffle(allLenormandCards);
      pickedIndices.value = new Set();
    }

    // 驗證 shuffledDeck 是否已準備好
    if (shuffledDeck.value.length === 0) {
      return { success: false, error: "請先洗牌" };
    }

    // 驗證索引範圍（基於 shuffledDeck）
    const invalidIndices = cardNumbers.filter((n) => n < 1 || n > shuffledDeck.value.length);
    if (invalidIndices.length > 0) {
      return {
        success: false,
        error: `牌號必須在 1-${shuffledDeck.value.length} 之間，無效的牌號：${invalidIndices.join(", ")}`,
      };
    }

    // 從洗好的牌堆中按索引抽取（牌號從1開始，數組索引從0開始）
    const selectedCards: LenormandDrawnCard[] = cardNumbers.map((num, idx) => {
      const card = shuffledDeck.value[num - 1];
      const position = spread.value.positions[idx];
      return { card, position };
    });

    // 更新 store 狀態
    drawnCards.value = selectedCards;
    revealedCount.value = 0;
    phase.value = "reveal";

    return {
      success: true,
      drawnCards: selectedCards,
    };
  }

  // ===== 歷史記錄 =====

  async function loadHistory() {
    try {
      const stored = await db.get<LenormandReading[]>(
        "gameStates",
        LENORMAND_HISTORY_KEY,
      );
      readings.value = stored || [];
      isHistoryLoaded.value = true;
    } catch {
      console.warn("[Lenormand] 載入歷史記錄失敗");
      readings.value = [];
      isHistoryLoaded.value = true;
    }
  }

  async function saveReading(reading: LenormandReading) {
    readings.value.unshift(reading);
    if (readings.value.length > MAX_READINGS) {
      readings.value = readings.value.slice(0, MAX_READINGS);
    }
    await persistHistory();
  }

  async function deleteReading(id: string) {
    readings.value = readings.value.filter((r) => r.id !== id);
    await persistHistory();
  }

  async function clearHistory() {
    readings.value = [];
    await persistHistory();
  }

  async function persistHistory() {
    try {
      await db.put(
        "gameStates",
        JSON.parse(JSON.stringify(readings.value)),
        LENORMAND_HISTORY_KEY,
      );
    } catch {
      console.warn("[Lenormand] 持久化歷史記錄失敗");
    }
  }

  return {
    phase,
    question,
    spread,
    drawnCards,
    revealedCount,
    interpretation,
    isInterpreting,
    interpretError,
    shuffledDeck,
    pickedIndices,
    isShuffling,
    shuffleCount,
    readings,
    isHistoryLoaded,
    requiredPicks,
    pickedCount,
    allRevealed,
    goToPhase,
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
    drawCardsByInput,
  };
});
