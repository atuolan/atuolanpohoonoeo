/**
 * 世界書類型定義
 * 完全兼容 SillyTavern world-info.js 規格
 */

// ===== 插入位置枚舉 =====
export enum WorldInfoPosition {
  /** ↑Char - 角色定義之前 */
  BEFORE_CHAR = 0,
  /** ↓Char - 角色定義之後 */
  AFTER_CHAR = 1,
  /** ↑AT - 作者筆記之前 */
  AN_TOP = 2,
  /** ↓AT - 作者筆記之後 */
  AN_BOTTOM = 3,
  /** @D - 指定深度插入 */
  AT_DEPTH = 4,
  /** ↑EM - 對話示例之前 */
  EM_TOP = 5,
  /** ↓EM - 對話示例之後 */
  EM_BOTTOM = 6,
  /** Outlet - 擴展輸出口 */
  OUTLET = 7,
}

// ===== 錨點位置 =====
export enum WIAnchorPosition {
  BEFORE = 0,
  AFTER = 1,
}

// ===== 選擇性邏輯 =====
export enum WorldInfoLogic {
  /** 主關鍵詞 AND 任一次要關鍵詞 */
  AND_ANY = 0,
  /** 主關鍵詞 AND NOT 全部次要關鍵詞 */
  NOT_ALL = 1,
  /** 主關鍵詞 AND NOT 任一次要關鍵詞 */
  NOT_ANY = 2,
  /** 主關鍵詞 AND 全部次要關鍵詞 */
  AND_ALL = 3,
}

// ===== 掃描狀態 =====
export enum ScanState {
  /** 停止掃描 */
  NONE = 0,
  /** 初始狀態 */
  INITIAL = 1,
  /** 遞歸觸發 */
  RECURSION = 2,
  /** 最小激活數偏移觸發 */
  MIN_ACTIVATIONS = 3,
}

// ===== 插入策略 =====
export enum WorldInfoInsertionStrategy {
  /** 均勻分佈 */
  EVENLY = 0,
  /** 角色優先 */
  CHARACTER_FIRST = 1,
  /** 全局優先 */
  GLOBAL_FIRST = 2,
}

// ===== 角色（用於 @D 插入） =====
export enum PromptRole {
  SYSTEM = 0,
  USER = 1,
  ASSISTANT = 2,
}

// ===== 世界書條目 - 完整 40+ 字段 =====
export interface WorldInfoEntry {
  // --- 識別 ---
  /** 唯一識別碼 */
  uid: number
  /** 所屬世界書名稱 */
  world?: string
  /** 顯示索引 */
  displayIndex?: number

  // --- 關鍵詞 ---
  /** 主要關鍵詞（觸發條件） */
  key: string[]
  /** 次要關鍵詞（選擇性邏輯） */
  keysecondary: string[]

  // --- 內容 ---
  /** 條目備註/標題 */
  comment: string
  /** 實際注入的內容 */
  content: string

  // --- 激活控制 ---
  /** 始終激活（不需要關鍵詞） */
  constant: boolean
  /** 禁用條目 */
  disable: boolean
  /** 啟用選擇性邏輯 */
  selective: boolean
  /** 選擇性邏輯類型 */
  selectiveLogic: WorldInfoLogic

  // --- 插入設定 ---
  /** 插入順序（越大越優先） */
  order: number
  /** 插入位置 */
  position: WorldInfoPosition
  /** @D 深度（當 position=AT_DEPTH 時使用） */
  depth: number
  /** 角色（0=system, 1=user, 2=assistant） */
  role: PromptRole | null

  // --- Token 與預算 ---
  /** 忽略 Token 預算限制 */
  ignoreBudget: boolean

  // --- 遞歸控制 ---
  /** 排除遞歸掃描 */
  excludeRecursion: boolean
  /** 阻止其他條目遞歸 */
  preventRecursion: boolean
  /** 延遲到第 N 次遞歸才激活 */
  delayUntilRecursion: number

  // --- 機率與時效 ---
  /** 激活機率 (0-100) */
  probability: number
  /** 是否使用機率 */
  useProbability: boolean
  /** 黏性：激活後持續 N 回合 */
  sticky: number | null
  /** 冷卻：激活後冷卻 N 回合 */
  cooldown: number | null
  /** 延遲：需要 N 回合對話才激活 */
  delay: number | null

  // --- 掃描設定（覆蓋全局） ---
  /** 自訂掃描深度 */
  scanDepth: number | null
  /** 區分大小寫 */
  caseSensitive: boolean | null
  /** 全詞匹配 */
  matchWholeWords: boolean | null
  /** 使用群組評分 */
  useGroupScoring: boolean | null

  // --- 匹配對象擴展 ---
  /** 掃描用戶角色描述 */
  matchPersonaDescription: boolean
  /** 掃描角色描述 */
  matchCharacterDescription: boolean
  /** 掃描角色性格 */
  matchCharacterPersonality: boolean
  /** 掃描角色深度提示 */
  matchCharacterDepthPrompt: boolean
  /** 掃描場景 */
  matchScenario: boolean
  /** 掃描創建者備註 */
  matchCreatorNotes: boolean

  // --- 群組設定 ---
  /** 群組名稱（同組互斥） */
  group: string
  /** 覆蓋群組 */
  groupOverride: boolean
  /** 群組權重 */
  groupWeight: number

  // --- 其他 ---
  /** Outlet 名稱 */
  outletName: string
  /** 自動化 ID */
  automationId: string
  /** 向量化標記 */
  vectorized: boolean
  /** 觸發類型過濾 */
  triggers: string[]
  /** 是否添加備註 */
  addMemo: boolean

