/**
 * 角色卡類型定義
 * 完全兼容 SillyTavern Character Card v2/v3 規格
 */

import type { PromptRole, WorldInfoEntry } from "./worldinfo";

// ===== 角色卡規格版本 =====
export type CharacterCardSpec = "chara_card_v2" | "chara_card_v3";

// ===== 內嵌世界書條目 =====
export interface CharacterBookEntry {
  /** 條目 ID */
  id: number;
  /** 主要關鍵詞 */
  keys: string[];
  /** 次要關鍵詞 */
  secondary_keys: string[];
  /** 備註/標題 */
  comment: string;
  /** 內容 */
  content: string;
  /** 始終激活 */
  constant: boolean;
  /** 啟用選擇性邏輯 */
  selective: boolean;
  /** 插入順序 */
  insertion_order: number;
  /** 啟用 */
  enabled: boolean;
  /** 位置字串 */
  position: "before_char" | "after_char";
  /** 使用正則 */
  use_regex: boolean;

  /** 擴展屬性 */
  extensions: {
    /** 數字位置 */
    position: number;
    /** 排除遞歸 */
    exclude_recursion: boolean;
    /** 機率 */
    probability: number;
    /** 使用機率 */
    useProbability: boolean;
    /** 深度 */
    depth: number;
    /** 選擇性邏輯 */
    selectiveLogic: number;
    /** 群組 */
    group: string;
    /** 群組覆蓋 */
    group_override: boolean;
    /** 群組權重 */
    group_weight: number;
    /** 阻止遞歸 */
    prevent_recursion: boolean;
    /** 延遲到遞歸 */
    delay_until_recursion: boolean;
    /** 掃描深度 */
    scan_depth: number | null;
    /** 全詞匹配 */
    match_whole_words: boolean | null;
    /** 使用群組評分 */
    use_group_scoring: boolean | null;
    /** 區分大小寫 */
    case_sensitive: boolean | null;
    /** 自動化 ID */
    automation_id: string;
    /** 角色 */
    role: number;
    /** 向量化 */
    vectorized: boolean;
    /** 顯示索引 */
    display_index?: number;
    /** 匹配用戶角色描述 */
    match_persona_description?: boolean;
    /** 匹配角色描述 */
    match_character_description?: boolean;
    /** 匹配角色性格 */
    match_character_personality?: boolean;
    /** 匹配角色深度提示 */
    match_character_depth_prompt?: boolean;
    /** 匹配場景 */
    match_scenario?: boolean;
    /** 匹配創建者備註 */
    match_creator_notes?: boolean;
  };
}

// ===== 內嵌世界書 =====
export interface CharacterBook {
  /** 世界書名稱 */
  name?: string;
  /** 描述 */
  description?: string;
  /** 掃描深度 */
  scan_depth?: number;
  /** Token 預算 */
  token_budget?: number;
  /** 遞歸掃描 */
  recursive_scanning?: boolean;
  /** 條目列表 */
  entries: CharacterBookEntry[];
}

// ===== 深度提示 =====
export interface DepthPrompt {
  /** 深度 */
  depth: number;
  /** 提示內容 */
  prompt: string;
  /** 角色 */
  role: "system" | "user" | "assistant";
}

// ===== 正則腳本 =====
export interface RegexScript {
  /** 腳本 UUID */
  id: string;
  /** 腳本名稱 */
  scriptName: string;
  /** 查找正則 */
  findRegex: string;
  /** 替換字串 */
  replaceString: string;
  /** 修剪字串 */
  trimStrings: string[];
  /** 位置 */
  placement: number[];
  /** 禁用 */
  disabled: boolean;
  /** 僅 Markdown */
  markdownOnly: boolean;
  /** 僅提示詞 */
  promptOnly: boolean;
  /** 編輯時運行 */
  runOnEdit: boolean;
  /** 替代正則 */
  substituteRegex: number;
  /** 最小深度 */
  minDepth: number;
  /** 最大深度 */
  maxDepth: number;
}

// ===== 角色卡擴展數據 =====
export interface CharacterExtensions {
  /** 話嘮程度 */
  talkativeness: number;
  /** 收藏 */
  fav: boolean;
  /** 關聯世界書名稱 */
  world: string;
  /** 深度提示 */
  depth_prompt: DepthPrompt;
  /** 正則腳本 */
  regex_scripts: RegexScript[];

  // --- 非標準擴展（外部工具添加） ---
  /** Pygmalion ID */
  pygmalion_id?: string;
  /** GitHub 倉庫 */
  github_repo?: string;
  /** 來源 URL */
  source_url?: string;
  /** Chub 數據 */
  chub?: { full_path: string };
  /** RisuAI 數據 */
  risuai?: { source: string[] };
  /** SD 角色提示 */
  sd_character_prompt?: { positive: string; negative: string };
  /** NAI 角色提示（生圖時前置注入） */
  naiCharacterPrompt?: string;
}

