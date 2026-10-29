/**
 * 六爻 Pinia Store
 * 管理六爻起卦流程狀態、排盤、AI 串流解讀與歷史記錄
 */
import { db } from "@/db/database";
import { loadZhouyi, type ZhouyiText } from "@/data/liuyao/zhouyi";
import type {
  CastMethod,
  ChartFacts,
  CoinThrow,
  LiuyaoChart,
  LiuyaoReading,
  QuestionCategory,
  YaoValue,
} from "@/types/liuyao";
import { analyzeChart } from "@/utils/liuyao/analysis";
import { getGanzhiTime } from "@/utils/liuyao/calendar";
import { paipan } from "@/utils/liuyao/paipan";
import { buildLiuyaoPrompt, type LiuyaoReader } from "@/utils/liuyao/prompt";
import { defineStore } from "pinia";
import { computed, ref } from "vue";

export type LiuyaoPhase = "ask" | "cast" | "board";

/** IndexedDB 儲存鍵 */
const LIUYAO_HISTORY_KEY = "liuyao-readings";
const MAX_READINGS = 50;

/** 爻值還原為三枚銅錢 */
function coinsOf(v: YaoValue): [2 | 3, 2 | 3, 2 | 3] {
  switch (v) {
    case 6:
      return [2, 2, 2];
    case 7:
      return [2, 2, 3];
    case 8:
      return [2, 3, 3];
    case 9:
      return [3, 3, 3];
  }
}

