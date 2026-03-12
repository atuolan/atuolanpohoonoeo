/**
 * 好感度數值系統 Store
 *
 * 管理每個聊天的好感度狀態，參考 gameEconomy store 的持久化模式：
 * - _dbLoadedIds 追蹤已從 DB 載入的 chatId
 * - 防抖自動保存避免高頻寫入
 * - 保存前檢查防止默認值覆蓋
 * - Promise 去重防止併發載入競態
 */
import { db, DB_STORES } from "@/db/database";
import {
  type CharacterAffinityConfig,
  type ChatAffinityState,
  type MetricValue,
  buildDynamicValidator,
  computePercentage,
  computeStage,
  createDefaultState,
  MAX_HISTORY_LENGTH,
  safeParseAffinityConfig,
  safeParseAffinityState,
} from "@/schemas/affinity";
import { defineStore } from "pinia";
import { ref, toRaw } from "vue";

const AFFINITY_STATES_STORE = DB_STORES.CHAT_AFFINITY_STATES;
const AFFINITY_CONFIG_STORE = DB_STORES.CHARACTER_AFFECTIONS;
const AUTO_SAVE_DELAY_MS = 300;

/**
 * 檢查 chatAffinityStates 表是否存在（DB 升級可能未完成）。
 * 不存在時靜默降級，避免刷屏報錯。
 */
async function _isStatesStoreReady(): Promise<boolean> {
  try {
    await db.init();
    if (!db._instance) return false;
    return db._instance.objectStoreNames.contains(AFFINITY_STATES_STORE);
  } catch {
    return false;
  }
}

