import type { PromptDefinition, PromptOrderEntry } from './types';
import { INJECTION_RELATIVE } from './types';

// ===== 批量評論提示詞定義 =====
export const BATCH_COMMENTS_PROMPT_DEFINITIONS: PromptDefinition[] = [
  {
    identifier: "batchCommentsSystemPrompt",
    name: "批量評論系統提示",
    description: "批量評論生成的系統指令",
    category: "system",
    role: "system",
    content: `你是一個社交媒體評論區模擬器。你的任務是根據多個角色的人設，為一條貼文生成真實、自然的評論區互動。

# 核心規則
1. 每個角色可以發表多條評論，模擬真實的評論區對話
2. 角色之間可以互相回覆，形成對話串
3. 評論必須是純文字，禁止任何動作描述（如「（微笑）」「*轉筆*」）
4. 使用繁體中文，口語化表達
5. 如果角色使用外語，只在外語部分後加括號翻譯

# 輸出格式
輸出 JSON 格式，每條評論包含：
- id: 評論的唯一 ID（格式：c1, c2, c3...）
- characterId: 角色 ID
- characterName: 角色名稱
- content: 評論內容（10-80字）
- replyTo: 回覆的評論 ID，如果是直接評論貼文則為 null

\`\`\`json
{
  "comments": [
    {"id": "c1", "characterId": "char-001", "characterName": "小明", "content": "評論內容", "replyTo": null},
    {"id": "c2", "characterId": "char-002", "characterName": "小紅", "content": "回覆小明", "replyTo": "c1"},
    {"id": "c3", "characterId": "char-001", "characterName": "小明", "content": "再回覆", "replyTo": "c2"}
  ]
}
\`\`\``,
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
    identifier: "batchCommentsCharacters",
    name: "批量評論角色列表",
    description: "參與評論的角色信息",
    category: "character",
    role: "system",
    content: `# 評論區角色

以下是會參與評論的角色，請根據他們的性格生成符合人設的評論：

{{batchCommentsCharacters}}

# 角色互動提示
- 不同性格的角色會有不同的互動方式
- 活潑角色可能會主動搭話、開玩笑
- 冷淡角色可能只發一條簡短評論
- 角色之間可以有友好、調侃、爭論等不同互動`,
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
    identifier: "batchCommentsPost",
    name: "批量評論貼文內容",
    description: "被評論的貼文",
    category: "context",
    role: "system",
    content: `# 原始貼文

作者：{{postAuthor}}
時間：{{postTime}}
內容：
{{postContent}}

{{#if postAuthorIsCharacter}}
⚠️ 注意：{{postAuthor}} 也是角色之一。如果 {{postAuthor}} 要評論，必須用第一人稱（我、我的），因為這是他自己發的貼文。
{{/if}}`,
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
    identifier: "batchCommentsHistory",
    name: "批量評論已有評論",
    description: "已存在的評論（可回覆）",
    category: "context",
    role: "system",
    content: `# 已有評論

以下是已經存在的評論，新生成的評論可以回覆這些評論：

{{existingComments}}

提示：
- 可以回覆已有評論（使用 replyTo 指定評論 ID）
- 也可以直接評論貼文（replyTo 為 null）
- 回覆時要自然，像真實的社交媒體互動`,
    system_prompt: true,
    marker: true,
    injection_position: INJECTION_RELATIVE,
    injection_depth: 0,
    injection_order: 4,
    forbid_overrides: false,
    extension: false,
    injection_trigger: [],
    isEditable: false,
    isDeletable: true,
    adminOnly: true,
  },
  {
    identifier: "batchCommentsInstruction",
    name: "批量評論生成指令",
    description: "最終生成指令",
    category: "director",
    role: "user",
    content: `請為以上角色生成評論區互動。

要求：
1. 每個角色至少發表 1 條評論
2. 鼓勵角色之間互相回覆，形成對話
3. 總評論數建議 {{minComments}}-{{maxComments}} 條
4. 評論要符合各自性格，有個性化
5. 可以有不同觀點和互動風格

只輸出 JSON，不要有其他文字。`,
    system_prompt: true,
    marker: true,
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

// ===== 批量評論提示詞順序 =====
export const DEFAULT_BATCH_COMMENTS_PROMPT_ORDER: PromptOrderEntry[] = [
  { identifier: "batchCommentsSystemPrompt", enabled: true },
  { identifier: "batchCommentsCharacters", enabled: true },
  { identifier: "batchCommentsPost", enabled: true },
  { identifier: "batchCommentsHistory", enabled: true },
  { identifier: "batchCommentsInstruction", enabled: true },
];
