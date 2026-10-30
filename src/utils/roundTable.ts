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
  stance?: string;
  assignment?: string;
}

/** 有填身份與工作的成員整理成一行（給提示詞用）；都沒填回空字串 */
export function formatRoundTableAssignments(
  speakers: readonly { name: string; assignment?: string }[],
): string {
  return speakers
    .map((s) => ({ name: s.name, assignment: (s.assignment || "").replace(/\s+/g, " ").trim() }))
    .filter((s) => s.assignment)
    .map((s) => `${s.name}＝${s.assignment}`)
    .join("；");
}

export function isRoundTableActive(meta: GroupChatMetadata | null | undefined): boolean {
  return !!meta && !meta.isMultiCharCard && meta.roundTable?.enabled === true;
}

/** 照自訂的發言順序排；沒排過的（後來加入的）照原本順序接在後面 */
export function sortByRoundTableOrder<T extends { characterId: string }>(
  members: readonly T[],
  speakerOrder: readonly string[] | undefined,
): T[] {
  if (!speakerOrder?.length) return [...members];
  const rank = (m: T) => {
    const at = speakerOrder.indexOf(m.characterId);
    return at === -1 ? speakerOrder.length : at;
  };
  return [...members].sort((a, b) => rank(a) - rank(b));
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
  options: {
    style?: "chat" | "long";
    independent?: boolean;
    /** 使用者私下傳給這位成員的悄悄話 */
    whisper?: boolean;
    /** 辯論立場 */
    stance?: string;
    /** 這位成員的身份與工作 */
    assignment?: string;
    /** 接力：這一輪前面成員說的話（照順序） */
    earlierReplies?: readonly { speaker: string; content: string }[];
  } = {},
): string {
  const others = [...otherNames, userName].map((n) => `「${n}」`).join("、");
  const earlier = (options.earlierReplies || []).filter((r) => r.content.trim());
  const lines: string[] = [];
  if (earlier.length) {
    lines.push(
      "[圓桌] 這一輪前面的人已經說了：",
      ...earlier.map((r) => `[${r.speaker}] ${r.content.trim().slice(0, 1500)}`),
      "",
    );
  }
  lines.push(
    `[圓桌] 這一輪只由「${speakerName}」發言。你只扮演 ${speakerName}，照群聊格式只輸出 ${speakerName} 的訊息（可以多則）。`,
    `不要替${others}發言，他們會自己回覆。`,
    options.independent
      ? `這一輪大家各自作答，你看不到其他成員這一輪的回答，請直接講你自己的看法。`
      : `可以回應、補充或反駁前面其他人說的話。`,
  );
  if (options.assignment?.trim()) {
    lines.push(
      `${speakerName} 在這場討論的身份與工作：${options.assignment.trim()}`,
      `照這個身份發言，專心做好自己負責的部分。`,
    );
  }
  if (options.stance?.trim()) {
    lines.push(
      `這是一場辯論，${speakerName} 的立場是「${options.stance.trim()}」：堅持這個立場、提出論據，並回應對方的論點。`,
    );
  }
  if (options.whisper) {
    lines.push(
      `這一輪是 ${userName} 私下傳給 ${speakerName} 的悄悄話，其他成員看不到；${speakerName} 的回覆也只有 ${userName} 看得到，可以講不方便在群裡講的話。`,
    );
  }
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

/** 用量小字：12 次・輸入 34.5k／輸出 2.1k tokens */
export function formatRoundTableUsage(usage: { calls: number; promptTokens: number; completionTokens: number }): string {
  const k = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));
  return `${usage.calls} 次・輸入 ${k(usage.promptTokens)}／輸出 ${k(usage.completionTokens)} tokens`;
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
  assignments = "",
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
        ...(assignments ? [`分工：${assignments}（照討論進度點該接手工作的成員）`] : []),
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

// ===== 討論工具：整理討論、裁判結論、互評投票 =====

function stripThink(text: string): string {
  return text.replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi, "").trim();
}

