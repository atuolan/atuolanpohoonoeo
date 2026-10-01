/**
 * 專屬預設：每個聊天各自獨立的提示詞調整
 *
 * 包含兩件事：
 * - 開關調整（promptToggles）：把某個全域提示詞在這個聊天強制開 / 強制關；沒列出的跟隨全域預設
 * - 專屬條目（chatPrompts）：只屬於這個聊天的額外提示詞
 *
 * 兩者都存在聊天記錄的 chatVariables 上，隨聊天一起刪除、匯出、備份。
 */

import type {
  ChatLocalPrompt,
  ChatPromptMode,
  ChatPromptPlacement,
  ChatVariablesState,
} from "@/types/chat";
import type {
  PromptDefinition,
  PromptOrderEntry,
  PromptRoleType,
} from "@/types/promptManager";

export const CHAT_PROMPT_MODE_LABELS: Record<ChatPromptMode, string> = {
  online: "線上",
  f2f: "面對面",
  gc: "群聊",
  call: "通話",
};

export const CHAT_PROMPT_PLACEMENTS: Array<{
  value: ChatPromptPlacement;
  label: string;
  description: string;
  /** 進階選項：預設收在「進階」裡 */
  advanced?: boolean;
}> = [
  { value: "end", label: "最後面", description: "放在所有提示詞之後，對回覆的影響最直接" },
  { value: "beforeHistory", label: "聊天記錄之前", description: "接在角色設定之後、對話內容之前" },
  { value: "top", label: "最前面", description: "放在所有提示詞之前，作為整體背景" },
  { value: "depth", label: "聊天記錄裡", description: "插在對話中間，由深度決定位置", advanced: true },
];

const PLACEMENTS = new Set<ChatPromptPlacement>(["top", "beforeHistory", "end", "depth"]);
const MODES = new Set<ChatPromptMode>(["online", "f2f", "gc", "call"]);
const ROLES = new Set<PromptRoleType>(["system", "user", "assistant"]);
const CHAT_HISTORY_IDENTIFIERS = new Set(["chatHistory", "f2fChatHistory", "gcChatHistory"]);

/** 這種聊天會用到哪些生成模式 */
export function chatPromptModesFor(isGroupChat: boolean): ChatPromptMode[] {
  return isGroupChat ? ["gc", "call"] : ["online", "f2f", "call"];
}

/** 新增專屬條目時預設勾選的模式：文字聊天的模式，通話需自行勾選 */
export function defaultChatPromptModes(isGroupChat: boolean): ChatPromptMode[] {
  return chatPromptModesFor(isGroupChat).filter((mode) => mode !== "call");
}

export function sanitizePromptToggles(value: unknown): Record<string, boolean> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).filter(([, val]) => typeof val === "boolean"),
  ) as Record<string, boolean>;
}

/** 只保留結構完整的專屬條目；舊格式（沒有 placement / modes）直接捨棄 */
export function sanitizeChatPrompts(value: unknown): ChatLocalPrompt[] {
  if (!Array.isArray(value)) return [];
  const result: ChatLocalPrompt[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const prompt = item as Partial<ChatLocalPrompt>;
    if (
      typeof prompt.id !== "string" ||
      typeof prompt.name !== "string" ||
      typeof prompt.content !== "string" ||
      typeof prompt.enabled !== "boolean" ||
      !ROLES.has(prompt.role as PromptRoleType) ||
      !PLACEMENTS.has(prompt.placement as ChatPromptPlacement) ||
      !Array.isArray(prompt.modes)
    ) {
      continue;
    }
    const depth = Number(prompt.depth);
    result.push({
      id: prompt.id,
      name: prompt.name,
      role: prompt.role as PromptRoleType,
      content: prompt.content,
      placement: prompt.placement as ChatPromptPlacement,
      depth: Number.isFinite(depth) && depth > 0 ? Math.floor(depth) : 0,
      modes: prompt.modes.filter((mode): mode is ChatPromptMode => MODES.has(mode)),
      enabled: prompt.enabled,
      createdAt: typeof prompt.createdAt === "number" ? prompt.createdAt : 0,
      updatedAt: typeof prompt.updatedAt === "number" ? prompt.updatedAt : 0,
    });
  }
  return result;
}

export interface ChatPromptPreset {
  chatPromptToggles: Record<string, boolean>;
  chatLocalPrompts: ChatLocalPrompt[];
}

/** 從聊天記錄讀出專屬預設（供沒有開著該聊天的流程使用，例如主動發訊息） */
export function readChatPromptPreset(
  chat: { chatVariables?: { promptToggles?: unknown; chatPrompts?: unknown } | null } | null | undefined,
): ChatPromptPreset {
  return {
    chatPromptToggles: sanitizePromptToggles(chat?.chatVariables?.promptToggles),
    chatLocalPrompts: sanitizeChatPrompts(chat?.chatVariables?.chatPrompts),
  };
}

