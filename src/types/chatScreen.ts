import type {
  ChatAppearance,
  ChatHistoryRecordData,
  FoodRecordRef,
  ForwardedFrom,
  GroupActionType,
  PlurkActivity,
  PlurkShareSnapshot,
  StoryClockState,
  WaimaiOrderSnapshot,
} from "@/types/chat";
import type { ToolActivityRecord } from "@/types/toolActivity";

export type ChatScreenMediaType =
  | "descriptive-image"
  | "descriptive-video"
  | "real-image"
  | "image-url"
  | "ai-generate";

export interface ChatScreenImageData {
  dataUrl: string;
  base64: string;
  mimeType: string;
  caption?: string;
}

export interface ChatScreenMessage {
  id: string;
  role: "user" | "ai" | "system";
  content: string;
  timestamp: number;
  /** 劇情時間：建立當下的聊天有效時間（假時間模式下與 timestamp 不同） */
  storyTime?: number;
  /** 這一輪套用劇情時間之後的時鐘狀態 */
  storyClockAfter?: StoryClockState;
  turnId?: string;
  swipes?: string[];
  swipeId?: number;
  roundSwipes?: ChatScreenMessage[][];
  roundSwipeId?: number;
  isStreaming?: boolean;
  thought?: string;
  isTimetravel?: boolean;
  timetravelContent?: string;
  isRedpacket?: boolean;
  redpacketData?: {
    amount: string;
    blessing: string;
    password?: string;
    voice?: string;
    type?: "lucky" | "exclusive" | "voice" | "split";
    count?: number;
    target?: string;
  };
  redpacketState?: {
    totalCents: number;
    totalCount: number;
    remainingCents: number;
    remainingCount: number;
    claims: Array<{
      claimerName: string;
      claimerCharId?: string;
      isUser: boolean;
      cents: number;
      timestamp: number;
    }>;
    fullyClaimed: boolean;
  };
  isLocation?: boolean;
  locationContent?: string;
  replyToContent?: string;
  replyTo?: string;
  messageType?:
    | "text"
    | "image"
    | "descriptive-image"
    | "descriptive-video"
    | "image-url"
    | "audio";
  imageUrl?: string;
  imageData?: string;
  imageMimeType?: string;
  imageCaption?: string;
  /** 模型看圖時寫的圖片備註（<pic-note>） */
  imageNote?: string;
  imagePrompt?: string;
  isGift?: boolean;
  giftName?: string;
  giftReceived?: boolean;
  giftCard?: string;
  giftDescription?: string;
  giftMemoryId?: string;
  isDollTouch?: boolean;
  dollTouchText?: string;
  dollTouchRound?: number;
  dollLookKey?: string;
  dollLookNote?: string;
  isTransfer?: boolean;
  transferAmount?: number;
  transferReceived?: boolean;
  transferType?: "pay" | "refund";
  transferNote?: string;
  transferStatus?: "sent" | "pending" | "received" | "refunded";
  transferSettledBy?: string;
  refundOfMessageId?: string;
  isWaimaiShare?: boolean;
  isWaimaiPaymentRequest?: boolean;
  isWaimaiPaymentConfirm?: boolean;
  isWaimaiPaymentResult?: boolean;
  isWaimaiProgress?: boolean;
  isWaimaiDelivery?: boolean;
  waimaiOrder?: WaimaiOrderSnapshot;
  isMusicShare?: boolean;
  musicShareData?: {
    name: string;
    artist: string;
    album?: string;
    cover?: string;
    lyrics?: string;
  };
  isAvatarChange?: boolean;
  avatarChangeAction?: "accept" | "reject" | "forced" | "mood" | "restore";
  avatarChangeMood?: string;
  avatarChangeDesc?: string;
  senderCharacterId?: string;
  senderCharacterName?: string;
  senderCharacterAvatar?: string;
  isRecall?: boolean;
  recallContent?: string;
  isPrivateMessage?: boolean;
  isGroupAction?: boolean;
  groupActionType?: GroupActionType;
  groupActionActor?: string;
  groupActionTarget?: string;
  groupActionValue?: string;
  isGroupChatHistory?: boolean;
  forwardedFrom?: ForwardedFrom;
  /** 噗文分享卡片 */
  plurkShare?: PlurkShareSnapshot;
  /** 這輪回覆裡角色去噗浪留言了 */
  plurkActivity?: PlurkActivity;
  groupChatHistoryData?: ChatHistoryRecordData;
  isGroupCallHistory?: boolean;
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
  isPhoneCallHistory?: boolean;
  phoneCallHistoryData?: {
    characterName: string;
    characterAvatar?: string;
    startedAt: number;
    endedAt: number;
    messages: Array<{
      role: "user" | "ai";
      content: string;
      tone?: string;
      audioUrl?: string;
      timestamp: number;
      /** 使用者用說的（語音辨識） */
      viaVoice?: boolean;
      /** 中文字幕（通話雙語字幕） */
      translation?: string;
    }>;
  };
  isCalendarEvent?: boolean;
  calendarEventData?: import("@/types/calendar").CalendarCardData;
  isCallNotification?: boolean;
  callNotificationType?: "declined" | "missed" | "unanswered";
  callReason?: string;
  isHtmlBlock?: boolean;
  htmlContent?: string;
  isShadowSegment?: boolean;
  shadowSourceId?: string;
  shadowOrdinal?: number;
  audioBlobId?: string;
  audioMimeType?: string;
  audioDuration?: number;
  audioWaveform?: number[];
  audioTranscript?: string;
  _audioBlob?: Blob;
  _audioDataUri?: string;
  _rawAffinityBlock?: string;
  ttsRawContent?: string;
  ttsAudioUrl?: string;
  ttsSegments?: Array<{
    emotion: string;
    speed: number;
    text: string;
    clean: string;
    audioUrl?: string;
  }>;
  isUserRecalled?: boolean;
  userRecalledType?: "seen" | "unseen";
  isUserEdited?: boolean;
  editOriginalContent?: string;
  editNoticed?: boolean;
  /** 撤回動畫過渡中的臨時訊息，3秒後會被替換，不應持久化 */
  _isPendingRecall?: boolean;
  isCharRecall?: boolean;
  charRecallType?: "seen" | "hidden";
  charRecallContent?: string;
  charRecallHints?: string[];
  charRecallRevealed?: boolean;
  isFaceToFaceRequest?: boolean;
  faceToFaceRequestReason?: string;
  faceToFaceRequestStatus?: "pending" | "accepted" | "rejected";
  isOnlineModeRequest?: boolean;
  onlineModeRequestReason?: string;
  onlineModeRequestStatus?: "pending" | "accepted" | "rejected";
  /** 這一輪角色用過的工具（只掛在該輪第一則角色訊息上） */
  toolActivity?: ToolActivityRecord[];
  sentWhileBlocked?: boolean;
  /** user 在角色暫時離開期間留下的（訊息或未接通電話卡），值是 CharAway.id */
  sentWhileAway?: string;
  isSystemNotification?: boolean;
  isTransactionClaimNotice?: boolean;
  isFoodRecord?: boolean;
  foodRecordData?: FoodRecordRef;
  diaryNoticeId?: string;
  isContinuePrompt?: boolean;
  isCharBlockedNotification?: boolean;
  charBlockedReason?: string;
  isFriendRequest?: boolean;
  friendRequestId?: string;
  friendRequestData?: {
    direction: "user-to-char" | "char-to-user";
    charName: string;
    createdAt: number;
  };
  friendRequestResult?: "accepted" | "rejected";
}

