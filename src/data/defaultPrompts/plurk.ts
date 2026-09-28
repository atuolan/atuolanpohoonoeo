/**
 * 噗浪相關提示詞定義（發文 + 評論）
 * 噗文格式的解析見 src/utils/plurkFormat.ts
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
<plurk>發文內容</plurk>
完整寫法：<plurk qualifier="覺得" reactions="❤️12 😂5">發文內容<image>配圖描述</image></plurk>
（qualifier 是噗浪限定詞：說／想／愛／覺得／希望／喜歡；reactions 是 1-4 種表情和數量；配圖用 <image> 寫在內文裡。三者都可省略）`,
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
// 批量評論（src/services/AIService.ts）會把啟用中、非 marker 的 system 條目附加為評論風格要求；
// 角色資訊、貼文內容與 JSON 輸出格式由系統自動提供。
export const PLURK_COMMENT_PROMPT_DEFINITIONS: PromptDefinition[] = [
  {
    identifier: "plurkCommentSystemPrompt",
    name: "噗浪評論風格",
    description: "批量生成評論時附加的風格要求",
    category: "system",
    role: "system",
    content: `評論風格要求：
1. 每個角色都用自己的身份和語氣留言，像真的在滑噗浪
2. 回覆要自然、有互動感，可以接話、吐槽、玩梗
3. 可以使用表情符號
4. 長度適中，不要每則都一樣長
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
];

/** 已停用的噗浪評論條目（舊版逐則回覆流程，從未被批量評論使用），載入時移除 */
export const RETIRED_PLURK_COMMENT_PROMPT_IDS = [
  "plurkCommentCharacterInfo",
  "plurkCommentContext",
  "plurkCommentInstruction",
];

// ===== 噗浪評論提示詞順序 =====
export const DEFAULT_PLURK_COMMENT_PROMPT_ORDER: PromptOrderEntry[] = [
  { identifier: "plurkCommentSystemPrompt", enabled: true },
];