/**
 * 開新對話沿用專屬預設時，新聊天的起始 chatVariables。
 * 只帶強制開關與專屬條目，變量從空白開始；複製後兩個聊天各自獨立。
 * 沒有任何調整時回傳 undefined，不在新聊天上留空欄位。
 */
export function inheritChatPromptPreset(
  preset: ChatPromptPreset,
  now: number = Date.now(),
): ChatVariablesState | undefined {
  const promptToggles = { ...preset.chatPromptToggles };
  const chatPrompts = preset.chatLocalPrompts.map((prompt) => ({
    ...prompt,
    modes: [...prompt.modes],
  }));
  if (Object.keys(promptToggles).length === 0 && chatPrompts.length === 0) return undefined;
  return {
    version: 1,
    localVars: {},
    ...(Object.keys(promptToggles).length > 0 && { promptToggles }),
    ...(chatPrompts.length > 0 && { chatPrompts }),
    updatedAt: now,
  };
}

/**
 * 把專屬預設套到一份提示詞順序上：
 * 1. 有強制開 / 關的條目改用強制值
 * 2. 適用於目前模式的專屬條目依 placement 插入
 */
export function applyChatPromptPreset(
  order: PromptOrderEntry[],
  preset: { toggles?: Record<string, boolean>; prompts?: ChatLocalPrompt[] },
  mode: ChatPromptMode,
): PromptOrderEntry[] {
  const toggles = preset.toggles ?? {};
  const result = order.map((entry) =>
    Object.prototype.hasOwnProperty.call(toggles, entry.identifier)
      ? { ...entry, enabled: toggles[entry.identifier] }
      : { ...entry },
  );

  const existingIds = new Set(result.map((entry) => entry.identifier));
  const top: PromptOrderEntry[] = [];
  const beforeHistory: PromptOrderEntry[] = [];
  const end: PromptOrderEntry[] = [];
  for (const prompt of preset.prompts ?? []) {
    if (existingIds.has(prompt.id) || !prompt.modes.includes(mode)) continue;
    existingIds.add(prompt.id);
    const entry = { identifier: prompt.id, enabled: prompt.enabled };
    if (prompt.placement === "top") top.push(entry);
    else if (prompt.placement === "beforeHistory") beforeHistory.push(entry);
    else end.push(entry);
  }

  const historyIndex = result.findIndex((entry) => CHAT_HISTORY_IDENTIFIERS.has(entry.identifier));
  if (historyIndex === -1) {
    // 這份順序沒有聊天記錄（被移除或停用）：沒有「之前」可言，退到最後面
    end.unshift(...beforeHistory);
  } else {
    result.splice(historyIndex, 0, ...beforeHistory);
  }
  return [...top, ...result, ...end];
}

/** 開關調整頁的一列 */
export interface PresetToggleRow {
  identifier: string;
  name: string;
  description?: string;
  role: PromptRoleType;
  /** 全域預設的開關狀態 */
  defaultEnabled: boolean;
  /** 這個聊天的強制值；null = 跟隨預設 */
  override: boolean | null;
  /** 實際生效的狀態 */
  enabled: boolean;
  /** 只用來分隔結構的標籤條目（例如 <視角>）：沒有內容 */
  structural: boolean;
  prompt: PromptDefinition;
}

/** 依提示詞管理器的順序列出可調整的條目（略過由系統填內容的 marker） */
export function buildPresetToggleRows(
  definitions: PromptDefinition[],
  order: PromptOrderEntry[],
  toggles: Record<string, boolean>,
): PresetToggleRow[] {
  const definitionMap = new Map(definitions.map((prompt) => [prompt.identifier, prompt]));
  const rows: PresetToggleRow[] = [];
  for (const entry of order) {
    const prompt = definitionMap.get(entry.identifier);
    if (!prompt || prompt.marker) continue;
    const override = Object.prototype.hasOwnProperty.call(toggles, entry.identifier)
      ? toggles[entry.identifier]
      : null;
    rows.push({
      identifier: entry.identifier,
      name: prompt.name || entry.identifier,
      description: prompt.description,
      role: prompt.role,
      defaultEnabled: entry.enabled,
      override,
      enabled: override ?? entry.enabled,
      // 匯入的提示詞在執行期可能沒有 content，需用 ?? "" 兜底
      structural: !(prompt.content ?? "").trim(),
      prompt,
    });
  }
  return rows;
}
