import type { ChatAppearance, WaimaiOrderSnapshot } from "@/types/chat";

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
  imagePrompt?: string;
  isGift?: boolean;
  giftName?: string;
  giftReceived?: boolean;
  isTransfer?: boolean;
  transferAmount?: number;
  transferReceived?: boolean;
  transferType?: "pay" | "refund";
  transferNote?: string;
  transferStatus?: "sent" | "pending" | "received" | "refunded";
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
  groupActionType?: "rename" | "kick" | "mute" | "unmute";
  groupActionActor?: string;
  groupActionTarget?: string;
  groupActionValue?: string;
  isGroupChatHistory?: boolean;
  groupChatHistoryData?: {
    groupName: string;
    messages: Array<{
      senderName: string;
      content: string;
      timestamp: number;
      isUser: boolean;
    }>;
  };
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
  isCalendarEvent?: boolean;
  calendarEventData?: {
    type: "user" | "period";
    title: string;
    date: string;
    description?: string;
  };
  isCallNotification?: boolean;
  callNotificationType?: "declined" | "missed";
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
  sentWhileBlocked?: boolean;
  isSystemNotification?: boolean;
  isTransactionClaimNotice?: boolean;
  isFoodRecord?: boolean;
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
