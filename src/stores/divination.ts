/**
 * 占卜 Pinia Store（塔羅／雷諾曼／神諭卡共用）
 * 流程：home → setup → table（抽牌＋翻牌）→ interpret
 * 歷史紀錄沿用各牌組原本的 gameStates key 與格式
 */
import { deckOrder, decks } from "@/data/decks";
import { db } from "@/db/database";
import type {
  DeckId,
  DeckSpread,
  DrawnCard,
  ReadingRecord,
  ShuffledEntry,
} from "@/types/divination";
import { FLEXIBLE_DEFAULT, resolveSpread } from "@/utils/divination/flexibleSpread";
import { pickGenerationToggles } from "@/utils/generationToggles";
import { parseNumberInput } from "@/utils/divination/numberInput";
import { shuffleDeck } from "@/utils/divination/shuffle";
import { defineStore } from "pinia";
import { computed, ref } from "vue";

export type DivinationPhase = "home" | "setup" | "table" | "interpret";
export type ThemeMode = "auto" | "day" | "night";

const MAX_READINGS = 50;
const PREFS_KEY = "fate-prefs";

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));

function firstRegularSpread(deckId: DeckId): string {
  const spreads = decks[deckId].spreads;
  return (spreads.find((s) => !s.flexible) ?? spreads[0]).id;
}