export interface PendingInjectedMessage {
  content: string;
  isWaimaiShare?: boolean;
  isWaimaiPaymentRequest?: boolean;
  isWaimaiPaymentConfirm?: boolean;
  isWaimaiPaymentResult?: boolean;
  isWaimaiProgress?: boolean;
  isWaimaiDelivery?: boolean;
  waimaiOrder?: WaimaiOrderSnapshot;
  waimaiProgressMessages?: Array<{
    content: string;
    isWaimaiProgress?: boolean;
    isWaimaiDelivery?: boolean;
    waimaiOrder?: WaimaiOrderSnapshot;
    timestamp?: number;
  }>;
  isMusicShare?: boolean;
  musicShareData?: {
    name: string;
    artist: string;
    album?: string;
    cover?: string;
    lyrics?: string;
  };
  /** 噗文分享卡片 */
  plurkShare?: PlurkShareSnapshot;
  /** 卡片後面接著送的一句話 */
  followUpText?: string;
}

export interface ChatScreenProps {
  chatId?: string;
  characterId?: string;
  characterName?: string;
  characterAvatar?: string;
  pendingAppearance?: ChatAppearance;
  pendingMessage?: string | PendingInjectedMessage;
  startPhoneCall?: boolean;
  incomingCallReason?: string;
}
