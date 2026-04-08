import _ from "lodash";
import type {
  CharacterAffinityConfig,
  ChatAffinityState,
  MetricValue,
} from "@/schemas/affinity";
import { computeStage } from "@/schemas/affinity";
import { useAffinityStore } from "@/stores/affinity";
import { useChatVariablesStore } from "@/stores/chatVariables";
import type { ChatMessage } from "@/types/chat";

export interface StTemplateContextOptions {
  affinityConfig?: CharacterAffinityConfig | null;
  affinityState?: ChatAffinityState | null;
  charName?: string;
  userName?: string;
  chatId?: string;
  messages?: ChatMessage[];
}

function getDefaultValue(parsed: Record<string, unknown>): unknown {
  return Object.prototype.hasOwnProperty.call(parsed, "defaults")
    ? parsed.defaults
    : undefined;
}

function checkFlags(existing: unknown, parsed: Record<string, unknown>): boolean {
  const flags = typeof parsed.flags === "string" ? parsed.flags : "n";
  const exists = existing !== undefined && existing !== "";
  if (flags === "nx" || flags === "nxs") return !exists;
  if (flags === "xx" || flags === "xxs") return exists;
  return true;
}

export interface StTemplateContext {
  stat_data: Record<string, unknown>;
  display_data: Record<string, unknown>;
  delta_data: Record<string, unknown>;
  values: Record<string, MetricValue>;
  stages: Record<string, string | null>;
  variables: Record<string, unknown>;
  getvar: (path: string, options?: unknown) => unknown;
  setvar: (path: string | null, value: unknown, options?: unknown) => unknown;
  getVariables: (options?: { type?: string }) => Record<string, unknown>;
  getChatMessage: (index: number, role?: string) => string;
  getMessages: () => string[];
  lastMessage: string;
  lastUserMessage: string;
  lastCharMessage: string;
  chatMessages: ChatMessage[];
  charName: string;
  userName: string;
  messageCount: number;
  getwi: (name?: string) => string;
  getWorldInfo: (name?: string) => string;
  incvar: (path: string, value?: number, options?: unknown) => unknown;
  decvar: (path: string, value?: number, options?: unknown) => unknown;
  setLocalVar: (path: string | null, value: unknown, options?: unknown) => unknown;
  setGlobalVar: (path: string | null, value: unknown, options?: unknown) => unknown;
  getLocalVar: (path: string, options?: unknown) => unknown;
  getGlobalVar: (path: string, options?: unknown) => unknown;
  getMessageVar: (path: string, options?: unknown) => unknown;
  setMessageVar: (path: string | null, value: unknown, options?: unknown) => unknown;
  incLocalVar: (path: string, value?: number, options?: unknown) => unknown;
  incGlobalVar: (path: string, value?: number, options?: unknown) => unknown;
  removeVariable: (path: string, options?: unknown) => unknown;
  insertVariable: (path: string, value: unknown, index?: string | number, options?: unknown) => unknown;
  _: typeof _;
}

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function normalizePath(path: string): string {
  return path.replace(/^\/+/, "").replace(/\//g, ".");
}

function getByPath(root: Record<string, unknown>, path: string): unknown {
  if (!path) return root;
  const normalized = path.startsWith("stat_data.")
    ? path.slice("stat_data.".length)
    : path.startsWith("display_data.")
      ? path.slice("display_data.".length)
      : path.startsWith("delta_data.")
        ? path.slice("delta_data.".length)
        : normalizePath(path);
  return _.get(root, normalized);
}

function setByPath(root: Record<string, unknown>, path: string, value: unknown): void {
  const normalized = normalizePath(path);
  if (!normalized) return;
  _.set(root, normalized, value);
}

function deleteByPath(root: Record<string, unknown>, path: string): void {
  const normalized = normalizePath(path);
  if (!normalized) return;
  _.unset(root, normalized);
}

function parseOptionObject(options?: unknown): Record<string, unknown> {
  if (!options) return {};
  if (typeof options === "string") {
    if (["global", "local", "message", "cache", "initial"].includes(options)) {
      return { scope: options };
    }
    return {};
  }
  if (typeof options === "object") return options as Record<string, unknown>;
  return {};
}

function coerceStoredValue(value: string): unknown {
  if (value === "") return "";
  if (value === "true") return true;
  if (value === "false") return false;
  if (value === "null") return null;
  const num = Number(value);
  if (!Number.isNaN(num) && value.trim() !== "") return num;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function serializeStoredValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value === null || value === undefined) return "";
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function buildStatData(
  affinityConfig?: CharacterAffinityConfig | null,
  affinityState?: ChatAffinityState | null,
): {
  statData: Record<string, unknown>;
  displayData: Record<string, unknown>;
  deltaData: Record<string, unknown>;
  values: Record<string, MetricValue>;
  stages: Record<string, string | null>;
} {
  const values: Record<string, MetricValue> = {};
  const stages: Record<string, string | null> = {};
  const statData = affinityState?.mvuState?.statData
    ? deepClone(affinityState.mvuState.statData)
    : affinityConfig?.mvuEnabled
      ? deepClone(affinityConfig.mvuInitialData)
      : {};
  const displayData = affinityState?.mvuState?.displayData
    ? deepClone(affinityState.mvuState.displayData)
    : affinityConfig?.mvuEnabled
      ? deepClone(affinityConfig.mvuInitialData)
      : {};
  const deltaData = affinityState?.mvuState?.deltaData
    ? deepClone(affinityState.mvuState.deltaData)
    : {};

  if (!affinityConfig?.enabled || !affinityState) {
    return { statData, displayData, deltaData, values, stages };
  }

  for (const metric of affinityConfig.metrics) {
    const value = affinityState.values[metric.id] ?? metric.initial;
    values[metric.name] = value;
    stages[metric.name] = computeStage(value, metric.stages);
    const path = metric.path || metric.name;
    if (path) {
      setByPath(statData, path, value);
      setByPath(displayData, path, value);
    }
  }

  return { statData, displayData, deltaData, values, stages };
}

export function createStTemplateContext(
  options: StTemplateContextOptions,
): StTemplateContext {
  const charName = options.charName ?? "角色";
  const userName = options.userName ?? "用戶";
  const messages = options.messages ?? [];
  const { statData, displayData, deltaData, values, stages } = buildStatData(
    options.affinityConfig,
    options.affinityState,
  );

  const chatVariables = useChatVariablesStore();
  const affinityStore = useAffinityStore();
  if (options.chatId) {
    chatVariables.initForChat(options.chatId);
  }

  const mergedVariables: Record<string, unknown> = {
    ...Object.fromEntries(
      Object.entries(chatVariables.globalVars).map(([key, value]) => [key, coerceStoredValue(value)]),
    ),
    ...Object.fromEntries(
      Object.entries(chatVariables.localVars).map(([key, value]) => [key, coerceStoredValue(value)]),
    ),
    stat_data: statData,
    display_data: displayData,
    delta_data: deltaData,
    values,
    stages,
  };

  const getScope = (rawOptions?: unknown): string => {
    const parsed = parseOptionObject(rawOptions);
    return typeof parsed.scope === "string" ? parsed.scope : "cache";
  };

  const getInitialValue = (path: string): unknown => {
    if (!path.startsWith("stat_data.") && !path.startsWith("display_data.")) return undefined;
    return getByPath({
      stat_data: options.affinityConfig?.mvuInitialData ?? {},
      display_data: options.affinityConfig?.mvuInitialData ?? {},
    }, path);
  };

  const getMessageValue = (_path: string): unknown => undefined;

  const getAffinityBackedValue = (path: string): unknown => {
    if (!options.chatId) return undefined;
    const normalized = path.startsWith("stat_data.")
      ? normalizePath(path.slice("stat_data.".length))
      : path.startsWith("display_data.")
        ? normalizePath(path.slice("display_data.".length))
        : path.startsWith("delta_data.")
          ? normalizePath(path.slice("delta_data.".length))
          : "";
    if (!normalized) return undefined;

    const fromTree = path.startsWith("stat_data.")
      ? affinityStore.getMvuStatData(options.chatId)
      : path.startsWith("display_data.")
        ? affinityStore.getMvuDisplayData(options.chatId)
        : affinityStore.getMvuDeltaData(options.chatId);
    if (fromTree) {
      const treeValue = _.get(fromTree, normalized);
      if (treeValue !== undefined) return treeValue;
    }
    if (path.startsWith("stat_data.") || path.startsWith("display_data.")) {
      return affinityStore.getMetricByPath(options.chatId, normalized)?.value;
    }
    return undefined;
  };

  const getvar = (path: string, rawOptions?: unknown): unknown => {
    if (!path) return undefined;
    const parsed = parseOptionObject(rawOptions);
    const scope = getScope(rawOptions);
    const defaultValue = getDefaultValue(parsed);

    if (scope === "global") {
      const value = chatVariables.getGlobal(path);
      return value === "" ? defaultValue : coerceStoredValue(value);
    }
    if (scope === "local") {
      const value = chatVariables.getLocal(path);
      return value === "" ? defaultValue : coerceStoredValue(value);
    }
    if (scope === "message") {
      const value = getMessageValue(path);
      return value === undefined ? defaultValue : value;
    }
    if (scope === "initial") {
      const value = getInitialValue(path);
      return value === undefined ? defaultValue : value;
    }

    const affinityBacked = getAffinityBackedValue(path);
    if (affinityBacked !== undefined) return affinityBacked;

    const found = getByPath(mergedVariables, path);
    return found === undefined ? defaultValue : found;
  };

  const setScopedValue = (
    path: string | null,
    value: unknown,
    scope: string,
    parsed: Record<string, unknown>,
  ): unknown => {
    if (path && scope !== "global" && scope !== "message" && path.startsWith("stat_data.") && options.chatId) {
      const normalized = normalizePath(path.slice("stat_data.".length));
      const synced = affinityStore.setMvuValueByPath(options.chatId, normalized, value, "ST setvar");
      if (synced) {
        setByPath(mergedVariables, path, value);
        return value;
      }
    }

    if (scope === "global") {
      if (path === null) return undefined;
      const existing = chatVariables.getGlobal(path);
      if (!checkFlags(existing === "" ? undefined : existing, parsed)) {
        return undefined;
      }
      chatVariables.setGlobal(path, serializeStoredValue(value));
      return value;
    }
    if (scope === "local" || scope === "cache") {
      if (path === null) return undefined;
      const existing = chatVariables.getLocal(path);
      if (!checkFlags(existing === "" ? undefined : existing, parsed)) {
        return undefined;
      }
      chatVariables.setLocal(path, serializeStoredValue(value));
      setByPath(mergedVariables, path, value);
      return value;
    }
    if (scope === "message") {
      return undefined;
    }
    return undefined;
  };

  const setvar = (path: string | null, value: unknown, rawOptions?: unknown): unknown => {
    const scope = getScope(rawOptions);
    const parsed = parseOptionObject(rawOptions);
    if (path !== null) {
      const existing = getvar(path, rawOptions);
      if (!checkFlags(existing, parsed)) return undefined;
    }
    return setScopedValue(path, value, scope, parsed);
  };

  const incWithDelta = (path: string, delta: number, rawOptions?: unknown): unknown => {
    const current = getvar(path, rawOptions);
    const base = typeof current === "number" ? current : Number(current ?? 0) || 0;
    const next = base + delta;
    setvar(path, next, rawOptions);
    return next;
  };

  const getMessages = (): string[] => messages.map((message) => message.content);

  const getChatMessage = (index: number, role?: string): string => {
    let pool = messages;
    if (role === "user") {
      pool = messages.filter((message) => message.is_user);
    } else if (role === "assistant") {
      pool = messages.filter(
        (message) => !message.is_user && message.sender !== "system" && message.sender !== "narrator",
      );
    } else if (role === "system") {
      pool = messages.filter((message) => message.sender === "system");
    }
    if (pool.length === 0) return "";
    const resolvedIndex = index < 0 ? pool.length + index : index;
    return pool[resolvedIndex]?.content ?? "";
  };

  const lastMessage = messages.length > 0 ? messages[messages.length - 1].content : "";
  const lastUserMessage = [...messages].reverse().find((message) => message.is_user)?.content ?? "";
  const lastCharMessage =
    [...messages]
      .reverse()
      .find((message) => !message.is_user && message.sender !== "system" && message.sender !== "narrator")
      ?.content ?? "";

  return {
    stat_data: statData,
    display_data: displayData,
    delta_data: deltaData,
    values,
    stages,
    variables: mergedVariables,
    getvar,
    setvar,
    getVariables: (rawOptions?: { type?: string }) => {
      if (rawOptions?.type === "chat") {
        return {
          ...Object.fromEntries(
            Object.entries(chatVariables.localVars).map(([key, value]) => [key, coerceStoredValue(value)]),
          ),
          stat_data: statData,
          display_data: displayData,
          delta_data: deltaData,
          values,
          stages,
        };
      }
      return mergedVariables;
    },
    getChatMessage,
    getMessages,
    lastMessage,
    lastUserMessage,
    lastCharMessage,
    chatMessages: messages,
    charName,
    userName,
    messageCount: messages.length,
    getwi: () => "",
    getWorldInfo: () => "",
    incvar: (path: string, value = 1, rawOptions?: unknown) => incWithDelta(path, value, rawOptions),
    decvar: (path: string, value = 1, rawOptions?: unknown) => incWithDelta(path, -value, rawOptions),
    setLocalVar: (path: string | null, value: unknown, rawOptions?: unknown) =>
      setScopedValue(path, value, "local", parseOptionObject(rawOptions)),
    setGlobalVar: (path: string | null, value: unknown, rawOptions?: unknown) =>
      setScopedValue(path, value, "global", parseOptionObject(rawOptions)),
    getLocalVar: (path: string, rawOptions?: unknown) =>
      getvar(path, { ...parseOptionObject(rawOptions), scope: "local" }),
    getGlobalVar: (path: string, rawOptions?: unknown) =>
      getvar(path, { ...parseOptionObject(rawOptions), scope: "global" }),
    getMessageVar: (path: string, rawOptions?: unknown) =>
      getvar(path, { ...parseOptionObject(rawOptions), scope: "message" }),
    setMessageVar: (_path: string | null, _value: unknown, _rawOptions?: unknown) => undefined,
    incLocalVar: (path: string, value = 1) => incWithDelta(path, value, { scope: "local" }),
    incGlobalVar: (path: string, value = 1) => incWithDelta(path, value, { scope: "global" }),
    removeVariable: (path: string, rawOptions?: unknown) => {
      const scope = getScope(rawOptions);
      if (path.startsWith("stat_data.") && options.chatId) {
        affinityStore.removeMvuValueByPath(
          options.chatId,
          normalizePath(path.slice("stat_data.".length)),
        );
        deleteByPath(mergedVariables, path);
        return undefined;
      }
      if (scope === "global") {
        chatVariables.setGlobal(path, "");
        return undefined;
      }
      deleteByPath(mergedVariables, path);
      chatVariables.setLocal(path, "");
      return undefined;
    },
    insertVariable: (path: string, value: unknown, index?: string | number, rawOptions?: unknown) => {
      if (path.startsWith("stat_data.") && options.chatId) {
        const inserted = affinityStore.insertMvuValueByPath(
          options.chatId,
          normalizePath(path.slice("stat_data.".length)),
          value,
          index,
        );
        if (inserted !== undefined) {
          setByPath(mergedVariables, path, inserted);
          return inserted;
        }
      }

      const current = getvar(path, rawOptions);
      if (Array.isArray(current)) {
        const copy = [...current];
        const targetIndex = typeof index === "number" ? index : copy.length;
        copy.splice(targetIndex, 0, value);
        setvar(path, copy, rawOptions);
        return copy;
      }
      if (current && typeof current === "object" && index !== undefined) {
        const copy = { ...(current as Record<string, unknown>), [String(index)]: value };
        setvar(path, copy, rawOptions);
        return copy;
      }
      return undefined;
    },
    _: _,
  };
}
