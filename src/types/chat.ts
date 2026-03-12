/**
 * 聊天類型定義
 * 用於管理對話歷史和消息
 */

import type { AuthorsNoteMetadata } from "./prompt";
import type {
  WaimaiDestinationSnapshot,
  WaimaiEtaSnapshot,
} from "./waimaiDelivery";
import type { WITimedEffect } from "./worldinfo";

// ===== 聊天外觀設定 =====
export interface ChatAppearance {
  /** 是否使用自定義外觀（false 則使用全局設定） */
  useCustom: boolean;
  /** 顏色設定 */
  colors?: {
    primary: string;
    primaryLight: string;
  };
  /** 頭像設定 */
  avatar?: {
    shape: "circle" | "square" | "rounded";
    size: "small" | "medium" | "large";
    borderWidth: number;
    borderColor: string;
    shadowEnabled: boolean;
  };
  /** 頭像框設定（聊天專屬） */
  avatarFrames?: {
    /** 用戶頭像框 ID（null 表示不使用） */
    userFrameId: string | null;
    /** 角色頭像框 ID（null 表示不使用） */
    charFrameId: string | null;
  };
  /** 氣泡設定 */
  bubble?: {
    userBgColor: string;
    userBgGradient: string;
    userTextColor: string;
    aiBgColor: string;
    aiTextColor: string;
    borderRadius: number;
    maxWidth: number;
    showAvatar: boolean;
  };
  /** 桌布設定 */
  wallpaper?: {
    type: "color" | "gradient" | "image" | "pattern";
    value: string;
    blur: number;
    opacity: number;
    overlay: string;
    fit?: "cover" | "contain" | "fill" | "repeat";
  };
  /** 字體設定 */
  font?: {
    size: "small" | "medium" | "large";
    family: "system" | "rounded" | "serif" | "mono";
    lineHeight: number; // 行高 (1.0 - 2.5)
    letterSpacing: number; // 字間距 (-2 - 5)
    /** Markdown 樣式顏色 */
    markdownColors?: {
      text: string; // 主要文字
      italic: string; // 斜體 *text*
      bold: string; // 粗體 **text**
      underline: string; // 底線 <u>text</u>
      strikethrough: string; // 刪除線 ~~text~~
      highlight: string; // 高亮 <mark>text</mark>
      quote: string; // 引用 > text
      code: string; // 行內代碼 `code`
      heading: string; // 標題 # text
    };
  };
}

// ===== 消息發送者 =====
export type MessageSender = "user" | "assistant" | "system" | "narrator";

// ===== 消息狀態 =====
export type MessageStatus = "pending" | "sent" | "streaming" | "error";

// ===== 外賣/商城（MVP） =====
export type WaimaiOrderStatus =
  | "created"
  | "payment_requested"
  | "payment_reviewing"
  | "paid"
  | "in_transit"
  | "customs"
  | "delivering"
  | "rejected"
  | "failed"
  | "delivered";

export interface WaimaiOrderItemSnapshot {
  itemId: string;
  name: string;
  storeName: string;
  section: "kind" | "spicy" | "food";
  unitPrice: number;
  quantity: number;
  imageUrl?: string;
}

export interface WaimaiOrderSnapshot {
  orderId: string;
  item: WaimaiOrderItemSnapshot;
  subtotal: number;
  shippingFee: number;
  totalPrice: number;
  recipientName: string;
  createdBy: "user" | "assistant";
  payer: "user" | "assistant";
  status: WaimaiOrderStatus;
  createdAt: number;
  paidAt?: number;
  deliveredAt?: number;
  failureReason?: "insufficient_funds" | "item_not_found" | "duplicate_payment" | "invalid_request";
  /** 收貨地快照（下單當下，避免後續地址簿改動影響歷史） */
  destination?: WaimaiDestinationSnapshot;
  /** ETA 快照（下單當下） */
  eta?: WaimaiEtaSnapshot;
}