export const useDivinationStore = defineStore("divination", () => {
  // ===== 流程狀態 =====
  const phase = ref<DivinationPhase>("home");
  const deckId = ref<DeckId>("tarot");
  const question = ref("");
  const spreadId = ref(firstRegularSpread("tarot"));
  const flexibleCount = ref(FLEXIBLE_DEFAULT);

  /** 進入抽牌時固定下來的牌陣（萬能牌陣已產生牌位） */
  const tableSpread = ref<DeckSpread | null>(null);
  const shuffled = ref<ShuffledEntry[]>([]);
  /** 依序選中的牌堆 index */
  const picked = ref<number[]>([]);
  const drawn = ref<DrawnCard[]>([]);
  /** 已翻開的牌位 index */
  const revealed = ref<Set<number>>(new Set());

  const interpretation = ref("");
  const isInterpreting = ref(false);
  const interpretError = ref<string | null>(null);

  // ===== 歷史與偏好 =====
  const rawHistory = ref<Record<DeckId, unknown[]>>({ tarot: [], lenormand: [], oracle: [] });
  const isHistoryLoaded = ref(false);
  const themeMode = ref<ThemeMode>("auto");

  // ===== 計算屬性 =====
  const deck = computed(() => decks[deckId.value]);

  const selectedSpread = computed(() => {
    const base = deck.value.spreads.find((s) => s.id === spreadId.value) ?? deck.value.spreads[0];
    return resolveSpread(base, flexibleCount.value);
  });

  const requiredPicks = computed(
    () => (tableSpread.value ?? selectedSpread.value).positions.length,
  );
  const isPickComplete = computed(
    () => drawn.value.length > 0 && drawn.value.length >= requiredPicks.value,
  );
  const allRevealed = computed(
    () => isPickComplete.value && revealed.value.size >= drawn.value.length,
  );

  const records = computed<ReadingRecord[]>(() => {
    const all: ReadingRecord[] = [];
    for (const id of deckOrder) {
      for (const raw of rawHistory.value[id]) {
        try {
          all.push(decks[id].toRecord(raw));
        } catch (err) {
          console.warn(`[Divination] 無法讀取 ${id} 紀錄`, err);
        }
      }
    }
    return all.sort((a, b) => b.createdAt - a.createdAt);
  });

  // ===== 流程方法 =====

  function openDeck(id: DeckId) {
    deckId.value = id;
    if (!decks[id].spreads.some((s) => s.id === spreadId.value)) {
      spreadId.value = firstRegularSpread(id);
    }
    clearInterpretation();
    phase.value = "setup";
  }

  function selectSpread(id: string) {
    spreadId.value = id;
  }

  function setFlexibleCount(n: number) {
    flexibleCount.value = n;
    // 夾到牌陣允許的範圍，讓畫面顯示的數字與實際張數一致
    const spread = deck.value.spreads.find((s) => s.id === spreadId.value);
    if (spread?.flexible) {
      flexibleCount.value = Math.min(spread.flexible.max, Math.max(spread.flexible.min, Math.round(n)));
    }
  }

  function resetTable() {
    shuffled.value = shuffleDeck(deck.value.cardCount, deck.value.hasReversed);
    picked.value = [];
    drawn.value = [];
    revealed.value = new Set();
  }

  function startTable() {
    tableSpread.value = clone(selectedSpread.value);
    resetTable();
    clearInterpretation();
    phase.value = "table";
  }

  /** 「↻ 洗牌」：重洗並清空已選 */
  function reshuffle() {
    resetTable();
  }

  function drawnFromDeckIndex(deckIndex: number, positionIndex: number): DrawnCard {
    const entry = shuffled.value[deckIndex];
    return {
      card: deck.value.cards[entry.cardIndex],
      reversed: entry.reversed,
      position: tableSpread.value!.positions[positionIndex],
    };
  }

  function pickCard(deckIndex: number): boolean {
    if (!tableSpread.value || isPickComplete.value) return false;
    if (picked.value.includes(deckIndex) || !shuffled.value[deckIndex]) return false;
    picked.value = [...picked.value, deckIndex];
    drawn.value = [...drawn.value, drawnFromDeckIndex(deckIndex, drawn.value.length)];
    return true;
  }

  /** 報數字：成功回傳 null，失敗回傳錯誤訊息 */
  function pickByNumbers(input: string): string | null {
    if (!tableSpread.value) return "請先選擇牌陣";
    const result = parseNumberInput(input, {
      count: requiredPicks.value,
      max: deck.value.cardCount,
    });
    if (!result.ok) return result.error;
    const indices = result.numbers.map((n) => n - 1);
    picked.value = indices;
    drawn.value = indices.map((deckIndex, i) => drawnFromDeckIndex(deckIndex, i));
    revealed.value = new Set();
    return null;
  }

  function revealCard(index: number) {
    if (!isPickComplete.value || index < 0 || index >= drawn.value.length) return;
    revealed.value = new Set([...revealed.value, index]);
  }

  function revealAll() {
    if (!isPickComplete.value) return;
    revealed.value = new Set(drawn.value.map((_, i) => i));
  }

  function clearInterpretation() {
    interpretation.value = "";
    interpretError.value = null;
    isInterpreting.value = false;
  }

  function backToSetup() {
    resetTable();
    clearInterpretation();
    phase.value = "setup";
  }

  function goHome() {
    clearInterpretation();
    phase.value = "home";
  }

  function newReading() {
    question.value = "";
    clearInterpretation();
    phase.value = "setup";
  }

  // ===== AI 解讀 =====

  async function requestInterpretation() {
    if (!tableSpread.value || !isPickComplete.value) return;
    revealAll();
    phase.value = "interpret";
    isInterpreting.value = true;
    interpretation.value = "";
    interpretError.value = null;

    const currentDeck = deck.value;
    const spread = tableSpread.value;
    const cards = drawn.value;

    try {
      const { useSettingsStore } = await import("@/stores/settings");
      const taskConfig = useSettingsStore().getAPIForTask("fate");
      const apiSettings = taskConfig.api;
      if (!apiSettings?.endpoint) throw new Error("請先在設定中配置 API");

      const { OpenAICompatibleClient } = await import("@/api/OpenAICompatible");
      const client = new OpenAICompatibleClient(apiSettings);
      const prompt = currentDeck.buildPrompt(question.value, spread, cards);

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
        await saveRecord({
          id: crypto.randomUUID(),
          deckId: currentDeck.id,
          question: question.value,
          spread: clone(spread),
          drawn: clone(cards),
          interpretation: interpretation.value,
          createdAt: Date.now(),
        });
      }
    } catch (err) {
      interpretError.value = err instanceof Error ? err.message : "解讀失敗";
    } finally {
      isInterpreting.value = false;
    }
  }

  /** 從歷史紀錄還原牌陣與牌，重新請 AI 解讀 */
  async function reinterpret(record: ReadingRecord) {
    deckId.value = record.deckId;
    question.value = record.question;
    tableSpread.value = clone(record.spread);
    drawn.value = clone(record.drawn);
    picked.value = record.drawn.map((_, i) => i);
    shuffled.value = [];
    revealed.value = new Set(record.drawn.map((_, i) => i));
    await requestInterpretation();
  }

  // ===== 歷史紀錄 =====

  async function persist(id: DeckId) {
    try {
      await db.put("gameStates", clone(rawHistory.value[id]), decks[id].historyKey);
    } catch {
      console.warn(`[Divination] 儲存 ${id} 紀錄失敗`);
    }
  }

  async function saveRecord(record: ReadingRecord) {
    const id = record.deckId;
    rawHistory.value[id] = [decks[id].fromRecord(record), ...rawHistory.value[id]].slice(0, MAX_READINGS);
    await persist(id);
  }

  async function loadHistory() {
    await Promise.all(
      deckOrder.map(async (id) => {
        try {
          rawHistory.value[id] = (await db.get<unknown[]>("gameStates", decks[id].historyKey)) ?? [];
        } catch {
          console.warn(`[Divination] 載入 ${id} 紀錄失敗`);
          rawHistory.value[id] = [];
        }
      }),
    );
    try {
      const prefs = await db.get<{ themeMode?: ThemeMode }>("gameStates", PREFS_KEY);
      if (prefs?.themeMode) themeMode.value = prefs.themeMode;
    } catch {
      /* 偏好讀不到就用預設 */
    }
    isHistoryLoaded.value = true;
  }

  async function deleteRecord(id: DeckId, recordId: string) {
    rawHistory.value[id] = rawHistory.value[id].filter((r) => (r as { id: string }).id !== recordId);
    await persist(id);
  }

  async function clearHistory() {
    for (const id of deckOrder) rawHistory.value[id] = [];
    await Promise.all(deckOrder.map(persist));
  }

  async function setThemeMode(mode: ThemeMode) {
    themeMode.value = mode;
    try {
      await db.put("gameStates", { themeMode: mode }, PREFS_KEY);
    } catch {
      console.warn("[Divination] 儲存日夜偏好失敗");
    }
  }

  return {
    phase,
    deckId,
    question,
    spreadId,
    flexibleCount,
    tableSpread,
    shuffled,
    picked,
    drawn,
    revealed,
    interpretation,
    isInterpreting,
    interpretError,
    rawHistory,
    isHistoryLoaded,
    themeMode,
    deck,
    selectedSpread,
    requiredPicks,
    isPickComplete,
    allRevealed,
    records,
    openDeck,
    selectSpread,
    setFlexibleCount,
    startTable,
    reshuffle,
    pickCard,
    pickByNumbers,
    revealCard,
    revealAll,
    resetTable,
    backToSetup,
    goHome,
    newReading,
    requestInterpretation,
    reinterpret,
    loadHistory,
    deleteRecord,
    clearHistory,
    setThemeMode,
  };
});
