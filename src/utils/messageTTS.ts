import { cleanTTSTags } from "@/utils/ttsTagCleaner";

export interface MessageTTSInput {
  content: string;
  ttsRawContent?: string;
}

export interface MessageTTSCandidate {
  role: "user" | "ai" | "system";
  content: string;
}

function stripAudioMessagePrefix(text: string): string {
  return text.replace(/^\[語音訊息\]\s*/i, "").trim();
}

export function getMessageTTSSource(message: MessageTTSInput): string {
  const content = stripAudioMessagePrefix(message.content.trim());
  const raw = stripAudioMessagePrefix(message.ttsRawContent?.trim() || "");
  if (!raw) return content;

  // 保留目前訊息相同的舊語氣/停頓標記，但不要沿用不一致的舊原文。
  const cleanContent = cleanTTSTags(content);
  const cleanRaw = cleanTTSTags(raw);
  if (cleanContent === cleanRaw) return raw;

  // 兩份文字無法對齊時，以目前氣泡內容為準，避免舊音訊來源帶入額外句子。
  return content;
}

export function canRegenerateMessageTTS(
  message: MessageTTSCandidate,
): boolean {
  return message.role === "ai" && message.content.trim().length > 0;
}
