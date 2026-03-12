/**
 * 遊戲經濟 Store
 *
 * 管理每個聊天的遊戲經濟狀態，包含錢包、交易記錄等
 * 使用 Zod 進行資料驗證，確保資料完整性
 *
 * @requirements 1.1, 1.2, 1.3, 2.1, 2.2, 2.3, 3.1, 3.3, 3.4, 3.5, 3.6, 5.2, 5.3, 5.4, 5.5, 6.1, 7.1
 */
import {
    calculateFishPrice,
    generateRandomWeight,
    getRandomFishType,
} from "@/data/fishTypes";
import {
    FRAME_ITEMS,
    getShopItemById,
    type ShopCategory,
    type ShopItem,
    type ShopItemVariant,
} from "@/data/shopItems";
import { db, DB_STORES } from "@/db/database";
import {
    createDefaultGameState,
    safeParseGameState,
    type CaughtFish,
    type ChatGameState,
    type FishingRod,
    type GiftRecord,
    type IdleSession,
    type InventoryItem,
    type Transaction,
    type TransactionCategory,
} from "@/schemas/gameEconomy";
import { defineStore } from "pinia";
import { ref, toRaw } from "vue";

// ===== 常量定義 =====

/** 遊戲狀態 Store 名稱 */
const GAME_STATES_STORE = DB_STORES.GAME_STATES;

/** 自動保存延遲（毫秒），防止高頻操作時過度寫入 */
const AUTO_SAVE_DELAY_MS = 300;

/** 刷盤子相關常量 */
const DISH_WASHING_CONFIG = {
  /** 每日疲勞上限（最多洗幾個盤子） */
  DAILY_LIMIT: 50,
  /** 基礎獎勵最小值 */
  BASE_REWARD_MIN: 10,
  /** 基礎獎勵最大值 */
  BASE_REWARD_MAX: 25,
} as const;

/** 掛機系統相關常量 */
const IDLE_CONFIG = {
  /** 最大掛機時長（24 小時，毫秒） */
  MAX_DURATION_MS: 24 * 60 * 60 * 1000,
  /** 每分鐘最少釣魚數 */
  FISH_PER_MINUTE_MIN: 4,
  /** 每分鐘最多釣魚數 */
  FISH_PER_MINUTE_MAX: 8,
} as const;

/** 賭博系統相關常量 */
const GAMBLING_CONFIG = {
  /** 每日賭博次數上限 */
  DAILY_LIMIT: 10,
  /** 最小下注金額 */
  MIN_BET: 10,
  /** 最大下注金額 */
  MAX_BET: 1000,
} as const;

// ===== 交易結果類型 =====

export interface TransactionResult {
  success: boolean;
  error?: "insufficient_funds" | "invalid_amount";
  newBalance?: number;
}

/** 購買結果類型 */
export interface PurchaseResult {
  success: boolean;
  error?:
    | "insufficient_funds"
    | "item_not_found"
    | "already_owned"
    | "invalid_item";
  newBalance?: number;
  purchasedItem?: ShopItem;
}

/** 刷盤子結果類型 */
export interface DishWashResult {
  success: boolean;
  error?: "daily_limit_reached";
  /** 獲得的金幣（含效率加成） */
  reward?: number;
  /** 基礎獎勵（不含加成） */
  baseReward?: number;
  /** 效率乘數 */
  efficiencyMultiplier?: number;
  /** 今日已洗盤數 */
  dishesWashedToday?: number;
  /** 每日上限 */
  dailyLimit?: number;
}

/** 釣魚結果類型 */
export interface FishingResult {
  success: boolean;
  error?: "no_rod_equipped" | "rod_broken" | "no_fish_available";
  /** 釣到的魚 */
  fish?: CaughtFish;
  /** 魚竿剩餘耐久度 */
  remainingDurability?: number;
  /** 魚竿是否損壞 */
  rodBroken?: boolean;
}

/** 賣魚結果類型 */
export interface SellFishResult {
  success: boolean;
  error?: "fish_not_found" | "invalid_fish";
  /** 賣出的金額 */
  amount?: number;
  /** 賣出的魚 */
  soldFish?: CaughtFish;
}

/** 開始掛機結果類型 */
export interface StartIdleResult {
  success: boolean;
  error?: "no_rod_equipped" | "rod_broken" | "already_idle";
  /** 掛機工作階段 */
  session?: IdleSession;
}

/** 掛機收益結果類型 */
export interface IdleRewardsResult {
  /** 是否有進行中的掛機 */
  hasSession: boolean;
  /** 掛機時長（毫秒） */
  duration: number;
  /** 實際計算的時長（受上限限制，毫秒） */
  effectiveDuration: number;
  /** 預計釣到的魚數量 */
  fishCount: number;
  /** 魚竿是否會損壞 */
  rodWillBreak: boolean;
  /** 剩餘耐久度 */
  remainingDurability: number;
}

/** 領取掛機收益結果類型 */
export interface ClaimIdleResult {
  success: boolean;
  error?: "no_session" | "rod_not_found";
  /** 釣到的魚列表 */
  fish?: CaughtFish[];
  /** 魚竿是否損壞 */
  rodBroken?: boolean;
  /** 剩餘耐久度 */
  remainingDurability?: number;
}

/** 賭博選擇類型 */
export type GambleChoice = "big" | "small";

/** 賭博結果類型 */
export interface GambleResult {
  success: boolean;
  error?: "insufficient_funds" | "daily_limit_reached" | "invalid_bet";
  /** 是否贏了 */
  won?: boolean;
  /** 骰子點數（1-6） */
  diceValue?: number;
  /** 下注金額 */
  betAmount?: number;
  /** 贏得或輸掉的金額（正數為贏，負數為輸） */
  netAmount?: number;
  /** 新餘額 */
  newBalance?: number;
  /** 今日已賭博次數 */
  todayGambles?: number;
  /** 每日上限 */
  dailyLimit?: number;
}

/** 送禮結果類型 */
export interface SendGiftResult {
  success: boolean;
  error?: "gift_not_found" | "gift_not_owned" | "insufficient_quantity";
  /** 送出的禮物名稱 */
  giftName?: string;
  /** 送出的禮物 ID */
  giftItemId?: string;
  /** 送禮記錄 ID */
  giftRecordId?: string;
}

/** 轉帳結果類型 */
export interface TransferResult {
  success: boolean;
  error?: "insufficient_funds" | "invalid_amount";
  /** 轉帳金額 */
  amount?: number;
  /** 新餘額 */
  newBalance?: number;
}

// ===== Store 定義 =====

