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
  type AffinityChangeRecord,
  type AffinityFloorState,
  type AffinityMetricConfig,
  type AffinityPostMutationRule,
  type AffinityRuleCondition,
  type CharacterAffinityConfig,
  type ChatAffinityState,
  type MetricValue,
  buildDynamicValidator,
  clampMetricNumber,
  computePercentage,
  computeStage,
  createDefaultState,
  findStage,
  isValueWithDescription,
  MAX_FLOOR_STATES,
  MAX_HISTORY_LENGTH,
  readMvuLeaf,
  safeParseAffinityConfig,
  safeParseAffinityState,
  writeMvuLeaf,
} from "@/schemas/affinity";
import { defineStore } from "pinia";
import { ref, toRaw } from "vue";
import _ from "lodash";

const AFFINITY_STATES_STORE = DB_STORES.CHAT_AFFINITY_STATES;
const AFFINITY_CONFIG_STORE = DB_STORES.CHARACTER_AFFECTIONS;
const AUTO_SAVE_DELAY_MS = 300;

/** batchUpdateByPath 收到的一筆更新（ResponseParser.AffinityUpdateEntry 的子集） */
export interface AffinityPathUpdate {
  metric: string;
  change: number;
  reason: string;
  operation?: "remove" | "insert";
  stringValue?: string;
  isAbsolute?: boolean;
  absoluteValue?: number;
  /** 布林、物件、陣列等非數字/字串的值 */
  rawValue?: unknown;
  sourceMetric?: string;
  insertIndex?: string | number;
  /** remove 的第二個參數：陣列索引、要刪的值或物件鍵 */
  removeTarget?: unknown;
}

export interface AffinityUpdateOptions {
  /** 套用指標的「單次最大變化」；開場白初始值、手動調整不受限 */
  limitChange?: boolean;
}

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

/** 比對指標用：`好感度[0]` / `好感度.0` 指的是 [值, 說明] 的值，視同 `好感度` */
function normalizeForMatch(path: string): string {
  return normalizeMetricPath(path)
    .replace(/\[(\d+)\]/g, ".$1")
    .replace(/\.0$/, "");
}

function deepClone<T>(value: T): T {
  if (value === undefined) return value;
  return JSON.parse(JSON.stringify(value)) as T;
}

/** 數字運算的浮點誤差（0.1+0.2）收掉，跟 MVU 一樣取 12 位有效數字 */
function roundNumber(value: number): number {
  return Number(value.toPrecision(12));
}

