import type { GroupChatMetadata } from "@/types/chat";

/**
 * 群聊圓桌模式：每個成員用自己綁的 API，一人一次呼叫、輪流發言。
 * 沿用整條群聊流程，只是每次呼叫限定一位發言人、只留他的訊息。
 */

/** 這輪沒話說時讓模型輸出的記號，解析後丟掉 */
export const ROUND_TABLE_PASS = "<pass/>";

export interface RoundTableSpeaker {
  characterId: string;
  name: string;
  avatar: string;
  apiProfileId?: string;
}

export function isRoundTableActive(meta: GroupChatMetadata | null | undefined): boolean {
  return !!meta && !meta.isMultiCharCard && meta.roundTable?.enabled === true;
}

/** 接力順序：被 @ 的先講，其餘照成員順序；有上限就截掉 */
export function orderRoundTableSpeakers<T extends { name: string }>(
  speakers: readonly T[],
  mentionedNames: readonly string[],
  maxSpeakers?: number,
): T[] {
  const mentioned = mentionedNames
    .map((name) => speakers.find((s) => s.name === name))
    .filter((s): s is T => !!s);
  const rest = speakers.filter((s) => !mentioned.includes(s));
  const ordered = [...mentioned, ...rest];
  return maxSpeakers && maxSpeakers > 0 ? ordered.slice(0, Math.max(maxSpeakers, mentioned.length)) : ordered;
}

export function buildRoundTableInstruction(
  speakerName: string,
  otherNames: readonly string[],
  userName: string,
): string {
  const others = [...otherNames, userName].map((n) => `「${n}」`).join("、");
  return [
    `[圓桌] 這一輪只由「${speakerName}」發言。你只扮演 ${speakerName}，照群聊格式只輸出 ${speakerName} 的訊息（可以多則）。`,
    `不要替${others}發言，他們會自己回覆。可以回應、補充或反駁前面其他人說的話。`,
    `如果 ${speakerName} 這一輪真的沒什麼要說，只輸出 ${ROUND_TABLE_PASS}。`,
  ].join("\n");
}

function isPass(content: string | undefined): boolean {
  return (content || "").trim() === ROUND_TABLE_PASS;
}

/**
 * 解析後只留這位發言人的訊息（含他做的群管理動作）。
 * 模型漏寫名字的訊息算他的；寫成別人的一律丟掉。
 */
export function pickRoundTableMessages<
  T extends { senderName: string; content?: string; isGroupAction?: boolean; groupActionActor?: string },
>(messages: readonly T[], isSpeaker: (name: string) => boolean, speakerName: string): T[] {
  const picked: T[] = [];
  for (const msg of messages) {
    if (isPass(msg.content)) continue;
    const name = (msg.senderName || "").trim();
    if (msg.isGroupAction) {
      if (isSpeaker(msg.groupActionActor || name)) picked.push(msg);
      continue;
    }
    if (!name) {
      picked.push({ ...msg, senderName: speakerName });
    } else if (isSpeaker(name)) {
      picked.push(msg);
    }
  }
  return picked;
}
