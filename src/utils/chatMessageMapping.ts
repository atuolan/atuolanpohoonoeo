import { needsParsing, parseAIResponse } from "@/services/ResponseParser";
import type { Chat, ChatMessage } from "@/types/chat";
import type { ChatScreenMessage } from "@/types/chatScreen";

interface CharacterLookupItem {
  id: string;
  avatar?: string;
  data?: {
    name?: string;
  };
}

interface StoredToUiMessageDeps {
  characters: CharacterLookupItem[];
  syncModeRequestFieldsFromContent: (message: ChatScreenMessage, content: string) => void;
}

function normalizeMessageContent(value: unknown): string {
  if (typeof value === "string") return value;
  if (value === undefined || value === null) return "";
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    return value
      .map((item) => normalizeMessageContent(item))
      .filter((text) => text.trim())
      .join("\n");
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    if ("text" in record) return normalizeMessageContent(record.text);
    if ("content" in record) return normalizeMessageContent(record.content);
    if ("mes" in record) return normalizeMessageContent(record.mes);
    if ("message" in record) return normalizeMessageContent(record.message);
  }
  return "";
}

function normalizeSwipeList(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const swipes = value
    .map((item) => normalizeMessageContent(item))
    .filter((text) => text.trim());
  return swipes.length > 0 ? swipes : undefined;
}

function normalizeRoundSwipes(value: unknown): ChatScreenMessage[][] | undefined {
  if (!Array.isArray(value)) return undefined;
  const rounds = value
    .map((round) => {
      if (!Array.isArray(round)) return [];
      return round
        .filter((message): message is Record<string, unknown> => Boolean(message) && typeof message === "object")
        .map((message) => {
          const content = normalizeMessageContent(message.content ?? message.text ?? message.mes);
          const swipes = normalizeSwipeList(message.swipes);
          return {
            ...message,
            content,
            swipes,
          } as unknown as ChatScreenMessage;
        })
        .filter((message) => message.id || message.content.trim());
    })
    .filter((round) => round.length > 0);
  return rounds.length > 0 ? rounds : undefined;
}

export function inferUiRoleFromStoredMessage(m: any): ChatScreenMessage["role"] {
  if (m.role === "user" || m.role === "ai" || m.role === "system") {
    return m.role;
  }
  if (m.sender === "user" || m.is_user === true) return "user";
  if (m.sender === "assistant") return "ai";
  return "system";
}

export function convertStoredMessageToUiMessage(
  m: ChatMessage,
  chat: Chat,
  deps: StoredToUiMessageDeps,
): ChatScreenMessage {
  const normalizedContent = normalizeMessageContent((m as any).content ?? (m as any).text ?? (m as any).mes);
  const normalizedSwipes = normalizeSwipeList((m as any).swipes);
  const normalizedRoundSwipes = normalizeRoundSwipes((m as any).roundSwipes);

  let isGift = m.isGift;
  let giftName = m.giftName;
  if (!isGift && normalizedContent) {
    const giftMatch = normalizedContent.match(/<送禮物>([\s\S]*?)<\/送禮物>/i);
    if (giftMatch) {
      isGift = true;
      giftName = giftMatch[1].trim();
    }
  }

  let isTransfer = m.isTransfer;
  let transferAmount = m.transferAmount;
  let transferType = m.transferType;
  let transferNote = m.transferNote;
  let transferStatus = m.transferStatus;
  if (!isTransfer && normalizedContent) {
    const oldTransferMatch = normalizedContent.match(/<轉帳>(\d+)\s*金幣<\/轉帳>/i);
    if (oldTransferMatch) {
      isTransfer = true;
      transferAmount = parseInt(oldTransferMatch[1], 10);
      transferType = "pay";
      transferStatus = "sent";
    }
    const payMatch = normalizedContent.match(/<pay>(\d+)(?::([^<]*?))?<\/pay>/i);
    if (payMatch) {
      isTransfer = true;
      transferAmount = parseInt(payMatch[1], 10);
      transferType = "pay";
      transferNote = payMatch[2]?.trim() || undefined;
      transferStatus = m.sender === "user" ? "sent" : transferStatus || "pending";
    }
    const refundMatch = normalizedContent.match(/<refund>(\d+)<\/refund>/i);
    if (refundMatch) {
      isTransfer = true;
      transferAmount = parseInt(refundMatch[1], 10);
      transferType = "refund";
      transferStatus = "refunded";
    }
  }

  let isMusicShare = (m as any).isMusicShare;
  let musicShareData = (m as any).musicShareData;
  if (!isMusicShare && normalizedContent) {
    const musicMatch = normalizedContent.match(/<分享歌曲>([\s\S]*?)<\/分享歌曲>/i);
    if (musicMatch) {
      isMusicShare = true;
      const parts = musicMatch[1].trim().split(" - ");
      musicShareData = {
        name: parts[0] || "",
        artist: parts[1] || "",
      };
    }
  }

  const needsModeRequestCompat =
    !(m as any).isFaceToFaceRequest &&
    !(m as any).isOnlineModeRequest &&
    normalizedContent.length > 0 &&
    /<face-to-face-request\s|<online-mode-request\s/i.test(normalizedContent);

  const loadedMessage = {
    ...(m as any),
    id: m.id,
    role: inferUiRoleFromStoredMessage(m),
    content: normalizedContent,
    swipes: normalizedSwipes,
    roundSwipes: normalizedRoundSwipes,
    timestamp: m.createdAt,
    isGift,
    giftName,
    isTransfer,
    transferAmount,
    transferType,
    transferNote,
    transferStatus,
    isMusicShare,
    musicShareData,
    senderCharacterName: m.senderCharacterId
      ? (() => {
          if (chat.groupMetadata?.isMultiCharCard) {
            const mc = chat.groupMetadata.multiCharMembers?.find(
              (member) => member.id === m.senderCharacterId,
            );
            if (mc) return mc.name;
          }
          const groupMember = chat.groupMetadata?.members?.find(
            (mem) => mem.characterId === m.senderCharacterId,
          );
          if (groupMember?.nickname) return groupMember.nickname;
          const c = deps.characters.find(
            (ch) => ch.id === m.senderCharacterId,
          );
          return c?.data?.name || m.senderCharacterName || "";
        })()
      : m.senderCharacterName || "",
    senderCharacterAvatar: m.senderCharacterId
      ? (() => {
          if (chat.groupMetadata?.isMultiCharCard) {
            const mc = chat.groupMetadata.multiCharMembers?.find(
              (member) => member.id === m.senderCharacterId,
            );
            if (mc) return mc.avatar;
          }
          return (
            deps.characters.find(
              (ch) => ch.id === m.senderCharacterId,
            )?.avatar ?? m.senderCharacterAvatar ?? ""
          );
        })()
      : m.senderCharacterAvatar || "",
    _audioBlob: undefined,
  } as ChatScreenMessage;

  if (needsModeRequestCompat) {
    deps.syncModeRequestFieldsFromContent(loadedMessage, normalizedContent);
  }

  return loadedMessage;
}