function limitByMaxChange(
  oldValue: number,
  newValue: number,
  metric: AffinityMetricConfig | undefined,
  options?: AffinityUpdateOptions,
): number {
  const max = metric?.maxChange ?? 0;
  if (!options?.limitChange || !(max > 0)) return newValue;
  const diff = newValue - oldValue;
  if (Math.abs(diff) <= max) return newValue;
  return roundNumber(oldValue + Math.sign(diff) * max);
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
  /** 正在套用哪一則訊息的更新（期間寫入的「近期變化」會標上這個 id） */
  const _activeMessageIds = new Map<string, string>();
  /** 正在對齊樓層的聊天（對齊本身不算手動修改） */
  const _syncingChats = new Set<string>();
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
    writeMvuLeaf(mvuState.statData, path, deepClone(value));
    writeMvuLeaf(mvuState.displayData, path, deepClone(value));
    _.set(mvuState.deltaData, path, deepClone(delta ?? value));
  }

  function _pushHistory(
    chatId: string,
    record: Omit<AffinityChangeRecord, "messageId">,
  ): void {
    const state = affinityStates.value.get(chatId);
    if (!state) return;
    const messageId = _activeMessageIds.get(chatId);
    state.history.push(messageId ? { ...record, messageId } : record);
    if (state.history.length > MAX_HISTORY_LENGTH) {
      state.history = state.history.slice(-MAX_HISTORY_LENGTH);
    }
  }

  /**
   * stat_data 某個路徑被整塊換掉（物件、插入、刪除）後，把底下的指標值拉回 values，
   * 避免面板顯示舊數字。
   */
  function _pullMetricsFromStatData(chatId: string, changedPath: string): void {
    const state = affinityStates.value.get(chatId);
    const config = state ? configCache.value.get(state.characterId) : undefined;
    const statData = state?.mvuState?.statData;
    if (!state || !config || !statData) return;
    const changed = normalizeForMatch(changedPath);
    for (const m of config.metrics) {
      const metricPath = normalizeMetricPath(m.path || m.name);
      if (!metricPath) continue;
      const related =
        metricPath === changed ||
        metricPath.startsWith(`${changed}.`) ||
        changed.startsWith(`${metricPath}.`);
      if (!related) continue;
      const leaf = readMvuLeaf(statData, metricPath);
      if (m.type === "string") {
        if (leaf === undefined || leaf === null || typeof leaf === "object") continue;
        setMetric(chatId, m.id, String(leaf), "MVU stat_data");
      } else if (typeof leaf === "number" || (typeof leaf === "string" && leaf.trim() !== "" && Number.isFinite(Number(leaf)))) {
        setMetric(chatId, m.id, Number(leaf), "MVU stat_data");
      }
    }
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
    // 不是在套用某則訊息、也不是在對齊樓層時改的（手動調整、電話、EJS setvar…）
    // → 寫回目前那一樓，之後對齊時才不會被蓋掉
    if (!_activeMessageIds.has(chatId) && !_syncingChats.has(chatId)) {
      const state = affinityStates.value.get(chatId);
      if (state) _writeAnchor(state);
    }
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
    // 強制重置：之前的訊息不再自動重新套用（否則重置完一進聊天又被最後一則覆蓋回去）
    if (options?.force) state.resetAt = Date.now();
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
    options?: {
      /** 舊訊息 id → 分支裡的新 id；給了就把樓層記錄換成新 id，並對齊到分支點 */
      idMap?: Map<string, string>;
      /** 分支裡的訊息 id（新 id，依順序） */
      branchMessageIds?: string[];
    },
  ): Promise<ChatAffinityState | null> {
    let src = affinityStates.value.get(srcChatId);
    if (!src) {
      src = (await loadState(srcChatId)) ?? undefined;
    }
    if (!src) return null;

    const cloned = JSON.parse(JSON.stringify(toRaw(src))) as ChatAffinityState;
    cloned.chatId = newChatId;
    cloned.lastUpdated = Date.now();

    const idMap = options?.idMap;
    if (idMap) {
      // 分支的訊息換了新 id：樓層記錄跟著換，分支點之後的丟掉
      const remap = (id: string | undefined) => (id ? idMap.get(id) : undefined);
      const states: ChatAffinityState["messageStates"] = {};
      for (const [oldId, floor] of Object.entries(cloned.messageStates ?? {})) {
        const newId = remap(oldId);
        if (!newId) continue;
        states[newId] = {
          ...floor,
          changes: floor.changes.map((c) => ({ ...c, messageId: newId })),
        };
      }
      cloned.messageStates = states;
      cloned.history = cloned.history.flatMap((h) => {
        if (!h.messageId) return [h];
        const newId = remap(h.messageId);
        return newId ? [{ ...h, messageId: newId }] : [];
      });
      cloned.anchorMessageId = remap(cloned.anchorMessageId);
      const snapshots: ChatAffinityState["snapshots"] = {};
      for (const [oldId, snap] of Object.entries(cloned.snapshots ?? {})) {
        const newId = remap(oldId);
        if (newId) snapshots[newId] = snap;
      }
      cloned.snapshots = snapshots;
      cloned.lastRescannedMessageId = remap(cloned.lastRescannedMessageId);
    } else if (cloned.baseState || Object.keys(cloned.messageStates ?? {}).length > 0) {
      // 新聊天的訊息跟來源對不上（小劇場另開新檔等）：只帶走目前的數值當起點
      cloned.baseState = _captureFloor(cloned);
      cloned.messageStates = {};
      cloned.anchorMessageId = undefined;
      cloned.history = cloned.history.map(({ messageId: _id, ...rest }) => rest);
    }

    affinityStates.value.set(newChatId, cloned);
    _dbLoadedIds.add(newChatId);
    if (options?.branchMessageIds) {
      syncToMessages(newChatId, options.branchMessageIds);
    }
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

  // ===== 樓層狀態（跟著訊息走） =====

  function _captureFloor(state: ChatAffinityState): AffinityFloorState {
    return {
      values: deepClone(state.values),
      statData: deepClone(state.mvuState?.statData ?? {}),
      deltaData: deepClone(state.mvuState?.deltaData ?? {}),
      changes: [],
      seq: 0,
    };
  }

  function _restoreFloor(state: ChatAffinityState, floor: AffinityFloorState): void {
    state.values = deepClone(floor.values);
    state.mvuState = {
      statData: deepClone(floor.statData),
      // displayData 一直都是 statData 的鏡像
      displayData: deepClone(floor.statData),
      deltaData: deepClone(floor.deltaData),
    };
  }

  function _sameFloor(state: ChatAffinityState, floor: AffinityFloorState): boolean {
    return (
      _.isEqual(toRaw(state.values), floor.values) &&
      _.isEqual(toRaw(state.mvuState?.statData ?? {}), floor.statData) &&
      _.isEqual(toRaw(state.mvuState?.deltaData ?? {}), floor.deltaData)
    );
  }

  /** 超過上限時把最舊的樓層併進 baseState */
  function _pruneFloors(state: ChatAffinityState): void {
    const entries = Object.entries(state.messageStates ?? {});
    if (entries.length <= MAX_FLOOR_STATES) return;
    entries.sort((a, b) => a[1].seq - b[1].seq);
    const dropCount = entries.length - MAX_FLOOR_STATES;
    for (let i = 0; i < dropCount; i++) {
      const [id, floor] = entries[i];
      delete state.messageStates[id];
      // 刪到比這更早的地方時，最接近的近似值就是被丟掉的最新一層
      if (i === dropCount - 1) state.baseState = { ...floor, changes: [] };
    }
  }

  /** 這個聊天是否已經在用樓層狀態（舊聊天第一次套用更新前都是 false） */
  function hasFloorStates(chatId: string): boolean {
    const state = affinityStates.value.get(chatId);
    if (!state) return false;
    return !!state.baseState || Object.keys(state.messageStates ?? {}).length > 0;
  }

  function hasMessageState(chatId: string, messageId: string): boolean {
    return !!affinityStates.value.get(chatId)?.messageStates?.[messageId];
  }

  /**
   * 把數值對齊到訊息列表：取最後一則有記錄的訊息的狀態；
   * 一則都沒有就回到 baseState。
   *
   * @param orderedMessageIds 目前聊天裡（或某則訊息之前）的訊息 id，依顯示順序
   * @returns 有沒有用樓層狀態對齊（舊聊天沒有樓層時回傳 false，呼叫端可改用舊的回滾）
   */
  function syncToMessages(chatId: string, orderedMessageIds: string[]): boolean {
    const state = affinityStates.value.get(chatId);
    if (!state || !hasFloorStates(chatId)) return false;
    state.messageStates ??= {};

    let anchorId: string | undefined;
    for (let i = orderedMessageIds.length - 1; i >= 0; i--) {
      if (state.messageStates[orderedMessageIds[i]]) {
        anchorId = orderedMessageIds[i];
        break;
      }
    }
    const target = anchorId ? state.messageStates[anchorId] : state.baseState;
    if (!target) return false;

    let changed = false;
    if (!_sameFloor(state, target)) {
      _restoreFloor(state, target);
      changed = true;
    }
    if (state.anchorMessageId !== anchorId) {
      state.anchorMessageId = anchorId;
      changed = true;
    }

    // 「近期變化」只留還在的訊息造成的；換回某則回覆時把它當時的變化補回來
    const live = new Set(orderedMessageIds);
    const kept = state.history.filter((h) => !h.messageId || live.has(h.messageId));
    const present = new Set(kept.map((h) => h.messageId).filter(Boolean));
    const restored: AffinityChangeRecord[] = [];
    for (const id of orderedMessageIds) {
      const floor = state.messageStates[id];
      if (floor?.changes.length && !present.has(id)) restored.push(...floor.changes);
    }
    if (kept.length !== state.history.length || restored.length > 0) {
      state.history = [...kept, ...restored]
        .sort((a, b) => a.timestamp - b.timestamp)
        .slice(-MAX_HISTORY_LENGTH);
      changed = true;
    }

    if (changed) {
      state.lastUpdated = Date.now();
      _triggerReactivity(chatId);
      _syncingChats.add(chatId);
      try {
        _scheduleAutoSave(chatId);
      } finally {
        _syncingChats.delete(chatId);
      }
    }
    return true;
  }

  /**
   * 準備套用某則訊息的更新：先回到「這則訊息之前」的狀態，
   * 這樣重抽、重新掃描都是從同一個起點算，不會疊加。
   *
   * @param previousMessageIds 這則訊息之前的所有訊息 id（依順序）；不知道時省略
   */
  function beginMessageUpdate(
    chatId: string,
    messageId: string,
    previousMessageIds?: string[],
  ): void {
    const state = affinityStates.value.get(chatId);
    if (!state) return;

    const synced = previousMessageIds
      ? syncToMessages(chatId, previousMessageIds)
      : false;
    if (!synced) {
      // 舊聊天：有這則訊息套用前的舊快照就用它
      const legacy = state.snapshots?.[messageId];
      if (legacy && !hasFloorStates(chatId)) state.values = { ...legacy };
    }
    // 第一次記錄樓層：目前的數值就是「所有樓層之前」的狀態
    if (!state.baseState) state.baseState = _captureFloor(state);
    _activeMessageIds.set(chatId, messageId);
  }

  /** 套用完某則訊息的更新：記下這則之後的狀態 */
  function commitMessageUpdate(chatId: string, messageId: string): void {
    _activeMessageIds.delete(chatId);
    const state = affinityStates.value.get(chatId);
    if (!state) return;
    const floor = _captureFloor(state);
    floor.changes = state.history.filter((h) => h.messageId === messageId);
    state.floorSeq = (state.floorSeq ?? 0) + 1;
    floor.seq = state.floorSeq;
    state.messageStates ??= {};
    state.messageStates[messageId] = floor;
    state.anchorMessageId = messageId;
    _pruneFloors(state);
    state.lastUpdated = Date.now();
    _triggerReactivity(chatId);
    _scheduleAutoSave(chatId);
  }

  /**
   * 手動調整後呼叫：把目前數值寫回對應的那一則訊息，
   * 之後重新對齊（刪掉後面的訊息、換回覆再換回來）時不會被蓋掉。
   */
  function commitManualEdit(chatId: string): void {
    const state = affinityStates.value.get(chatId);
    if (!state) return;
    _writeAnchor(state);
    _scheduleAutoSave(chatId);
  }

  function _writeAnchor(state: ChatAffinityState): void {
    if (!state.baseState && Object.keys(state.messageStates ?? {}).length === 0) return;
    const anchorId = state.anchorMessageId;
    const anchor = anchorId ? state.messageStates?.[anchorId] : undefined;
    const floor = _captureFloor(state);
    if (anchorId && anchor) {
      state.messageStates[anchorId] = { ...floor, changes: anchor.changes, seq: anchor.seq };
    } else {
      state.baseState = floor;
    }
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
    options?: AffinityUpdateOptions,
  ): boolean {
    const state = affinityStates.value.get(chatId);
    if (!state) return false;

    const config = configCache.value.get(state.characterId);
    const metricConfig = config?.metrics.find((m) => m.id === metricId);

    if (metricConfig?.type === "string") return false;
    if (!Number.isFinite(delta)) return false;

    const oldValue = state.values[metricId];
    const numOld =
      typeof oldValue === "number"
        ? oldValue
        : typeof metricConfig?.initial === "number"
          ? metricConfig.initial
          : 0;
    let newValue = roundNumber(numOld + delta);

    if (metricConfig) {
      newValue = limitByMaxChange(numOld, newValue, metricConfig, options);
      newValue = clampMetricNumber(newValue, metricConfig);
    }

    if (newValue === oldValue) return false;

    state.values[metricId] = newValue;
    _syncMetricToMvuViews(chatId, metricId, newValue, roundNumber(newValue - numOld));
    _pushHistory(chatId, {
      metricId,
      oldValue: numOld,
      newValue,
      reason,
      timestamp: Date.now(),
    });

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
    options?: AffinityUpdateOptions,
  ): boolean {
    const state = affinityStates.value.get(chatId);
    if (!state) return false;

    const config = configCache.value.get(state.characterId);
    const metricConfig = config?.metrics.find((m) => m.id === metricId);
    const oldValue = state.values[metricId] ?? (metricConfig?.initial ?? 0);

    let finalValue: MetricValue = value;
    if (metricConfig?.type === "string") {
      finalValue = String(value);
    } else if (metricConfig) {
      // 數字指標收到 "74" 這種字串也當數字；真的不是數字就不動
      const numeric = typeof value === "number" ? value : Number(value);
      if (typeof value === "string" && (value.trim() === "" || !Number.isFinite(numeric))) {
        return false;
      }
      if (!Number.isFinite(numeric)) return false;
      finalValue = numeric;
      if (typeof oldValue === "number") {
        finalValue = limitByMaxChange(oldValue, finalValue, metricConfig, options);
      }
      finalValue = clampMetricNumber(finalValue, metricConfig);
    }

    if (finalValue === oldValue && state.values[metricId] !== undefined) return false;

    state.values[metricId] = finalValue;
    _syncMetricToMvuViews(
      chatId,
      metricId,
      finalValue,
      typeof finalValue === "number" && typeof oldValue === "number"
        ? roundNumber(finalValue - oldValue)
        : finalValue,
    );
    if (finalValue !== oldValue) {
      _pushHistory(chatId, {
        metricId,
        oldValue,
        newValue: finalValue,
        reason,
        timestamp: Date.now(),
      });
    }

    _scheduleAutoSave(chatId);
    _applyPostMutationRules(chatId);
    // 觸發 Vue 響應式更新（重新設置 Map 條目）
    _triggerReactivity(chatId);
    return finalValue !== oldValue;
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

    const normalizedPath = normalizeForMatch(path);
    if (!normalizedPath) {
      console.warn("[AffinityStore][getMetricByPath] normalizedPath 為空", { path });
      return null;
    }

    const tail = normalizedPath.split(".").pop() ?? "";

    const metric = config.metrics.find((m) => {
      const metricPath = m.path ? normalizeForMatch(m.path) : "";
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
    options?: AffinityUpdateOptions,
  ): boolean {
    const state = affinityStates.value.get(chatId);
    if (!state) return false;

    const normalizedPath = normalizeMetricPath(path);
    if (!normalizedPath) return false;

    const mvuState = _ensureMvuState(chatId);
    if (!mvuState) return false;

    const metric = getMetricByPath(chatId, normalizedPath);
    if (metric && (typeof value === "string" || typeof value === "number" || typeof value === "boolean")) {
      // 指標用 setMetric 寫（會同步 stat_data、夾範圍、記近期變化）
      const changed = setMetric(
        chatId,
        metric.metricId,
        typeof value === "boolean" ? String(value) : value,
        reason || "MVU stat_data set",
        options,
      );
      if (typeof value === "boolean") {
        // 布林原樣留在 stat_data，EJS 的 `=== true` 才判斷得到
        writeMvuLeaf(mvuState.statData, normalizedPath, value);
        writeMvuLeaf(mvuState.displayData, normalizedPath, value);
      }
      void changed;
      return true;
    }

    const previous = readMvuLeaf(mvuState.statData, normalizedPath);
    writeMvuLeaf(mvuState.statData, normalizedPath, deepClone(value));
    writeMvuLeaf(mvuState.displayData, normalizedPath, deepClone(value));
    _.set(mvuState.deltaData, normalizedPath, deepClone(value));
    if (value !== null && typeof value === "object") {
      _pullMetricsFromStatData(chatId, normalizedPath);
    } else if (!_.isEqual(previous, value)) {
      _pushHistory(chatId, {
        metricId: normalizedPath,
        oldValue: _toHistoryValue(previous),
        newValue: _toHistoryValue(value),
        reason,
        timestamp: Date.now(),
      });
    }

    state.lastUpdated = Date.now();
    _triggerReactivity(chatId);
    _scheduleAutoSave(chatId);
    return true;
  }

  function _toHistoryValue(v: unknown): MetricValue {
    if (typeof v === "number" || typeof v === "string") return v;
    if (v === undefined || v === null) return "";
    if (typeof v === "boolean") return String(v);
    try {
      return JSON.stringify(v);
    } catch {
      return String(v);
    }
  }

  /**
   * 刪除 stat_data 裡的路徑。
   * - 只給路徑：刪掉那個鍵（路徑最後是數字且父層是陣列時，刪掉那一格）
   * - 再給 target：父層是陣列時刪掉該索引或等於該值的項目；物件時刪掉該鍵
   */
  function removeMvuValueByPath(
    chatId: string,
    path: string,
    target?: unknown,
  ): boolean {
    const state = affinityStates.value.get(chatId);
    const mvuState = _ensureMvuState(chatId);
    if (!state || !mvuState) return false;

    const normalizedPath = normalizeMetricPath(path);
    if (!normalizedPath) return false;

    const apply = (root: Record<string, unknown>): boolean => {
      if (target === undefined) {
        const segments = _.toPath(normalizedPath);
        const last = segments[segments.length - 1];
        const parentPath = segments.slice(0, -1);
        const parent = parentPath.length ? _.get(root, parentPath) : root;
        if (Array.isArray(parent) && /^\d+$/.test(last)) {
          const idx = Number(last);
          if (idx >= parent.length) return false;
          parent.splice(idx, 1);
          return true;
        }
        if (!_.has(root, normalizedPath)) return false;
        return _.unset(root, normalizedPath);
      }
      const container = _.get(root, normalizedPath);
      if (Array.isArray(container)) {
        const idx =
          typeof target === "number"
            ? target
            : container.findIndex((item) => _.isEqual(item, target));
        if (idx < 0 || idx >= container.length) return false;
        container.splice(idx, 1);
        return true;
      }
      if (container && typeof container === "object") {
        const keys = Object.keys(container as Record<string, unknown>);
        const key = typeof target === "number" ? keys[target] : String(target);
        if (key === undefined || !(key in (container as Record<string, unknown>))) return false;
        delete (container as Record<string, unknown>)[key];
        return true;
      }
      return false;
    };

    const removed = apply(mvuState.statData);
    if (!removed) return false;
    apply(mvuState.displayData);
    _.set(mvuState.deltaData, normalizedPath, target === undefined ? "REMOVED" : `REMOVED ${_toHistoryValue(target)}`);
    _pushHistory(chatId, {
      metricId: normalizedPath,
      oldValue: target === undefined ? "存在" : _toHistoryValue(target),
      newValue: "已刪除",
      reason: "MVU 刪除",
      timestamp: Date.now(),
    });
    _pullMetricsFromStatData(chatId, normalizedPath);
    state.lastUpdated = Date.now();
    _triggerReactivity(chatId);
    _scheduleAutoSave(chatId);
    return true;
  }

  /**
   * 插入 stat_data（MVU 的 _.insert / _.assign）：
   * - 陣列：沒給索引或給 "-" 就加在最後，給數字就插在那個位置
   * - 物件：給鍵就設那個鍵；沒給鍵且值是物件就合併進去
   * - 路徑不存在：給了文字鍵就建物件，否則建陣列
   * - 路徑是單一值（舊版把 _.assign 當賦值用）：直接改成新值
   */
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

    const isIndex = (i: unknown) =>
      i === undefined || i === "-" || typeof i === "number" || (typeof i === "string" && /^\d+$/.test(i));

    const current = _.get(mvuState.statData, normalizedPath);
    let next: unknown;
    if (Array.isArray(current) && !isValueWithDescription(current)) {
      const copy = [...current];
      if (index === undefined || index === "-") copy.push(deepClone(value));
      else if (isIndex(index)) copy.splice(Number(index), 0, deepClone(value));
      else copy.push(deepClone(value));
      next = copy;
    } else if (current && typeof current === "object" && !Array.isArray(current)) {
      if (index === undefined) {
        next =
          value && typeof value === "object" && !Array.isArray(value)
            ? _.merge({}, current, deepClone(value))
            : { ...(current as Record<string, unknown>), [String(Object.keys(current).length)]: deepClone(value) };
      } else {
        next = { ...(current as Record<string, unknown>), [String(index)]: deepClone(value) };
      }
    } else if (current === undefined) {
      next =
        index !== undefined && !isIndex(index)
          ? { [String(index)]: deepClone(value) }
          : [deepClone(value)];
    } else {
      // 單一值（含 [值, 說明]）：當成賦值
      const target = index !== undefined && !isIndex(index) ? `${normalizedPath}.${index}` : normalizedPath;
      setMvuValueByPath(chatId, target, value, "MVU _.assign");
      return _.get(mvuState.statData, normalizedPath);
    }

    _.set(mvuState.statData, normalizedPath, next);
    _.set(mvuState.displayData, normalizedPath, deepClone(next));
    _.set(mvuState.deltaData, normalizedPath, deepClone(value));
    _pushHistory(chatId, {
      metricId: normalizedPath,
      oldValue: "",
      newValue: `+ ${_toHistoryValue(value)}`,
      reason: "MVU 插入",
      timestamp: Date.now(),
    });
    _pullMetricsFromStatData(chatId, normalizedPath);
    state.lastUpdated = Date.now();
    _triggerReactivity(chatId);
    _scheduleAutoSave(chatId);
    return next;
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
    u: AffinityPathUpdate,
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

    const previousValue = readMvuLeaf(mvuState.statData, normalizedPath);
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
      const base =
        typeof previousValue === "number"
          ? previousValue
          : Number.isFinite(Number(previousValue)) && previousValue !== "" && previousValue !== null
            ? Number(previousValue)
            : 0;
      newValue = roundNumber(base + u.change);
    }

    writeMvuLeaf(mvuState.statData, normalizedPath, deepClone(newValue));
    writeMvuLeaf(mvuState.displayData, normalizedPath, deepClone(newValue));
    // deltaData：對 delta 操作記錄差值，其他情況存最終值
    const deltaValue =
      !u.isAbsolute && !isStringWrite && typeof newValue === "number"
        ? u.change
        : newValue;
    _.set(mvuState.deltaData, normalizedPath, deepClone(deltaValue));

    // 友善 history：metricId 用完整 normalizedPath，oldValue/newValue 取 MetricValue 可接受的型別
    const oldForHistory =
      previousValue === undefined || previousValue === null ? 0 : _toHistoryValue(previousValue);
    const newForHistory = _toHistoryValue(newValue);

    if (oldForHistory !== newForHistory) {
      _pushHistory(chatId, {
        metricId: normalizedPath,
        oldValue: oldForHistory,
        newValue: newForHistory,
        reason: u.reason,
        timestamp: Date.now(),
      });
    }

    state.lastUpdated = Date.now();
    _scheduleAutoSave(chatId);
    _triggerReactivity(chatId);
  }

  function batchUpdateByPath(
    chatId: string,
    updates: AffinityPathUpdate[],
    options?: AffinityUpdateOptions,
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
        if (removeMvuValueByPath(chatId, u.metric, u.removeTarget)) repairedCount += 1;
        else skippedCount += 1;
        return [];
      }

      // 布林、物件、陣列：直接寫 stat_data（對應到指標時會一起同步）
      if (
        u.operation !== "insert" &&
        u.isAbsolute &&
        u.rawValue !== undefined &&
        u.stringValue === undefined &&
        u.absoluteValue === undefined
      ) {
        if (setMvuValueByPath(chatId, u.metric, u.rawValue, u.reason, options)) repairedCount += 1;
        else skippedCount += 1;
        return [];
      }

      if (u.operation === "insert") {
        const insertValue = u.rawValue !== undefined ? u.rawValue : (u.stringValue ?? u.absoluteValue);
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

    const appliedCount = batchUpdate(chatId, resolved, options) + repairedCount;
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
    options?: AffinityUpdateOptions,
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
          applied = setMetric(chatId, u.metricId, u.stringValue, u.reason, options);
        } else if (u.absoluteValue !== undefined) {
          applied = setMetric(chatId, u.metricId, u.absoluteValue, u.reason, options);
        }
      } else if (mc?.type === "string" && u.stringValue !== undefined) {
        applied = setMetric(chatId, u.metricId, u.stringValue, u.reason, options);
      } else {
        applied = updateMetric(chatId, u.metricId, u.change, u.reason, options);
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

    if (metricConfig.bounded === false) return 0;
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
        percentage: m.bounded === false ? 0 : computePercentage(value, m.min, m.max),
        stage: computeStage(value, m.stages),
        stageDescription: findStage(value, m.stages)?.description ?? "",
        stages: m.stages,
        bounded: m.bounded !== false,
        description: m.description ?? "",
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
    hasFloorStates,
    hasMessageState,
    syncToMessages,
    beginMessageUpdate,
    commitMessageUpdate,
    commitManualEdit,

    getCurrentStage,
    getMetricPercentage,
    getMetricsSnapshot,
    validateAndClamp,
  };
});
