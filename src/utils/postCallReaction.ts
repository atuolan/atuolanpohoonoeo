/**
 * Post-Call Reaction utilities
 *
 * Pure functions for building post-call notification cards and prompts.
 * Extracted for testability.
 */

export type CallNotificationType = "declined" | "missed" | "busy";

export interface CallNotificationCard {
  id: string;
  role: "system";
  content: string;
  timestamp: number;
  isCallNotification: true;
  callNotificationType: CallNotificationType;
  callReason: string;
}

/**
 * Creates a call notification card message object.
 */
export function createCallNotificationCard(
  type: CallNotificationType,
  characterName: string,
  reason: string,
  timestamp?: number,
): CallNotificationCard {
  const ts = timestamp ?? Date.now();
  let content: string;
  if (type === "declined") {
    content = `📞 已拒接 ${characterName} 的來電`;
  } else if (type === "busy") {
    content = `📞 ${characterName} 來電未接通（通話中）`;
  } else {
    content = `📞 ${characterName} 的未接來電`;
  }
  return {
    id: `msg_${ts}`,
    role: "system",
    content,
    timestamp: ts,
    isCallNotification: true,
    callNotificationType: type,
    callReason: reason,
  };
}

/**
 * Builds the post-call prompt injected into the AI generation context.
 * Pure function — no side effects.
 */
export function buildPostCallPrompt(
  type: CallNotificationType,
  reason: string,
  characterName: string,
  userName: string,
): string {
  if (type === "declined") {
    return `[系統情境] ${characterName} 剛才打電話給 ${userName}，但 ${userName} 看到來電後按了拒接。
來電原因：${reason}
請以 ${characterName} 的身份，用普通聊天訊息的方式回覆。${characterName} 知道 ${userName} 是故意不接的。
注意：這是文字訊息，不是電話通話。請使用正常的聊天輸出格式回覆。`;
  } else if (type === "busy") {
    return `[系統情境] ${characterName} 剛才打電話給 ${userName}，但 ${userName} 正在和別人通話中，電話沒有接通。
來電原因：${reason}
請以 ${characterName} 的身份，用普通聊天訊息的方式回覆。${characterName} 聽到了忙線音，知道 ${userName} 正在通話中。
注意：這是文字訊息，不是電話通話。請使用正常的聊天輸出格式回覆。`;
  } else {
    return `[系統情境] ${characterName} 剛才打電話給 ${userName}，電話響了很久都沒人接。
來電原因：${reason}
請以 ${characterName} 的身份，用普通聊天訊息的方式回覆。${characterName} 不確定 ${userName} 是在忙還是沒看到。
注意：這是文字訊息，不是電話通話。請使用正常的聊天輸出格式回覆。`;
  }
}