export function sanitizeStreamingContentForStorage(content: string): string {
  const trimmed = content.trim();
  if (!trimmed) return "";

  try {
    if (needsParsing(trimmed)) {
      const parsed = parseAIResponse(trimmed);
      const combined = parsed.messages
        .map((msg) => {
          if (msg.isAiImage && msg.imageDescription) return `<pic>${msg.imageDescription}</pic>`;
          if (msg.isVoice) return `[語音訊息] ${msg.voiceContent || ""}`;
          if (msg.isHtmlBlock) return "";
          if (!msg.content && msg.thought) return `ˇ${msg.thought}ˇ`;
          return msg.content || "";
        })
        .filter((text) => text.trim())
        .join("\n");

      if (combined.trim()) {
        return combined.trim();
      }

      if (parsed.rawOutput.trim()) {
        return parsed.rawOutput
          .replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi, "")
          .replace(/<\/?content>/gi, "")
          .replace(/<\/?msg>/gi, "")
          .trim();
      }
    }
  } catch (error) {
    console.warn("[ChatScreen] 清理流式內容供持久化時解析失敗，改用正則回退:", error);
  }

  return trimmed
    .replace(/<think(?:ing)?>[\s\S]*?(<\/think(?:ing)?>|$)/gi, "")
    .replace(/<\/?content>/gi, "")
    .replace(/<\/?msg>/gi, "")
    .trim();
}