export const useGameEconomyStore = defineStore("gameEconomy", () => {
  // ===== 狀態 =====

  /** 每個聊天的遊戲狀態 Map */
  const gameStates = ref<Map<string, ChatGameState>>(new Map());

  /** 是否已初始化 */
  const isInitialized = ref(false);

  // ===== 自動保存機制 =====

  /** 每個 chatId 的自動保存計時器 */
  const _autoSaveTimers = new Map<string, ReturnType<typeof setTimeout>>();

  /** 正在進行的 loadState Promise（防止併發載入覆蓋） */
  const _loadingPromises = new Map<string, Promise<ChatGameState>>();

  /** 已從 IndexedDB 載入過的 chatId 集合（區分「從 DB 載入」vs「getState 自動建立的預設值」） */
  const _dbLoadedIds = new Set<string>();

  /**
   * 排程自動保存（防抖）
   * 在狀態變更後自動排程一次 IndexedDB 寫入
   * @param chatId 聊天 ID
   */
  function _scheduleAutoSave(chatId: string): void {
    // 清除已有的計時器
    const existing = _autoSaveTimers.get(chatId);
    if (existing) {
      clearTimeout(existing);
    }
    // 排程新的保存
    const timer = setTimeout(async () => {
      _autoSaveTimers.delete(chatId);
      try {
        await _doSave(chatId);
      } catch (error) {
        console.error("[GameEconomyStore] 自動保存失敗:", chatId, error);
      }
    }, AUTO_SAVE_DELAY_MS);
    _autoSaveTimers.set(chatId, timer);
  }

  /**
   * 內部保存方法（不經過排程）
   * @param chatId 聊天 ID
   */
  async function _doSave(chatId: string): Promise<void> {
    try {
      await db.init();
      const state = gameStates.value.get(chatId);
      if (state) {
        // 安全檢查：如果此 chatId 從未從 DB 載入過，先載入再決定是否保存
        // 防止 getState() 自動建立的預設狀態覆蓋 DB 中的真實資料
        if (!_dbLoadedIds.has(chatId)) {
          const existingRaw = await db.get<Record<string, unknown>>(
            GAME_STATES_STORE,
            chatId,
          );
          if (existingRaw) {
            console.warn(
              "[GameEconomyStore] 狀態未從 DB 載入，先恢復 DB 資料:",
              chatId,
            );
            const correctState = safeParseGameState(existingRaw, chatId);
            gameStates.value.set(chatId, correctState);
            _dbLoadedIds.add(chatId);
            return;
          }
          // DB 中無資料，標記為已載入（預設狀態是正確的）
          _dbLoadedIds.add(chatId);
        }

        // 保護機制：如果記憶體中的狀態看起來是剛建立的預設狀態，
        // 先檢查 DB 中是否已有更豐富的資料，避免覆蓋
        if (
          state.wallet === 100 &&
          state.transactions.length === 0 &&
          state.decorations.ownedFrames.length === 0 &&
          state.decorations.ownedBubbles.length === 0 &&
          state.inventory.length === 0 &&
          state.fishingRods.length === 0
        ) {
          const existingRaw = await db.get<Record<string, unknown>>(
            GAME_STATES_STORE,
            chatId,
          );
          if (existingRaw) {
            // DB 中已有資料，檢查是否比當前記憶體狀態更豐富
            const existingTxCount = Array.isArray(existingRaw.transactions)
              ? existingRaw.transactions.length
              : 0;
            const existingWallet =
              typeof existingRaw.wallet === "number" ? existingRaw.wallet : 0;
            if (existingTxCount > 0 || existingWallet !== 100) {
              console.warn(
                "[GameEconomyStore] 阻止將預設狀態覆蓋已有資料！",
                "DB 錢包:",
                existingWallet,
                "交易數:",
                existingTxCount,
              );
              // 重新從 DB 載入正確的狀態
              const correctState = safeParseGameState(existingRaw, chatId);
              gameStates.value.set(chatId, correctState);
              return;
            }
          }
        }

        // 交易記錄清理：只保留最近 500 筆，防止無限增長
        if (state.transactions.length > 500) {
          const sorted = [...state.transactions].sort(
            (a, b) => b.timestamp - a.timestamp,
          );
          state.transactions = sorted.slice(0, 500);
        }

        const plainState = JSON.parse(JSON.stringify(toRaw(state)));
        await db.put(GAME_STATES_STORE, plainState, chatId);
        console.log("[GameEconomyStore] 狀態已保存:", chatId);
      }
    } catch (error) {
      console.error("[GameEconomyStore] 保存狀態失敗:", error);
      throw error;
    }
  }

  // ===== 基礎方法 =====

  /**
   * 取得指定聊天的遊戲狀態
   * 如果不存在則建立預設狀態
   * @param chatId 聊天 ID（使用 "global" 作為全局錢包）
   * @returns 遊戲狀態
   */
  function getState(chatId: string): ChatGameState {
    let state = gameStates.value.get(chatId);
    if (!state) {
      state = createDefaultGameState(chatId);
      gameStates.value.set(chatId, state);
    }
    return state;
  }

  /**
   * 從 IndexedDB 載入指定聊天的遊戲狀態
   * 使用 Promise 去重，防止併發載入覆蓋記憶體中的最新狀態
   * @param chatId 聊天 ID（使用 "global" 作為全局錢包）
   * @param forceReload 是否強制從 DB 重新載入（忽略記憶體快取）
   * @returns 遊戲狀態
   */
  async function loadState(
    chatId: string,
    forceReload: boolean = false,
  ): Promise<ChatGameState> {
    // 如果已有進行中的載入，直接複用
    const existing = _loadingPromises.get(chatId);
    if (existing) {
      return existing;
    }

    const promise = _loadStateInternal(chatId, forceReload);
    _loadingPromises.set(chatId, promise);
    try {
      return await promise;
    } finally {
      _loadingPromises.delete(chatId);
    }
  }

  /**
   * 內部載入實作
   */
  async function _loadStateInternal(
    chatId: string,
    forceReload: boolean = false,
  ): Promise<ChatGameState> {
    try {
      // 如果有待處理的自動保存，先立即執行，避免從 DB 讀到過期資料覆蓋記憶體
      const pendingTimer = _autoSaveTimers.get(chatId);
      if (pendingTimer) {
        clearTimeout(pendingTimer);
        _autoSaveTimers.delete(chatId);
        try {
          await _doSave(chatId);
          console.log(
            "[GameEconomyStore] loadState 前已刷新待保存資料:",
            chatId,
          );
        } catch (e) {
          console.error("[GameEconomyStore] loadState 前刷新保存失敗:", e);
        }
      }

      // 如果記憶體中已有此 chatId 的狀態且已從 DB 載入過且非強制重載，直接回傳
      if (!forceReload) {
        const existing = gameStates.value.get(chatId);
        if (existing && _dbLoadedIds.has(chatId)) {
          return existing;
        }
      }

      await db.init();
      const raw = await db.get<unknown>(GAME_STATES_STORE, chatId);

      if (raw) {
        // 使用 Zod 驗證並填充預設值
        const state = safeParseGameState(raw, chatId);
        // 修復可能的 NaN 值（歷史資料損壞）
        if (Number.isNaN(state.workState.totalDishesWashed)) {
          state.workState.totalDishesWashed = 0;
        }
        if (Number.isNaN(state.workState.dishesWashedToday)) {
          state.workState.dishesWashedToday = 0;
        }
        if (Number.isNaN(state.wallet)) {
          state.wallet = 100;
        }
        gameStates.value.set(chatId, state);
        _dbLoadedIds.add(chatId);
        // 合併同類型魚竿並清理損壞的魚竿
        const rodCountBefore = state.fishingRods.length;
        consolidateFishingRods(chatId);
        const rodCountAfter = state.fishingRods.length;
        // 如果有合併或清理，自動保存
        if (rodCountBefore !== rodCountAfter) {
          console.log(
            `[GameEconomyStore] 魚竿已合併: ${rodCountBefore} -> ${rodCountAfter}`,
          );
          await saveState(chatId);
        }
        return state;
      } else {
        // 建立預設狀態（DB 中無資料，這是全新的）
        const state = createDefaultGameState(chatId);
        gameStates.value.set(chatId, state);
        _dbLoadedIds.add(chatId);
        return state;
      }
    } catch (error) {
      console.error("[GameEconomyStore] 載入狀態失敗:", error);
      // 如果記憶體中已有狀態，保留它（不要用預設值覆蓋）
      const existing = gameStates.value.get(chatId);
      if (existing) {
        return existing;
      }
      // 只有在完全沒有狀態時才建立預設狀態
      const state = createDefaultGameState(chatId);
      gameStates.value.set(chatId, state);
      return state;
    }
  }

  /**
   * 合併同類型魚竿並清理損壞的魚竿
   * 同名稱的魚竿會合併耐久度，只保留一根
   * @param chatId 聊天 ID
   */
  function consolidateFishingRods(chatId: string): void {
    const state = getState(chatId);

    // 先移除耐久度為 0 的魚竿
    state.fishingRods = state.fishingRods.filter((rod) => rod.durability > 0);

    // 按名稱分組
    const rodsByName = new Map<string, FishingRod[]>();
    for (const rod of state.fishingRods) {
      const existing = rodsByName.get(rod.name) || [];
      existing.push(rod);
      rodsByName.set(rod.name, existing);
    }

    // 合併同類型魚竿
    const consolidatedRods: FishingRod[] = [];
    for (const [, rods] of rodsByName) {
      if (rods.length === 1) {
        consolidatedRods.push(rods[0]);
      } else {
        // 合併耐久度到第一根魚竿
        const primaryRod = rods[0];
        let totalDurability = 0;
        let totalMaxDurability = 0;
        for (const rod of rods) {
          totalDurability += rod.durability;
          totalMaxDurability += rod.maxDurability;
        }
        primaryRod.durability = totalDurability;
        primaryRod.maxDurability = totalMaxDurability;
        consolidatedRods.push(primaryRod);
      }
    }

    state.fishingRods = consolidatedRods;

    // 如果裝備的魚竿被移除了，清除裝備狀態
    if (
      state.equippedRodId &&
      !state.fishingRods.some((r) => r.id === state.equippedRodId)
    ) {
      state.equippedRodId = null;
    }
  }

  /**
   * 保存指定聊天的遊戲狀態到 IndexedDB
   * 會取消待處理的自動保存並立即寫入
   * @param chatId 聊天 ID
   */
  async function saveState(chatId: string): Promise<void> {
    // 取消待處理的自動保存，改為立即保存
    const pendingTimer = _autoSaveTimers.get(chatId);
    if (pendingTimer) {
      clearTimeout(pendingTimer);
      _autoSaveTimers.delete(chatId);
    }
    await _doSave(chatId);
  }

  // ===== 錢包操作方法 =====

  /**
   * 新增交易記錄
   * @param chatId 聊天 ID
   * @param type 交易類型
   * @param amount 金額
   * @param category 交易分類
   * @param description 描述
   * @param relatedItemId 相關物品 ID（可選）
   */
  function addTransaction(
    chatId: string,
    type: "income" | "expense",
    amount: number,
    category: TransactionCategory,
    description: string,
    relatedItemId?: string,
  ): Transaction {
    const state = getState(chatId);
    const transaction: Transaction = {
      id: `tx-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type,
      amount,
      category,
      description,
      relatedItemId,
      timestamp: Date.now(),
    };
    state.transactions.push(transaction);
    return transaction;
  }

  /**
   * 賺取金幣
   * @param chatId 聊天 ID
   * @param amount 金額
   * @param category 交易分類
   * @param description 描述
   * @param relatedItemId 相關物品 ID（可選）
   * @returns 交易結果
   */
  function earnMoney(
    chatId: string,
    amount: number,
    category: TransactionCategory,
    description: string,
    relatedItemId?: string,
  ): TransactionResult {
    if (amount <= 0) {
      return { success: false, error: "invalid_amount" };
    }

    const state = getState(chatId);
    state.wallet += amount;
    addTransaction(
      chatId,
      "income",
      amount,
      category,
      description,
      relatedItemId,
    );

    _scheduleAutoSave(chatId);
    return { success: true, newBalance: state.wallet };
  }

  /**
   * 消費金幣
   * @param chatId 聊天 ID
   * @param amount 金額
   * @param category 交易分類
   * @param description 描述
   * @param relatedItemId 相關物品 ID（可選）
   * @returns 交易結果
   */
  function spendMoney(
    chatId: string,
    amount: number,
    category: TransactionCategory,
    description: string,
    relatedItemId?: string,
  ): TransactionResult {
    if (amount <= 0) {
      return { success: false, error: "invalid_amount" };
    }

    const state = getState(chatId);

    // 餘額不足檢查
    if (state.wallet < amount) {
      return { success: false, error: "insufficient_funds" };
    }

    state.wallet -= amount;
    addTransaction(
      chatId,
      "expense",
      amount,
      category,
      description,
      relatedItemId,
    );

    _scheduleAutoSave(chatId);
    return { success: true, newBalance: state.wallet };
  }

  /**
   * 檢查餘額是否足夠
   * @param chatId 聊天 ID
   * @param amount 金額
   * @returns 是否足夠
   */
  function hasEnoughBalance(chatId: string, amount: number): boolean {
    const state = getState(chatId);
    return state.wallet >= amount;
  }

  /**
   * 取得錢包餘額
   * @param chatId 聊天 ID
   * @returns 餘額
   */
  function getBalance(chatId: string): number {
    return getState(chatId).wallet;
  }

  /**
   * 取得交易記錄
   * @param chatId 聊天 ID
   * @param limit 限制數量（可選）
   * @returns 交易記錄列表
   */
  function getTransactions(chatId: string, limit?: number): Transaction[] {
    const state = getState(chatId);
    const transactions = [...state.transactions].sort(
      (a, b) => b.timestamp - a.timestamp,
    );
    return limit ? transactions.slice(0, limit) : transactions;
  }

  /**
   * 計算餘額（從交易記錄重新計算）
   * 用於驗證餘額一致性
   * @param chatId 聊天 ID
   * @param initialBalance 初始餘額
   * @returns 計算後的餘額
   */
  function calculateBalanceFromTransactions(
    chatId: string,
    initialBalance: number = 100,
  ): number {
    const state = getState(chatId);
    return state.transactions.reduce((balance, tx) => {
      if (tx.type === "income") {
        return balance + tx.amount;
      } else {
        return balance - tx.amount;
      }
    }, initialBalance);
  }

  // ===== 刷盤子小遊戲方法 =====

  /**
   * 取得今日日期字串（用於每日重置判斷）
   * @returns YYYY-MM-DD 格式的日期字串
   */
  function getTodayDateString(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  }

  /**
   * 檢查並重置每日打工狀態
   * @param chatId 聊天 ID
   */
  function checkAndResetDailyWorkState(chatId: string): void {
    const state = getState(chatId);
    const today = getTodayDateString();

    // 如果日期不同，重置今日洗盤數
    if (state.workState.lastWorkDate !== today) {
      state.workState.dishesWashedToday = 0;
      state.workState.lastWorkDate = today;
    }
  }

  /**
   * 計算效率道具加成乘數
   * 根據背包中的效率道具計算總乘數
   * @param chatId 聊天 ID
   * @returns 效率乘數（基礎為 1.0）
   */
  function calculateWorkEfficiencyMultiplier(chatId: string): number {
    const state = getState(chatId);
    let multiplier = 1.0;

    // 遍歷背包中的消耗品，找出效率道具
    for (const item of state.inventory) {
      if (item.type === "consumable") {
        const shopItem = getShopItemById(item.itemId);
        if (shopItem?.consumableEffect?.type === "work_efficiency") {
          // 累乘效率加成
          multiplier *= shopItem.consumableEffect.multiplier;
        }
      }
    }

    return multiplier;
  }

  /**
   * 生成刷盤子基礎獎勵（10-25 金幣）
   * @returns 基礎獎勵金額
   */
  function generateDishWashingBaseReward(): number {
    const { BASE_REWARD_MIN, BASE_REWARD_MAX } = DISH_WASHING_CONFIG;
    return (
      Math.floor(Math.random() * (BASE_REWARD_MAX - BASE_REWARD_MIN + 1)) +
      BASE_REWARD_MIN
    );
  }

  /**
   * 刷盤子（洗一個盤子）
   * @param chatId 聊天 ID
   * @returns 刷盤子結果
   * @requirements 2.1, 2.2, 2.3
   */
  function washDish(chatId: string): DishWashResult {
    const state = getState(chatId);

    // 檢查並重置每日狀態
    checkAndResetDailyWorkState(chatId);

    // 檢查是否達到每日上限
    if (state.workState.dishesWashedToday >= DISH_WASHING_CONFIG.DAILY_LIMIT) {
      return {
        success: false,
        error: "daily_limit_reached",
        dishesWashedToday: state.workState.dishesWashedToday,
        dailyLimit: DISH_WASHING_CONFIG.DAILY_LIMIT,
      };
    }

    // 計算效率乘數
    const efficiencyMultiplier = calculateWorkEfficiencyMultiplier(chatId);

    // 生成基礎獎勵
    const baseReward = generateDishWashingBaseReward();

    // 計算最終獎勵（基礎獎勵 * 效率乘數，向下取整）
    const finalReward = Math.floor(baseReward * efficiencyMultiplier);

    // 更新狀態
    state.workState.dishesWashedToday += 1;
    state.workState.totalDishesWashed += 1;

    // 增加金幣
    earnMoney(chatId, finalReward, "work", `刷盤子獲得 ${finalReward} 金幣`);

    return {
      success: true,
      reward: finalReward,
      baseReward,
      efficiencyMultiplier,
      dishesWashedToday: state.workState.dishesWashedToday,
      dailyLimit: DISH_WASHING_CONFIG.DAILY_LIMIT,
    };
  }

  /**
   * 取得打工狀態
   * @param chatId 聊天 ID
   * @returns 打工狀態
   */
  function getWorkState(chatId: string) {
    checkAndResetDailyWorkState(chatId);
    const state = getState(chatId);
    // 防禦：確保數值不是 NaN
    if (Number.isNaN(state.workState.totalDishesWashed)) {
      state.workState.totalDishesWashed = 0;
    }
    if (Number.isNaN(state.workState.dishesWashedToday)) {
      state.workState.dishesWashedToday = 0;
    }
    return state.workState;
  }

  /**
   * 檢查是否可以繼續刷盤子
   * @param chatId 聊天 ID
   * @returns 是否可以繼續
   */
  function canWashDish(chatId: string): boolean {
    checkAndResetDailyWorkState(chatId);
    const state = getState(chatId);
    return state.workState.dishesWashedToday < DISH_WASHING_CONFIG.DAILY_LIMIT;
  }

  /**
   * 取得刷盤子配置常量
   * @returns 配置常量
   */
  function getDishWashingConfig() {
    return { ...DISH_WASHING_CONFIG };
  }

  // ===== 商城購買方法 =====

  /**
   * 檢查是否已擁有裝飾品
   * @param chatId 聊天 ID
   * @param itemId 商品 ID
   * @param category 商品分類
   * @returns 是否已擁有
   */
  function ownsDecoration(
    chatId: string,
    itemId: string,
    category: ShopCategory,
  ): boolean {
    const state = getState(chatId);
    // Ensure decorations object exists with proper defaults
    if (!state.decorations) {
      state.decorations = {
        ownedFrames: [],
        ownedBubbles: [],
        equippedFrameId: null,
        equippedBubbleId: null,
      };
    }
    if (!state.decorations.ownedFrames) {
      state.decorations.ownedFrames = [];
    }
    if (!state.decorations.ownedBubbles) {
      state.decorations.ownedBubbles = [];
    }

    if (category === "frame") {
      return state.decorations.ownedFrames.includes(itemId);
    } else if (category === "bubble") {
      return state.decorations.ownedBubbles.includes(itemId);
    }
    return false;
  }

  /**
   * 購買商品
   * @param chatId 聊天 ID
   * @param itemId 商品 ID（變體商品格式：baseId_variantId）
   * @param quantity 購買數量（預設為 1，僅對魚竿有效）
   * @returns 購買結果
   */
  function purchaseItem(
    chatId: string,
    itemId: string,
    quantity: number = 1,
  ): PurchaseResult {
    // 解析變體 ID（格式：baseId_variantId）
    const { baseId, variantId, variant } = parseVariantItemId(itemId);
    const item = getShopItemById(baseId);

    // 檢查商品是否存在
    if (!item) {
      return { success: false, error: "item_not_found" };
    }

    // 如果商品有變體但傳入的不是變體 ID，返回錯誤
    if (item.variants && item.variants.length > 0 && !variantId) {
      return { success: false, error: "invalid_item" };
    }

    // 如果傳入了變體 ID 但商品沒有該變體，返回錯誤
    if (variantId && !variant) {
      return { success: false, error: "item_not_found" };
    }

    const state = getState(chatId);

    // 計算總價（魚竿支援批量購買）
    const totalPrice =
      item.category === "rod" ? item.price * quantity : item.price;

    // 檢查餘額是否足夠
    if (state.wallet < totalPrice) {
      return { success: false, error: "insufficient_funds" };
    }

    // 根據商品類型處理
    switch (item.category) {
      case "frame":
      case "bubble":
        return purchaseDecoration(chatId, item, itemId, variant);
      case "rod":
        return purchaseRod(chatId, item, quantity);
      case "gift":
      case "consumable":
        return purchaseInventoryItem(chatId, item);
      default:
        return { success: false, error: "invalid_item" };
    }
  }

  /**
   * 解析變體商品 ID
   * @param itemId 商品 ID（可能包含變體：baseId_variantId）
   * @returns 解析結果
   */
  function parseVariantItemId(itemId: string): {
    baseId: string;
    variantId: string | null;
    variant: ShopItemVariant | null;
  } {
    // 嘗試找到匹配的基礎商品
    const directItem = getShopItemById(itemId);
    if (directItem) {
      return { baseId: itemId, variantId: null, variant: null };
    }

    // 嘗試解析為 baseId_variantId 格式
    const lastUnderscoreIndex = itemId.lastIndexOf("_");
    if (lastUnderscoreIndex === -1) {
      return { baseId: itemId, variantId: null, variant: null };
    }

    const baseId = itemId.substring(0, lastUnderscoreIndex);
    const variantId = itemId.substring(lastUnderscoreIndex + 1);
    const baseItem = getShopItemById(baseId);

    if (!baseItem || !baseItem.variants) {
      return { baseId: itemId, variantId: null, variant: null };
    }

    const variant = baseItem.variants.find((v) => v.variantId === variantId);
    if (!variant) {
      return { baseId: itemId, variantId: null, variant: null };
    }

    return { baseId, variantId, variant };
  }

  /**
   * 購買裝飾品（頭像框、聊天氣泡）
   * @param chatId 聊天 ID
   * @param item 商品
   * @param actualId 實際購買的 ID（變體商品為 baseId_variantId）
   * @param variant 變體資訊（如果有）
   * @returns 購買結果
   */
  function purchaseDecoration(
    chatId: string,
    item: ShopItem,
    actualId: string,
    variant: ShopItemVariant | null,
  ): PurchaseResult {
    const state = getState(chatId);

    // 檢查是否已擁有（裝飾品不可重複購買）
    if (ownsDecoration(chatId, actualId, item.category)) {
      return { success: false, error: "already_owned" };
    }

    // 扣除金幣
    state.wallet -= item.price;

    // 加入已擁有清單（使用實際 ID，變體商品為 baseId_variantId）
    if (item.category === "frame") {
      state.decorations.ownedFrames.push(actualId);
    } else if (item.category === "bubble") {
      state.decorations.ownedBubbles.push(actualId);
    }

    // 記錄交易（顯示變體名稱）
    const displayName = variant ? `${item.name} - ${variant.name}` : item.name;
    addTransaction(
      chatId,
      "expense",
      item.price,
      "shop",
      `購買 ${displayName}`,
      actualId,
    );

    _scheduleAutoSave(chatId);
    return {
      success: true,
      newBalance: state.wallet,
      purchasedItem: item,
    };
  }

  /**
   * 購買魚竿
   * @param chatId 聊天 ID
   * @param item 商品
   * @param quantity 購買數量（預設為 1）
   * @returns 購買結果
   */
  function purchaseRod(
    chatId: string,
    item: ShopItem,
    quantity: number = 1,
  ): PurchaseResult {
    if (!item.rodStats) {
      return { success: false, error: "invalid_item" };
    }

    const state = getState(chatId);
    const totalPrice = item.price * quantity;
    const totalDurability = item.rodStats.maxDurability * quantity;

    // 檢查餘額是否足夠
    if (state.wallet < totalPrice) {
      return { success: false, error: "insufficient_funds" };
    }

    // 扣除金幣
    state.wallet -= totalPrice;

    // 查找是否已有同類型的魚竿（根據名稱匹配）
    const existingRod = state.fishingRods.find((rod) => rod.name === item.name);

    if (existingRod) {
      // 疊加耐久度到現有魚竿
      existingRod.durability += totalDurability;
      existingRod.maxDurability += totalDurability;
    } else {
      // 建立新魚竿實例
      const rod: FishingRod = {
        id: `rod-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        name: item.name,
        price: item.price,
        durability: totalDurability,
        maxDurability: totalDurability,
        minFishTier: item.rodStats.minFishTier,
        maxFishTier: item.rodStats.maxFishTier,
        efficiency: item.rodStats.efficiency,
      };

      // 加入背包
      state.fishingRods.push(rod);
    }

    // 記錄交易
    addTransaction(
      chatId,
      "expense",
      totalPrice,
      "shop",
      quantity > 1 ? `購買 ${item.name} x${quantity}` : `購買 ${item.name}`,
      item.id,
    );

    _scheduleAutoSave(chatId);
    return {
      success: true,
      newBalance: state.wallet,
      purchasedItem: item,
    };
  }

  /**
   * 購買背包物品（禮物、消耗品）
   * @param chatId 聊天 ID
   * @param item 商品
   * @returns 購買結果
   */
  function purchaseInventoryItem(
    chatId: string,
    item: ShopItem,
  ): PurchaseResult {
    const state = getState(chatId);

    // 扣除金幣
    state.wallet -= item.price;

    // 檢查背包中是否已有該物品
    const existingItem = state.inventory.find((i) => i.itemId === item.id);

    if (existingItem) {
      // 增加數量
      existingItem.quantity += 1;
    } else {
      // 建立新的背包物品
      const inventoryItem: InventoryItem = {
        id: `inv-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        itemId: item.id,
        name: item.name,
        type: item.category === "gift" ? "gift" : "consumable",
        quantity: 1,
        acquiredAt: Date.now(),
      };
      state.inventory.push(inventoryItem);
    }

    // 記錄交易
    addTransaction(
      chatId,
      "expense",
      item.price,
      "shop",
      `購買 ${item.name}`,
      item.id,
    );

    _scheduleAutoSave(chatId);
    return {
      success: true,
      newBalance: state.wallet,
      purchasedItem: item,
    };
  }

  // ===== 裝備切換方法 =====

  /**
   * 裝備頭像框
   * @param chatId 聊天 ID
   * @param frameId 頭像框 ID（null 表示卸下）
   * @returns 是否成功
   */
  function equipFrame(chatId: string, frameId: string | null): boolean {
    const state = getState(chatId);

    // 如果要裝備，檢查是否擁有
    if (frameId !== null && !state.decorations.ownedFrames.includes(frameId)) {
      return false;
    }

    state.decorations.equippedFrameId = frameId;
    _scheduleAutoSave(chatId);
    return true;
  }

  /**
   * [開發用] 免費獲得頭像框
   * @param chatId 聊天 ID
   * @param frameId 頭像框 ID
   */
  function grantFrame(chatId: string, frameId: string): void {
    const state = getState(chatId);
    // 確保 decorations 存在
    if (!state.decorations) {
      state.decorations = {
        ownedFrames: [],
        ownedBubbles: [],
        equippedFrameId: null,
        equippedBubbleId: null,
      };
    }
    if (!state.decorations.ownedFrames) {
      state.decorations.ownedFrames = [];
    }
    if (!state.decorations.ownedFrames.includes(frameId)) {
      state.decorations.ownedFrames.push(frameId);
    }
    _scheduleAutoSave(chatId);
  }

  /**
   * [開發用] 免費獲得所有頭像框
   * @param chatId 聊天 ID
   */
  function grantAllFrames(chatId: string): void {
    const state = getState(chatId);
    // 確保 decorations 存在
    if (!state.decorations) {
      state.decorations = {
        ownedFrames: [],
        ownedBubbles: [],
        equippedFrameId: null,
        equippedBubbleId: null,
      };
    }
    if (!state.decorations.ownedFrames) {
      state.decorations.ownedFrames = [];
    }
    const allFrameIds = FRAME_ITEMS.map((item) => item.id);
    for (const frameId of allFrameIds) {
      if (!state.decorations.ownedFrames.includes(frameId)) {
        state.decorations.ownedFrames.push(frameId);
      }
    }
    _scheduleAutoSave(chatId);
  }

  /**
   * 裝備聊天氣泡
   * @param chatId 聊天 ID
   * @param bubbleId 氣泡 ID（null 表示卸下）
   * @returns 是否成功
   */
  function equipBubble(chatId: string, bubbleId: string | null): boolean {
    const state = getState(chatId);

    // 如果要裝備，檢查是否擁有
    if (
      bubbleId !== null &&
      !state.decorations.ownedBubbles.includes(bubbleId)
    ) {
      return false;
    }

    state.decorations.equippedBubbleId = bubbleId;
    _scheduleAutoSave(chatId);
    return true;
  }

  /**
   * 裝備魚竿
   * @param chatId 聊天 ID
   * @param rodId 魚竿 ID（null 表示卸下）
   * @returns 是否成功
   */
  function equipRod(chatId: string, rodId: string | null): boolean {
    const state = getState(chatId);

    // 如果要裝備，檢查是否擁有且耐久度大於 0
    if (rodId !== null) {
      const rod = state.fishingRods.find((r) => r.id === rodId);
      if (!rod || rod.durability <= 0) {
        return false;
      }
    }

    state.equippedRodId = rodId;
    _scheduleAutoSave(chatId);
    return true;
  }

  /**
   * 取得已裝備的魚竿
   * @param chatId 聊天 ID
   * @returns 已裝備的魚竿或 null
   */
  function getEquippedRod(chatId: string): FishingRod | null {
    const state = getState(chatId);
    if (!state.equippedRodId) return null;
    return state.fishingRods.find((r) => r.id === state.equippedRodId) || null;
  }

  /**
   * 取得所有魚竿
   * @param chatId 聊天 ID
   * @returns 魚竿列表
   */
  function getFishingRods(chatId: string): FishingRod[] {
    return getState(chatId).fishingRods;
  }

  /**
   * 取得背包物品
   * @param chatId 聊天 ID
   * @returns 背包物品列表
   */
  function getInventory(chatId: string): InventoryItem[] {
    return getState(chatId).inventory;
  }

  /**
   * 取得裝飾品狀態
   * @param chatId 聊天 ID
   * @returns 裝飾品狀態
   */
  function getDecorations(chatId: string) {
    const state = getState(chatId);
    // 確保 decorations 及其子屬性存在
    if (!state.decorations) {
      state.decorations = {
        ownedFrames: [],
        ownedBubbles: [],
        equippedFrameId: null,
        equippedBubbleId: null,
      };
    }
    if (!state.decorations.ownedFrames) {
      state.decorations.ownedFrames = [];
    }
    if (!state.decorations.ownedBubbles) {
      state.decorations.ownedBubbles = [];
    }
    return state.decorations;
  }

  // ===== 釣魚系統方法 =====

  /**
   * 根據魚竿等級生成隨機魚
   * @param rod 魚竿
   * @returns 生成的魚或 undefined（如果沒有可釣的魚）
   * @requirements 3.3
   */
  function generateFish(rod: FishingRod): CaughtFish | undefined {
    // 根據魚竿等級範圍隨機選擇魚種
    const fishType = getRandomFishType(rod.minFishTier, rod.maxFishTier);
    if (!fishType) {
      return undefined;
    }

    // 生成隨機重量
    const weight = generateRandomWeight(fishType);

    // 計算最終價格
    const finalPrice = calculateFishPrice(fishType, weight);

    // 建立釣到的魚
    const caughtFish: CaughtFish = {
      id: `fish-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      fishTypeId: fishType.id,
      name: fishType.name,
      tier: fishType.tier,
      weight,
      basePrice: fishType.basePrice,
      finalPrice,
      rarity: fishType.rarity,
      caughtAt: Date.now(),
    };

    return caughtFish;
  }

  /**
   * 釣魚（消耗耐久度、加入魚簍）
   * @param chatId 聊天 ID
   * @returns 釣魚結果
   * @requirements 3.3, 3.4, 3.5
   */
  function catchFish(chatId: string): FishingResult {
    const state = getState(chatId);

    // 檢查是否有裝備魚竿
    if (!state.equippedRodId) {
      return { success: false, error: "no_rod_equipped" };
    }

    // 取得裝備的魚竿
    const rod = state.fishingRods.find((r) => r.id === state.equippedRodId);
    if (!rod) {
      return { success: false, error: "no_rod_equipped" };
    }

    // 檢查魚竿耐久度
    if (rod.durability <= 0) {
      return { success: false, error: "rod_broken" };
    }

    // 生成魚
    const fish = generateFish(rod);
    if (!fish) {
      return { success: false, error: "no_fish_available" };
    }

    // 消耗魚竿耐久度
    rod.durability -= 1;

    // 檢查魚竿是否損壞
    const rodBroken = rod.durability <= 0;
    if (rodBroken) {
      // 自動卸下損壞的魚竿
      state.equippedRodId = null;
      // 刪除損壞的魚竿
      const rodIndex = state.fishingRods.findIndex((r) => r.id === rod.id);
      if (rodIndex !== -1) {
        state.fishingRods.splice(rodIndex, 1);
      }
    }

    // 將魚加入魚簍
    state.fishInventory.push(fish);
    state.totalFishCaught += 1;

    _scheduleAutoSave(chatId);
    return {
      success: true,
      fish,
      remainingDurability: rod.durability,
      rodBroken,
    };
  }

  /**
   * 賣魚
   * @param chatId 聊天 ID
   * @param fishId 魚的 ID
   * @returns 賣魚結果
   * @requirements 3.6
   */
  function sellFish(chatId: string, fishId: string): SellFishResult {
    const state = getState(chatId);

    // 找到要賣的魚
    const fishIndex = state.fishInventory.findIndex((f) => f.id === fishId);
    if (fishIndex === -1) {
      return { success: false, error: "fish_not_found" };
    }

    const fish = state.fishInventory[fishIndex];

    // 從魚簍移除
    state.fishInventory.splice(fishIndex, 1);

    // 增加金幣
    earnMoney(
      chatId,
      fish.finalPrice,
      "fishing",
      `賣出 ${fish.name}（${fish.weight.toFixed(2)} 公斤）`,
      fish.id,
    );

    return {
      success: true,
      amount: fish.finalPrice,
      soldFish: fish,
    };
  }

  /**
   * 賣出所有魚
   * @param chatId 聊天 ID
   * @returns 賣出的總金額
   */
  function sellAllFish(chatId: string): number {
    const state = getState(chatId);
    let totalAmount = 0;

    // 計算總金額
    for (const fish of state.fishInventory) {
      totalAmount += fish.finalPrice;
    }

    if (totalAmount > 0) {
      // 增加金幣
      earnMoney(
        chatId,
        totalAmount,
        "fishing",
        `賣出 ${state.fishInventory.length} 條魚`,
      );

      // 清空魚簍
      state.fishInventory = [];
    }

    return totalAmount;
  }

  /**
   * 取得魚簍中的魚
   * @param chatId 聊天 ID
   * @returns 魚簍中的魚列表
   */
  function getFishInventory(chatId: string): CaughtFish[] {
    return getState(chatId).fishInventory;
  }

  /**
   * 取得釣魚統計
   * @param chatId 聊天 ID
   * @returns 釣魚統計資訊
   */
  function getFishingStats(chatId: string) {
    const state = getState(chatId);
    return {
      totalFishCaught: state.totalFishCaught,
      fishInInventory: state.fishInventory.length,
      equippedRod: getEquippedRod(chatId),
      ownedRods: state.fishingRods.length,
    };
  }

  // ===== 掛機系統方法 =====

  /**
   * 開始掛機釣魚
   * @param chatId 聊天 ID
   * @returns 開始掛機結果
   * @requirements 4.1
   */
  function startIdleSession(chatId: string): StartIdleResult {
    const state = getState(chatId);

    // 檢查是否已有進行中的掛機
    if (state.currentIdleSession) {
      return { success: false, error: "already_idle" };
    }

    // 檢查是否有裝備魚竿
    if (!state.equippedRodId) {
      return { success: false, error: "no_rod_equipped" };
    }

    // 取得裝備的魚竿
    const rod = state.fishingRods.find((r) => r.id === state.equippedRodId);
    if (!rod) {
      return { success: false, error: "no_rod_equipped" };
    }

    // 檢查魚竿耐久度
    if (rod.durability <= 0) {
      return { success: false, error: "rod_broken" };
    }

    // 建立掛機工作階段
    const session: IdleSession = {
      type: "fishing",
      startTime: Date.now(),
      maxDuration: IDLE_CONFIG.MAX_DURATION_MS,
      rodId: rod.id,
      efficiency: rod.efficiency,
    };

    state.currentIdleSession = session;

    _scheduleAutoSave(chatId);
    return {
      success: true,
      session,
    };
  }

  /**
   * 計算掛機收益（不實際領取）
   * @param chatId 聊天 ID
   * @returns 掛機收益計算結果
   * @requirements 4.2, 4.3, 4.5
   */
  function calculateIdleRewards(chatId: string): IdleRewardsResult {
    const state = getState(chatId);

    // 檢查是否有進行中的掛機
    if (!state.currentIdleSession) {
      return {
        hasSession: false,
        duration: 0,
        effectiveDuration: 0,
        fishCount: 0,
        rodWillBreak: false,
        remainingDurability: 0,
      };
    }

    const session = state.currentIdleSession;
    const now = Date.now();

    // 計算實際掛機時長
    const actualDuration = now - session.startTime;

    // 應用 24 小時上限
    const effectiveDuration = Math.min(
      actualDuration,
      IDLE_CONFIG.MAX_DURATION_MS,
    );

    // 計算掛機分鐘數
    const idleMinutes = Math.floor(effectiveDuration / 60000);

    // 計算可釣到的魚數量（每分鐘 6-20 條隨機，乘以效率係數）
    // 使用固定種子來確保預覽和實際領取一致
    const seed = session.startTime;
    let fishCount = 0;
    for (let i = 0; i < idleMinutes; i++) {
      // 使用簡單的偽隨機，基於種子和分鐘數
      const minuteSeed = (seed + i * 12345) % 2147483647;
      const random = (minuteSeed % 1000) / 1000;
      const fishThisMinute = Math.floor(
        IDLE_CONFIG.FISH_PER_MINUTE_MIN +
          random *
            (IDLE_CONFIG.FISH_PER_MINUTE_MAX - IDLE_CONFIG.FISH_PER_MINUTE_MIN),
      );
      fishCount += Math.floor(fishThisMinute * session.efficiency);
    }

    // 取得魚竿資訊
    const rod = state.fishingRods.find((r) => r.id === session.rodId);
    if (!rod) {
      return {
        hasSession: true,
        duration: actualDuration,
        effectiveDuration,
        fishCount: 0,
        rodWillBreak: true,
        remainingDurability: 0,
      };
    }

    // 計算魚竿是否會損壞（受耐久度限制）
    const actualFishCount = Math.min(fishCount, rod.durability);
    const remainingDurability = rod.durability - actualFishCount;
    const rodWillBreak = remainingDurability <= 0;

    return {
      hasSession: true,
      duration: actualDuration,
      effectiveDuration,
      fishCount: actualFishCount,
      rodWillBreak,
      remainingDurability: Math.max(0, remainingDurability),
    };
  }

  /**
   * 領取掛機收益
   * @param chatId 聊天 ID
   * @returns 領取結果
   * @requirements 4.2, 4.3, 4.4
   */
  function claimIdleRewards(chatId: string): ClaimIdleResult {
    const state = getState(chatId);

    // 檢查是否有進行中的掛機
    if (!state.currentIdleSession) {
      return { success: false, error: "no_session" };
    }

    const session = state.currentIdleSession;

    // 取得魚竿
    const rod = state.fishingRods.find((r) => r.id === session.rodId);
    if (!rod) {
      // 清除掛機狀態
      state.currentIdleSession = null;
      return { success: false, error: "rod_not_found" };
    }

    // 計算收益（使用 calculateIdleRewards 確保一致性）
    const rewards = calculateIdleRewards(chatId);

    // 記錄實際釣到的魚數量
    const actualFishCount = rewards.fishCount;

    // 生成魚
    const caughtFish: CaughtFish[] = [];
    for (let i = 0; i < actualFishCount; i++) {
      const fish = generateFish(rod);
      if (fish) {
        caughtFish.push(fish);
        state.fishInventory.push(fish);
        state.totalFishCaught += 1;
      }
    }

    // 消耗魚竿耐久度（只消耗實際釣到的魚數量）
    rod.durability = Math.max(0, rod.durability - caughtFish.length);

    // 檢查魚竿是否損壞
    const rodBroken = rod.durability <= 0;
    if (rodBroken) {
      // 自動卸下損壞的魚竿
      if (state.equippedRodId === rod.id) {
        state.equippedRodId = null;
      }
      // 刪除損壞的魚竿
      const rodIndex = state.fishingRods.findIndex((r) => r.id === rod.id);
      if (rodIndex !== -1) {
        state.fishingRods.splice(rodIndex, 1);
      }
    }

    // 清除掛機狀態
    state.currentIdleSession = null;

    console.log(
      `[GameEconomyStore] 掛機領取: 預計 ${actualFishCount} 條, 實際生成 ${caughtFish.length} 條`,
    );

    _scheduleAutoSave(chatId);
    return {
      success: true,
      fish: caughtFish,
      rodBroken,
      remainingDurability: rod.durability,
    };
  }

  /**
   * 取得當前掛機狀態
   * @param chatId 聊天 ID
   * @returns 當前掛機工作階段或 null
   */
  function getCurrentIdleSession(chatId: string): IdleSession | null {
    return getState(chatId).currentIdleSession;
  }

  /**
   * 檢查是否正在掛機
   * @param chatId 聊天 ID
   * @returns 是否正在掛機
   */
  function isIdle(chatId: string): boolean {
    return getState(chatId).currentIdleSession !== null;
  }

  /**
   * 取消掛機（不領取收益）
   * @param chatId 聊天 ID
   * @returns 是否成功取消
   */
  function cancelIdleSession(chatId: string): boolean {
    const state = getState(chatId);
    if (!state.currentIdleSession) {
      return false;
    }
    state.currentIdleSession = null;
    _scheduleAutoSave(chatId);
    return true;
  }

  /**
   * 取得掛機系統配置
   * @returns 掛機系統配置
   */
  function getIdleConfig() {
    return { ...IDLE_CONFIG };
  }

  // ===== 賭博系統方法 =====

  /**
   * 檢查並重置每日賭博狀態
   * @param chatId 聊天 ID
   */
  function checkAndResetDailyGamblingState(chatId: string): void {
    const state = getState(chatId);
    const today = getTodayDateString();

    // 如果日期不同，重置今日賭博次數
    if (state.gamblingStats.lastGambleDate !== today) {
      state.gamblingStats.todayGambles = 0;
      state.gamblingStats.lastGambleDate = today;
    }
  }

  /**
   * 生成骰子點數（1-6）
   * @returns 骰子點數
   */
  function rollDice(): number {
    return Math.floor(Math.random() * 6) + 1;
  }

  /**
   * 判斷骰子結果是大還是小
   * 1-3 為小，4-6 為大
   * @param diceValue 骰子點數
   * @returns 結果
   */
  function getDiceResult(diceValue: number): GambleChoice {
    return diceValue <= 3 ? "small" : "big";
  }

  /**
   * 賭博（猜大小）
   * @param chatId 聊天 ID
   * @param betAmount 下注金額
   * @param choice 玩家選擇（大或小）
   * @returns 賭博結果
   * @requirements 9.1, 9.2, 9.3, 9.4
   */
  function gamble(
    chatId: string,
    betAmount: number,
    choice: GambleChoice,
  ): GambleResult {
    const state = getState(chatId);

    // 檢查並重置每日狀態
    checkAndResetDailyGamblingState(chatId);

    // 檢查下注金額是否有效
    if (
      betAmount < GAMBLING_CONFIG.MIN_BET ||
      betAmount > GAMBLING_CONFIG.MAX_BET
    ) {
      return {
        success: false,
        error: "invalid_bet",
        todayGambles: state.gamblingStats.todayGambles,
        dailyLimit: GAMBLING_CONFIG.DAILY_LIMIT,
      };
    }

    // 檢查是否達到每日上限
    if (state.gamblingStats.todayGambles >= GAMBLING_CONFIG.DAILY_LIMIT) {
      return {
        success: false,
        error: "daily_limit_reached",
        todayGambles: state.gamblingStats.todayGambles,
        dailyLimit: GAMBLING_CONFIG.DAILY_LIMIT,
      };
    }

    // 檢查餘額是否足夠
    if (state.wallet < betAmount) {
      return {
        success: false,
        error: "insufficient_funds",
        todayGambles: state.gamblingStats.todayGambles,
        dailyLimit: GAMBLING_CONFIG.DAILY_LIMIT,
      };
    }

    // 擲骰子
    const diceValue = rollDice();
    const diceResult = getDiceResult(diceValue);
    const won = choice === diceResult;

    // 計算淨收益
    let netAmount: number;
    if (won) {
      // 贏了：獲得雙倍下注金額（淨收益為下注金額）
      netAmount = betAmount;
      state.wallet += betAmount;
      state.gamblingStats.totalWins += 1;
      addTransaction(
        chatId,
        "income",
        betAmount,
        "gambling",
        `賭博贏得 ${betAmount} 金幣（骰子：${diceValue}）`,
      );
    } else {
      // 輸了：扣除下注金額
      netAmount = -betAmount;
      state.wallet -= betAmount;
      state.gamblingStats.totalLosses += 1;
      addTransaction(
        chatId,
        "expense",
        betAmount,
        "gambling",
        `賭博輸掉 ${betAmount} 金幣（骰子：${diceValue}）`,
      );
    }

    // 更新今日賭博次數
    state.gamblingStats.todayGambles += 1;

    _scheduleAutoSave(chatId);
    return {
      success: true,
      won,
      diceValue,
      betAmount,
      netAmount,
      newBalance: state.wallet,
      todayGambles: state.gamblingStats.todayGambles,
      dailyLimit: GAMBLING_CONFIG.DAILY_LIMIT,
    };
  }

  /**
   * 取得賭博統計
   * @param chatId 聊天 ID
   * @returns 賭博統計
   */
  function getGamblingStats(chatId: string) {
    checkAndResetDailyGamblingState(chatId);
    return getState(chatId).gamblingStats;
  }

  /**
   * 檢查是否可以繼續賭博
   * @param chatId 聊天 ID
   * @returns 是否可以繼續
   */
  function canGamble(chatId: string): boolean {
    checkAndResetDailyGamblingState(chatId);
    const state = getState(chatId);
    return state.gamblingStats.todayGambles < GAMBLING_CONFIG.DAILY_LIMIT;
  }

  /**
   * 取得賭博系統配置
   * @returns 賭博系統配置
   */
  function getGamblingConfig() {
    return { ...GAMBLING_CONFIG };
  }

  // ===== 禮物和轉帳方法 =====

  /**
   * 送出禮物
   * @param chatId 聊天 ID
   * @param inventoryItemId 背包物品 ID（不是商品 ID）
   * @returns 送禮結果
   * @requirements 6.2
   */
  function sendGift(chatId: string, inventoryItemId: string): SendGiftResult {
    const state = getState(chatId);

    // 在背包中找到該禮物
    const inventoryItem = state.inventory.find(
      (item) => item.id === inventoryItemId && item.type === "gift",
    );

    if (!inventoryItem) {
      return { success: false, error: "gift_not_found" };
    }

    // 檢查數量
    if (inventoryItem.quantity <= 0) {
      return { success: false, error: "insufficient_quantity" };
    }

    // 減少背包中的數量
    inventoryItem.quantity -= 1;

    // 如果數量為 0，從背包移除
    if (inventoryItem.quantity <= 0) {
      const index = state.inventory.findIndex(
        (item) => item.id === inventoryItemId,
      );
      if (index !== -1) {
        state.inventory.splice(index, 1);
      }
    }

    // 建立送禮記錄
    const giftRecord: GiftRecord = {
      id: `gift-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      itemId: inventoryItem.itemId,
      itemName: inventoryItem.name,
      sentAt: Date.now(),
    };

    // 加入送禮歷史
    state.giftHistory.push(giftRecord);

    _scheduleAutoSave(chatId);
    return {
      success: true,
      giftName: inventoryItem.name,
      giftItemId: inventoryItem.itemId,
      giftRecordId: giftRecord.id,
    };
  }

  /**
   * 根據商品 ID 送出禮物（從背包中找到對應的禮物並送出）
   * @param chatId 聊天 ID
   * @param itemId 商品 ID
   * @returns 送禮結果
   * @requirements 6.2
   */
  function sendGiftByItemId(chatId: string, itemId: string): SendGiftResult {
    const state = getState(chatId);

    // 在背包中找到該商品 ID 對應的禮物
    const inventoryItem = state.inventory.find(
      (item) => item.itemId === itemId && item.type === "gift",
    );

    if (!inventoryItem) {
      return { success: false, error: "gift_not_owned" };
    }

    // 使用 inventoryItem.id 來送禮
    return sendGift(chatId, inventoryItem.id);
  }

  /**
   * 取得送禮歷史
   * @param chatId 聊天 ID
   * @param limit 限制數量（可選）
   * @returns 送禮記錄列表
   */
  function getGiftHistory(chatId: string, limit?: number): GiftRecord[] {
    const state = getState(chatId);
    const history = [...state.giftHistory].sort((a, b) => b.sentAt - a.sentAt);
    return limit ? history.slice(0, limit) : history;
  }

  /**
   * 取得最近送出的禮物
   * @param chatId 聊天 ID
   * @param count 數量
   * @returns 最近的送禮記錄
   */
  function getRecentGifts(chatId: string, count: number = 5): GiftRecord[] {
    return getGiftHistory(chatId, count);
  }

  /**
   * 轉帳給角色
   * @param chatId 聊天 ID
   * @param amount 轉帳金額
   * @returns 轉帳結果
   * @requirements 11.3
   */
  function transfer(chatId: string, amount: number): TransferResult {
    if (amount <= 0) {
      return { success: false, error: "invalid_amount" };
    }

    const state = getState(chatId);

    // 檢查餘額是否足夠
    if (state.wallet < amount) {
      return { success: false, error: "insufficient_funds" };
    }

    // 扣除金幣
    state.wallet -= amount;

    // 記錄交易
    addTransaction(
      chatId,
      "expense",
      amount,
      "transfer",
      `轉帳 ${amount} 金幣給角色`,
    );

    _scheduleAutoSave(chatId);
    return {
      success: true,
      amount,
      newBalance: state.wallet,
    };
  }

  // ===== 初始化 =====

  /**
   * 初始化 Store
   */
  async function initialize(): Promise<void> {
    if (isInitialized.value) return;
    await db.init();
    isInitialized.value = true;
    console.log("[GameEconomyStore] 已初始化");
  }

  return {
    // 狀態
    gameStates,
    isInitialized,

    // 基礎方法
    getState,
    loadState,
    saveState,
    initialize,

    // 錢包操作
    earnMoney,
    spendMoney,
    hasEnoughBalance,
    getBalance,
    getTransactions,
    addTransaction,
    calculateBalanceFromTransactions,

    // 刷盤子小遊戲
    washDish,
    getWorkState,
    canWashDish,
    getDishWashingConfig,
    calculateWorkEfficiencyMultiplier,

    // 商城購買
    purchaseItem,
    ownsDecoration,

    // 裝備切換
    equipFrame,
    equipBubble,
    equipRod,
    getEquippedRod,
    getFishingRods,
    getInventory,
    getDecorations,

    // [開發用] 免費獲得頭像框
    grantFrame,
    grantAllFrames,

    // 釣魚系統
    generateFish,
    catchFish,
    sellFish,
    sellAllFish,
    getFishInventory,
    getFishingStats,

    // 掛機系統
    startIdleSession,
    calculateIdleRewards,
    claimIdleRewards,
    getCurrentIdleSession,
    isIdle,
    cancelIdleSession,
    getIdleConfig,

    // 賭博系統
    gamble,
    getGamblingStats,
    canGamble,
    getGamblingConfig,

    // 禮物和轉帳
    sendGift,
    sendGiftByItemId,
    getGiftHistory,
    getRecentGifts,
    transfer,
  };
});
