export interface MessageTTSInput {
  content: string;
  ttsRawContent?: string;
}

export interface MessageTTSCandidate {
  role: "user" | "ai" | "system";
  content: string;
}

export function getMessageTTSSource(message: MessageTTSInput): string {
  return message.ttsRawContent?.trim() || message.content.trim();
}

export function canRegenerateMessageTTS(
  message: MessageTTSCandidate,
): boolean {
  return message.role === "ai" && message.content.trim().length > 0;
}
