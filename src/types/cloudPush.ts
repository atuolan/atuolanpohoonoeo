/**
 * 雲端推送鬧鐘 — 類型定義
 */

// ===== 同步到雲端的角色資料（精簡版） =====
export interface CloudPushCharacter {
  id: string;
  name: string;
  /** description + personality 合併文本 */
  personality: string;
  /** system_prompt */
  systemPrompt: string;
  avatar: string | null;
  /** 最近聊天紀錄（最多 15 輪，每輪含 user + assistant） */
  recentMessages?: Array<{ role: "user" | "assistant"; content: string }>;
  /** 最近總結（最多 5 條） */
  recentSummaries?: string[];
  /** 可用表情包名稱列表 */
  stickerNames?: string[];
  /** 主動發訊息設定（只傳啟用的角色才有此欄位） */
  proactiveSettings: {
    intervalMinutes: number;
    doNotDisturbEnabled: boolean;
    doNotDisturbStart: string;
    doNotDisturbEnd: string;
    lastSentTime?: number;
    nextScheduledTime?: number;
  };
}

// ===== 同步到雲端的 API 設定（精簡版） =====
export interface CloudPushApiSettings {
  provider: string;
  endpoint: string;
  apiKey: string;
  model: string;
  temperature: number;
  maxTokens: number;
}

// ===== 推送排程設定 =====
export interface CloudPushSchedule {
  intervalMinutes: number;
  doNotDisturbEnabled: boolean;
  doNotDisturbStart: string;
  doNotDisturbEnd: string;
  /** 用戶時區偏移（分鐘），用於伺服器端 DND 計算 */
  timezoneOffset: number;
}

// ===== POST /push/sync 請求 =====
export interface CloudPushSyncPayload {
  characters: CloudPushCharacter[];
  apiSettings: CloudPushApiSettings;
  userName: string;
  schedule: CloudPushSchedule;
  pushChannels: ("discord" | "webpush")[];
  discordUserId: string;
  /** 本地頁面存活時間戳（ms）。Worker 收到後若距現在 < 間隔時間，代表本地還活著，跳過雲端生成 */
  lastClientAliveAt?: number;
  pushSubscription?: PushSubscriptionJSON | null;
}

// ===== POST /push/sync 回應 =====
export interface CloudPushSyncResponse {
  ok: boolean;
  nextAlarm: number | null;
  nextAlarmReadable: string | null;
}

// ===== GET /push/status 回應 =====
export interface CloudPushStatus {
  enabled: boolean;
  hasConfig: boolean;
  nextAlarm: number | null;
  nextAlarmReadable: string | null;
  pendingMessageCount: number;
  pushChannels: ("discord" | "webpush")[];
  lastTriggeredAt: number | null;
}

// ===== GET /push/messages 回應中的單條訊息 =====
export interface CloudPushMessage {
  id: string;
  characterId: string;
  characterName: string;
  content: string;
  createdAt: number;
}

// ===== GET /push/messages 回應 =====
export interface CloudPushMessagesResponse {
  messages: CloudPushMessage[];
}

// ===== 本地 Pinia store 狀態 =====
export interface CloudPushState {
  enabled: boolean;
  discordUserId: string;
  enabledChannels: ("discord" | "webpush")[];
  intervalMinutes: number;
  doNotDisturbEnabled: boolean;
  doNotDisturbStart: string;
  doNotDisturbEnd: string;
  lastSyncAt: number | null;
  nextAlarm: number | null;
  pendingMessageCount: number;
  syncStatus: "idle" | "syncing" | "success" | "error";
  syncError: string | null;
}
