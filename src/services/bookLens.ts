/**
 * 閱讀 App「觀點鏡頭」：選一段文字，換不同鏡頭看，可以接著追問
 * 只送引文前後、讀到的位置以前的內容，不捏造出處（只標我們自己知道的「第 N 段」）
 */

import type { APIMessage } from "@/api/OpenAICompatible";
import { askAI, extractJson } from "@/services/BookAIService";

export type LensId = "plain" | "philosopher" | "history" | "devil";

export interface LensDef {
  id: LensId;
  label: string;
  /** 給 AI 的鏡頭說明 */
  instruction: string;
  /** 存成記憶卡時的問題 */
  cardQuestion: string;
}

export const LENSES: LensDef[] = [
  {
    id: "plain",
    label: "白話",
    instruction: "用現代口語把這段話翻成白話，說清楚它在講什麼；有難懂的字詞順便解釋。",
    cardQuestion: "這段話用白話說是什麼意思？",
  },
  {
    id: "philosopher",
    label: "哲學家",
    instruction: "用哲學的角度讀這段：它碰到什麼根本問題、背後有什麼主張，可以拿哪些思想家或流派對照。",
    cardQuestion: "從哲學的角度，這段在談什麼問題？",
  },
  {
    id: "history",
    label: "歷史背景",
    instruction: "說明理解這段需要的時代與文化背景：當時的社會、典故、作者處境。不確定的地方要直說不確定，不要編造出處或引文。",
    cardQuestion: "理解這段需要知道什麼背景？",
  },
  {
    id: "devil",
    label: "唱反調",
    instruction: "站在反對的一方，提出這段話最有力的反駁或漏洞，最後一句再公平地說它站得住的地方。",
    cardQuestion: "這段話可以怎麼反駁？",
  },
];

export function lensById(id: LensId): LensDef {
  return LENSES.find((l) => l.id === id) ?? LENSES[0];
}

export interface LensTurn {
  /** 追問的問題；第一次換鏡頭時沒有 */
  question?: string;
  answer: string;
  followUp?: string;
}

export interface LensInput {
  bookTitle: string;
  author?: string;
  chapterTitle: string;
  quote: string;
  /** 引文前面的原文 */
  before: string;
  /** 引文後面、還在讀到的位置以內的原文 */
  after: string;
  /** 前情摘要（排版好的文字，可以是空字串） */
  summaries: string;
  lens: LensId;
}

/** 引文前後的上下文：前面最多 beforeChars 字，後面最多 afterChars 字但不超過 readEnd */
export function lensContext(
  content: string,
  start: number,
  end: number,
  readEnd: number,
  beforeChars = 1500,
  afterChars = 500,
): { before: string; after: string } {
  const limit = Math.max(end, Math.min(readEnd, content.length));
  const from = Math.max(0, start - beforeChars);
  const to = Math.min(limit, end + afterChars);
  return {
    before: `${from > 0 ? "……" : ""}${content.slice(from, start)}`,
    after: content.slice(end, to),
  };
}

export function buildLensPrompt(input: LensInput, history: LensTurn[] = [], question?: string): APIMessage[] {
  const lens = lensById(input.lens);
  const material = [
    `書名：《${input.bookTitle}》${input.author ? `\n作者：${input.author}` : ""}`,
    `章節：${input.chapterTitle}`,
    input.summaries ? `前情摘要：\n${input.summaries}` : "",
    `引文前後的原文（讀者讀到這裡為止）：\n${input.before}【${input.quote}】${input.after}`,
    `讀者選的引文：「${input.quote}」`,
    `請用「${lens.label}」的鏡頭看這段：${lens.instruction}`,
  ]
    .filter(Boolean)
    .join("\n\n");

  const messages: APIMessage[] = [
    {
      role: "system",
      content: [
        "你是讀書夥伴，幫讀者換個角度讀他選的一段文字。",
        "只能根據讀者已經讀到的內容，不可以透露或暗示後面的情節。",
        "不要捏造出處、頁碼或引文；不確定就說不確定。",
        "用繁體中文，口吻像朋友聊天，answer 200 字以內，可以分段。",
        "followUp 是一個讀者可能會想接著問的短問題（20 字以內）。",
        '回傳 JSON：{"answer": "…", "followUp": "…"}，只回 JSON。',
      ].join("\n"),
    },
    { role: "user", content: material },
  ];
  for (const turn of history) {
    if (turn.question) messages.push({ role: "user", content: turn.question });
    messages.push({ role: "assistant", content: JSON.stringify({ answer: turn.answer, followUp: turn.followUp ?? "" }) });
  }
  if (question) messages.push({ role: "user", content: question });
  return messages;
}

/** 解析回答；不是 JSON 時把整段當回答 */
export function parseLens(text: string): { answer: string; followUp?: string } | null {
  const json = extractJson<{ answer?: unknown; followUp?: unknown }>(text);
  if (json && typeof json === "object" && !Array.isArray(json) && typeof json.answer === "string" && json.answer.trim()) {
    const followUp = typeof json.followUp === "string" && json.followUp.trim() ? json.followUp.trim() : undefined;
    return { answer: json.answer.trim(), followUp };
  }
  const plain = text.replace(/```[\s\S]*?```/g, "").trim();
  return plain ? { answer: plain } : null;
}

export async function askLens(input: LensInput, history: LensTurn[], question?: string): Promise<LensTurn> {
  const reply = await askAI(buildLensPrompt(input, history, question), { task: "chat", temperature: 0.7 });
  const parsed = parseLens(reply);
  if (!parsed) throw new Error("AI 沒有回應");
  return { question, ...parsed };
}