// ===== 單條消息 =====
export interface ChatMessage {
  /** 唯一識別碼 */
  id: string;
  /** 發送者類型 */
  sender: MessageSender;
  /** 發送者名稱 */
  name: string;
  /** 消息內容 */
  content: string;
  /** 是否為用戶消息 */
  is_user: boolean;
  /** 消息狀態 */
  status: MessageStatus;
  /** 創建時間 */
  createdAt: number;
  /** 更新時間 */
  updatedAt: number;

  // --- 滑動功能 ---
  /** 滑動消息列表（多個回覆選項） */
  swipes?: string[];
  /** 當前滑動索引 */
  swipeId?: number;

  // --- 元數據 ---
  /** Token 數量 */
  tokenCount?: number;
  /** 生成時間（毫秒） */
  generationTime?: number;
  /** 使用的模型 */
  model?: string;

  // --- 解析後的額外資訊 ---
  /** 想法內容 ~(想法)~ */
  thought?: string;
  /** 是否為時空跳轉 */
  isTimetravel?: boolean;
  /** 時空跳轉內容 */
  timetravelContent?: string;
  /** 是否為紅包 */
  isRedpacket?: boolean;
  /** 紅包數據 */
  redpacketData?: {
    amount: string;
    blessing: string;
    password?: string;
    voice?: string;
  };
  /** 是否為位置分享 */
  isLocation?: boolean;
  /** 位置內容 */
  locationContent?: string;
  /** 回覆引用內容 */
  replyToContent?: string;
  /** 回覆引用的消息 ID */
  replyTo?: string;
  /** 是否為禮物 */
  isGift?: boolean;
  /** 禮物名稱 */
  giftName?: string;
  /** 禮物是否已被接收 */
  giftReceived?: boolean;
  /** 是否為轉帳 */
  isTransfer?: boolean;
  /** 轉帳金額 */
  transferAmount?: number;
  /** 轉帳是否已被接收 */
  transferReceived?: boolean;
  /** 轉帳類型：pay=轉帳, refund=退回 */
  transferType?: "pay" | "refund";
  /** 轉帳備註 */
  transferNote?: string;
  /** 轉帳狀態：sent=已發送, pending=待收款, received=已收款, refunded=已退回 */
  transferStatus?: "sent" | "pending" | "received" | "refunded";

  // --- 外賣/商城（MVP） ---
  /** 是否為商品分享卡 */
  isWaimaiShare?: boolean;
  /** 是否為請款卡（請你幫我支付） */
  isWaimaiPaymentRequest?: boolean;
  /** 是否為付款確認卡（版本 D） */
  isWaimaiPaymentConfirm?: boolean;
  /** 是否為付款結果卡 */
  isWaimaiPaymentResult?: boolean;
  /** 是否為送達卡 */
  isWaimaiDelivery?: boolean;
  /** 外賣訂單快照（MVP 單品） */
  waimaiOrder?: WaimaiOrderSnapshot;

  // --- 換頭像相關 ---
  /** 是否為換頭像動作 */
  isAvatarChange?: boolean;
  /** 換頭像動作類型 */
  avatarChangeAction?: "accept" | "reject" | "forced" | "mood" | "restore";
  /** 情緒頭像的情緒類型 */
  avatarChangeMood?: string;

  // --- 圖片相關 ---
  /** 消息類型 */
  messageType?:
    | "text"
    | "image"
    | "descriptive-image"
    | "descriptive-video"
    | "image-url"
    | "audio";
  /** 圖片 URL（外部連結或 Base64 DataURL） */
  imageUrl?: string;
  /** 圖片 Base64 數據（用於 AI Vision 識別） */
  imageData?: string;
  /** 圖片 MIME 類型（如 image/jpeg） */
  imageMimeType?: string;
  /** 圖片說明/描述 */
  imageCaption?: string;
  /** 文生圖英文提示詞 */
  imagePrompt?: string;