export function convertToStorableMessage(m: any, charName: string): ChatMessage {
  const role = inferUiRoleFromStoredMessage(m);
  return {
    id: m.id,
    sender:
      role === "user"
        ? ("user" as const)
        : role === "ai"
          ? ("assistant" as const)
          : ("system" as const),
    name: role === "user" ? "User" : m.senderCharacterName || charName,
    content:
      m.isStreaming && role === "ai"
        ? sanitizeStreamingContentForStorage(normalizeMessageContent(m.content))
        : normalizeMessageContent(m.content),
    is_user: role === "user",
    status: "sent" as const,
    createdAt: m.timestamp ?? m.createdAt ?? Date.now(),
    updatedAt: m.timestamp ?? m.updatedAt ?? m.createdAt ?? Date.now(),
    swipes: normalizeSwipeList(m.swipes),
    swipeId: m.swipeId,
    roundSwipes: normalizeRoundSwipes(m.roundSwipes),
    roundSwipeId: m.roundSwipeId,
    thought: m.thought,
    isTimetravel: m.isTimetravel,
    timetravelContent: m.timetravelContent,
    isRedpacket: m.isRedpacket,
    redpacketData: m.redpacketData ? { ...m.redpacketData } : undefined,
    redpacketState: m.redpacketState
      ? JSON.parse(JSON.stringify(m.redpacketState))
      : undefined,
    isLocation: m.isLocation,
    locationContent: m.locationContent,
    replyToContent: m.replyToContent,
    replyTo: m.replyTo,
    messageType: m.messageType,
    imageUrl: m.imageUrl,
    imageData: m.imageData,
    imageMimeType: m.imageMimeType,
    imageCaption: m.imageCaption,
    imagePrompt: m.imagePrompt,
    isGift: m.isGift,
    giftName: m.giftName,
    giftReceived: m.giftReceived,
    isTransfer: m.isTransfer,
    transferAmount: m.transferAmount,
    transferReceived: m.transferReceived,
    transferType: m.transferType,
    transferNote: m.transferNote,
    transferStatus: m.transferStatus,
    isWaimaiShare: m.isWaimaiShare,
    isWaimaiPaymentRequest: m.isWaimaiPaymentRequest,
    isWaimaiPaymentConfirm: m.isWaimaiPaymentConfirm,
    isWaimaiPaymentResult: m.isWaimaiPaymentResult,
    isWaimaiProgress: m.isWaimaiProgress,
    isWaimaiDelivery: m.isWaimaiDelivery,
    waimaiOrder: m.waimaiOrder
      ? JSON.parse(JSON.stringify(m.waimaiOrder))
      : undefined,
    isMusicShare: m.isMusicShare,
    musicShareData: m.musicShareData
      ? JSON.parse(JSON.stringify(m.musicShareData))
      : undefined,
    isAvatarChange: m.isAvatarChange,
    avatarChangeAction: m.avatarChangeAction,
    avatarChangeMood: m.avatarChangeMood,
    avatarChangeDesc: m.avatarChangeDesc,
    senderCharacterId: m.senderCharacterId,
    senderCharacterName: m.senderCharacterName,
    senderCharacterAvatar: m.senderCharacterId
      ? undefined
      : m.senderCharacterAvatar,
    isRecall: m.isRecall,
    recallContent: m.recallContent,
    isPrivateMessage: m.isPrivateMessage,
    isGroupAction: m.isGroupAction,
    groupActionType: m.groupActionType,
    groupActionActor: m.groupActionActor,
    groupActionTarget: m.groupActionTarget,
    groupActionValue: m.groupActionValue,
    isGroupChatHistory: m.isGroupChatHistory,
    groupChatHistoryData: m.groupChatHistoryData
      ? JSON.parse(JSON.stringify(m.groupChatHistoryData))
      : undefined,
    isGroupCallHistory: m.isGroupCallHistory,
    groupCallHistoryData: m.groupCallHistoryData
      ? JSON.parse(JSON.stringify(m.groupCallHistoryData))
      : undefined,
    isCalendarEvent: m.isCalendarEvent,
    calendarEventData: m.calendarEventData
      ? JSON.parse(JSON.stringify(m.calendarEventData))
      : undefined,
    audioBlobId: m.audioBlobId,
    audioMimeType: m.audioMimeType,
    audioDuration: m.audioDuration,
    audioWaveform: m.audioWaveform ? [...m.audioWaveform] : undefined,
    audioTranscript: m.audioTranscript,
    _audioBlob: m._audioBlob,
    ttsRawContent: m.ttsRawContent,
    ttsAudioUrl: m.ttsAudioUrl,
    ttsSegments: m.ttsSegments,
    isHtmlBlock: m.isHtmlBlock,
    htmlContent: m.htmlContent,
    isShadowSegment: m.isShadowSegment,
    shadowSourceId: m.shadowSourceId,
    shadowOrdinal: m.shadowOrdinal,
    isUserRecalled: m.isUserRecalled,
    userRecalledType: m.userRecalledType,
    isCharRecall: m.isCharRecall,
    charRecallType: m.charRecallType,
    charRecallContent: m.charRecallContent,
    charRecallHints: m.charRecallHints ? [...m.charRecallHints] : undefined,
    charRecallRevealed: m.charRecallRevealed,
    isFaceToFaceRequest: m.isFaceToFaceRequest,
    faceToFaceRequestReason: m.faceToFaceRequestReason,
    faceToFaceRequestStatus: m.faceToFaceRequestStatus,
    isOnlineModeRequest: m.isOnlineModeRequest,
    onlineModeRequestReason: m.onlineModeRequestReason,
    onlineModeRequestStatus: m.onlineModeRequestStatus,
    sentWhileBlocked: m.sentWhileBlocked,
    isSystemNotification: m.isSystemNotification,
    isTransactionClaimNotice: m.isTransactionClaimNotice,
    isFriendRequest: m.isFriendRequest,
    friendRequestId: m.friendRequestId,
    friendRequestData: m.friendRequestData
      ? JSON.parse(JSON.stringify(m.friendRequestData))
      : undefined,
    friendRequestResult: m.friendRequestResult,
    isContinuePrompt: m.isContinuePrompt,
    isCallNotification: m.isCallNotification,
    callNotificationType: m.callNotificationType,
    callReason: m.callReason,
  } as ChatMessage;
}
