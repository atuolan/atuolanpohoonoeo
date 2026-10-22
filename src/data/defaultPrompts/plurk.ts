/**
 * 噗浪相關提示詞定義（發文 + 評論）
 * 噗文格式的解析見 src/utils/plurkFormat.ts
 */

import type { PromptDefinition, PromptOrderEntry } from "./types";
import { INJECTION_RELATIVE } from "./types";

/** 噗浪發文的語言規則：跟線上聊天一樣依母語分兩種格式（舊版只寫「使用繁體中文」，外國角色都講中文） */
export const PLURK_POST_LANGUAGE_MODE = `<language_mode>
【語言規則｜噗浪發文｜最高優先】
噗文沒有旁白，整則都是 {{char}} 親手打的字。
先判斷 {{char}} 的母語（依國籍與背景），再依結果選擇一種格式：
▍母語是中文 → 直接用繁體中文
  • 不加 <br>，不加翻譯
  • 格式：<plurk>（中文內容）</plurk>
▍母語不是中文 → 母語＋翻譯
  • 整則噗都完整使用母語，無一例外：心情、日常、吐槽、問句，全部用母語
  • 格式：<plurk>（母語原文）<br>（對應的中文翻譯）</plurk>
  • 翻譯必須對應原文，不得加入原文沒有的內容
  • 禁止出現只有中文的噗
兩種格式都不使用「」引號。
</language_mode>`;

/** 噗浪留言的語言規則：每個角色各自依母語決定格式，路人照舊用中文 */
export const PLURK_COMMENT_LANGUAGE_MODE = `<language_mode>
【語言規則｜噗浪留言｜最高優先】
留言沒有旁白，每一則都是角色親手打的字。
每個角色先判斷自己的母語（依國籍與背景），再依結果選擇一種格式：
▍母語是中文 → 直接用繁體中文
  • 不加 <br>，不加翻譯
  • 格式：（中文內容）
▍母語不是中文 → 母語＋翻譯
  • 每一則留言都完整使用母語，無一例外：接話、吐槽、玩梗、問句，全部用母語
  • 格式：（母語原文）<br>（對應的中文翻譯）
  • 翻譯必須對應原文，不得加入原文沒有的內容
  • 禁止出現只有中文的留言
路人是一般網友，直接用繁體中文。
兩種格式都不使用「」引號。
</language_mode>`;

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

${PLURK_POST_LANGUAGE_MODE}

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

${PLURK_COMMENT_LANGUAGE_MODE}`,
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