  // --- 音頻/語音相關 ---
  /** 音頻 Blob 在 Audio_Blob_Store 中的 ID */
  audioBlobId?: string;
  /** 音頻 MIME 類型（如 audio/webm;codecs=opus） */
  audioMimeType?: string;
  /** 音頻時長（秒） */
  audioDuration?: number;
  /** 波形數據（0-1 的振幅陣列） */
  audioWaveform?: number[];
  /** STT 語音轉文字結果 */
  audioTranscript?: string;

  // --- MiniMax TTS 語音合成相關 ---
  /** TTS 原始文字（含語氣標籤，用於語音合成） */
  ttsRawContent?: string;
  /** TTS 合成的音頻 URL（舊版單段，向下相容） */
  ttsAudioUrl?: string;
  /** TTS 逐句段落（新版，每段對話獨立合成） */
  ttsSegments?: Array<{
    emotion: string;
    speed: number;
    text: string;
    clean: string;
    audioUrl?: string;
  }>;

  // --- 群聊相關 ---
  /** 發送者角色 ID（群聊時用於區分不同 AI 角色） */
  senderCharacterId?: string;
  /** 是否為撤回訊息 */
  isRecall?: boolean;
  /** 撤回的原始內容 */
  recallContent?: string;
  /** 是否為私信（群聊中的 DM） */
  isPrivateMessage?: boolean;
  /** 是否為群管理動作 */
  isGroupAction?: boolean;
  /** 群管理動作類型 */
  groupActionType?: "rename" | "kick" | "mute" | "unmute";
  /** 群管理動作執行者 */
  groupActionActor?: string;
  /** 群管理動作目標 */
  groupActionTarget?: string;
  /** 群管理動作值（如新群名） */
  groupActionValue?: string;
  /** 是否為群聊記錄卡片（用於私信中附帶的群聊記錄） */
  isGroupChatHistory?: boolean;
  /** 群聊記錄數據 */
  groupChatHistoryData?: {
    groupName: string;
    messages: Array<{
      senderName: string;
      content: string;
      timestamp: number;
      isUser: boolean;
    }>;
  };

  // --- 群通話相關 ---
  /** 是否為群通話請求 */
  isGroupCallRequest?: boolean;
  /** 群通話請求原因 */
  groupCallRequestReason?: string;
  /** 是否為群通話回應 */
  isGroupCallResponse?: boolean;
  /** 群通話回應動作 */
  groupCallResponseAction?: "join" | "decline";
  /** 群通話回應拒絕原因 */
  groupCallDeclineReason?: string;
  /** 是否為加入通話 */
  isJoinCall?: boolean;
  /** 是否為離開通話 */
  isLeaveCall?: boolean;
  /** 離開通話原因 */
  leaveCallReason?: string;
  /** 是否為通話中的語音訊息 */
  isVoiceInCall?: boolean;
  /** 是否為群通話記錄卡片 */
  isGroupCallHistory?: boolean;
  /** 群通話記錄數據 */
  groupCallHistoryData?: {
    groupName: string;
    participants: Array<{
      characterId: string;
      name: string;
      avatar?: string;
    }>;
    messages: Array<{
      type: "voice" | "system" | "user";
      senderName?: string;
      content: string;
      timestamp: number;
    }>;
    startedAt: number;
    endedAt: number;
  };

  // --- 通話通知相關 ---
  /** 是否為通話通知卡片 */
  isCallNotification?: boolean;
  /** 通話通知類型 */
  callNotificationType?: "declined" | "missed";
  /** 通話來電原因（用於顯示和上下文） */
  callReason?: string;

  // --- HTML 區塊 ---
  /** 是否為完整 HTML 文件（需要用 iframe 渲染） */
  isHtmlBlock?: boolean;
  /** HTML 文件內容 */
  htmlContent?: string;

  // --- 行事曆事件 ---
  /** 是否為行事曆事件通知 */
  isCalendarEvent?: boolean;
  /** 行事曆事件資料 */
  calendarEventData?: {
    type: "user" | "period";
    title: string;
    date: string;
    description?: string;
  };

  // --- 擴展 ---
  /** 附加數據 */
  extra?: Record<string, unknown>;
}

