/**
 * 功德修行 Store
 *
 * 全域功德值系統，不綁定角色
 * 管理功德餘額、句子解鎖、自訂句子
 */
import {
    BEADS_DEFAULT_SENTENCE,
    CUSTOM_SLOT_PRICE,
    getSentenceById,
    MAX_CUSTOM_SLOTS,
    WOODFISH_DEFAULT_SENTENCE,
} from "@/data/meritSentences";
import { db, DB_STORES } from "@/db/database";
import { defineStore } from "pinia";
import { ref, toRaw } from "vue";

/** 功德狀態 key（存在 gameStates store 裡） */
const MERIT_STATE_KEY = "merit_global";

export interface CustomSentence {
  id: string;
  text: string;
}

export interface MeritState {
  balance: number;
  totalEarned: number;
  woodfish: {
    totalTaps: number;
    selectedSentenceId: string;
  };
  beads: {
    totalBeadsRolled: number;
    completedRounds: number;
    selectedSentenceId: string;
  };
  unlockedSentences: string[];
  customSentences: CustomSentence[];
  customSlots: number;
}

function createDefaultMeritState(): MeritState {
  return {
    balance: 0,
    totalEarned: 0,
    woodfish: {
      totalTaps: 0,
      selectedSentenceId: WOODFISH_DEFAULT_SENTENCE.id,
    },
    beads: {
      totalBeadsRolled: 0,
      completedRounds: 0,
      selectedSentenceId: BEADS_DEFAULT_SENTENCE.id,
    },
    unlockedSentences: [],
    customSentences: [],
    customSlots: 0,
  };
}

