/**
 * 日記系統提示詞定義
 */

import type { PromptDefinition, PromptOrderEntry } from "./types";
import { INJECTION_RELATIVE } from "./types";

// ===== 日記提示詞定義 =====
export const DIARY_PROMPT_DEFINITIONS: PromptDefinition[] = [
  {
    identifier: "diarySystemPrompt",
    name: "日記系統提示",
    description: "日記生成的系統指令",
    category: "system",
    role: "system",
    content: `你是一個角色扮演助手。現在你需要以 {{char}} 的身份，根據最近的對話內容，寫一篇私密日記。

現在的真實時間是：{{currentDateTime}}

要求：
1. 完全以 {{char}} 的第一人稱視角書寫
2. 日記日期必須使用上方提供的真實時間，不要自行編造日期
3. 嚴格基於提供的對話內容書寫，不要編造沒有發生過的事件或對話
4. 反映 {{char}} 對 {{user}} 的真實感受和想法
5. 可以包含 {{char}} 不會直接對 {{user}} 說的內心話
6. 語氣要符合 {{char}} 的性格特點
7. 長度適中，200-500字左右
8. 使用中文`,
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
    identifier: "diaryCharacterInfo",
    name: "日記角色信息",
    description: "角色的基本信息",
    category: "character",
    role: "system",
    content: `角色信息：
{{charDescription}}

性格特點：
{{charPersonality}}`,
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
    identifier: "diaryUserPersona",
    name: "日記用戶人設",
    description: "對話對象的人設信息（用於日記）",
    category: "context",
    role: "system",
    content: `👤 對話對象信息：{{user}}

{{userPersona}}`,
    system_prompt: true,
    marker: true,
    injection_position: INJECTION_RELATIVE,
    injection_depth: 0,
    injection_order: 2.5,
    forbid_overrides: false,
    extension: false,
    injection_trigger: [],
    isEditable: true,
    isDeletable: true,
    adminOnly: true,
  },
  {
    identifier: "diaryRecentChat",
    name: "日記最近對話",
    description: "最近的對話內容",
    category: "context",
    role: "system",
    content: `最近的對話內容：
{{recentMessages}}`,
    system_prompt: true,
    marker: true,
    injection_position: INJECTION_RELATIVE,
    injection_depth: 0,
    injection_order: 3,
    forbid_overrides: false,
    extension: false,
    injection_trigger: [],
    isEditable: false,
    isDeletable: true,
    adminOnly: true,
  },
  {
    identifier: "diaryInstruction",
    name: "日記生成指令",
    description: "最終生成指令",
    category: "director",
    role: "user",
    content: `請以 {{char}} 的身份，根據以上對話內容，寫一篇今天（{{currentDateTime}}）的日記。只能根據提供的對話記錄來寫，不要編造任何未發生的事。直接輸出日記內容，不要加任何前綴或說明。

写作日记时，{{char}}会注意：
- 单篇日记字数会保持在400-800字之间。
- 单篇日记通常只围绕一天中的1-2件重要事件展开，并对这些事情发出感慨。
- 单篇日记不会过于发散，但是会表露出{{char}}的真实感受。`,
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

// ===== 日記提示詞順序 =====
export const DEFAULT_DIARY_PROMPT_ORDER: PromptOrderEntry[] = [
  { identifier: "diarySystemPrompt", enabled: true },
  { identifier: "diaryCharacterInfo", enabled: true },
  { identifier: "diaryUserPersona", enabled: true },
  { identifier: "diaryRecentChat", enabled: true },
  { identifier: "diaryInstruction", enabled: true },
];