// ===== 群聊成員 =====
export interface GroupMember {
  /** 角色 ID */
  characterId: string;
  /** 群暱稱（可選，覆蓋角色本名） */
  nickname?: string;
  /** 是否為管理員 */
  isAdmin: boolean;
  /** 是否被禁言 */
  isMuted: boolean;
  /** 加入時間 */
  joinedAt: number;
}

// ===== 群通話參與者 =====
export interface GroupCallParticipant {
  /** 角色 ID */
  characterId: string;
  /** 加入時間 */
  joinedAt: number;
  /** 是否正在說話 */
  isSpeaking?: boolean;
}

// ===== 群通話狀態 =====
export interface GroupCallState {
  /** 是否正在通話中 */
  isActive: boolean;
  /** 通話發起者角色 ID（null 表示用戶發起） */
  initiatorCharacterId: string | null;
  /** 發起原因 */
  initiatorReason?: string;
  /** 通話開始時間 */
  startedAt: number;
  /** 目前在通話中的參與者 */
  participants: GroupCallParticipant[];
}

// ===== 多人卡子角色 =====
/** 多人卡子角色（一張卡內的多個角色） */
export interface MultiCharMember {
  /** 虛擬 ID（用於消息的 senderCharacterId，格式：multi_xxx） */
  id: string;
  /** 角色名字（必須與卡的 description 中的角色名一致） */
  name: string;
  /** 頭像 URL */
  avatar: string;
}

// ===== 群聊元數據 =====
export interface GroupChatMetadata {
  /** 群名稱 */
  groupName: string;
  /** 群成員列表 */
  members: GroupMember[];
  /** 群頭像（可選） */
  groupAvatar?: string;
  /** 長期記憶（群聊專屬） */
  longTermMemory?: string[];
  /** 世界觀設定 */
  worldSetting?: string;
  /** 群通話狀態 */
  callState?: GroupCallState;
  /** 群聊日記 */
  groupDiary?: GroupDiaryEntry[];
  /** 對話總結 */
  conversationSummaries?: string[];
  /** 群聊綁定的世界書 ID 列表（僅此群組生效） */
  lorebookIds?: string[];
  /** 是否為多人卡模式（區別於普通群聊） */
  isMultiCharCard?: boolean;
  /** 多人卡子角色列表（僅多人卡模式使用） */
  multiCharMembers?: MultiCharMember[];
}

// ===== 群聊日記條目 =====
export interface GroupDiaryEntry {
  /** 日期 */
  date: string;
  /** 日記內容 */
  content: string;
  /** 生成時間 */
  generatedAt: number;
}

// ===== 聊天元數據 =====
export interface ChatMetadata {
  /** 作者筆記 */
  authorsNote?: AuthorsNoteMetadata;
  /** 時效世界資訊 */
  timedWorldInfo?: {
    sticky: Record<string, WITimedEffect>;
    cooldown: Record<string, WITimedEffect>;
  };
  /** 自定義變量 */
  variables?: Record<string, string | number | boolean>;
  /** 聊天專屬的 Persona 覆蓋 */
  personaOverride?: {
    /** 關聯的 Persona ID */
    personaId: string;
    /** 聊天專屬的秘密 */
    secrets: string;
    /** 聊天專屬的權力關係 */
    powerDynamic: string;
  };
}

// ===== 總結記憶設定 =====
export interface SummarySettings {
  /** 計算模式：message = 按消息數，turn = 按輪次 */
  intervalMode: "message" | "turn";
  /** 總結間隔（消息數模式） */
  summaryIntervalMessage: number;
  /** 總結間隔（輪次模式） */
  summaryIntervalTurn: number;
  /** 日記間隔（消息數模式） */
  diaryIntervalMessage: number;
  /** 日記間隔（輪次模式） */
  diaryIntervalTurn: number;
  /** 實際讀取消息數量 */
  actualMessageCount: number;
  /** 實際讀取模式：message = 按消息數，turn = 按輪次 */
  actualMessageMode: "message" | "turn";
  /** 總結讀取模式：all = 全部，recent = 最近 N 條 */
  summaryReadMode: "all" | "recent";
  /** 讀取最近 N 條總結 */
  summaryReadCount: number;
}

