import dayjs from "dayjs";
import type {
  ChatHistoryRecordData,
  ChatHistoryRecordPart,
  ForwardedFrom,
} from "@/types/chat";
import type { ChatScreenMessage } from "@/types/chatScreen";

/** 合併轉發時每條訊息的文字上限，避免長篇回覆把 prompt 撐爆 */
const RECORD_ITEM_MAX_CHARS = 600;

/** 能被選進轉發的訊息：一般的使用者或角色訊息（系統通知、撤回提示、生成中的不算） */
export function isForwardSelectable(m: ChatScreenMessage): boolean {
  if (m.role !== "user" && m.role !== "ai") return false;
  if (m.isStreaming) return false;
  return !(
    m.isSystemNotification ||
    m.isTransactionClaimNotice ||
    m.isUserRecalled ||
    m.isContinuePrompt
  );
}

/**
 * 能原樣複製到另一個聊天的訊息（逐條轉發）。
 * 紅包、轉帳、禮物、外送、通話、邀請這類帶狀態的卡片複製過去會變成可再領取／可再操作，
 * 語音則依賴 blob 引用，只在合併轉發裡以文字呈現。
 */
export function canForwardIndividually(m: ChatScreenMessage): boolean {
  if (!isForwardSelectable(m)) return false;
  return !(
    m.isRedpacket ||
    m.isTransfer ||
    m.isGift ||
    m.isWaimaiShare ||
    m.isWaimaiPaymentRequest ||
    m.isWaimaiPaymentConfirm ||
    m.isWaimaiPaymentResult ||
    m.isWaimaiProgress ||
    m.isWaimaiDelivery ||
    m.isFaceToFaceRequest ||
    m.isOnlineModeRequest ||
    m.isFriendRequest ||
    m.isCharRecall ||
    m.isRecall ||
    m.isCallNotification ||
    m.isCharBlockedNotification ||
    m.isAvatarChange ||
    m.isGroupAction ||
    m.isGroupCallHistory ||
    m.isPhoneCallHistory ||
    m.isCalendarEvent ||
    m.messageType === "audio" ||
    m.audioBlobId
  );
}

