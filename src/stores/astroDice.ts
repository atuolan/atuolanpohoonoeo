/**
 * 占星骰子 Pinia Store
 * 管理占星骰子狀態、歷史記錄（IndexedDB 持久化）
 * 骰子一落定就存進紀錄，解讀出來再補上去
 */
import {
  astroHouses,
  astroPlanets,
  astroSigns,
  getRandomHouse,
  getRandomPlanet,
  getRandomSign,
} from "@/data/astroDiceData";
import { pickGenerationToggles } from "@/utils/generationToggles";
import { buildAstroDiceInterpretationPrompt } from "@/data/astroDicePrompts";
import { db } from "@/db/database";
import type {
  AstroDicePhase,
  AstroDiceReading,
  AstroDiceResult,
  AstroHouse,
  AstroPlanet,
  AstroSign,
} from "@/types/astroDice";
import { defineStore } from "pinia";
import { ref } from "vue";

/** IndexedDB store 名稱 */
const ASTRO_DICE_HISTORY_KEY = "astro-dice-readings";
const MAX_READINGS = 50;

export const useAstroDiceStore = defineStore("astroDice", () => {
  // ===== 占卜流程狀態 =====
  const phase = ref<AstroDicePhase>("question");
  const question = ref("");
  const result = ref<AstroDiceResult | null>(null);
  const interpretation = ref("");
  const isInterpreting = ref(false);
  const interpretError = ref<string | null>(null);

  // ===== 骰子動畫狀態 =====
  const isRolling = ref(false);
  const rollingPlanet = ref<AstroPlanet | null>(null);
  const rollingSign = ref<AstroSign | null>(null);
  const rollingHouse = ref<AstroHouse | null>(null);

  // ===== 歷史記錄 =====
  const readings = ref<AstroDiceReading[]>([]);
  const isHistoryLoaded = ref(false);
  /** 這次擲骰存進紀錄時用的 id；解讀出來後寫回同一筆 */
  const currentReadingId = ref<string | null>(null);
  /** 每次請求解讀或重置都會遞增，舊的串流就不再寫進畫面 */
  let interpretRun = 0;
  /** 每次擲骰或重置都會遞增，擲到一半離開就不出結果 */
  let rollRun = 0;

  // ===== 占卜流程方法 =====

  /** 設定階段 */
  function goToPhase(p: AstroDicePhase) {
    phase.value = p;
  }

  /** 擲骰子 */
  async function rollDice() {
    if (isRolling.value) return;

    const run = ++rollRun;
    isRolling.value = true;
    rollingPlanet.value = null;
    rollingSign.value = null;
    rollingHouse.value = null;

    // 動畫：快速切換顯示
    const animDuration = 1500;
    const interval = 80;
    const startTime = Date.now();

    return new Promise<void>((resolve) => {
      const animate = () => {
        if (run !== rollRun) {
          resolve();
          return;
        }
        const elapsed = Date.now() - startTime;
        if (elapsed < animDuration) {
          // 隨機顯示符號
          rollingPlanet.value =
            astroPlanets[Math.floor(Math.random() * astroPlanets.length)];
          rollingSign.value =
            astroSigns[Math.floor(Math.random() * astroSigns.length)];
          rollingHouse.value =
            astroHouses[Math.floor(Math.random() * astroHouses.length)];
          setTimeout(animate, interval);
        } else {
          // 最終結果
          const finalPlanet = getRandomPlanet();
          const finalSign = getRandomSign();
          const finalHouse = getRandomHouse();

          rollingPlanet.value = finalPlanet;
          rollingSign.value = finalSign;
          rollingHouse.value = finalHouse;

          result.value = {
            planet: finalPlanet,
            sign: finalSign,
            house: finalHouse,
          };

          const reading: AstroDiceReading = {
            id: crypto.randomUUID(),
            question: question.value,
            result: JSON.parse(JSON.stringify(result.value)),
            createdAt: Date.now(),
          };
          currentReadingId.value = reading.id;
          void saveReading(reading);

          isRolling.value = false;
          phase.value = "result";
          resolve();
        }
      };
      animate();
    });
  }

  /** 開始 AI 解讀（流式） */
  async function startInterpretation() {
    if (!result.value) return;

    const run = ++interpretRun;
    const isCurrent = () => run === interpretRun;
    const readingId = currentReadingId.value;
    let text = "";
    let failed = false;

    isInterpreting.value = true;
    interpretation.value = "";
    interpretError.value = null;
    phase.value = "interpret";

    try {
      // 動態 import 避免循環依賴
      const { useSettingsStore } = await import("@/stores/settings");
      const settingsStore = useSettingsStore();
      const taskConfig = settingsStore.getAPIForTask("fate");
      const apiSettings = taskConfig.api;

      if (!apiSettings?.endpoint) {
        throw new Error("請先在設定中配置 API");
      }

      const { OpenAICompatibleClient } = await import("@/api/OpenAICompatible");
      const client = new OpenAICompatibleClient(apiSettings);

      const prompt = buildAstroDiceInterpretationPrompt(
        question.value,
        result.value,
      );

      const messages = [{ role: "user" as const, content: prompt }];

      // 使用流式生成
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
          text += event.token;
          if (isCurrent()) interpretation.value = text;
        } else if (event.type === "error") {
          failed = true;
          if (isCurrent()) interpretError.value = event.error || "解讀失敗";
          break;
        }
      }
    } catch (err) {
      failed = true;
      if (isCurrent()) interpretError.value = err instanceof Error ? err.message : "解讀失敗";
    } finally {
      if (isCurrent()) isInterpreting.value = false;
    }

    // 就算已經離開這頁，解讀也寫回擲骰時存的那一筆
    if (text && readingId) await saveInterpretation(readingId, text, failed);
  }

  /** 從歷史紀錄還原骰子結果（之後可再請求解讀） */
  function openReading(r: AstroDiceReading) {
    interpretRun += 1;
    question.value = r.question;
    result.value = JSON.parse(JSON.stringify(r.result));
    interpretation.value = r.interpretation ?? "";
    isInterpreting.value = false;
    interpretError.value = null;
    currentReadingId.value = r.id;
    phase.value = "interpret";
  }

  /** 重置占卜 */
  function reset() {
    interpretRun += 1;
    rollRun += 1;
    currentReadingId.value = null;
    phase.value = "question";
    question.value = "";
    result.value = null;
    interpretation.value = "";
    isInterpreting.value = false;
    interpretError.value = null;
    isRolling.value = false;
    rollingPlanet.value = null;
    rollingSign.value = null;
    rollingHouse.value = null;
  }

  // ===== 歷史記錄方法 =====

  /** 載入歷史記錄 */
  async function loadHistory() {
    try {
      const stored = await db.get<AstroDiceReading[]>(
        "gameStates",
        ASTRO_DICE_HISTORY_KEY,
      );
      readings.value = stored || [];
      isHistoryLoaded.value = true;
    } catch {
      console.warn("[AstroDice] 載入歷史記錄失敗");
      readings.value = [];
      isHistoryLoaded.value = true;
    }
  }

  /** 儲存單筆記錄 */
  async function saveReading(reading: AstroDiceReading) {
    readings.value.unshift(reading);
    if (readings.value.length > MAX_READINGS) {
      readings.value = readings.value.slice(0, MAX_READINGS);
    }
    await persistHistory();
  }

  /**
   * 把解讀寫回紀錄。紀錄已被刪掉就不再補回；
   * 這次解讀中途出錯、而紀錄原本已有完整解讀時，保留原本的
   */
  async function saveInterpretation(id: string, text: string, failed: boolean) {
    const target = readings.value.find((r) => r.id === id);
    if (!target) return;
    if (failed && target.interpretation) return;
    target.interpretation = text;
    await persistHistory();
  }

  /** 刪除記錄 */
  async function deleteReading(id: string) {
    readings.value = readings.value.filter((r) => r.id !== id);
    await persistHistory();
  }

  /** 清空所有記錄 */
  async function clearHistory() {
    readings.value = [];
    await persistHistory();
  }

  /** 持久化到 IndexedDB */
  async function persistHistory() {
    try {
      await db.put(
        "gameStates",
        JSON.parse(JSON.stringify(readings.value)),
        ASTRO_DICE_HISTORY_KEY,
      );
    } catch {
      console.warn("[AstroDice] 持久化歷史記錄失敗");
    }
  }

  return {
    // 狀態
    phase,
    question,
    result,
    interpretation,
    isInterpreting,
    interpretError,
    isRolling,
    rollingPlanet,
    rollingSign,
    rollingHouse,
    readings,
    isHistoryLoaded,
    currentReadingId,
    // 方法
    goToPhase,
    rollDice,
    startInterpretation,
    openReading,
    reset,
    loadHistory,
    deleteReading,
    clearHistory,
  };
});