// ===== 創建默認總結設定 =====
export const createDefaultSummarySettings = (): SummarySettings => ({
  intervalMode: "turn",
  summaryIntervalMessage: 60,
  summaryIntervalTurn: 30,
  diaryIntervalMessage: 60,
  diaryIntervalTurn: 30,
  actualMessageCount: 30,
  actualMessageMode: "turn",
  summaryReadMode: "recent",
  summaryReadCount: 5,
});

// ===== 聊天會話 =====
export interface Chat {
  /** 唯一識別碼 */
  id: string;
  /** 聊天名稱 */
  name: string;
  /** 關聯的角色 ID */
  characterId: string;
  /** 消息列表 */
  messages: ChatMessage[];
  /** 元數據 */
  metadata: ChatMetadata;
  /** 創建時間 */
  createdAt: number;
  /** 更新時間 */
  updatedAt: number;

  // --- 群聊 ---
  /** 是否為群聊 */
  isGroupChat?: boolean;
  /** 群聊元數據（僅群聊時存在） */
  groupMetadata?: GroupChatMetadata;

  // --- 設定覆蓋 ---
  /** 系統提示詞覆蓋 */
  systemPromptOverride?: string;
  /** 越獄提示詞覆蓋 */
  jailbreakOverride?: string;

  // --- 聊天專屬設定 ---
  /** 是否啟用角色決定接電話（關閉則一律默認接聽） */
  enablePhoneDecision?: boolean;
  /** 勿擾模式（此聊天不會觸發來電） */
  doNotDisturb?: boolean;
  /** 面對面模式（此聊天使用面對面敘事風格） */
  faceToFaceMode?: boolean;

  /** 第三人稱模式（面對面模式下使用第三人稱敘事） */
  thirdPersonMode?: boolean;

  /** 感知現實時間（關閉後不注入時間標籤和時間提示詞，讓用戶可以自由使用時間跳轉魔法） */
  enableRealTimeAwareness?: boolean;

  /** 假時間模式：real=真實時間, loop=輪迴時間, offset=偏移時間 */
  fakeTimeMode?: 'real' | 'loop' | 'offset';
  /** 輪迴時間設定（fakeTimeMode = 'loop' 時使用） */
  fakeTimeLoop?: {
    /** 輪迴起始日期時間 ISO string, e.g. "2024-01-01T00:00:00" */
    startDateTime: string;
    /** 輪迴結束日期時間 ISO string, e.g. "2024-01-07T23:59:59" */
    endDateTime: string;
  };
  /** 時間偏移量（fakeTimeMode = 'offset' 時使用，毫秒） */
  fakeTimeOffset?: number;

  /** 是否啟用 MiniMax TTS 語音合成（單聊天存取，默認關閉） */
  minimaxTTSEnabled?: boolean;

  /** 聊天專屬 MiniMax TTS 音色覆蓋（不設則用全域設定） */
  minimaxTTSOverride?: {
    voiceId?: string;
    speed?: number;
    pitch?: number;
    emotion?: string;
  };

  /** 是否為分支聊天（不顯示在主列表，只在角色卡聊天檔案中顯示） */
  isBranch?: boolean;

  /** 是否釘選到聊天列表（允許同一角色的多個聊天同時出現在列表中） */
  pinnedToList?: boolean;

  // --- 外觀設定 ---
  /** 聊天專屬外觀設定 */
  appearance?: ChatAppearance;

  // --- 總結記憶設定 ---
  /** 聊天專屬總結設定 */
  summarySettings?: SummarySettings;

  // --- 分塊儲存輔助欄位 ---
  /** 最後一條訊息預覽（用於列表顯示，避免讀取全部訊息） */
  lastMessagePreview?: string;
  /** 訊息總數（用於列表顯示） */
  messageCount?: number;

  /** 未讀訊息數量（用於聊天列表顯示紅點/數字） */
  unreadCount?: number;
}

