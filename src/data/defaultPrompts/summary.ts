/**
 * 總結系統提示詞定義
 */

import type { PromptDefinition, PromptOrderEntry } from "./types";
import { INJECTION_RELATIVE } from "./types";

// ===== 總結提示詞定義 =====
export const SUMMARY_PROMPT_DEFINITIONS: PromptDefinition[] = [
  {
    identifier: "summarySystemPrompt",
    name: "總結系統提示",
    description: "對話總結的系統指令",
    category: "system",
    role: "system",
    content: `⚠️ 极其重要的输出格式要求：

1. 你现在就是{{char}}，以第一人称（"我"）直接写作
2. 立即开始写，第一行就是 \`<output>\`
3. 绝对禁止任何思考过程、讨论、Scene、基拉祈、雪拉比等内容
4. 只需要在 \`<output></output>\` 标签内写最终内容

格式示例：
\`\`\`
<output>
今天真是开心的一天！（直接开始内容，不要有任何前置说明）
...</output>
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
    identifier: "summaryUserPersona",
    name: "用戶人設",
    description: "對話對象的人設信息（用於總結）",
    category: "context",
    role: "system",
    content: `👤 對話對象信息：{{user}}

{{userPersona}}`,
    system_prompt: true,
    marker: true,
    injection_position: INJECTION_RELATIVE,
    injection_depth: 0,
    injection_order: 1.5,
    forbid_overrides: false,
    extension: false,
    injection_trigger: [],
    isEditable: true,
    isDeletable: true,
    adminOnly: true,
  },
  {
    identifier: "summaryCharInfo",
    name: "角色資訊",
    description: "角色的描述信息（用於總結）",
    category: "context",
    role: "system",
    content: `🎭 你是 {{char}}

{{charDescription}}`,
    system_prompt: true,
    marker: true,
    injection_position: INJECTION_RELATIVE,
    injection_depth: 0,
    injection_order: 1.6,
    forbid_overrides: false,
    extension: false,
    injection_trigger: [],
    isEditable: true,
    isDeletable: true,
    adminOnly: true,
  },
  {
    identifier: "summaryContext",
    name: "總結上下文",
    description: "需要總結的對話內容",
    category: "context",
    role: "system",
    content: `需要總結的對話內容（日期標記 [YYYY/MM/DD] 表示該段對話發生的日期）：
{{messagesForSummary}}`,
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
    identifier: "summaryInstruction",
    name: "總結生成指令",
    description: "最終生成指令",
    category: "director",
    role: "system",
    content: `【总结要求】
1. 以第一人称（"我"）描述发生的事情
2. 要直白易懂，清楚说明发生了什么
3. 根据对话的复杂程度，字数控制在 100-300 字
4. 语气要自然，符合{{char}}的性格
5. 重点记录关键事件和重要信息
6. 根据{{user}}的性别信息使用正确的代词（他/她/Ta等）
7. 💡 翻譯提示：如果使用非中文，請在後面用括號附上中文翻譯。例如：「feeling good (感覺不錯)」
8. 📅 日期標記：對話中的 [YYYY/MM/DD] 標記代表真實日期，請在總結中使用具體日期（如「3月21日」）而非「今天」「昨天」等相對時間詞

禁用词汇：一絲、不容置喙、不易察覺、心湖、石子、投入、激起漣漪、教學、權力、掌控、審視、壓迫、佔有、支配、臣服

现在就以{{char}}的身份直接写，第一行就写 <output>！`,
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

// ===== 總結提示詞順序 =====
export const DEFAULT_SUMMARY_PROMPT_ORDER: PromptOrderEntry[] = [
  { identifier: "summarySystemPrompt", enabled: true },
  { identifier: "summaryUserPersona", enabled: true },
  { identifier: "summaryCharInfo", enabled: true },
  { identifier: "summaryContext", enabled: true },
  { identifier: "summaryInstruction", enabled: true },
];