export function buildSummaryMessages(
  transcript: string,
  speakers: readonly { name: string; stance?: string; assignment?: string }[],
  verdict: boolean,
): { role: "system" | "user"; content: string }[] {
  const stances = speakers.filter((s) => s.stance?.trim());
  const assignments = formatRoundTableAssignments(speakers);
  const system = verdict
    ? [
        "你是這場群組討論的裁判，立場中立。看完討論，判定哪一方（或哪一位）的論證比較有說服力，理由要具體，指出關鍵論點和漏洞。",
        "用繁體中文，照這個格式輸出（不要多餘的開場白）：",
        "【裁決】一句話講結果",
        "【理由】條列 2–4 點",
        "【各方表現】- 名字：一句評語",
      ]
    : [
        "你是會議記錄員。把這段群組討論整理成重點，不加入自己的意見。",
        "用繁體中文，照這個格式輸出（不要多餘的開場白；沒有的段落寫「無」）：",
        "【共識】條列",
        "【分歧】條列，寫清楚誰站哪邊",
        "【各自的獨到觀點】- 名字：一句",
        "【結論／下一步】一到兩句",
      ];
  const user = [
    `成員：${speakers.map((s) => s.name).join("、")}`,
    ...(stances.length ? [`立場：${stances.map((s) => `${s.name}＝${s.stance!.trim()}`).join("；")}`] : []),
    ...(assignments ? [`分工：${assignments}`] : []),
    "討論內容：",
    transcript || "（沒有）",
  ];
  return [
    { role: "system", content: system.join("\n") },
    { role: "user", content: user.join("\n") },
  ];
}

export function buildVoteMessages(
  voter: string,
  answers: readonly { speaker: string; content: string }[],
): { role: "system" | "user"; content: string }[] {
  const candidates = answers.map((a) => a.speaker).filter((n) => n !== voter);
  return [
    {
      role: "system",
      content: `你是「${voter}」，正在參加一場群組討論的互評投票。從其他成員這一輪的回答裡，選出你覺得最好的一個（不能投自己），並用一句話說明理由。`,
    },
    {
      role: "user",
      content: [
        "這一輪的回答：",
        ...answers.map((a) => `[${a.speaker}] ${a.content.replace(/\s+/g, " ").trim().slice(0, 1200)}`),
        "",
        `可以投的人：${candidates.join("、")}`,
        "只輸出一行，格式：名字｜理由",
      ].join("\n"),
    },
  ];
}

/** 解析一票：「名字｜理由」；格式跑掉時找第一個出現的候選人。投自己或對不到 → null */
export function parseVote(
  text: string,
  candidates: readonly string[],
  voter: string,
): { vote: string; reason: string } | null {
  const cleaned = stripThink(text);
  const allowed = candidates.filter((n) => n !== voter);
  if (!cleaned || allowed.length === 0) return null;
  const line = cleaned.split("\n").find((l) => /[｜|]/.test(l)) ?? cleaned.split("\n")[0];
  const [head, ...rest] = line.split(/[｜|]/);
  const vote = parseHostDecision(head, allowed) ?? parseHostDecision(cleaned, allowed);
  if (!vote) return null;
  const reason = rest.join("｜").trim() || cleaned.replace(vote, "").replace(/^[\s:：｜|]+/, "").trim();
  return { vote, reason: reason.slice(0, 120) };
}

export function tallyVotes(
  votes: readonly { voter: string; vote: string; reason: string }[],
): { body: string; winner?: string } {
  if (votes.length === 0) return { body: "沒有人投出有效的一票。" };
  const counts = new Map<string, number>();
  for (const v of votes) counts.set(v.vote, (counts.get(v.vote) ?? 0) + 1);
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const top = ranked[0][1];
  const winners = ranked.filter(([, n]) => n === top).map(([name]) => name);
  const lines = votes.map((v) => `${v.voter} → ${v.vote}${v.reason ? `：${v.reason}` : ""}`);
  const result = ranked.map(([name, n]) => `${name} ${n} 票`).join("、");
  return {
    body: [...lines, "", `結果：${result}${winners.length > 1 ? "（平手）" : ""}`].join("\n"),
    winner: winners.length === 1 ? winners[0] : undefined,
  };
}

