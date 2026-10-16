/**
 * 設定 App 用到的固定選項。從舊 SettingsScreen 原樣搬出來。
 */
import type { MiniMaxModel } from "@/api/MiniMaxTTSApi";
import type {
  APIProvider,
  PromptPostProcessingType,
  ToolProtocol,
} from "@/types/settings";

export type SettingsPageId =
  | "home"
  | "model"
  | "auxiliary"
  | "memory"
  | "voiceMessage"
  | "tts"
  | "call"
  | "notification"
  | "background"
  | "phone"
  | "backup"
  | "sync"
  | "storage"
  | "support"
  | "developer";

export const SETTINGS_PAGE_TITLES: Record<Exclude<SettingsPageId, "home">, string> = {
  model: "主要模型",
  auxiliary: "備用模型與分流",
  memory: "向量記憶",
  voiceMessage: "語音訊息",
  tts: "語音合成",
  call: "通話",
  notification: "通知",
  background: "背景執行",
  phone: "日曆與定位",
  backup: "備份與還原",
  sync: "跨裝置同步",
  storage: "儲存空間",
  support: "支持作者",
  developer: "開發者選項",
};

export const API_PROVIDERS: { id: APIProvider; name: string; endpoint: string }[] = [
  { id: "openai", name: "OpenAI", endpoint: "https://api.openai.com/v1" },
  { id: "claude", name: "Claude", endpoint: "https://api.anthropic.com/v1" },
  {
    id: "gemini",
    name: "Gemini",
    endpoint: "https://generativelanguage.googleapis.com/v1beta/openai",
  },
  { id: "openrouter", name: "OpenRouter", endpoint: "https://openrouter.ai/api/v1" },
  { id: "custom", name: "自定義", endpoint: "" },
];

// 常用模型（還沒拉取模型清單時顯示）
export const POPULAR_MODELS: Record<string, string[]> = {
  openai: ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "gpt-3.5-turbo", "o1-mini", "o1-preview"],
  claude: [
    "claude-sonnet-4-20250514",
    "claude-3-5-sonnet-20241022",
    "claude-3-5-haiku-20241022",
    "claude-3-opus-20240229",
  ],
  gemini: ["gemini-2.0-flash", "gemini-2.0-flash-lite", "gemini-1.5-pro", "gemini-1.5-flash"],
  openrouter: [
    "openai/gpt-4o",
    "anthropic/claude-3.5-sonnet",
    "google/gemini-2.0-flash-exp",
    "meta-llama/llama-3.3-70b-instruct",
  ],
  custom: [],
};

export const TOOL_PROTOCOL_OPTIONS: Array<{
  value: ToolProtocol;
  label: string;
  description: string;
}> = [
  { value: "auto", label: "自動", description: "優先使用原生工具，上游不支援時自動改走文字協議" },
  { value: "native", label: "原生", description: "只使用 API 原生 tool calling，不自動回退" },
  { value: "text", label: "文字", description: "以文字格式描述工具，相容不支援原生工具的中轉站" },
  { value: "disabled", label: "停用", description: "不傳送任何工具定義" },
];

export type PromptPostProcessingOption = {
  value: PromptPostProcessingType;
  label: string;
  description: string;
};

/** 不涉及工具語意的模式，置於分組之外。 */
export const PROMPT_POST_PROCESSING_PLAIN: PromptPostProcessingOption[] = [
  { value: "none", label: "不處理", description: "保留原始訊息結構" },
  { value: "claude", label: "Claude 相容", description: "等同「合併連續角色」，為相容舊設定保留" },
];

/** 保留 tool_calls 與 tool 角色，供原生工具呼叫使用。 */
export const PROMPT_POST_PROCESSING_TOOL: PromptPostProcessingOption[] = [
  { value: "merge_tools", label: "合併連續角色（含工具）", description: "合併連續相同角色，保留工具欄位" },
  {
    value: "semi_tools",
    label: "半嚴格（角色交替；含工具）",
    description: "只保留第一則 system，其餘轉為 user，保留工具欄位",
  },
  {
    value: "strict_tools",
    label: "嚴格（使用者優先，角色交替；含工具）",
    description: "半嚴格處理並補上 user 起始訊息，保留工具欄位",
  },
];

/** 移除 tool_calls 並將 tool 角色轉為 user。 */
export const PROMPT_POST_PROCESSING_NO_TOOL: PromptPostProcessingOption[] = [
  { value: "merge", label: "合併連續角色", description: "合併連續相同角色，移除工具欄位" },
  { value: "semi", label: "半嚴格（交替角色）", description: "只保留第一則 system，其餘轉為 user" },
  { value: "strict", label: "嚴格（使用者優先，交替角色）", description: "半嚴格處理並補上 user 起始訊息" },
  { value: "single", label: "單一使用者訊息（無工具）", description: "將全部內容合併為一則 user 訊息" },
];

export const PROMPT_POST_PROCESSING_ALL: PromptPostProcessingOption[] = [
  ...PROMPT_POST_PROCESSING_PLAIN,
  ...PROMPT_POST_PROCESSING_TOOL,
  ...PROMPT_POST_PROCESSING_NO_TOOL,
];

export const LAST_PROMPT_ROLE_OPTIONS: Array<{
  value: "none" | "system" | "user" | "assistant";
  label: string;
}> = [
  { value: "none", label: "不覆蓋（預設）" },
  { value: "system", label: "system" },
  { value: "user", label: "user" },
  { value: "assistant", label: "assistant" },
];

export interface RingtoneOption {
  id: string;
  name: string;
  description: string;
}

export const RINGTONE_OPTIONS: RingtoneOption[] = [
  { id: "classic", name: "經典來電", description: "傳統雙音電話鈴聲" },
  { id: "digital", name: "數位節奏", description: "較明亮、節奏感強" },
  { id: "soft", name: "柔和提醒", description: "較柔和不刺耳" },
  { id: "custom", name: "自訂音檔", description: "使用你上傳的音檔" },
];

export const MINIMAX_MODEL_OPTIONS: Array<{ value: MiniMaxModel; label: string }> = [
  { value: "speech-2.8-hd", label: "speech-2.8-hd（最新HD，支持語氣標籤）" },
  { value: "speech-2.8-turbo", label: "speech-2.8-turbo（最新Turbo，支持語氣標籤）" },
  { value: "speech-2.6-hd", label: "speech-2.6-hd" },
  { value: "speech-2.6-turbo", label: "speech-2.6-turbo（40語種）" },
  { value: "speech-02-hd", label: "speech-02-hd" },
  { value: "speech-02-turbo", label: "speech-02-turbo" },
];

/** 預設 HF Space 同步伺服器 */
export const DEFAULT_SYNC_SERVER_URL = "https://lonson0215-aguaphone-sync.hf.space/";