export const useLiuyaoStore = defineStore("liuyao", () => {
  // ===== 狀態 =====
  const phase = ref<LiuyaoPhase>("ask");
  const question = ref("");
  const category = ref<QuestionCategory | null>(null);
  const method = ref<CastMethod>("auto");
  const readerCharacterId = ref<string | null>(null);
  const castTime = ref(Date.now());
  const throws = ref<CoinThrow[]>([]);
  const inputValues = ref<(YaoValue | null)[]>([null, null, null, null, null, null]);

  const chart = ref<LiuyaoChart | null>(null);
  const facts = ref<ChartFacts | null>(null);
  const originalText = ref<ZhouyiText | null>(null);
  const changedText = ref<ZhouyiText | null>(null);

  const interpretation = ref("");
  const isInterpreting = ref(false);
  const interpretError = ref<string | null>(null);

  const currentReadingId = ref<string | null>(null);
  const readings = ref<LiuyaoReading[]>([]);
  const isHistoryLoaded = ref(false);

  // ===== Computed =====
  const values = computed<YaoValue[]>(() => {
    if (method.value === "input") {
      const inputs = inputValues.value;
      if (inputs.length === 6 && inputs.every((v): v is YaoValue => v !== null)) {
        return [...inputs];
      }
      return [];
    }
    return throws.value.map((t) => t.value);
  });

  const isComplete = computed(() => values.value.length === 6);

  // ===== 方法 =====

  /** 開始起卦 */
  function startCast() {
    if (method.value !== "input") {
      castTime.value = Date.now();
    }
    throws.value = [];
    inputValues.value = [null, null, null, null, null, null];
    chart.value = null;
    facts.value = null;
    originalText.value = null;
    changedText.value = null;
    interpretation.value = "";
    interpretError.value = null;
    currentReadingId.value = null;
    phase.value = "cast";
  }

  /** 記錄一次擲爻（未滿 6 次才記錄） */
  function addThrow(t: CoinThrow) {
    if (throws.value.length < 6) {
      throws.value.push(t);
    }
  }

  /** 手動輸入單爻（0＝初爻） */
  function setInputValue(index: number, v: YaoValue) {
    if (index >= 0 && index < 6) {
      inputValues.value[index] = v;
    }
  }

  /** 重新起卦 */
  function restartCast() {
    throws.value = [];
    inputValues.value = [null, null, null, null, null, null];
  }

  /** 排盤 */
  async function buildChart() {
    if (!isComplete.value) return;

    const time = await getGanzhiTime(castTime.value);
    const newChart = paipan(values.value, time);
    chart.value = newChart;
    facts.value = analyzeChart(newChart);

    try {
      originalText.value = await loadZhouyi(newChart.original.index);
    } catch {
      originalText.value = null;
    }

    if (newChart.changed) {
      try {
        changedText.value = await loadZhouyi(newChart.changed.index);
      } catch {
        changedText.value = null;
      }
    } else {
      changedText.value = null;
    }

    phase.value = "board";
  }

  /** 開始 AI 串流解讀 */
  async function startInterpretation() {
    if (!chart.value || !facts.value) return;

    isInterpreting.value = true;
    interpretation.value = "";
    interpretError.value = null;

    try {
      // 1. 準備解卦者與人設
      let reader: LiuyaoReader | null = null;
      let readerName: string | undefined = undefined;

      if (readerCharacterId.value !== null) {
        const { useCharactersStore } = await import("@/stores/characters");
        const { useUserStore } = await import("@/stores/user");

        const charactersStore = useCharactersStore();
        const userStore = useUserStore();

        const char = charactersStore.characters.find((c) => c.id === readerCharacterId.value);
        if (char) {
          readerName = char.nickname || char.data?.name || "角色";
          const userName = userStore.currentName || "我";
          const resolvedPersonaId = userStore.resolvePersonaForChat(char.id, null);
          const persona = resolvedPersonaId ? userStore.personas.find((p) => p.id === resolvedPersonaId) : null;
          const userPersona = persona?.description || userStore.currentPersona?.description || "";

          reader = {
            name: readerName,
            description: char.data?.description,
            personality: char.data?.personality,
            userName,
            userPersona,
          };
        }
      }

      // 2. 組裝提示詞
      const { system, user } = buildLiuyaoPrompt({
        chart: chart.value,
        facts: facts.value,
        question: question.value,
        category: category.value,
        original: originalText.value,
        changed: changedText.value,
        reader,
      });

      // 3. 取得 API 設定與串流呼叫
      const { useSettingsStore } = await import("@/stores/settings");
      const settingsStore = useSettingsStore();
      const taskConfig = settingsStore.getAPIForTask("fate");
      const apiSettings = taskConfig.api;

      if (!apiSettings?.endpoint) {
        throw new Error("請先在設定中配置 API");
      }

      const { OpenAICompatibleClient } = await import("@/api/OpenAICompatible");
      const { pickGenerationToggles } = await import("@/utils/generationToggles");
      const client = new OpenAICompatibleClient(apiSettings);

      const messages = [
        { role: "system" as const, content: system },
        { role: "user" as const, content: user },
      ];

      const stream = client.generateStream({
        messages,
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

      // 4. 存檔或更新紀錄
      if (interpretation.value) {
        if (!currentReadingId.value) {
          const newId = crypto.randomUUID();
          const reading: LiuyaoReading = {
            id: newId,
            question: question.value,
            category: category.value,
            method: method.value,
            values: [...values.value],
            castTime: castTime.value,
            readerCharacterId: readerCharacterId.value ?? undefined,
            readerName,
            interpretation: interpretation.value,
            createdAt: Date.now(),
          };
          currentReadingId.value = newId;
          await saveReading(reading);
        } else {
          const target = readings.value.find((r) => r.id === currentReadingId.value);
          if (target) {
            target.interpretation = interpretation.value;
            target.readerCharacterId = readerCharacterId.value ?? undefined;
            target.readerName = readerName;
            await persistHistory();
          }
        }
      }
    } catch (err) {
      interpretError.value = err instanceof Error ? err.message : "解讀失敗";
    } finally {
      isInterpreting.value = false;
    }
  }

  /** 開啟歷史紀錄 */
  async function openReading(r: LiuyaoReading) {
    question.value = r.question;
    category.value = r.category;
    method.value = r.method;
    readerCharacterId.value = r.readerCharacterId ?? null;
    castTime.value = r.castTime;
    interpretation.value = r.interpretation;
    interpretError.value = null;
    currentReadingId.value = r.id;

    if (r.method === "input") {
      inputValues.value = [...r.values];
      throws.value = [];
    } else {
      throws.value = r.values.map((v) => ({ coins: coinsOf(v), value: v }));
      inputValues.value = [null, null, null, null, null, null];
    }

    const time = await getGanzhiTime(r.castTime);
    const newChart = paipan(r.values, time);
    chart.value = newChart;
    facts.value = analyzeChart(newChart);

    try {
      originalText.value = await loadZhouyi(newChart.original.index);
    } catch {
      originalText.value = null;
    }

    if (newChart.changed) {
      try {
        changedText.value = await loadZhouyi(newChart.changed.index);
      } catch {
        changedText.value = null;
      }
    } else {
      changedText.value = null;
    }

    phase.value = "board";
  }

  /** 重設所有狀態回到首頁 */
  function reset() {
    phase.value = "ask";
    question.value = "";
    category.value = null;
    method.value = "auto";
    readerCharacterId.value = null;
    castTime.value = Date.now();
    throws.value = [];
    inputValues.value = [null, null, null, null, null, null];
    chart.value = null;
    facts.value = null;
    originalText.value = null;
    changedText.value = null;
    interpretation.value = "";
    isInterpreting.value = false;
    interpretError.value = null;
    currentReadingId.value = null;
  }

  // ===== 歷史紀錄內部方法 =====

  async function persistHistory() {
    try {
      await db.put(
        "gameStates",
        JSON.parse(JSON.stringify(readings.value)),
        LIUYAO_HISTORY_KEY,
      );
    } catch {
      console.warn("[Liuyao] 持久化歷史記錄失敗");
    }
  }

  async function saveReading(reading: LiuyaoReading) {
    readings.value.unshift(reading);
    if (readings.value.length > MAX_READINGS) {
      readings.value = readings.value.slice(0, MAX_READINGS);
    }
    await persistHistory();
  }

  // ===== 歷史紀錄公開方法 =====

  /** 載入歷史記錄 */
  async function loadHistory() {
    try {
      const stored = await db.get<LiuyaoReading[]>(
        "gameStates",
        LIUYAO_HISTORY_KEY,
      );
      readings.value = stored || [];
      isHistoryLoaded.value = true;
    } catch {
      console.warn("[Liuyao] 載入歷史記錄失敗");
      readings.value = [];
      isHistoryLoaded.value = true;
    }
  }

  /** 刪除一筆歷史記錄 */
  async function deleteReading(id: string) {
    readings.value = readings.value.filter((r) => r.id !== id);
    await persistHistory();
  }

  /** 清空所有歷史記錄 */
  async function clearHistory() {
    readings.value = [];
    await persistHistory();
  }

  return {
    // 狀態
    phase,
    question,
    category,
    method,
    readerCharacterId,
    castTime,
    throws,
    inputValues,
    chart,
    facts,
    originalText,
    changedText,
    interpretation,
    isInterpreting,
    interpretError,
    currentReadingId,
    readings,
    isHistoryLoaded,
    // computed
    values,
    isComplete,
    // 方法
    startCast,
    addThrow,
    setInputValue,
    restartCast,
    buildChart,
    startInterpretation,
    openReading,
    reset,
    loadHistory,
    deleteReading,
    clearHistory,
  };
});