  // --- 角色過濾（排除模板） ---
  characterFilterNames?: string[]
  characterFilterTags?: string[]
  characterFilterExclude?: boolean
}

// ===== 世界書 =====
export interface Lorebook {
  /** 唯一識別碼 */
  id: string
  /** 世界書名稱 */
  name: string
  /** 描述 */
  description?: string
  /** 條目列表 */
  entries: WorldInfoEntry[]
  /** 是否為全局世界書（對所有角色生效） */
  isGlobal?: boolean

  // --- 全局設定 ---
  /** 掃描深度 */
  scanDepth?: number
  /** Token 預算 */
  tokenBudget?: number
  /** 啟用遞歸掃描 */
  recursiveScanning?: boolean
  /** 區分大小寫 */
  caseSensitive?: boolean
  /** 全詞匹配 */
  matchWholeWords?: boolean

  // --- 元數據 ---
  /** 創建時間 */
  createdAt: number
  /** 更新時間 */
  updatedAt: number
}

// ===== 世界書全局設定 =====
export interface WorldInfoSettings {
  /** 掃描深度 */
  depth: number
  /** 最小激活數 */
  minActivations: number
  /** 最小激活深度上限 */
  minActivationsDepthMax: number
  /** Token 預算百分比 */
  budget: number
  /** Token 預算上限 */
  budgetCap: number
  /** 包含角色名稱 */
  includeNames: boolean
  /** 啟用遞歸 */
  recursive: boolean
  /** 最大遞歸步數 */
  maxRecursionSteps: number
  /** 區分大小寫 */
  caseSensitive: boolean
  /** 全詞匹配 */
  matchWholeWords: boolean
  /** 使用群組評分 */
  useGroupScoring: boolean
  /** 插入策略 */
  characterStrategy: WorldInfoInsertionStrategy
  /** 預算溢出警告 */
  overflowAlert: boolean
}

// ===== 全局掃描數據 =====
export interface WIGlobalScanData {
  /** 觸發類型 */
  trigger: string
  /** 用戶角色描述 */
  personaDescription: string
  /** 角色描述 */
  characterDescription: string
  /** 角色性格 */
  characterPersonality: string
  /** 角色深度提示 */
  characterDepthPrompt: string
  /** 場景 */
  scenario: string
  /** 創建者備註 */
  creatorNotes: string
}

// ===== 時效效果 =====
export interface WITimedEffect {
  /** 條目哈希 */
  hash: number
  /** 效果開始的聊天索引 */
  start: number
  /** 效果結束的聊天索引 */
  end: number
  /** 受保護的效果不能在聊天未推進時移除 */
  protected: boolean
}

export type TimedEffectType = 'sticky' | 'cooldown' | 'delay'

// ===== 激活結果 =====
export interface WIActivatedResult {
  /** 角色前的世界資訊 */
  worldInfoBefore: string
  /** 角色後的世界資訊 */
  worldInfoAfter: string
  /** 深度條目 */
  WIDepthEntries: Array<{
    depth: number
    role: PromptRole
    content: string
  }>
  /** 示例條目 */
  EMEntries: Array<{
    position: WIAnchorPosition
    content: string
  }>
  /** 作者筆記前條目 */
  ANBeforeEntries: Array<{
    position: WIAnchorPosition
    content: string
  }>
  /** 作者筆記後條目 */
  ANAfterEntries: Array<{
    position: WIAnchorPosition
    content: string
  }>
  /** Outlet 條目 */
  outletEntries: Record<string, string[]>
  /** 所有激活的條目 */
  allActivatedEntries: Set<WorldInfoEntry>
}

// ===== 默認值 =====
export const DEFAULT_WI_DEPTH = 4
export const DEFAULT_WI_WEIGHT = 100
export const DEFAULT_WI_PROBABILITY = 100
export const MAX_SCAN_DEPTH = 1000

// ===== 默認世界書條目模板 =====
export const createDefaultWorldInfoEntry = (uid: number): WorldInfoEntry => ({
  uid,
  key: [],
  keysecondary: [],
  comment: '',
  content: '',
  constant: false,
  disable: false,
  selective: true,
  selectiveLogic: WorldInfoLogic.AND_ANY,
  order: 100,
  position: WorldInfoPosition.BEFORE_CHAR,
  depth: DEFAULT_WI_DEPTH,
  role: null,
  ignoreBudget: false,
  excludeRecursion: false,
  preventRecursion: false,
  delayUntilRecursion: 0,
  probability: DEFAULT_WI_PROBABILITY,
  useProbability: true,
  sticky: null,
  cooldown: null,
  delay: null,
  scanDepth: null,
  caseSensitive: null,
  matchWholeWords: null,
  useGroupScoring: null,
  matchPersonaDescription: false,
  matchCharacterDescription: false,
  matchCharacterPersonality: false,
  matchCharacterDepthPrompt: false,
  matchScenario: false,
  matchCreatorNotes: false,
  group: '',
  groupOverride: false,
  groupWeight: DEFAULT_WI_WEIGHT,
  outletName: '',
  automationId: '',
  vectorized: false,
  triggers: [],
  addMemo: false,
})

// ===== 默認全局設定 =====
export const createDefaultWorldInfoSettings = (): WorldInfoSettings => ({
  depth: 2,
  minActivations: 0,
  minActivationsDepthMax: 0,
  budget: 25,
  budgetCap: 0,
  includeNames: true,
  recursive: false,
  maxRecursionSteps: 0,
  caseSensitive: false,
  matchWholeWords: false,
  useGroupScoring: false,
  characterStrategy: WorldInfoInsertionStrategy.CHARACTER_FIRST,
  overflowAlert: false,
})
