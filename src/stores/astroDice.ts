/**
 * 占星骰子 Pinia Store
 * 管理占星骰子狀態、歷史記錄（IndexedDB 持久化）
 */
import {
  astroHouses,
  astroPlanets,
  astroSigns,
  getRandomHouse,
  getRandomPlanet,
  getRandomSign,
} from "@/data/astroDiceData";
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

  // ===== 占卜流程方法 =====

  /** 設定階段 */
  function goToPhase(p: AstroDicePhase) {
    phase.value = p;
  }

  /** 擲骰子 */
  async function rollDice() {
    if (isRolling.value) return;

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

      const { getAPIClient } = await import("@/api/OpenAICompatible");
      const client = getAPIClient(apiSettings);

      const prompt = buildAstroDiceInterpretationPrompt(
        question.value,
        result.value,
      );

      const messages = [{ role: "user" as const, content: prompt }];

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
      });

      for await (const event of stream) {
        if (event.type === "token" && event.token) {
          interpretation.value += event.token;
        } else if (event.type === "error") {
          interpretError.value = event.error || "解讀失敗";
          break;
        }
      }

      // 儲存占卜記錄
      if (interpretation.value && result.value) {
        const reading: AstroDiceReading = {
          id: crypto.randomUUID(),
          question: question.value,
          result: JSON.parse(JSON.stringify(result.value)),
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

  /** 重置占卜 */
  function reset() {
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
    // 方法
    goToPhase,
    rollDice,
    startInterpretation,
    reset,
    loadHistory,
    deleteReading,
    clearHistory,
  };
});