export const useAffinityStore = defineStore("affinity", () => {
  // ===== 狀態 =====

  const affinityStates = ref<Map<string, ChatAffinityState>>(new Map());
  const configCache = ref<Map<string, CharacterAffinityConfig>>(new Map());
  const isInitialized = ref(false);
  let _storeReady: boolean | null = null; // 緩存 store 是否存在的結果

  // ===== 內部追蹤 =====

  const _autoSaveTimers = new Map<string, ReturnType<typeof setTimeout>>();
  const _loadingPromises = new Map<string, Promise<ChatAffinityState | null>>();
  const _dbLoadedIds = new Set<string>();

  // ===== 自動保存機制 =====

  /**
   * 強制觸發 Vue 響應式更新：淺拷貝 Map 條目，讓依賴 affinityStates 的 computed 重新計算
   */
  function _triggerReactivity(chatId: string): void {
    const state = affinityStates.value.get(chatId);
    if (state) {
      affinityStates.value = new Map(affinityStates.value);
    }
  }

  function _scheduleAutoSave(chatId: string): void {
    const existing = _autoSaveTimers.get(chatId);
    if (existing) clearTimeout(existing);

    const timer = setTimeout(async () => {
      _autoSaveTimers.delete(chatId);
      try {
        await _doSave(chatId);
      } catch (error) {
        console.error("[AffinityStore] 自動保存失敗:", chatId, error);
      }
    }, AUTO_SAVE_DELAY_MS);
    _autoSaveTimers.set(chatId, timer);
  }

  async function _doSave(chatId: string): Promise<void> {
    try {
      if (_storeReady === null) _storeReady = await _isStatesStoreReady();
      if (!_storeReady) return;

      const state = affinityStates.value.get(chatId);
      if (!state) return;

      if (!_dbLoadedIds.has(chatId)) {
        const existingRaw = await db.get<Record<string, unknown>>(
          AFFINITY_STATES_STORE,
          chatId,
        );
        if (existingRaw) {
          console.warn(
            "[AffinityStore] 狀態未從 DB 載入，先恢復 DB 資料:",
            chatId,
          );
          const correctState = safeParseAffinityState(existingRaw, chatId);
          affinityStates.value.set(chatId, correctState);
          _dbLoadedIds.add(chatId);
          return;
        }
        _dbLoadedIds.add(chatId);
      }

      // 防止默認值覆蓋已有資料
      if (
        Object.keys(state.values).length === 0 &&
        state.history.length === 0
      ) {
        const existingRaw = await db.get<Record<string, unknown>>(
          AFFINITY_STATES_STORE,
          chatId,
        );
        if (existingRaw) {
          const existingValues =
            typeof existingRaw.values === "object" && existingRaw.values
              ? Object.keys(existingRaw.values)
              : [];
          if (existingValues.length > 0) {
            console.warn(
              "[AffinityStore] 阻止將空狀態覆蓋已有資料！",
              chatId,
            );
            const correctState = safeParseAffinityState(existingRaw, chatId);
            affinityStates.value.set(chatId, correctState);
            return;
          }
        }
      }

      // 深層去除 Vue reactive proxy，避免 IndexedDB DataCloneError
      const toSave = JSON.parse(JSON.stringify(toRaw(state))) as ChatAffinityState;
      toSave.lastUpdated = Date.now();
      await db.put(AFFINITY_STATES_STORE, toSave);
    } catch (error) {
      console.error("[AffinityStore] 保存失敗:", error);
    }
  }

  // ===== 載入 =====

  async function loadState(
    chatId: string,
    forceReload = false,
  ): Promise<ChatAffinityState | null> {
    const existing = _loadingPromises.get(chatId);
    if (existing) return existing;

    const promise = _loadStateInternal(chatId, forceReload);
    _loadingPromises.set(chatId, promise);
    try {
      return await promise;
    } finally {
      _loadingPromises.delete(chatId);
    }
  }

  async function _loadStateInternal(
    chatId: string,
    forceReload: boolean,
  ): Promise<ChatAffinityState | null> {
    try {
      if (_storeReady === null) _storeReady = await _isStatesStoreReady();
      if (!_storeReady) return null;

      const pendingTimer = _autoSaveTimers.get(chatId);
      if (pendingTimer) {
        clearTimeout(pendingTimer);
        _autoSaveTimers.delete(chatId);
        try {
          await _doSave(chatId);
        } catch (e) {
          console.error("[AffinityStore] loadState 前刷新保存失敗:", e);
        }
      }

      if (!forceReload) {
        const cached = affinityStates.value.get(chatId);
        if (cached && _dbLoadedIds.has(chatId)) return cached;
      }

      await db.init();
      const raw = await db.get<unknown>(AFFINITY_STATES_STORE, chatId);

      if (raw) {
        const state = safeParseAffinityState(raw, chatId);
        affinityStates.value.set(chatId, state);
        _dbLoadedIds.add(chatId);
        return state;
      }

      return null;
    } catch (error) {
      console.error("[AffinityStore] 載入狀態失敗:", error);
      const cached = affinityStates.value.get(chatId);
      return cached ?? null;
    }
  }

  async function saveState(chatId: string): Promise<void> {
    const pendingTimer = _autoSaveTimers.get(chatId);
    if (pendingTimer) {
      clearTimeout(pendingTimer);
      _autoSaveTimers.delete(chatId);
    }
    await _doSave(chatId);
  }

  // ===== 配置管理 =====

  async function loadConfig(
    characterId: string,
  ): Promise<CharacterAffinityConfig | null> {
    const cached = configCache.value.get(characterId);
    if (cached) return cached;

    try {
      await db.init();
      const raw = await db.get<unknown>(AFFINITY_CONFIG_STORE, characterId);
      if (raw) {
        const config = safeParseAffinityConfig(raw, characterId);
        configCache.value.set(characterId, config);
        return config;
      }
    } catch (error) {
      console.error("[AffinityStore] 載入配置失敗:", error);
    }
    return null;
  }

  async function saveConfig(config: CharacterAffinityConfig): Promise<void> {
    try {
      await db.init();
      // 深層去除 Vue reactive proxy，避免 IndexedDB DataCloneError
      const toSave = JSON.parse(JSON.stringify(toRaw(config))) as CharacterAffinityConfig;
      toSave.lastUpdated = Date.now();
      await db.put(AFFINITY_CONFIG_STORE, toSave);
      configCache.value.set(config.characterId, toSave);
    } catch (error) {
      console.error("[AffinityStore] 保存配置失敗:", error);
    }
  }

  function getConfig(
    characterId: string,
  ): CharacterAffinityConfig | undefined {
    return configCache.value.get(characterId);
  }

  // ===== 初始化 =====

  async function initializeFromConfig(
    chatId: string,
    config: CharacterAffinityConfig,
  ): Promise<ChatAffinityState> {
    const existing = await loadState(chatId);
    if (existing) return existing;

    const state = createDefaultState(chatId, config);
    affinityStates.value.set(chatId, state);
    _dbLoadedIds.add(chatId);
    await saveState(chatId);
    return state;
  }

  // ===== 獲取狀態 =====

  function getState(chatId: string): ChatAffinityState | undefined {
    return affinityStates.value.get(chatId);
  }

  // ===== 核心：更新指標 =====

  /**
   * 在處理某條訊息的好感度更新之前，先儲存當前數值快照。
   * 應在 _handleAffinityUpdates 之前呼叫。
   */
  function snapshotBeforeMessage(chatId: string, messageId: string): void {
    const state = affinityStates.value.get(chatId);
    if (!state) return;
    // 深複製當前 values，避免後續修改影響快照
    state.snapshots[messageId] = { ...state.values };
    _scheduleAutoSave(chatId);
  }

  /**
   * 刪除訊息時，恢復到那些訊息之前的狀態。
   * 傳入被刪掉的 messageId 陣列（按訊息時間順序，最早的在前），
   * 找最早那個有快照的 messageId 來恢復。
   */
  function rollbackToBeforeMessages(chatId: string, deletedMessageIds: string[]): boolean {
    const state = affinityStates.value.get(chatId);
    if (!state) return false;

    // 找出有快照記錄的 messageId
    const snapshotsToCheck = deletedMessageIds
      .filter(id => state.snapshots[id] !== undefined);

    if (snapshotsToCheck.length === 0) return false;

    // 取最早的（調用方傳入時已按訊息順序排序）
    const earliestId = snapshotsToCheck[0];

    // 恢復到該訊息之前的快照
    state.values = { ...state.snapshots[earliestId] };

    // 清除被刪訊息的快照
    for (const id of deletedMessageIds) {
      delete state.snapshots[id];
    }

    state.lastUpdated = Date.now();
    _scheduleAutoSave(chatId);
    _triggerReactivity(chatId);
    return true;
  }

  function updateMetric(
    chatId: string,
    metricId: string,
    delta: number,
    reason = "",
  ): boolean {
    const state = affinityStates.value.get(chatId);
    if (!state) return false;

    const config = configCache.value.get(state.characterId);
    const metricConfig = config?.metrics.find((m) => m.id === metricId);

    if (metricConfig?.type === "string") return false;

    const oldValue = state.values[metricId];
    const numOld = typeof oldValue === "number" ? oldValue : 0;
    let newValue = numOld + delta;

    if (metricConfig) {
      newValue = Math.min(metricConfig.max, Math.max(metricConfig.min, newValue));
    }

    if (newValue === numOld) return false;

    state.values[metricId] = newValue;
    state.history.push({
      metricId,
      oldValue: numOld,
      newValue,
      reason,
      timestamp: Date.now(),
    });

    if (state.history.length > MAX_HISTORY_LENGTH) {
      state.history = state.history.slice(-MAX_HISTORY_LENGTH);
    }

    _scheduleAutoSave(chatId);
    // 觸發 Vue 響應式更新（重新設置 Map 條目）
    _triggerReactivity(chatId);
    return true;
  }

  function setMetric(
    chatId: string,
    metricId: string,
    value: MetricValue,
    reason = "",
  ): boolean {
    const state = affinityStates.value.get(chatId);
    if (!state) return false;

    const config = configCache.value.get(state.characterId);
    const metricConfig = config?.metrics.find((m) => m.id === metricId);

    let finalValue: MetricValue = value;
    if (metricConfig?.type === "string") {
      finalValue = String(value);
    } else if (typeof value === "number" && metricConfig) {
      finalValue = Math.min(
        metricConfig.max,
        Math.max(metricConfig.min, value),
      );
    }

    const oldValue = state.values[metricId] ?? (metricConfig?.initial ?? 0);
    if (finalValue === oldValue) return false;

    state.values[metricId] = finalValue;
    state.history.push({
      metricId,
      oldValue,
      newValue: finalValue,
      reason,
      timestamp: Date.now(),
    });

    if (state.history.length > MAX_HISTORY_LENGTH) {
      state.history = state.history.slice(-MAX_HISTORY_LENGTH);
    }

    _scheduleAutoSave(chatId);
    // 觸發 Vue 響應式更新（重新設置 Map 條目）
    _triggerReactivity(chatId);
    return true;
  }

  /**
   * 批量更新多個指標（AI 回覆時一次更新多個值）
   * 數字型指標：change 為 delta；字串型指標：stringValue 直接賦值
   */
  function batchUpdate(
    chatId: string,
    updates: {
      metricId: string;
      change: number;
      reason: string;
      stringValue?: string;
      isAbsolute?: boolean;
      absoluteValue?: number;
    }[],
  ): void {
    for (const u of updates) {
      const config = configCache.value.get(
        affinityStates.value.get(chatId)?.characterId ?? "",
      );
      const mc = config?.metrics.find((m) => m.id === u.metricId);

      if (u.isAbsolute) {
        // _.set() 絕對賦值：字串或數字直接 setMetric
        if (u.stringValue !== undefined) {
          setMetric(chatId, u.metricId, u.stringValue, u.reason);
        } else if (u.absoluteValue !== undefined) {
          setMetric(chatId, u.metricId, u.absoluteValue, u.reason);
        }
      } else if (mc?.type === "string" && u.stringValue !== undefined) {
        setMetric(chatId, u.metricId, u.stringValue, u.reason);
      } else {
        updateMetric(chatId, u.metricId, u.change, u.reason);
      }
    }

    // batchUpdate 內部的 updateMetric/setMetric 已各自觸發響應式更新
  }

  // ===== 查詢 =====

  function getCurrentStage(
    chatId: string,
    metricId: string,
  ): string | null {
    const state = affinityStates.value.get(chatId);
    if (!state) return null;

    const config = configCache.value.get(state.characterId);
    const metricConfig = config?.metrics.find((m) => m.id === metricId);
    if (!metricConfig) return null;

    const value = state.values[metricId] ?? metricConfig.initial;
    return computeStage(value, metricConfig.stages);
  }

  function getMetricPercentage(
    chatId: string,
    metricId: string,
  ): number {
    const state = affinityStates.value.get(chatId);
    if (!state) return 0;

    const config = configCache.value.get(state.characterId);
    const metricConfig = config?.metrics.find((m) => m.id === metricId);
    if (!metricConfig) return 0;

    const value = state.values[metricId] ?? metricConfig.initial;
    return computePercentage(value, metricConfig.min, metricConfig.max);
  }

  /**
   * 獲取指定聊天所有指標的完整資訊（用於 UI 顯示和 EJS 模板）
   */
  function getMetricsSnapshot(chatId: string) {
    const state = affinityStates.value.get(chatId);
    if (!state) return [];

    const config = configCache.value.get(state.characterId);
    if (!config) return [];

    return config.metrics.map((m) => {
      const value = state.values[m.id] ?? m.initial;
      return {
        id: m.id,
        name: m.name,
        type: m.type,
        value,
        min: m.min,
        max: m.max,
        options: m.options,
        percentage: computePercentage(value, m.min, m.max),
        stage: computeStage(value, m.stages),
        stages: m.stages,
      };
    });
  }

  // ===== 驗證 =====

  /**
   * 用動態 Zod schema 驗證並修正狀態中的數值
   */
  function validateAndClamp(chatId: string): void {
    const state = affinityStates.value.get(chatId);
    if (!state) return;

    const config = configCache.value.get(state.characterId);
    if (!config || config.metrics.length === 0) return;

    const validator = buildDynamicValidator(config.metrics);
    const result = validator.safeParse(state.values);
    if (result.success) {
      state.values = result.data;
    }
  }

  // ===== 初始化 =====

  async function initialize(): Promise<void> {
    if (isInitialized.value) return;
    await db.init();
    _storeReady = await _isStatesStoreReady();
    isInitialized.value = true;
    if (!_storeReady) {
      console.warn(
        "[AffinityStore] chatAffinityStates 表尚未建立，需要重新整理頁面以完成 DB 升級",
      );
    } else {
      console.log("[AffinityStore] 已初始化");
    }
  }

  // ===== 清除 =====

  function clearCache(): void {
    affinityStates.value.clear();
    configCache.value.clear();
    _dbLoadedIds.clear();
    for (const timer of _autoSaveTimers.values()) clearTimeout(timer);
    _autoSaveTimers.clear();
    _loadingPromises.clear();
    _storeReady = null;
  }

  return {
    affinityStates,
    configCache,
    isInitialized,

    initialize,
    clearCache,

    loadState,
    saveState,
    loadConfig,
    saveConfig,
    getConfig,

    initializeFromConfig,
    getState,

    updateMetric,
    setMetric,
    batchUpdate,
    snapshotBeforeMessage,
    rollbackToBeforeMessages,

    getCurrentStage,
    getMetricPercentage,
    getMetricsSnapshot,
    validateAndClamp,
  };
});