// ===== 角色卡 v2 數據 =====
export interface CharacterCardV2Data {
  /** 角色名稱 */
  name: string;
  /** 角色描述 */
  description: string;
  /** 角色版本 */
  character_version: string;
  /** 性格特徵 */
  personality: string;
  /** 場景設定 */
  scenario: string;
  /** 開場白 */
  first_mes: string;
  /** 對話示例 */
  mes_example: string;
  /** 創建者備註 */
  creator_notes: string;
  /** 標籤 */
  tags: string[];
  /** 系統提示詞 */
  system_prompt: string;
  /** 歷史後指令 */
  post_history_instructions: string;
  /** 創建者 */
  creator: string;
  /** 備選開場白 */
  alternate_greetings: string[];
  /** 內嵌世界書 */
  character_book?: CharacterBook;
  /** 擴展數據 */
  extensions: CharacterExtensions;
}

// ===== 完整角色卡 v2 =====
export interface CharacterCardV2 {
  /** 規格標識 */
  spec: "chara_card_v2";
  /** 規格版本 */
  spec_version: "2.0";
  /** 角色數據 */
  data: CharacterCardV2Data;
}

// ===== 完整角色卡 v1（舊版兼容） =====
export interface CharacterCardV1 {
  /** 角色名稱 */
  name: string;
  /** 角色描述 */
  description: string;
  /** 性格 */
  personality: string;
  /** 場景 */
  scenario: string;
  /** 開場白 */
  first_mes: string;
  /** 對話示例 */
  mes_example: string;
  /** 創建者評論 */
  creatorcomment: string;
  /** 標籤 */
  tags: string[];
  /** 話嘮程度 */
  talkativeness: number;
  /** 收藏 */
  fav: boolean | string;
  /** 創建日期 */
  create_date: string;
  /** v2 數據擴展 */
  data?: CharacterCardV2Data;

  // --- ST 服務器添加的非標準擴展 ---
  /** 當前聊天檔名 */
  chat?: string;
  /** 頭像檔名（作為唯一識別符） */
  avatar?: string;
  /** 原始 JSON 數據 */
  json_data?: string;
  /** 是否為淺載入 */
  shallow?: boolean;
}

// ===== 統一角色卡類型 =====
export type CharacterCard = CharacterCardV1 | CharacterCardV2;

// ===== 角色世界設定 =====
export interface CharacterWorldSettings {
  /** 角色所在地名稱（自由文字，如「東京，日本」） */
  location?: string;
  /** 角色本地時區（IANA 格式，如 "Asia/Tokyo"） */
  timezone?: string;
  /** 手動天氣描述（如「晴天，25°C」） */
  weatherOverride?: string;
}

// ===== 應用內部使用的角色類型 =====
export interface StoredCharacter {
  /** 唯一識別碼 */
  id: string;
  /** 顯示暱稱 */
  nickname: string;
  /** 頭像（Base64 或 URL） */
  avatar: string;
  /** 角色卡數據 */
  data: CharacterCardV2Data;
  /** 綁定的世界書 ID 列表 */
  lorebookIds: string[];
  /** 來源 */
  source: "import" | "manual" | "api";
  /** 創建時間 */
  createdAt: number;
  /** 更新時間 */
  updatedAt: number;
  /** 主動發訊息設置 */
  proactiveMessageSettings?: {
    enabled: boolean;
    intervalMinutes: number;
    lastSentTime?: number;
    nextScheduledTime?: number;
    doNotDisturbEnabled: boolean;
    doNotDisturbStart: string;
    doNotDisturbEnd: string;
    showNotification: boolean;
  };
  /** 角色世界設定（undefined 表示無世界設定） */
  worldSettings?: CharacterWorldSettings;
}

// ===== 角色卡導入結果 =====
export interface CharacterImportResult {
  /** 是否成功 */
  success: boolean;
  /** 角色數據 */
  character?: StoredCharacter;
  /** 提取的世界書 */
  lorebook?: {
    id: string;
    name: string;
    entries: WorldInfoEntry[];
  };
  /** 導入的正則腳本數量 */
  regexScriptsCount?: number;
  /** 從 MVU initvar 偵測並轉換的指標數量（大於 0 表示偵測到 MVU） */
  mvuMetricsCount?: number;
  /** 錯誤信息 */
  error?: string;
}

// ===== 默認角色數據 =====
export const createDefaultCharacterData = (): CharacterCardV2Data => ({
  name: "",
  description: "",
  character_version: "1.0",
  personality: "",
  scenario: "",
  first_mes: "",
  mes_example: "",
  creator_notes: "",
  tags: [],
  system_prompt: "",
  post_history_instructions: "",
  creator: "",
  alternate_greetings: [],
  extensions: {
    talkativeness: 0.5,
    fav: false,
    world: "",
    depth_prompt: {
      depth: 4,
      prompt: "",
      role: "system",
    },
    regex_scripts: [],
  },
});

// ===== 默認存儲角色 =====
export const createDefaultStoredCharacter = (): StoredCharacter => ({
  id: "",
  nickname: "",
  avatar: "",
  data: createDefaultCharacterData(),
  lorebookIds: [],
  source: "manual",
  createdAt: Date.now(),
  updatedAt: Date.now(),
});
