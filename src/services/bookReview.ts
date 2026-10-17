/**
 * 閱讀 App「回顧卡」：從劃線和分段摘要出記憶卡，翻卡自評，用簡化的間隔重複排下次複習
 * 出卡只送劃線所在的段落和摘要，不送整章原文
 */

import type { APIMessage } from "@/api/OpenAICompatible";
import { askAI, extractJson } from "@/services/BookAIService";
import { comparePos } from "@/services/bookSummary";
import type { BookChapter, BookHighlight, BookReviewCard, BookSummary, ReviewGrade } from "@/types/book";
import { splitParagraphs } from "@/utils/bookReading";

const DAY_MS = 86_400_000;
/** 一章最多出幾張 */
export const MAX_CARDS_PER_CHAPTER = 3;

// ===== 排程 =====

/** 自評後的下次間隔（天） */
export function nextInterval(currentDays: number, grade: ReviewGrade): number {
  if (grade === "fuzzy") return 1;
  if (grade === "remember") return Math.max(4, Math.round(currentDays * 2));
  return Math.max(14, Math.round(currentDays * 3.5));
}

/** 當地那天的 0 點 */
function dayStart(ts: number): number {
  const d = new Date(ts);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** 自評一張卡：排到 N 天後那天的 0 點，當天一打開就會出現 */
export function nextReview(card: BookReviewCard, grade: ReviewGrade, now: number): BookReviewCard {
  const intervalDays = nextInterval(card.intervalDays, grade);
  return {
    ...card,
    intervalDays,
    dueAt: dayStart(now + intervalDays * DAY_MS),
    reviews: card.reviews + 1,
    lastGrade: grade,
  };
}

/** 到期的卡，早到期的在前 */
export function dueCards<T extends Pick<BookReviewCard, "dueAt">>(cards: T[] | undefined, now: number): T[] {
  return (cards ?? []).filter((c) => c.dueAt <= now).sort((a, b) => a.dueAt - b.dueAt);
}

/** 自評鈕下面的小字 */
export function intervalLabel(days: number): string {
  if (days <= 1) return "明天再考";
  if (days < 14) return `${days} 天後`;
  if (days < 60) return `${Math.round(days / 7)} 週後`;
  return `${Math.round(days / 30)} 個月後`;
}

/** 「今天」「昨天」「3 天前」 */
export function agoLabel(ts: number, now: number): string {
  const days = Math.round((dayStart(now) - dayStart(ts)) / DAY_MS);
  if (days <= 0) return "今天";
  if (days === 1) return "昨天";
  return `${days} 天前`;
}

export function newCard(
  fields: Pick<BookReviewCard, "source" | "chapterIndex" | "charOffset" | "question" | "answer" | "highlightId">,
  now: number,
  dueInDays = 0,
): BookReviewCard {
  return {
    id: crypto.randomUUID(),
    ...fields,
    createdAt: now,
    dueAt: dueInDays > 0 ? dayStart(now + dueInDays * DAY_MS) : now,
    intervalDays: dueInDays,
    reviews: 0,
  };
}

// ===== 出卡材料 =====

export interface CardHighlightMaterial {
  id: string;
  start: number;
  text: string;
  note?: string;
  /** 劃線所在的整段原文 */
  paragraph: string;
}

export interface ChapterCardMaterial {
  highlights: CardHighlightMaterial[];
  summaries: BookSummary[];
}

/**
 * 一章的出卡材料：這章的劃線（含所在段落）、這章範圍內的摘要
 * @param readEnd 讀到本章第幾個字（章還沒讀完時給）：段落與摘要都不超過這裡
 */
export function chapterCardMaterial(
  chapter: BookChapter,
  chapterIndex: number,
  highlights: BookHighlight[],
  summaries: BookSummary[] | undefined,
  readEnd = Infinity,
): ChapterCardMaterial {
  const paras = splitParagraphs(chapter.content);
  const material = highlights
    .filter((h) => h.start < readEnd)
    .sort((a, b) => a.start - b.start)
    .map((h) => {
      const hit = paras.filter((p) => p.start < h.end && p.start + p.length > h.start);
      const from = hit[0]?.start ?? h.start;
      const last = hit[hit.length - 1];
      const to = Math.max(Math.min(last ? last.start + last.length : h.end, readEnd), h.end);
      return { id: h.id, start: h.start, text: h.text, note: h.note?.trim() || undefined, paragraph: chapter.content.slice(from, to).trim() };
    });
  const chapterStart = { chapterIndex, charOffset: 0 };
  const nextStart = { chapterIndex: chapterIndex + 1, charOffset: 0 };
  // 摘要本來就只總結讀過的地方；章還沒讀完時再保險一次，不拿結尾超過讀到位置的
  const readPos = { chapterIndex, charOffset: readEnd };
  const withinRead = (s: BookSummary) => readEnd === Infinity || comparePos(s.to, readPos) <= 0;
  const inChapter = (summaries ?? [])
    .filter((s) => comparePos(s.from, nextStart) < 0 && comparePos(s.to, chapterStart) > 0 && withinRead(s))
    .sort((a, b) => comparePos(a.from, b.from));
  return { highlights: material, summaries: inChapter };
}

export function hasCardMaterial(m: ChapterCardMaterial): boolean {
  return m.highlights.length > 0 || m.summaries.length > 0;
}

export function buildCardsPrompt(input: {
  bookTitle: string;
  author?: string;
  chapterTitle: string;
  material: ChapterCardMaterial;
}): APIMessage[] {
  const { highlights, summaries } = input.material;
  const parts = [`書名：《${input.bookTitle}》${input.author ? `\n作者：${input.author}` : ""}`, `章節：${input.chapterTitle}`];
  if (highlights.length) {
    parts.push(
      "讀者的劃線：\n" +
        highlights
          .map((h, i) =>
            [`[劃線 ${i + 1}] 「${h.text}」`, h.note ? `讀者的筆記：${h.note}` : "", `所在段落：${h.paragraph}`]
              .filter(Boolean)
              .join("\n"),
          )
          .join("\n\n"),
    );
  }
  if (summaries.length) {
    parts.push("這章的摘要：\n" + summaries.map((s) => `${s.title}\n${s.content}`).join("\n\n"));
  }
  return [
    {
      role: "system",
      content: [
        "你是讀書夥伴，幫讀者把剛讀完的這章做成記憶卡，之後隔幾天考他一次。",
        `最多 ${MAX_CARDS_PER_CHAPTER} 張。有劃線就優先從劃線出題，並在 highlight 填劃線編號；從摘要出的題不要填。`,
        "問題要具體、能從材料裡找到答案，不要問是非題；答案 60 字以內。",
        "只能根據下面的材料，不可以補充或猜測後面的情節。",
        "用繁體中文，回傳 JSON 陣列：[{\"question\": \"…\", \"answer\": \"…\", \"highlight\": 1}]，只回 JSON。",
      ].join("\n"),
    },
    { role: "user", content: parts.join("\n\n") },
  ];
}

export interface ParsedCard {
  question: string;
  answer: string;
  highlightId?: string;
}

/** 解析出卡結果；highlight 編號換回劃線 id（編號對不上就當成從摘要出的） */
export function parseCards(text: string, highlightIds: string[]): ParsedCard[] {
  const json = extractJson<unknown>(text);
  const list = Array.isArray(json) ? json : (json as { cards?: unknown })?.cards;
  if (!Array.isArray(list)) return [];
  const out: ParsedCard[] = [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const { question, answer, highlight } = item as Record<string, unknown>;
    if (typeof question !== "string" || typeof answer !== "string" || !question.trim() || !answer.trim()) continue;
    const n = typeof highlight === "number" ? highlight : typeof highlight === "string" ? Number(highlight) : NaN;
    out.push({ question: question.trim(), answer: answer.trim(), highlightId: highlightIds[n - 1] });
    if (out.length >= MAX_CARDS_PER_CHAPTER) break;
  }
  return out;
}

/** 出一章的卡（一次 AI 呼叫）；新卡都是現在到期，出完馬上可以複習 */
export async function generateChapterCards(input: {
  bookTitle: string;
  author?: string;
  chapterTitle: string;
  chapterIndex: number;
  material: ChapterCardMaterial;
  now?: number;
}): Promise<BookReviewCard[]> {
  if (!hasCardMaterial(input.material)) throw new Error("這章還沒有劃線或摘要");
  const reply = await askAI(buildCardsPrompt(input), { task: "summary", temperature: 0.5 });
  const parsed = parseCards(reply, input.material.highlights.map((h) => h.id));
  if (parsed.length === 0) throw new Error("AI 沒有出好卡，再試一次");
  const now = input.now ?? Date.now();
  const summaryStart = input.material.summaries.find((s) => s.from.chapterIndex === input.chapterIndex)?.from.charOffset ?? 0;
  return parsed.map((p) => {
    const h = input.material.highlights.find((x) => x.id === p.highlightId);
    return newCard(
      {
        source: h ? "highlight" : "summary",
        highlightId: h?.id,
        chapterIndex: input.chapterIndex,
        charOffset: h ? h.start : summaryStart,
        question: p.question,
        answer: p.answer,
      },
      now,
    );
  });
}