// ===== 聊天設定 =====
export interface ChatSettings {
  /** 最大上下文長度 */
  maxContextLength: number;
  /** 最大回覆長度 */
  maxResponseLength: number;
  /** 溫度 */
  temperature: number;
  /** Top P */
  topP: number;
  /** Top K */
  topK: number;
  /** 頻率懲罰 */
  frequencyPenalty: number;
  /** 存在懲罰 */
  presencePenalty: number;
  /** 重複懲罰 */
  repetitionPenalty: number;
  /** 停止序列 */
  stopSequences: string[];
  /** 是否流式輸出 */
  streaming: boolean;
  /** 是否使用流式輸出窗口 */
  useStreamingWindow: boolean;
}

// ===== 生成請求 =====
export interface GenerationRequest {
  /** 消息歷史 */
  messages: Array<{
    role: "system" | "user" | "assistant";
    content: string;
    name?: string;
  }>;
  /** 聊天設定 */
  settings: ChatSettings;
  /** 生成類型 */
  type: GenerationType;
  /** 取消信號 */
  signal?: AbortSignal;
}

// ===== 生成類型 =====
export type GenerationType =
  | "normal" // 正常生成
  | "continue" // 繼續生成
  | "swipe" // 滑動（重新生成）
  | "impersonate" // 扮演用戶
  | "quiet" // 靜默生成（不顯示）
  | "regenerate"; // 重新生成

// ===== 生成結果 =====
export interface GenerationResult {
  /** 生成的文本 */
  content: string;
  /** Token 統計 */
  tokenCount: {
    prompt: number;
    completion: number;
    total: number;
  };
  /** 生成時間（毫秒） */
  generationTime: number;
  /** 停止原因 */
  stopReason: "stop" | "length" | "error";
  /** 使用的模型 */
  model: string;
}

// ===== 流式生成事件 =====
export interface StreamingEvent {
  /** 事件類型 */
  type: "token" | "done" | "error";
  /** Token 內容（僅 token 事件） */
  token?: string;
  /** 完整內容（僅 done 事件） */
  content?: string;
  /** 錯誤信息（僅 error 事件） */
  error?: string;
  /** Token 使用量（done 事件中，如果 API 有返回） */
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

// ===== 創建默認消息 =====
export const createDefaultMessage = (
  sender: MessageSender,
  name: string,
  content: string = "",
): ChatMessage => ({
  id: crypto.randomUUID(),
  sender,
  name,
  content,
  is_user: sender === "user",
  status: "sent",
  createdAt: Date.now(),
  updatedAt: Date.now(),
});

// ===== 創建默認聊天 =====
export const createDefaultChat = (
  characterId: string,
  characterName: string,
): Chat => ({
  id: crypto.randomUUID(),
  name: `Chat with ${characterName}`,
  characterId,
  messages: [],
  metadata: {},
  createdAt: Date.now(),
  updatedAt: Date.now(),
});

// ===== 創建默認聊天設定 =====
export const createDefaultChatSettings = (): ChatSettings => ({
  maxContextLength: 200000,
  maxResponseLength: 200000,
  temperature: 0.7,
  topP: 1,
  topK: 0,
  frequencyPenalty: 0,
  presencePenalty: 0,
  repetitionPenalty: 1,
  stopSequences: [],
  streaming: true,
  useStreamingWindow: true,
});

// ===== 創建默認群聊 =====
export const createDefaultGroupChat = (
  groupName: string,
  characterIds: string[],
): Chat => {
  if (characterIds.length < 2) {
    throw new Error(
      `Group chat requires at least 2 characters, got ${characterIds.length}`,
    );
  }
  return {
    id: crypto.randomUUID(),
    name: groupName,
    characterId: characterIds[0],
    messages: [],
    metadata: {},
    createdAt: Date.now(),
    updatedAt: Date.now(),
    isGroupChat: true,
    groupMetadata: {
      groupName,
      members: characterIds.map((id) => ({
        characterId: id,
        isAdmin: false,
        isMuted: false,
        joinedAt: Date.now(),
      })),
    },
  };
};
