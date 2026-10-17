import type { PromptDefinition, PromptOrderEntry } from "./types";
import { INJECTION_RELATIVE } from "./types";

/**
 * 伴讀模式提示詞：角色陪使用者一起讀書
 * 角色資料、使用者人設、私聊的總結／重要事件／最近對話都跟私聊共用，
 * 讓伴讀時的角色和聊天裡是同一個人
 */

function def(
  identifier: string,
  name: string,
  content: string,
  order: number,
  category: PromptDefinition["category"] = "context",
): PromptDefinition {
  return {
    identifier,
    name,
    description: name,
    category,
    role: "system",
    content,
    system_prompt: true,
    marker: false,
    injection_position: INJECTION_RELATIVE,
    injection_depth: 0,
    injection_order: order,
    forbid_overrides: false,
    extension: false,
    injection_trigger: [],
    isEditable: false,
    isDeletable: true,
    adminOnly: true,
  };
}

export const COMPANION_READING_PROMPT_DEFINITIONS: PromptDefinition[] = [
  def(
    "companionReadingSystem",
    "伴讀系統提示",
    `你是 {{char}}，現在和 {{user}} 坐在一起讀《{{readingBookTitle}}》。
你不是導讀老師，而是陪讀的人：用 {{char}} 自己的個性、口吻、和 {{user}} 的關係，聊剛讀到的內容、說說感想、提問、吐槽、聯想到你們之間的事都可以。`,
    0,
  ),
  def(
    "companionReadingCharacterInfo",
    "伴讀角色資料",
    `🎭 {{char}} 的角色資料：
{{description}}

💫 性格：
{{personality}}

{{scenario}}`,
    1,
    "character",
  ),
  def(
    "companionReadingUserInfo",
    "伴讀使用者資料",
    `👤 一起讀書的人：{{user}}
{{userPersona}}`,
    2,
    "character",
  ),
  def(
    "companionReadingMemory",
    "伴讀時的私聊記憶",
    `📖 你們平常聊天的前情提要：
{{phoneSummaries}}

⭐ 重要事件：
{{phoneImportantEvents}}

💬 最近在私聊裡的對話：
{{phoneRecentChatHistory}}

這些是你和 {{user}} 之間的記憶，聊書的時候可以自然地連結，不用刻意提起。`,
    3,
  ),
  def(
    "companionReadingContent",
    "正在讀的內容",
    `📚 {{user}} 剛讀到的內容（讀到這裡為止）：
{{readingWindow}}

⚠️ 後面的情節 {{user}} 還沒讀：就算你知道這本書，也不可以透露或暗示後面會發生什麼。`,
    4,
  ),
  def(
    "companionReadingStyle",
    "伴讀回覆格式",
    `【回覆格式】
像在傳訊息一樣，一句一行，總共 4 到 10 行，每行不超過 50 字。
不要寫成一大段，不要用條列或標題，不要加動作描寫的括號旁白。`,
    5,
  ),
];

export const DEFAULT_COMPANION_READING_PROMPT_ORDER: PromptOrderEntry[] = [
  { identifier: "companionReadingSystem", enabled: true },
  { identifier: "companionReadingCharacterInfo", enabled: true },
  { identifier: "worldInfoBefore", enabled: true },
  { identifier: "companionReadingUserInfo", enabled: true },
  { identifier: "companionReadingMemory", enabled: true },
  { identifier: "worldInfoAfter", enabled: true },
  { identifier: "companionReadingContent", enabled: true },
  { identifier: "companionReadingStyle", enabled: true },
  { identifier: "chatHistory", enabled: true },
];
