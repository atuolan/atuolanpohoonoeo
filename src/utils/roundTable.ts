import type { GroupChatMetadata, RoundTableOrder } from "@/types/chat";

/**
 * 群聊圓桌模式：每個成員用自己綁的 API，一人一次呼叫、輪流發言。
 * 沿用整條群聊流程，只是每次呼叫限定一位發言人、只留他的訊息。
 */

/** 這輪沒話說時讓模型輸出的記號，解析後丟掉 */
export const ROUND_TABLE_PASS = "<pass/>";

/** 主持人決定這一輪結束 */
export const ROUND_TABLE_HOST_END = "結束";

/** 「模型本人」成員的人設 */
export const MODEL_SELF_DESCRIPTION =
  "（模型本人）不扮演任何角色，以這個 AI 模型自己的身分、知識和觀點參與群組討論。可以同意、補充或反駁其他成員，講出自己真正的看法；不用假裝是人類，也不用編造私生活。";

export const ROUND_TABLE_ORDER_LABELS: Record<RoundTableOrder, string> = {
  relay: "接力（輪流講，看得到前面的人）",
  parallel: "各自作答（這一輪互相看不到）",
  host: "主持人（由主持人點下一位）",
  mention: "只有被 @ 的講",
};

export interface RoundTableSpeaker {
  characterId: string;
  name: string;
  avatar: string;
  apiProfileId?: string;
  fallbackApiProfileId?: string;
}

export function isRoundTableActive(meta: GroupChatMetadata | null | undefined): boolean {
  return !!meta && !meta.isMultiCharCard && meta.roundTable?.enabled === true;
}

/**
 * 這一輪誰講、照什麼順序：被 @ 的先講，其餘照成員順序；有上限就截掉（被 @ 的不受限）。
 * mentionOnly：只有被 @ 的講；沒人被 @ 就全部照順序。
 */
export function orderRoundTableSpeakers<T extends { name: string }>(
  speakers: readonly T[],
  mentionedNames: readonly string[],
  maxSpeakers?: number,
  mentionOnly = false,
): T[] {
  const mentioned = mentionedNames
    .map((name) => speakers.find((s) => s.name === name))
    .filter((s): s is T => !!s);
  if (mentionOnly && mentioned.length > 0) return mentioned;
  const rest = speakers.filter((s) => !mentioned.includes(s));
  const ordered = [...mentioned, ...rest];
  return maxSpeakers && maxSpeakers > 0 ? ordered.slice(0, Math.max(maxSpeakers, mentioned.length)) : ordered;
}

export function buildRoundTableInstruction(
  speakerName: string,
  otherNames: readonly string[],
  userName: string,
  options: { style?: "chat" | "long"; independent?: boolean } = {},
): string {
  const others = [...otherNames, userName].map((n) => `「${n}」`).join("、");
  const lines = [
    `[圓桌] 這一輪只由「${speakerName}」發言。你只扮演 ${speakerName}，照群聊格式只輸出 ${speakerName} 的訊息（可以多則）。`,
    `不要替${others}發言，他們會自己回覆。`,
    options.independent
      ? `這一輪大家各自作答，你看不到其他成員這一輪的回答，請直接講你自己的看法。`
      : `可以回應、補充或反駁前面其他人說的話。`,
  ];
  if (options.style === "long") {
    lines.push(`這是一場討論：可以寫長一點、條列重點、把理由講清楚，不必拘泥聊天短句。`);
  }
  lines.push(`如果 ${speakerName} 這一輪真的沒什麼要說，只輸出 ${ROUND_TABLE_PASS}。`);
  return lines.join("\n");
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

// ===== 主持人 =====

/** 主持人看的最近對話：每則截短，最多 maxItems 則 */
export function buildHostTranscript(
  items: readonly { speaker: string; content: string }[],
  maxItems = 12,
  maxChars = 300,
): string {
  return items
    .slice(-maxItems)
    .map(({ speaker, content }) => {
      const text = content.replace(/\s+/g, " ").trim();
      return `${speaker}：${text.length > maxChars ? `${text.slice(0, maxChars)}…` : text}`;
    })
    .join("\n");
}

export function buildHostMessages(
  transcript: string,
  memberNames: readonly string[],
  spokenThisRound: readonly string[],
): { role: "system" | "user"; content: string }[] {
  return [
    {
      role: "system",
      content: [
        "你是群組討論的主持人。看最近的對話，決定下一位最適合發言的成員，讓討論有來有往、不重複。",
        "被點名、被反駁、還沒表達過看法的成員優先；同一個人不要連續講。",
        `只輸出一個成員名字。如果這一輪已經夠了（大家都講過、沒有新東西），只輸出「${ROUND_TABLE_HOST_END}」。`,
      ].join("\n"),
    },
    {
      role: "user",
      content: [
        `成員：${memberNames.join("、")}`,
        `這一輪已經發言：${spokenThisRound.length ? spokenThisRound.join("、") : "（還沒有）"}`,
        "最近對話：",
        transcript || "（沒有）",
        "",
        `下一位是誰？只輸出名字或「${ROUND_TABLE_HOST_END}」。`,
      ].join("\n"),
    },
  ];
}

/** 從主持人的回答找出名字；說結束或對不到人 → null */
export function parseHostDecision(text: string, memberNames: readonly string[]): string | null {
  const cleaned = text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  if (!cleaned) return null;
  // 長的名字先比，避免「小明」吃掉「小明明」
  const byLength = [...memberNames].sort((a, b) => b.length - a.length);
  const exact = byLength.find((n) => cleaned === n);
  if (exact) return exact;
  const found = byLength
    .map((n) => ({ n, at: cleaned.indexOf(n) }))
    .filter((x) => x.at !== -1)
    .sort((a, b) => a.at - b.at)[0];
  return found ? found.n : null;
}
