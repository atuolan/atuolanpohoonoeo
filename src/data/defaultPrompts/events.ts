/**
 * 重要事件提取提示詞定義
 */

import type { PromptDefinition, PromptOrderEntry } from "./types";
import { INJECTION_RELATIVE } from "./types";

// ===== 重要事件提示詞定義 =====
export const IMPORTANT_EVENTS_PROMPT_DEFINITIONS: PromptDefinition[] = [
  {
    identifier: "eventsSystemPrompt",
    name: "事件提取系統提示",
    description: "重要事件提取的系統指令",
    category: "system",
    role: "system",
    content: `你是一個事件提取助手。請從對話中識別並提取重要事件。

重要事件包括：
- 關係變化（告白、分手、和好等）
- 重要決定或承諾
- 情感高潮時刻
- 重要的第一次（第一次約會、第一次見面等）
- 衝突或誤解
- 特殊紀念日或慶祝

輸出格式（JSON 陣列）：
[
  {
    "title": "事件標題",
    "description": "事件描述",
    "emotion": "相關情緒（開心/難過/感動/緊張等）",
    "importance": "重要程度（1-5）"
  }
]

如果沒有重要事件，返回空陣列 []`,
    system_prompt: true,
    marker: false,
    injection_position: INJECTION_RELATIVE,
    injection_depth: 0,
    injection_order: 1,
    forbid_overrides: false,
    extension: false,
    injection_trigger: [],
    isEditable: true,
    isDeletable: true,
    adminOnly: true,
  },
  {
    identifier: "eventsContext",
    name: "事件上下文",
    description: "需要分析的對話內容",
    category: "context",
    role: "system",
    content: `需要分析的對話內容：
{{messagesForAnalysis}}`,
    system_prompt: true,
    marker: true,
    injection_position: INJECTION_RELATIVE,
    injection_depth: 0,
    injection_order: 2,
    forbid_overrides: false,
    extension: false,
    injection_trigger: [],
    isEditable: false,
    isDeletable: true,
    adminOnly: true,
  },
  {
    identifier: "eventsInstruction",
    name: "事件提取指令",
    description: "最終提取指令",
    category: "director",
    role: "user",
    content: `請從以上對話中提取重要事件。只輸出 JSON 陣列，不要加任何其他內容。`,
    system_prompt: true,
    marker: false,
    injection_position: INJECTION_RELATIVE,
    injection_depth: 0,
    injection_order: 100,
    forbid_overrides: false,
    extension: false,
    injection_trigger: [],
    isEditable: true,
    isDeletable: true,
    adminOnly: true,
  },
];

// ===== 重要事件提示詞順序 =====
export const DEFAULT_IMPORTANT_EVENTS_PROMPT_ORDER: PromptOrderEntry[] = [
  { identifier: "eventsSystemPrompt", enabled: true },
  { identifier: "eventsContext", enabled: true },
  { identifier: "eventsInstruction", enabled: true },
];