function stripMarkup(text: string): string {
  return text
    .replace(/\[sticker:[^\]]*\]/gi, "[貼圖]")
    .replace(/<pic>[\s\S]*?<\/pic>/gi, "[圖片]")
    // 換行標籤先轉成真正的換行，再拿掉其餘標籤
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li)>/gi, "\n")
    .replace(/<\/?[a-zA-Z][^>]*>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** 把一條訊息濃縮成一段文字，給聊天記錄卡片和 prompt 使用 */
export function summarizeForwardContent(m: ChatScreenMessage): string {
  if (m.isRedpacket) return `[紅包] ${m.redpacketData?.blessing || "恭喜發財"}`;
  if (m.isTransfer) {
    const label = m.transferType === "refund" ? "退款" : "轉帳";
    return `[${label} ${m.transferAmount ?? ""}]${m.transferNote ? ` ${m.transferNote}` : ""}`;
  }
  if (m.isGift) return `[禮物：${m.giftName || ""}]`;
  if (m.isLocation) return `[位置] ${m.locationContent || ""}`;
  if (m.isMusicShare && m.musicShareData) {
    return `[分享歌曲] ${m.musicShareData.name}${m.musicShareData.artist ? ` - ${m.musicShareData.artist}` : ""}`;
  }
  if (m.isGroupChatHistory && m.groupChatHistoryData) {
    return `[聊天記錄] ${m.groupChatHistoryData.groupName}的聊天記錄`;
  }
  if (m.isGroupCallHistory) return "[群通話記錄]";
  if (m.isPhoneCallHistory) return "[通話記錄]";
  if (m.isCallNotification) return "[通話]";
  if (
    m.isWaimaiShare ||
    m.isWaimaiPaymentRequest ||
    m.isWaimaiPaymentConfirm ||
    m.isWaimaiPaymentResult ||
    m.isWaimaiProgress ||
    m.isWaimaiDelivery
  ) {
    return "[外送]";
  }
  if (m.isFaceToFaceRequest) return "[面對面邀請]";
  if (m.isOnlineModeRequest) return "[線上模式邀請]";
  if (m.messageType === "audio" || m.audioBlobId) {
    return m.audioTranscript ? `[語音] ${m.audioTranscript}` : "[語音]";
  }
  if (m.messageType === "descriptive-video") {
    return `[影片${m.imageCaption ? `：${m.imageCaption}` : ""}]`;
  }
  if (
    m.messageType === "image" ||
    m.messageType === "descriptive-image" ||
    m.messageType === "image-url" ||
    m.imageUrl
  ) {
    const caption = m.imageCaption || m.imagePrompt;
    const text = stripMarkup(m.content || "");
    return `[圖片${caption ? `：${caption}` : ""}]${text ? ` ${text}` : ""}`;
  }
  if (m.isHtmlBlock) return "[網頁卡片]";
  return stripMarkup(m.content || "") || "[訊息]";
}

/**
 * 拆出訊息裡的貼圖與圖片，讓聊天記錄查看頁能直接顯示。
 * 沒有任何貼圖或圖片時回傳 undefined，查看頁就用純文字。
 */
export function extractRecordParts(
  m: ChatScreenMessage,
  resolveStickerUrl: (name: string) => string | undefined,
): ChatHistoryRecordPart[] | undefined {
  // 實際照片多半存成 IndexedDB 引用，換了聊天就讀不到，只收網址或 data URL
  if (m.imageUrl && /^(https?:|data:image\/)/.test(m.imageUrl)) {
    const parts: ChatHistoryRecordPart[] = [
      { type: "image", url: m.imageUrl, name: m.imageCaption },
    ];
    const text = stripMarkup(m.content || "");
    if (text) parts.push({ type: "text", text });
    return parts;
  }

  // 與 MessageBubble 相同：先把各種貼圖寫法統一成 [sticker:名稱]
  const content = (m.content || "")
    .replace(/<sticker\s+name="([^"]+)"\s*\/?>(<\/sticker>)?/gi, "[sticker:$1]")
    .replace(/<sticker:([^/>]+)\s*\/>/gi, "[sticker:$1]")
    .replace(/<sticker>([^<]+)<\/sticker>/gi, "[sticker:$1]")
    .replace(/<sticker:([^>/<]+)>/gi, "[sticker:$1]");

  const mediaRegex = /\[(img|sticker|表情包):(.*?)\]/g;
  const parts: ChatHistoryRecordPart[] = [];
  let lastIndex = 0;
  let hasMedia = false;
  let match: RegExpExecArray | null;
  const pushText = (raw: string) => {
    const text = stripMarkup(raw);
    if (text) parts.push({ type: "text", text });
  };

  while ((match = mediaRegex.exec(content)) !== null) {
    pushText(content.slice(lastIndex, match.index));
    hasMedia = true;
    if (match[1] === "img") {
      const [first, second] = match[2].split("|");
      parts.push(
        second
          ? { type: "image", url: second.trim(), name: first.trim() }
          : { type: "image", url: first.trim() },
      );
    } else {
      const [name, providedUrl] = match[2].split("|");
      parts.push({
        type: "sticker",
        name: name.trim(),
        url: providedUrl?.trim() || resolveStickerUrl(name.trim()) || "",
      });
    }
    lastIndex = match.index + match[0].length;
  }
  pushText(content.slice(lastIndex));

  return hasMedia ? parts : undefined;
}

export interface ForwardRecordItem {
  senderName: string;
  isUser: boolean;
  timestamp: number;
  content: string;
  parts?: ChatHistoryRecordPart[];
}

/**
 * 組出合併轉發的卡片資料與給 AI 看的文字內容。
 * 卡片顯示用 groupChatHistoryData；content 存成純文字，讓角色在 prompt 裡讀得到記錄。
 */
export function buildForwardRecord(
  title: string,
  items: ForwardRecordItem[],
  senderAvatars?: Record<string, string>,
): {
  content: string;
  groupChatHistoryData: ChatHistoryRecordData;
} {
  const trimmed = items.map(({ parts, ...item }) => ({
    ...item,
    ...(parts ? { parts } : {}),
    content:
      item.content.length > RECORD_ITEM_MAX_CHARS
        ? `${item.content.slice(0, RECORD_ITEM_MAX_CHARS)}…`
        : item.content,
  }));
  const lines = trimmed.map(
    (item) =>
      `[${dayjs(item.timestamp).format("MM/DD HH:mm")}] ${item.senderName}：${item.content}`,
  );
  const content = [
    `[聊天記錄] ${title}的聊天記錄`,
    `<轉發的聊天記錄 標題="${title}">`,
    ...lines,
    "</轉發的聊天記錄>",
  ].join("\n");
  return {
    content,
    groupChatHistoryData: {
      groupName: title,
      messages: trimmed,
      ...(senderAvatars && Object.keys(senderAvatars).length > 0 ? { senderAvatars } : {}),
    },
  };
}

/** 逐條轉發的訊息送進 prompt 時，標出它是從哪裡轉來的 */
export function formatForwardedForPrompt(
  content: string,
  forwardedFrom: ForwardedFrom,
): string {
  return `[轉發自「${forwardedFrom.chatName}」，原發送者：${forwardedFrom.senderName}]\n${content}`;
}
