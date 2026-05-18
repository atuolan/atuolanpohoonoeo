import { needsParsing, parseGreeting } from "@/services/ResponseParser";
import type { ChatScreenMessage } from "@/types/chatScreen";

function createPlainGreetingMessage(firstMessage: string, timestamp = Date.now()): ChatScreenMessage {
  return {
    id: `msg_${timestamp}`,
    role: "ai",
    content: firstMessage,
    timestamp,
  };
}

function hasParsedGreetingContent(parsedMsg: any): boolean {
  return !!(
    parsedMsg.content ||
    parsedMsg.isHtmlBlock ||
    parsedMsg.isTimetravel ||
    parsedMsg.isRedpacket ||
    parsedMsg.isLocation ||
    parsedMsg.isTransfer ||
    parsedMsg.isGift ||
    parsedMsg.isAiImage ||
    parsedMsg.isVoice ||
    parsedMsg.isFaceToFaceRequest ||
    parsedMsg.isOnlineModeRequest
  );
}

export function createGreetingMessages(firstMessage: string): ChatScreenMessage[] {
  if (!needsParsing(firstMessage)) {
    return [createPlainGreetingMessage(firstMessage)];
  }

  try {
    const parsedMessages = parseGreeting(firstMessage);
    if (parsedMessages.length === 0) {
      return [createPlainGreetingMessage(firstMessage)];
    }

    const baseTime = Date.now();
    const messages: ChatScreenMessage[] = [];
    for (let i = 0; i < parsedMessages.length; i++) {
      const parsedMsg = parsedMessages[i];
      if (!hasParsedGreetingContent(parsedMsg)) continue;

      const messageRole: "user" | "ai" | "system" = parsedMsg.isTimetravel
        ? "system"
        : "ai";
      messages.push({
        id: `msg_${baseTime}_${i}`,
        role: messageRole,
        content:
          parsedMsg.isAiImage && parsedMsg.imageDescription
            ? `<pic>${parsedMsg.imageDescription}</pic>`
            : parsedMsg.isHtmlBlock
              ? ""
              : parsedMsg.isVoice
                ? `[語音訊息] ${parsedMsg.voiceContent || ""}`
                : parsedMsg.content,
        timestamp: baseTime + i,
        thought: parsedMsg.thought,
        isTimetravel: parsedMsg.isTimetravel,
        timetravelContent: parsedMsg.timetravelContent,
        isRedpacket: parsedMsg.isRedpacket,
        redpacketData: parsedMsg.redpacketData,
        isLocation: parsedMsg.isLocation,
        locationContent: parsedMsg.locationContent,
        replyToContent: parsedMsg.replyToContent,
        isGift: parsedMsg.isGift,
        giftName: parsedMsg.giftName,
        isTransfer: parsedMsg.isTransfer,
        transferType: parsedMsg.transferType,
        transferAmount: parsedMsg.transferAmount,
        transferNote: parsedMsg.transferNote,
        transferStatus: parsedMsg.isTransfer
          ? parsedMsg.transferType === "refund"
            ? "refunded"
            : "pending"
          : undefined,
        isAvatarChange: parsedMsg.isAvatarChange,
        avatarChangeAction: parsedMsg.avatarChangeAction,
        avatarChangeMood: parsedMsg.avatarChangeMood,
        avatarChangeDesc: parsedMsg.avatarChangeDesc,
        messageType: parsedMsg.isAiImage
          ? "descriptive-image"
          : parsedMsg.isVoice
            ? "audio"
            : undefined,
        imageCaption: parsedMsg.isAiImage
          ? parsedMsg.imageDescription
          : undefined,
        imagePrompt: parsedMsg.imagePrompt,
        isHtmlBlock: parsedMsg.isHtmlBlock,
        htmlContent: parsedMsg.isHtmlBlock ? parsedMsg.content : undefined,
        audioTranscript: parsedMsg.isVoice ? parsedMsg.voiceContent : undefined,
        isFaceToFaceRequest: parsedMsg.isFaceToFaceRequest,
        faceToFaceRequestReason: parsedMsg.faceToFaceRequestReason,
        faceToFaceRequestStatus: parsedMsg.isFaceToFaceRequest
          ? "pending"
          : undefined,
        isOnlineModeRequest: parsedMsg.isOnlineModeRequest,
        onlineModeRequestReason: parsedMsg.onlineModeRequestReason,
        onlineModeRequestStatus: parsedMsg.isOnlineModeRequest
          ? "pending"
          : undefined,
      });
    }

    return messages.length > 0 ? messages : [createPlainGreetingMessage(firstMessage)];
  } catch (e) {
    console.warn("[ChatScreen] 開場白解析失敗，使用原始內容:", e);
    return [createPlainGreetingMessage(firstMessage)];
  }
}
