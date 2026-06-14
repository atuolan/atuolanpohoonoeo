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
  type AffinityPostMutationRule,
  type AffinityRuleCondition,
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
import _ from "lodash";

const AFFINITY_STATES_STORE = DB_STORES.CHAT_AFFINITY_STATES;
const AFFINITY_CONFIG_STORE = DB_STORES.CHARACTER_AFFECTIONS;
const AUTO_SAVE_DELAY_MS = 300;

export interface AffinityBatchUpdateResult {
  applied: boolean;
  appliedCount: number;
  repairedCount: number;
  resolvedCount: number;
  skippedCount: number;
  reason?: string;
}

/**
 * MVU 三層視圖的根前綴。AI 產生的 JSONPatch 路徑常以 `/stat_data/角色/欄位` 形式
 * 出現，但 `mvuState` 內部本來就分為 statData / displayData / deltaData 三層儲存，
 * 因此在比對 metric path 與寫入 mvuState 時，這層前綴必須剝除，否則會出現
 * 「路徑不匹配 → metric 找不到 → 變更被當作未配置欄位」的問題。
 */
const MVU_VIEW_PREFIXES = [
  "stat_data",
  "display_data",
  "delta_data",
  "stat",
  "display",
  "delta",
];

function normalizeMetricPath(path: string): string {
  let normalized = path.replace(/^\/+/, "").replace(/\//g, ".");
  for (const prefix of MVU_VIEW_PREFIXES) {
    if (normalized.startsWith(`${prefix}.`)) {
      normalized = normalized.slice(prefix.length + 1);
      break;
    }
    if (normalized === prefix) return "";
  }
  return normalized;
}

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function evaluateCondition(
  value: MetricValue | undefined,
  condition: AffinityRuleCondition,
): boolean {
  switch (condition.operator) {
    case "gte":
      return typeof value === "number" && typeof condition.value === "number"
        ? value >= condition.value
        : false;
    case "lte":
      return typeof value === "number" && typeof condition.value === "number"
        ? value <= condition.value
        : false;
    case "gt":
      return typeof value === "number" && typeof condition.value === "number"
        ? value > condition.value
        : false;
    case "lt":
      return typeof value === "number" && typeof condition.value === "number"
        ? value < condition.value
        : false;
    case "eq":
      return value === condition.value;
    case "neq":
      return value !== condition.value;
  }
}

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

  function _reconcileStateAfterRules(chatId: string): void {
    _applyPostMutationRules(chatId);
    const state = affinityStates.value.get(chatId);
    if (!state) return;
    state.lastUpdated = Date.now();
    _triggerReactivity(chatId);
    _scheduleAutoSave(chatId);
  }

  function _ensureMvuState(chatId: string): {
    statData: Record<string, unknown>;
    displayData: Record<string, unknown>;
    deltaData: Record<string, unknown>;
  } | null {
    const state = affinityStates.value.get(chatId);
    if (!state) return null;
    if (!state.mvuState) {
      state.mvuState = { statData: {}, displayData: {}, deltaData: {} };
    }
    if (!state.mvuState.displayData) {
      state.mvuState.displayData = {};
    }
    if (!state.mvuState.deltaData) {
      state.mvuState.deltaData = {};
    }
    return state.mvuState;
  }

  function _syncMetricToMvuViews(
    chatId: string,
    metricId: string,
    value: MetricValue,
    delta?: unknown,
  ): void {
    const state = affinityStates.value.get(chatId);
    if (!state) return;
    const config = configCache.value.get(state.characterId);
    const metricConfig = config?.metrics.find((m) => m.id === metricId);
    const path = metricConfig?.path || metricConfig?.name;
    if (!path) return;

    const mvuState = _ensureMvuState(chatId);
    if (!mvuState) return;
    _.set(mvuState.statData, path, deepClone(value));
    _.set(mvuState.displayData, path, deepClone(value));
    _.set(mvuState.deltaData, path, deepClone(delta ?? value));
  }

  function _ruleConditionsMatch(
    chatId: string,
    rule: AffinityPostMutationRule,
  ): boolean {
    const checks = rule.conditions.map((condition) => {
      const resolved = getMetricByPath(chatId, condition.path);
      return evaluateCondition(resolved?.value, condition);
    });
    return rule.mode === "any" ? checks.some(Boolean) : checks.every(Boolean);
  }

  function _applyPostMutationRules(chatId: string): void {
    const state = affinityStates.value.get(chatId);
    if (!state) return;

    const config = configCache.value.get(state.characterId);
    if (!config || config.postMutationRules.length === 0) return;

    let changed = false;

    for (const rule of config.postMutationRules) {
      if (rule.type === "derive_boolean") {
        const target = getMetricByPath(chatId, rule.targetPath);
        if (!target) continue;

        const currentValue = target.value;
        if (rule.lockOnTrue && currentValue === rule.trueValue) {
          continue;
        }

        const nextValue = _ruleConditionsMatch(chatId, rule)
          ? rule.trueValue
          : rule.falseValue;
        if (currentValue !== nextValue) {
          changed = setMetricByPath(chatId, rule.targetPath, String(nextValue), "Post mutation rule") || changed;
        }
        continue;
      }

      if (rule.type === "clamp_max_when") {
        if (!_ruleConditionsMatch(chatId, rule)) continue;
        const target = getMetricByPath(chatId, rule.targetPath);
        if (!target || typeof target.value !== "number") continue;
        if (target.value > rule.max) {
          changed = setMetricByPath(chatId, rule.targetPath, rule.max, "Post mutation clamp") || changed;
        }
      }
    }

    if (changed) {
      _scheduleAutoSave(chatId);
      _triggerReactivity(chatId);
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
        _reconcileStateAfterRules(chatId);
        _dbLoadedIds.add(chatId);
        return affinityStates.value.get(chatId) ?? state;
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
    options?: { force?: boolean },
  ): Promise<ChatAffinityState> {
    if (!options?.force) {
      const existing = await loadState(chatId);
      if (existing) return existing;
    }

    configCache.value.set(config.characterId, config);
    const state = createDefaultState(chatId, config);
    affinityStates.value.set(chatId, state);
    _reconcileStateAfterRules(chatId);
    _dbLoadedIds.add(chatId);
    await saveState(chatId);
    return state;
  }

  /**
   * 將來源 chat 的 affinity state 深複製為新 chat 的初始狀態（分支「繼承當下值」用）。
   * 若來源不存在，回傳 null。
   */
  async function cloneStateForBranch(
    srcChatId: string,
    newChatId: string,
  ): Promise<ChatAffinityState | null> {
    let src = affinityStates.value.get(srcChatId);
    if (!src) {
      src = (await loadState(srcChatId)) ?? undefined;
    }
    if (!src) return null;

    const cloned = JSON.parse(JSON.stringify(toRaw(src))) as ChatAffinityState;
    cloned.chatId = newChatId;
    cloned.lastUpdated = Date.now();
    // 不繼承 lastRescannedMessageId 以外的快照鍵會跟著 messageId 走，這裡保留
    affinityStates.value.set(newChatId, cloned);
    _dbLoadedIds.add(newChatId);
    await saveState(newChatId);
    return cloned;
  }

  /**
   * 設定 lastRescannedMessageId（避免 rescan 重複套用同一筆絕對值）。
   */
  function setLastRescannedMessageId(
    chatId: string,
    messageId: string | undefined,
  ): void {
    const state = affinityStates.value.get(chatId);
    if (!state) return;
    state.lastRescannedMessageId = messageId;
    state.lastUpdated = Date.now();
    _scheduleAutoSave(chatId);
  }

  function getLastRescannedMessageId(chatId: string): string | undefined {
    return affinityStates.value.get(chatId)?.lastRescannedMessageId;
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
    _syncMetricToMvuViews(chatId, metricId, newValue, newValue - numOld);
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
    _applyPostMutationRules(chatId);
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
    _syncMetricToMvuViews(
      chatId,
      metricId,
      finalValue,
      typeof finalValue === "number" && typeof oldValue === "number"
        ? finalValue - oldValue
        : finalValue,
    );
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
    _applyPostMutationRules(chatId);
    // 觸發 Vue 響應式更新（重新設置 Map 條目）
    _triggerReactivity(chatId);
    return true;
  }

  /**
   * 用 path/name/id 多重 fallback 匹配 metric，避免 AI 給出
   * 「stat_data.角色.好感度」「角色.好感度」「好感度」等不同寫法時找不到。
   *
   * 匹配優先級：
   * 1. 完全相等（path/name/id 任一欄位）
   * 2. 雙向 endsWith（使用者只給末段或多給前綴皆可）
   * 3. 末段名稱匹配（最後一個 segment 對 name/id/metricTail）
   */
  function getMetricByPath(
    chatId: string,
    path: string,
  ): { metricId: string; value: MetricValue } | null {
    const state = affinityStates.value.get(chatId);
    if (!state) {
      console.warn("[AffinityStore][getMetricByPath] state 不存在", { chatId, path });
      return null;
    }

    const config = configCache.value.get(state.characterId);
    if (!config) {
      console.warn("[AffinityStore][getMetricByPath] config 不存在", {
        chatId,
        characterId: state.characterId,
        path,
      });
      return null;
    }

    const normalizedPath = normalizeMetricPath(path);
    if (!normalizedPath) {
      console.warn("[AffinityStore][getMetricByPath] normalizedPath 為空", { path });
      return null;
    }

    const tail = normalizedPath.split(".").pop() ?? "";

    const metric = config.metrics.find((m) => {
      const metricPath = m.path ? normalizeMetricPath(m.path) : "";
      const metricTail = metricPath ? metricPath.split(".").pop() ?? "" : "";

      // 1. 直接相等
      if (m.id === normalizedPath) return true;
      if (m.name === normalizedPath) return true;
      if (metricPath && metricPath === normalizedPath) return true;

      // 2. endsWith 雙向匹配
      if (metricPath && normalizedPath.endsWith(`.${metricPath}`)) return true;
      if (metricPath && metricPath.endsWith(`.${normalizedPath}`)) return true;
      if (m.name && normalizedPath.endsWith(`.${m.name}`)) return true;
      if (m.id && normalizedPath.endsWith(`.${m.id}`)) return true;

      // 3. 末段名稱匹配
      if (tail && (tail === m.name || tail === m.id || (metricTail && tail === metricTail))) {
        return true;
      }

      return false;
    });
    if (!metric) {
      console.log("[AffinityStore][getMetricByPath] 未匹配到 metric", {
        rawPath: path,
        normalizedPath,
        tail,
        configMetrics: config.metrics.map((m) => ({ id: m.id, name: m.name, path: m.path })),
      });
      return null;
    }

    console.log("[AffinityStore][getMetricByPath] 匹配成功", {
      rawPath: path,
      normalizedPath,
      matchedMetricId: metric.id,
      matchedMetricName: metric.name,
    });
    return {
      metricId: metric.id,
      value: state.values[metric.id] ?? metric.initial,
    };
  }

  function getMvuStatData(chatId: string): Record<string, unknown> | null {
    const state = affinityStates.value.get(chatId);
    if (!state) return null;
    return state.mvuState?.statData ?? null;
  }

  function getMvuDisplayData(chatId: string): Record<string, unknown> | null {
    const state = affinityStates.value.get(chatId);
    if (!state) return null;
    return state.mvuState?.displayData ?? null;
  }

  function getMvuDeltaData(chatId: string): Record<string, unknown> | null {
    const state = affinityStates.value.get(chatId);
    if (!state) return null;
    return state.mvuState?.deltaData ?? null;
  }

  function resetMvuDeltaData(chatId: string): boolean {
    const state = affinityStates.value.get(chatId);
    const mvuState = _ensureMvuState(chatId);
    if (!state || !mvuState) return false;

    mvuState.deltaData = {};
    state.lastUpdated = Date.now();
    _triggerReactivity(chatId);
    _scheduleAutoSave(chatId);
    return true;
  }

  function setMvuValueByPath(
    chatId: string,
    path: string,
    value: unknown,
    reason = "",
  ): boolean {
    const state = affinityStates.value.get(chatId);
    if (!state) return false;

    const normalizedPath = normalizeMetricPath(path);
    if (!normalizedPath) return false;

    const mvuState = _ensureMvuState(chatId);
    if (!mvuState) return false;

    _.set(mvuState.statData, normalizedPath, deepClone(value));
    _.set(mvuState.displayData, normalizedPath, deepClone(value));
    _.set(mvuState.deltaData, normalizedPath, deepClone(value));

    const metric = getMetricByPath(chatId, normalizedPath);
    if (metric && (typeof value === "string" || typeof value === "number")) {
      setMetric(chatId, metric.metricId, value, reason || "MVU stat_data set");
      return true;
    }

    state.lastUpdated = Date.now();
    _triggerReactivity(chatId);
    _scheduleAutoSave(chatId);
    return true;
  }

  function removeMvuValueByPath(chatId: string, path: string): boolean {
    const state = affinityStates.value.get(chatId);
    const mvuState = _ensureMvuState(chatId);
    if (!state || !mvuState) return false;

    const normalizedPath = normalizeMetricPath(path);
    if (!normalizedPath) return false;

    _.unset(mvuState.statData, normalizedPath);
    _.unset(mvuState.displayData, normalizedPath);
    _.unset(mvuState.deltaData, normalizedPath);
    state.lastUpdated = Date.now();
    _triggerReactivity(chatId);
    _scheduleAutoSave(chatId);
    return true;
  }

  function insertMvuValueByPath(
    chatId: string,
    path: string,
    value: unknown,
    index?: string | number,
  ): unknown {
    const state = affinityStates.value.get(chatId);
    if (!state) return undefined;

    const normalizedPath = normalizeMetricPath(path);
    if (!normalizedPath) return undefined;

    const mvuState = _ensureMvuState(chatId);
    if (!mvuState) return undefined;

    const current = _.get(mvuState.statData, normalizedPath);
    if (Array.isArray(current)) {
      const copy = [...current];
      const targetIndex = typeof index === "number" ? index : copy.length;
      copy.splice(targetIndex, 0, deepClone(value));
      _.set(mvuState.statData, normalizedPath, copy);
      _.set(mvuState.displayData, normalizedPath, deepClone(copy));
      _.set(mvuState.deltaData, normalizedPath, deepClone(value));
      state.lastUpdated = Date.now();
      _triggerReactivity(chatId);
      _scheduleAutoSave(chatId);
      return copy;
    }

    if (current && typeof current === "object") {
      const key = index === undefined ? String(Object.keys(current).length) : String(index);
      const copy = { ...(current as Record<string, unknown>), [key]: deepClone(value) };
      _.set(mvuState.statData, normalizedPath, copy);
      _.set(mvuState.displayData, normalizedPath, deepClone(copy));
      _.set(mvuState.deltaData, normalizedPath, deepClone(value));
      state.lastUpdated = Date.now();
      _triggerReactivity(chatId);
      _scheduleAutoSave(chatId);
      return copy;
    }

    return undefined;
  }

  function setMetricByPath(
    chatId: string,
    path: string,
    value: MetricValue,
    reason = "",
  ): boolean {
    const state = affinityStates.value.get(chatId);
    if (!state) return false;

    const config = configCache.value.get(state.characterId);
    if (!config) return false;

    const resolved = getMetricByPath(chatId, path);
    if (!resolved) return false;

    return setMetric(chatId, resolved.metricId, value, reason);
  }

  /**
   * 自動修復：當 batchUpdateByPath 的 metric 在 character config 中找不到時，
   * 直接把更新寫入 mvuState 三層視圖（statData/displayData/deltaData），
   * 並在 history 中以路徑為 metricId 推送一筆紀錄，確保：
   * 1. 數值仍能被 EJS 模板與 AI 後續輪次讀到（透過 mvuState）
   * 2. UI 的「近期變化」面板能顯示出此次變更（透過 history）
   * 3. 不會因為配置缺漏而靜默丟失 AI 的更新
   */
  function _autoRepairMvuUpdate(
    chatId: string,
    u: {
      metric: string;
      change: number;
      reason: string;
      stringValue?: string;
      isAbsolute?: boolean;
      absoluteValue?: number;
    },
    sourceTreeValue: unknown,
    sourceStringValue: string | undefined,
    sourceNumberValue: number | undefined,
  ): void {
    const state = affinityStates.value.get(chatId);
    if (!state) {
      console.warn("[AffinityStore][_autoRepairMvuUpdate] state 不存在", { chatId, u });
      return;
    }

    const normalizedPath = normalizeMetricPath(u.metric);
    if (!normalizedPath) {
      console.warn("[AffinityStore][_autoRepairMvuUpdate] normalizedPath 為空", { u });
      return;
    }

    const mvuState = _ensureMvuState(chatId);
    if (!mvuState) {
      console.warn("[AffinityStore][_autoRepairMvuUpdate] mvuState 取得失敗", { chatId });
      return;
    }

    const previousValue = _.get(mvuState.statData, normalizedPath);
    console.log("[AffinityStore][_autoRepairMvuUpdate] 開始修復", {
      rawMetric: u.metric,
      normalizedPath,
      previousValue,
      change: u.change,
      isAbsolute: u.isAbsolute,
      stringValue: u.stringValue,
      absoluteValue: u.absoluteValue,
      sourceTreeValue,
      sourceStringValue,
      sourceNumberValue,
    });

    // 推算最終值：優先順序為 stringValue > sourceTree string > sourceMetric string
    //              > absoluteValue > sourceTree number > sourceMetric number
    //              > delta（基於 previousValue 加總）
    let newValue: unknown;
    let isStringWrite = false;

    if (u.stringValue !== undefined) {
      newValue = u.stringValue;
      isStringWrite = true;
    } else if (typeof sourceTreeValue === "string") {
      newValue = sourceTreeValue;
      isStringWrite = true;
    } else if (sourceStringValue !== undefined) {
      newValue = sourceStringValue;
      isStringWrite = true;
    } else if (u.isAbsolute) {
      if (u.absoluteValue !== undefined) newValue = u.absoluteValue;
      else if (typeof sourceTreeValue === "number") newValue = sourceTreeValue;
      else if (sourceNumberValue !== undefined) newValue = sourceNumberValue;
      else return;
    } else {
      const base = typeof previousValue === "number" ? previousValue : 0;
      newValue = base + u.change;
    }

    _.set(mvuState.statData, normalizedPath, deepClone(newValue));
    _.set(mvuState.displayData, normalizedPath, deepClone(newValue));
    // deltaData：對 delta 操作記錄差值，其他情況存最終值
    const deltaValue =
      !u.isAbsolute && !isStringWrite && typeof newValue === "number"
        ? u.change
        : newValue;
    _.set(mvuState.deltaData, normalizedPath, deepClone(deltaValue));

    // 友善 history：metricId 用完整 normalizedPath，oldValue/newValue 取 MetricValue 可接受的型別
    const toMetricValue = (v: unknown): MetricValue => {
      if (typeof v === "number" || typeof v === "string") return v;
      if (v === undefined || v === null) return 0;
      return String(v);
    };
    const oldForHistory = toMetricValue(previousValue);
    const newForHistory = toMetricValue(newValue);

    if (oldForHistory !== newForHistory) {
      state.history.push({
        metricId: normalizedPath,
        oldValue: oldForHistory,
        newValue: newForHistory,
        reason: u.reason,
        timestamp: Date.now(),
      });
      if (state.history.length > MAX_HISTORY_LENGTH) {
        state.history = state.history.slice(-MAX_HISTORY_LENGTH);
      }
      console.log("[AffinityStore][_autoRepairMvuUpdate] 寫入完成", {
        normalizedPath,
        oldForHistory,
        newForHistory,
        historyLength: state.history.length,
      });
    } else {
      console.log("[AffinityStore][_autoRepairMvuUpdate] 新舊值相同，未推 history", {
        normalizedPath,
        oldForHistory,
        newForHistory,
      });
    }

    state.lastUpdated = Date.now();
    _scheduleAutoSave(chatId);
    _triggerReactivity(chatId);
  }

  function batchUpdateByPath(
    chatId: string,
    updates: {
      metric: string;
      change: number;
      reason: string;
      operation?: "remove" | "insert";
      stringValue?: string;
      isAbsolute?: boolean;
      absoluteValue?: number;
      sourceMetric?: string;
      insertIndex?: string | number;
    }[],
  ): AffinityBatchUpdateResult {
    console.log("[AffinityStore][batchUpdateByPath] 收到 MVU/好感更新", {
      chatId,
      updateCount: updates.length,
      updates,
    });

    if (updates.length === 0) {
      return {
        applied: false,
        appliedCount: 0,
        repairedCount: 0,
        resolvedCount: 0,
        skippedCount: 0,
        reason: "updates 為空",
      };
    }

    const state = affinityStates.value.get(chatId);
    if (!state) {
      console.warn("[AffinityStore][batchUpdateByPath] 無法套用：state 不存在", {
        chatId,
        updates,
      });
      return {
        applied: false,
        appliedCount: 0,
        repairedCount: 0,
        resolvedCount: 0,
        skippedCount: updates.length,
        reason: "state 不存在",
      };
    }

    const config = configCache.value.get(state.characterId);
    if (!config) {
      console.warn("[AffinityStore][batchUpdateByPath] 無法套用：config 不存在", {
        chatId,
        characterId: state.characterId,
        updates,
      });
      return {
        applied: false,
        appliedCount: 0,
        repairedCount: 0,
        resolvedCount: 0,
        skippedCount: updates.length,
        reason: "config 不存在",
      };
    }

    let repairedCount = 0;
    let skippedCount = 0;

    const resolved = updates.flatMap((u) => {
      if (u.operation === "remove") {
        console.log("[AffinityStore][batchUpdateByPath] remove 操作", { metric: u.metric });
        if (removeMvuValueByPath(chatId, u.metric)) repairedCount += 1;
        else skippedCount += 1;
        return [];
      }

      if (u.operation === "insert") {
        const insertValue = u.stringValue ?? u.absoluteValue;
        console.log("[AffinityStore][batchUpdateByPath] insert 操作", {
          metric: u.metric,
          insertValue,
          insertIndex: u.insertIndex,
        });
        if (insertValue !== undefined && insertMvuValueByPath(chatId, u.metric, insertValue, u.insertIndex) !== undefined) {
          repairedCount += 1;
        } else {
          skippedCount += 1;
        }
        return [];
      }

      const metric = getMetricByPath(chatId, u.metric);
      const sourceTree = u.sourceMetric ? getMvuStatData(chatId) : null;
      const sourceTreeValue =
        u.sourceMetric && sourceTree
          ? _.get(sourceTree, normalizeMetricPath(u.sourceMetric))
          : undefined;
      const sourceMetric = u.sourceMetric ? getMetricByPath(chatId, u.sourceMetric) : null;
      const sourceStringValue =
        typeof sourceMetric?.value === "string" ? sourceMetric.value : undefined;
      const sourceNumberValue =
        typeof sourceMetric?.value === "number" ? sourceMetric.value : undefined;

      // 自動修復：metric 未匹配到任何 config 時，直接寫入 mvuState 並推送友善 history
      if (!metric) {
        console.log("[AffinityStore][batchUpdateByPath] 未匹配 metric，走自動修復", {
          metric: u.metric,
          change: u.change,
          isAbsolute: u.isAbsolute,
          stringValue: u.stringValue,
          absoluteValue: u.absoluteValue,
        });
        _autoRepairMvuUpdate(
          chatId,
          u,
          sourceTreeValue,
          sourceStringValue,
          sourceNumberValue,
        );
        repairedCount += 1;
        return [];
      }

      console.log("[AffinityStore][batchUpdateByPath] 匹配到 metric，走 batchUpdate", {
        rawMetric: u.metric,
        matchedMetricId: metric.metricId,
        change: u.change,
        isAbsolute: u.isAbsolute,
      });

      return [{
        metricId: metric.metricId,
        change: u.change,
        reason: u.reason,
        stringValue:
          u.stringValue ??
          (typeof sourceTreeValue === "string" ? sourceTreeValue : undefined) ??
          sourceStringValue,
        isAbsolute: u.isAbsolute,
        absoluteValue:
          u.absoluteValue ??
          (typeof sourceTreeValue === "number" ? sourceTreeValue : undefined) ??
          sourceNumberValue,
      }];
    });

    console.log("[AffinityStore][batchUpdateByPath] 即將呼叫 batchUpdate", {
      resolvedCount: resolved.length,
      repairedCount,
      skippedCount,
      resolved,
    });

    const appliedCount = batchUpdate(chatId, resolved) + repairedCount;
    const result: AffinityBatchUpdateResult = {
      applied: appliedCount > 0,
      appliedCount,
      repairedCount,
      resolvedCount: resolved.length,
      skippedCount,
      reason: appliedCount > 0 ? undefined : "沒有任何更新成功寫入",
    };
    if (!result.applied) {
      console.warn("[AffinityStore][batchUpdateByPath] MVU/好感更新沒有生效", {
        chatId,
        result,
        updates,
      });
    }
    return result;
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
  ): number {
    let appliedCount = 0;
    for (const u of updates) {
      const config = configCache.value.get(
        affinityStates.value.get(chatId)?.characterId ?? "",
      );
      const mc = config?.metrics.find((m) => m.id === u.metricId);
      let applied = false;

      if (u.isAbsolute) {
        // _.set() 絕對賦值：字串或數字直接 setMetric
        if (u.stringValue !== undefined) {
          applied = setMetric(chatId, u.metricId, u.stringValue, u.reason);
        } else if (u.absoluteValue !== undefined) {
          applied = setMetric(chatId, u.metricId, u.absoluteValue, u.reason);
        }
      } else if (mc?.type === "string" && u.stringValue !== undefined) {
        applied = setMetric(chatId, u.metricId, u.stringValue, u.reason);
      } else {
        applied = updateMetric(chatId, u.metricId, u.change, u.reason);
      }

      if (applied) appliedCount += 1;
    }

    // batchUpdate 內部的 updateMetric/setMetric 已各自觸發響應式更新
    return appliedCount;
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
    cloneStateForBranch,
    setLastRescannedMessageId,
    getLastRescannedMessageId,
    getState,

    updateMetric,
    setMetric,
    getMetricByPath,
    setMetricByPath,
    getMvuStatData,
    getMvuDisplayData,
    getMvuDeltaData,
    resetMvuDeltaData,
    setMvuValueByPath,
    removeMvuValueByPath,
    insertMvuValueByPath,
    batchUpdateByPath,
    batchUpdate,
    snapshotBeforeMessage,
    rollbackToBeforeMessages,

    getCurrentStage,
    getMetricPercentage,
    getMetricsSnapshot,
    validateAndClamp,
  };
});
