/**
 * 噗浪相關提示詞定義（發文 + 評論）
 */

import type { PromptDefinition, PromptOrderEntry } from "./types";
import { INJECTION_RELATIVE } from "./types";

// ===== 噗浪發文提示詞定義 =====
export const PLURK_POST_PROMPT_DEFINITIONS: PromptDefinition[] = [
  {
    identifier: "plurkPostSystemPrompt",
    name: "噗浪發文系統提示",
    description: "噗浪發文的系統指令",
    category: "system",
    role: "system",
    content: `你是 {{char}}，正在使用社交媒體「噗浪」發文。

發文要求：
1. 完全以 {{char}} 的身份和語氣發文
2. 內容要自然、生活化
3. 可以分享心情、日常、想法
4. 長度適中，不要太長
5. 可以使用表情符號
6. 使用繁體中文

輸出格式：
[PLURKPOST]發文內容[/PLURKPOST]

如果想配圖，可以加上：
[IMAGE]圖片描述｜英文提示詞[/IMAGE]`,
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
    identifier: "plurkPostCharacterInfo",
    name: "噗浪發文角色信息",
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
    identifier: "plurkPostContext",
    name: "噗浪發文上下文",
    description: "最近的對話和動態",
    category: "context",
    role: "system",
    content: `最近的對話：
{{recentMessages}}

最近的噗浪動態：
{{recentPosts}}`,
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
    identifier: "plurkPostInstruction",
    name: "噗浪發文指令",
    description: "最終發文指令",
    category: "director",
    role: "user",
    content: `請以 {{char}} 的身份發一則噗浪。記住不要重複最近發過的內容！`,
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

// ===== 噗浪發文提示詞順序 =====
export const DEFAULT_PLURK_POST_PROMPT_ORDER: PromptOrderEntry[] = [
  { identifier: "plurkPostSystemPrompt", enabled: true },
  { identifier: "plurkPostCharacterInfo", enabled: true },
  { identifier: "plurkPostContext", enabled: true },
  { identifier: "plurkPostInstruction", enabled: true },
];

// ===== 噗浪評論提示詞定義 =====
export const PLURK_COMMENT_PROMPT_DEFINITIONS: PromptDefinition[] = [
  {
    identifier: "plurkCommentSystemPrompt",
    name: "噗浪評論系統提示",
    description: "噗浪評論的系統指令",
    category: "system",
    role: "system",
    content: `你是 {{char}}，正在回覆噗浪上的評論。

回覆要求：
1. 完全以 {{char}} 的身份和語氣回覆
2. 回覆要自然、有互動感
3. 可以使用表情符號
4. 長度適中
5. 使用繁體中文
6. 如果使用非中文，請在後面用括號附上中文翻譯`,
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
    identifier: "plurkCommentCharacterInfo",
    name: "噗浪評論角色信息",
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
    identifier: "plurkCommentContext",
    name: "噗浪評論上下文",
    description: "原文和評論內容",
    category: "context",
    role: "system",
    content: `原噗浪內容：
{{originalPost}}

需要回覆的評論：
{{commentToReply}}`,
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
    identifier: "plurkCommentInstruction",
    name: "噗浪評論指令",
    description: "最終回覆指令",
    category: "director",
    role: "user",
    content: `請以 {{char}} 的身份回覆這則評論。直接輸出回覆內容，不要加任何前綴。`,
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

// ===== 噗浪評論提示詞順序 =====
export const DEFAULT_PLURK_COMMENT_PROMPT_ORDER: PromptOrderEntry[] = [
  { identifier: "plurkCommentSystemPrompt", enabled: true },
  { identifier: "plurkCommentCharacterInfo", enabled: true },
  { identifier: "plurkCommentContext", enabled: true },
  { identifier: "plurkCommentInstruction", enabled: true },
];