export const useMeritStore = defineStore("merit", () => {
  const state = ref<MeritState>(createDefaultMeritState());
  const isInitialized = ref(false);

  // ===== 持久化 =====

  async function loadState(): Promise<void> {
    try {
      await db.init();
      const raw = await db.get<MeritState>(
        DB_STORES.GAME_STATES,
        MERIT_STATE_KEY,
      );
      if (raw) {
        // 合併預設值（處理舊版資料缺少欄位的情況）
        state.value = { ...createDefaultMeritState(), ...raw };
      }
      isInitialized.value = true;
    } catch (e) {
      console.error("[MeritStore] 載入失敗:", e);
      isInitialized.value = true;
    }
  }

  async function saveState(): Promise<void> {
    try {
      await db.init();
      const plain = JSON.parse(JSON.stringify(toRaw(state.value)));
      await db.put(DB_STORES.GAME_STATES, plain, MERIT_STATE_KEY);
    } catch (e) {
      console.error("[MeritStore] 保存失敗:", e);
    }
  }

  // ===== 功德操作 =====

  function addMerit(amount: number): void {
    state.value.balance += amount;
    state.value.totalEarned += amount;
  }

  /** 敲木魚 +1 功德 */
  function tapWoodfish(): void {
    addMerit(1);
    state.value.woodfish.totalTaps += 1;
  }

  /** 盤佛珠 +1 功德 */
  function rollBead(): void {
    addMerit(1);
    state.value.beads.totalBeadsRolled += 1;
  }

  /** 完成一圈佛珠 +5 額外功德 */
  function completeBeadRound(): void {
    addMerit(5);
    state.value.beads.completedRounds += 1;
  }

  // ===== 句子系統 =====

  function isSentenceUnlocked(sentenceId: string): boolean {
    const s = getSentenceById(sentenceId);
    if (!s) return false;
    if (s.price === 0) return true;
    return state.value.unlockedSentences.includes(sentenceId);
  }

  function unlockSentence(sentenceId: string): {
    success: boolean;
    error?: string;
  } {
    const s = getSentenceById(sentenceId);
    if (!s) return { success: false, error: "句子不存在" };
    if (s.price === 0) return { success: false, error: "此句子已免費" };
    if (state.value.unlockedSentences.includes(sentenceId)) {
      return { success: false, error: "已解鎖" };
    }
    if (state.value.balance < s.price) {
      return { success: false, error: "功德不足" };
    }
    state.value.balance -= s.price;
    state.value.unlockedSentences.push(sentenceId);
    return { success: true };
  }

  function selectWoodfishSentence(sentenceId: string): boolean {
    if (!isSentenceUnlocked(sentenceId) && !isCustomSentence(sentenceId))
      return false;
    state.value.woodfish.selectedSentenceId = sentenceId;
    return true;
  }

  function selectBeadsSentence(sentenceId: string): boolean {
    if (!isSentenceUnlocked(sentenceId) && !isCustomSentence(sentenceId))
      return false;
    state.value.beads.selectedSentenceId = sentenceId;
    return true;
  }

  // ===== 自訂句子 =====

  function isCustomSentence(id: string): boolean {
    return state.value.customSentences.some((s) => s.id === id);
  }

  function unlockCustomSlot(): { success: boolean; error?: string } {
    if (state.value.customSlots >= MAX_CUSTOM_SLOTS) {
      return { success: false, error: "已達上限" };
    }
    if (state.value.balance < CUSTOM_SLOT_PRICE) {
      return { success: false, error: "功德不足" };
    }
    state.value.balance -= CUSTOM_SLOT_PRICE;
    state.value.customSlots += 1;
    return { success: true };
  }

  function addCustomSentence(text: string): {
    success: boolean;
    error?: string;
    sentence?: CustomSentence;
  } {
    if (state.value.customSentences.length >= state.value.customSlots) {
      return { success: false, error: "沒有空的自訂欄位" };
    }
    const trimmed = text.trim();
    if (!trimmed) return { success: false, error: "句子不能為空" };

    const sentence: CustomSentence = {
      id: `custom_${Date.now()}`,
      text: trimmed,
    };
    state.value.customSentences.push(sentence);
    return { success: true, sentence };
  }

  function removeCustomSentence(id: string): boolean {
    const idx = state.value.customSentences.findIndex((s) => s.id === id);
    if (idx === -1) return false;
    state.value.customSentences.splice(idx, 1);
    // 如果正在使用這個句子，切回預設
    if (state.value.woodfish.selectedSentenceId === id) {
      state.value.woodfish.selectedSentenceId = WOODFISH_DEFAULT_SENTENCE.id;
    }
    if (state.value.beads.selectedSentenceId === id) {
      state.value.beads.selectedSentenceId = BEADS_DEFAULT_SENTENCE.id;
    }
    return true;
  }

  /**
   * 取得當前選中句子的詞組
   */
  function getWoodfishWords(): string[] {
    const id = state.value.woodfish.selectedSentenceId;
    const custom = state.value.customSentences.find((s) => s.id === id);
    if (custom) return custom.text.split(/\s+/);
    const s = getSentenceById(id);
    return s?.words ?? WOODFISH_DEFAULT_SENTENCE.words;
  }

  function getBeadsWords(): string[] {
    const id = state.value.beads.selectedSentenceId;
    const custom = state.value.customSentences.find((s) => s.id === id);
    if (custom) return custom.text.split(/\s+/);
    const s = getSentenceById(id);
    return s?.words ?? BEADS_DEFAULT_SENTENCE.words;
  }

  // ===== 初始化 =====

  async function initialize(): Promise<void> {
    if (isInitialized.value) return;
    await loadState();
  }

  return {
    state,
    isInitialized,
    initialize,
    loadState,
    saveState,
    addMerit,
    tapWoodfish,
    rollBead,
    completeBeadRound,
    isSentenceUnlocked,
    unlockSentence,
    selectWoodfishSentence,
    selectBeadsSentence,
    isCustomSentence,
    unlockCustomSlot,
    addCustomSentence,
    removeCustomSentence,
    getWoodfishWords,
    getBeadsWords,
  };
});
