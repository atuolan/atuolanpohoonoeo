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

現在的時間是：{{currentDateTime}}

要求：
1. 完全以 {{char}} 的第一人稱視角書寫
2. 日記日期必須使用上方提供的時間，不要自行編造日期
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
    identifier: "diaryDecoration",
    name: "日記本與裝飾",
    description: "角色挑日記本、每頁的頁首、貼紙與劃掉／螢光筆／頁邊小字",
    category: "director",
    role: "system",
    content: `【日記本】
{{diaryBook}}

【這一頁的裝飾】
正文開始前先寫一行頁首標籤：
<diary-page weather="今天的天氣，用 {{char}} 的口吻，10 字內" mood="心情，10 字內" stickers="貼紙代號，0～2 個，用逗號分隔" />

貼紙代號：star 星星、heart 愛心、moon 月亮、cloud 雲、raindrop 雨滴、flower 小花、coffee 咖啡、cat 貓、sun 太陽、paperclip 迴紋針、strawberry 草莓、cake 蛋糕、envelope 信封、note 音符、rainbow 彩虹、clover 四葉草、lightning 閃電、bow 蝴蝶結、leaf 葉子、snowflake 雪花、bandage OK繃、fire 火氣、dog 狗、exclaim 驚嘆
貼紙照 {{char}} 的性格和今天的心情挑；不愛裝飾的人可以一張都不貼。

正文裡可以用三種記號，像真的在本子上寫：
- ~~寫了又劃掉的話~~：不想承認、說不出口的真心話
- ==用螢光筆畫起來的字==：{{char}} 特別在意的幾個字
- <margin>寫在頁邊的小字</margin>：寫完又補的一句或忍不住的吐槽，20 字內，放在那一段的最後
整篇加起來 1～4 處就好，不要每段都用；冷淡克制的人用得少，活潑的人可以多一點。
除了這些記號，不要用 Markdown（不要標題、粗體、清單）。標籤名稱和代號照抄英文，天氣、心情和正文用 {{char}} 平常寫字的語言。`,
    system_prompt: true,
    marker: false,
    injection_position: INJECTION_RELATIVE,
    injection_depth: 0,
    injection_order: 99,
    forbid_overrides: false,
    extension: false,
    injection_trigger: [],
    isEditable: true,
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
  { identifier: "diaryDecoration", enabled: true },
  { identifier: "diaryInstruction", enabled: true },
];
