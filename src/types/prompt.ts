/**
 * 提示詞類型定義
 * 完全兼容 SillyTavern PromptManager.js 規格
 */

import type { PromptRole } from './worldinfo'

// ===== 注入位置 =====
export enum InjectionPosition {
  /** 相對位置 */
  RELATIVE = 0,
  /** 絕對位置（指定深度） */
  ABSOLUTE = 1,
}

// ===== 提示詞位置標識 =====
export type PromptPosition =
  | 'main'           // 主提示詞
  | 'nsfw'           // NSFW 提示詞
  | 'jailbreak'      // 越獄提示詞
  | 'worldInfo'      // 世界資訊
  | 'charDescription' // 角色描述
  | 'charPersonality' // 角色性格
  | 'scenario'       // 場景
  | 'personaDescription' // 用戶角色描述
  | 'authorsNote'    // 作者筆記
  | 'chatHistory'    // 聊天歷史
  | 'examples'       // 對話示例
  | 'custom'         // 自定義

// ===== 提示詞定義 =====
export interface Prompt {
  /** 啟用狀態 */
  enabled: boolean
  /** 唯一標識 */
  identifier: string
  /** 角色 */
  role: 'system' | 'user' | 'assistant'
  /** 內容 */
  content: string
  /** 顯示名稱 */
  name: string
  /** 是否為系統提示 */
  system_prompt: boolean
  /** 位置 */
  position: PromptPosition | number
  /** 注入位置類型 */
  injection_position: InjectionPosition
  /** 注入深度 */
  injection_depth: number
  /** 注入順序 */
  injection_order: number
  /** 禁止覆蓋 */
  forbid_overrides: boolean
  /** 由擴展添加 */
  extension: boolean
  /** 注入觸發類型 */
  injection_trigger: string[]
  /** 是否為標記（佔位符） */
  marker: boolean
}

// ===== 提示詞順序項 =====
export interface PromptOrderItem {
  /** 提示詞標識 */
  identifier: string
  /** 是否啟用 */
  enabled: boolean
}

// ===== 提示詞預設 =====
export interface PromptPreset {
  /** 預設名稱 */
  name: string
  /** 提示詞列表 */
  prompts: Prompt[]
  /** 順序列表 */
  promptOrder: PromptOrderItem[]
}

// ===== 擴展提示詞 =====
export interface ExtensionPrompt {
  /** 內容 */
  content: string
  /** 位置 */
  position: number
  /** 深度 */
  depth: number
  /** 順序 */
  order: number
  /** 角色 */
  role: PromptRole
  /** 是否掃描 */
  scan: boolean
  /** 觸發器 */
  triggers: string[]
}

// ===== 提示詞組裝上下文 =====
export interface PromptBuildContext {
  /** 角色名稱 */
  charName: string
  /** 用戶名稱 */
  userName: string
  /** 角色描述 */
  charDescription: string
  /** 角色性格 */
  charPersonality: string
  /** 場景 */
  scenario: string
  /** 世界資訊（角色前） */
  worldInfoBefore: string
  /** 世界資訊（角色後） */
  worldInfoAfter: string
  /** 對話示例 */
  messageExamples: string
  /** 系統提示詞 */
  systemPrompt: string
  /** 歷史後指令 */
  postHistoryInstructions: string
  /** 作者筆記 */
  authorsNote: string
  /** 用戶角色描述 */
  personaDescription: string
  /** 越獄提示詞 */
  jailbreakPrompt: string
  /** 主提示詞 */
  mainPrompt: string
  /** NSFW 提示詞 */
  nsfwPrompt: string
}

// ===== 提示詞組裝結果 =====
export interface PromptBuildResult {
  /** 完整提示詞列表 */
  messages: Array<{
    role: 'system' | 'user' | 'assistant'
    content: string
    name?: string
    /** 消息標識符（用於調試和追蹤） */
    identifier?: string
  }>
  /** Token 統計 */
  tokenCount: number
  /** 世界資訊 Token 數 */
  worldInfoTokens: number
  /** 聊天歷史 Token 數 */
  chatHistoryTokens: number
  /** 是否截斷 */
  wasTruncated: boolean
  /** 世界書掃描結果（供進階使用） */
  wiResult?: import('./worldinfo').WIActivatedResult
}

// ===== 作者筆記元數據 =====
export interface AuthorsNoteMetadata {
  /** 內容 */
  prompt: string
  /** 間隔 */
  interval: number
  /** 深度 */
  depth: number
  /** 位置 */
  position: number
  /** 角色 */
  role: PromptRole
}

// ===== 默認提示詞 =====
export const DEFAULT_PROMPTS = {
  main: "Write {{char}}'s next reply in a fictional chat between {{charIfNotGroup}} and {{user}}.",
  nsfw: '',
  jailbreak: '',
  impersonation: "[Write your next reply from the point of view of {{user}}, using the chat history so far as a guideline for the writing style of {{user}}. Don't write as {{char}} or system. Don't describe actions of {{char}}.]",
  enhanceDefinitions: "If you have more knowledge of {{char}}, add to the character's lore and personality to enhance them but keep the Character Sheet's definitions absolute.",
  wiFormat: '{0}',
  newChat: '[Start a new Chat]',
  newGroupChat: '[Start a new group chat. Group members: {{group}}]',
  newExampleChat: '[Example Chat]',
  continueNudge: '[Continue your last message without repeating its original content.]',
  personalityFormat: '{{personality}}',
  scenarioFormat: '{{scenario}}',
  groupNudge: '[Write the next reply only as {{char}}.]',
}

// ===== Story String 默認模板 =====
export const DEFAULT_STORY_STRING = `{{#if system}}{{system}}
{{/if}}{{#if description}}{{description}}
{{/if}}{{#if personality}}{{char}}'s personality: {{personality}}
{{/if}}{{#if scenario}}Scenario: {{scenario}}
{{/if}}{{#if persona}}{{persona}}
{{/if}}`

// ===== 創建默認提示詞 =====
export const createDefaultPrompt = (identifier: string): Prompt => ({
  enabled: true,
  identifier,
  role: 'system',
  content: '',
  name: identifier,
  system_prompt: false,
  position: 'custom',
  injection_position: InjectionPosition.RELATIVE,
  injection_depth: 4,
  injection_order: 100,
  forbid_overrides: false,
  extension: false,
  injection_trigger: [],
  marker: false,
})

// ===== 創建默認作者筆記 =====
export const createDefaultAuthorsNote = (): AuthorsNoteMetadata => ({
  prompt: '',
  interval: 0,
  depth: 4,
  position: 0,
  role: 0,
})
