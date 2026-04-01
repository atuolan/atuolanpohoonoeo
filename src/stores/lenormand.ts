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

export const useLenormandStore = defineStore("lenormand", () => {
  // ===== 占卜流程狀態 =====
  const phase = ref<LenormandPhase>("question");
  const question = ref("");
  const spread = ref<LenormandSpread>(getDefaultLenormandSpread());
  const drawnCards = ref<LenormandDrawnCard[]>([]);
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
      shuffledDeck.value = [...allLenormandCards].sort(
        () => Math.random() - 0.5,
      );
      pickedIndices.value = new Set();
      drawnCards.value = [];
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
      phase.value = "result";
    }
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

      const { getAPIClient } = await import("@/api/OpenAICompatible");
      const client = getAPIClient(apiSettings);

      const prompt = buildLenormandInterpretationPrompt(
        question.value,
        spread.value,
        drawnCards.value,
      );

      const stream = client.generateStream({
        messages: [{ role: "user" as const, content: prompt }],
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
    interpretation.value = "";
    isInterpreting.value = false;
    interpretError.value = null;
    shuffledDeck.value = [];
    pickedIndices.value = new Set();
    shuffleCount.value = 0;
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
    goToPhase,
    selectSpread,
    shuffleDeck,
    confirmShuffle,
    pickCard,
    startInterpretation,
    reset,
    loadHistory,
    deleteReading,
    clearHistory,
  };
});
