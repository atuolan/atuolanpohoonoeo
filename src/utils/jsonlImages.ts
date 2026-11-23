/**
 * JSONL（SillyTavern 相容）匯出／匯入的圖片：
 * 圖片放在 SillyTavern 也認得的 extra.image（data URL 或網址），說明放 extra.title；
 * 本 App 自己的欄位（文生圖提示詞、圖片備註）用 SillyTavern 不認得、會略過的 key。
 */
import type { ChatMessage } from "@/types/chat";

export interface JsonlImageExtra {
  image?: string;
  title?: string;
  image_prompt?: string;
  image_negative_prompt?: string;
  image_note?: string;
}

type ImageMessageType = "image" | "image-url";

const DATA_URL = /^data:(image\/[a-z0-9.+-]+);base64,(.+)$/is;

/** 訊息的圖片轉成可以放進 JSONL 的字串：data URL 優先，其次網址；沒有圖回傳 undefined */
export function messageImageToJsonl(msg: Pick<ChatMessage, "imageUrl" | "imageData" | "imageMimeType">): string | undefined {
  if (msg.imageUrl?.startsWith("data:")) return msg.imageUrl;
  if (msg.imageData) {
    if (msg.imageData.startsWith("data:")) return msg.imageData;
    // 還原失敗留下的 chatimg 引用不是圖片內容
    if (!msg.imageData.startsWith("chatimg_")) {
      return `data:${msg.imageMimeType || "image/png"};base64,${msg.imageData.replace(/\s+/g, "")}`;
    }
  }
  if (msg.imageUrl && /^https?:\/\//i.test(msg.imageUrl)) return msg.imageUrl;
  return undefined;
}

/** 匯出：這則訊息要加進 extra 的圖片欄位；沒有圖回傳 undefined */
export function buildJsonlImageExtra(msg: ChatMessage): JsonlImageExtra | undefined {
  const image = messageImageToJsonl(msg);
  if (!image) return undefined;
  const extra: JsonlImageExtra = { image };
  if (msg.imageCaption) extra.title = msg.imageCaption;
  if (msg.imagePrompt) extra.image_prompt = msg.imagePrompt;
  if (msg.imageNegativePrompt) extra.image_negative_prompt = msg.imageNegativePrompt;
  if (msg.imageNote) extra.image_note = msg.imageNote;
  return extra;
}

const text = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim() ? value.trim() : undefined;

/**
 * 匯入：extra 裡有圖片就寫回訊息（data URL 拆成 imageData 給模型看圖用）。
 * 認不得的圖片（例如 SillyTavern 伺服器上的相對路徑）略過。回傳有沒有讀到圖。
 */
export function applyJsonlImageExtra(message: ChatMessage, extra: unknown): boolean {
  if (!extra || typeof extra !== "object") return false;
  const data = extra as Record<string, unknown>;
  const image = text(data.image);
  if (!image) return false;

  const dataUrl = image.match(DATA_URL);
  if (dataUrl) {
    message.imageUrl = `data:${dataUrl[1]};base64,${dataUrl[2].replace(/\s+/g, "")}`;
    message.imageData = dataUrl[2].replace(/\s+/g, "");
    message.imageMimeType = dataUrl[1];
    // 帶著圖片資料的一律是一般圖片
    message.messageType = "image" satisfies ImageMessageType;
  } else if (/^https?:\/\//i.test(image)) {
    message.imageUrl = image;
    message.messageType = "image-url" satisfies ImageMessageType;
  } else {
    return false;
  }

  const caption = text(data.title);
  if (caption) message.imageCaption = caption;
  const prompt = text(data.image_prompt);
  if (prompt) message.imagePrompt = prompt;
  const negative = text(data.image_negative_prompt);
  if (negative) message.imageNegativePrompt = negative;
  const note = text(data.image_note);
  if (note) message.imageNote = note;
  return true;
}
