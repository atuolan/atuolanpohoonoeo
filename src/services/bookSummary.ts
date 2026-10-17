/**
 * 閱讀 App「分段摘要」：使用者決定總結哪幾頁，送完整原文給 AI，不裁切
 * 摘要存在 BookReadingProgress.summaries，三句接上、伴讀、回顧卡都會用到
 */

import type { APIMessage } from "@/api/OpenAICompatible";
import { askAI, extractJson } from "@/services/BookAIService";
import type { BookChapter, BookPosition, BookSummary } from "@/types/book";
import { splitParagraphs } from "@/utils/bookReading";

/** 一次呼叫最多送幾個字 */
export const SUMMARY_MAX_CHARS = 20_000;
/** 自動摘要一輪最多打幾次 */
export const AUTO_SUMMARY_MAX_CALLS = 2;
/** 自動摘要連續失敗幾次就暫停 */
export const AUTO_SUMMARY_MAX_FAILURES = 3;

export function comparePos(a: BookPosition, b: BookPosition): number {
  return a.chapterIndex - b.chapterIndex || a.charOffset - b.charOffset;
}

/** 各章開頭在全書的字元位置；最後多一格是全書字數 */
function chapterStarts(chapters: BookChapter[]): number[] {
  const starts = [0];
  for (const c of chapters) starts.push(starts[starts.length - 1] + c.content.length);
  return starts;
}

/** 章節位置 → 全書字元位置（超出範圍會夾住） */
export function toGlobal(chapters: BookChapter[], pos: BookPosition): number {
  if (chapters.length === 0) return 0;
  const ch = Math.min(Math.max(pos.chapterIndex, 0), chapters.length - 1);
  const len = chapters[ch].content.length;
  return chapterStarts(chapters)[ch] + Math.min(Math.max(pos.charOffset, 0), len);
}

/** 全書字元位置 → 章節位置；剛好落在章與章交界時算下一章開頭 */
export function fromGlobal(chapters: BookChapter[], global: number): BookPosition {
  if (chapters.length === 0) return { chapterIndex: 0, charOffset: 0 };
  const starts = chapterStarts(chapters);
  let ch = 0;
  for (let i = 0; i < chapters.length; i++) if (starts[i] <= global) ch = i;
  return { chapterIndex: ch, charOffset: Math.min(Math.max(global - starts[ch], 0), chapters[ch].content.length) };
}

/** 範圍內有幾個字（不含章名） */
export function charsBetween(chapters: BookChapter[], from: BookPosition, to: BookPosition): number {
  return Math.max(0, toGlobal(chapters, to) - toGlobal(chapters, from));
}

/** 取 [from, to) 的原文；每章前面加【章名】，空的章略過 */
export function textBetween(chapters: BookChapter[], from: BookPosition, to: BookPosition): string {
  const a = toGlobal(chapters, from);
  const b = toGlobal(chapters, to);
  if (b <= a) return "";
  const starts = chapterStarts(chapters);
  const parts: string[] = [];
  chapters.forEach((c, i) => {
    const s = Math.max(a, starts[i]) - starts[i];
    const e = Math.min(b, starts[i + 1]) - starts[i];
    if (e <= s) return;
    const text = c.content.slice(s, e).trim();
    if (text) parts.push(`【${c.title}】\n${s > 0 ? "……" : ""}${text}`);
  });
  return parts.join("\n\n");
}

/**
 * 把 [from, to) 依段落切成好幾段，每段不超過 maxChars 字，首尾相接不漏字；
 * 單一段落就超過上限時硬切
 */
export function splitRange(
  chapters: BookChapter[],
  from: BookPosition,
  to: BookPosition,
  maxChars = SUMMARY_MAX_CHARS,
): Array<{ from: BookPosition; to: BookPosition }> {
  const a = toGlobal(chapters, from);
  const b = toGlobal(chapters, to);
  if (b <= a) return [];

  // 可以切的地方：每段開頭、每章開頭
  const starts = chapterStarts(chapters);
  const cuts: number[] = [];
  chapters.forEach((c, i) => {
    cuts.push(starts[i]);
    for (const p of splitParagraphs(c.content)) cuts.push(starts[i] + p.start);
  });
  const candidates = [...new Set(cuts)].filter((g) => g > a && g < b).sort((x, y) => x - y);

  const ranges: Array<{ from: BookPosition; to: BookPosition }> = [];
  let cursor = a;
  let k = 0;
  while (cursor < b) {
    const limit = cursor + Math.max(1, maxChars);
    let end: number;
    if (b <= limit) {
      end = b;
    } else {
      while (k < candidates.length && candidates[k] <= cursor) k++;
      let best = -1;
      for (let j = k; j < candidates.length && candidates[j] <= limit; j++) best = candidates[j];
      end = best > cursor ? best : limit;
    }
    ranges.push({ from: fromGlobal(chapters, cursor), to: fromGlobal(chapters, end) });
    cursor = end;
  }
  return ranges;
}

/** 位置之前（結尾不超過 pos）最近的 n 則，舊的在前 */
export function summariesBefore(summaries: BookSummary[] | undefined, pos: BookPosition, n: number): BookSummary[] {
  if (n <= 0) return [];
  return (summaries ?? [])
    .filter((s) => comparePos(s.to, pos) <= 0)
    .sort((x, y) => comparePos(x.to, y.to) || x.createdAt - y.createdAt)
    .slice(-n);
}

/** 所有摘要裡最後的結尾；沒有摘要回傳 undefined */
export function lastSummaryEnd(summaries: BookSummary[] | undefined): BookPosition | undefined {
  let last: BookPosition | undefined;
  for (const s of summaries ?? []) if (!last || comparePos(s.to, last) > 0) last = s.to;
  return last;
}

/** 依開頭位置排序（摘要列表用） */
export function sortSummaries(summaries: BookSummary[] | undefined): BookSummary[] {
  return [...(summaries ?? [])].sort((x, y) => comparePos(x.from, y.from) || comparePos(x.to, y.to));
}

/** 這次翻頁後要不要自動總結 */
export function shouldAutoSummarize(pagesSince: number, everyPages: number, failures: number): boolean {
  return everyPages > 0 && failures < AUTO_SUMMARY_MAX_FAILURES && pagesSince >= everyPages;
}

/** 摘要拿來當前情提要的文字 */
export function formatSummaries(summaries: BookSummary[], chapters: BookChapter[]): string {
  return summaries
    .map((s) => `【${rangeLabel(s, chapters)}｜${s.title}】\n${s.content}`)
    .join("\n\n");
}

/** 「第 2 章 → 第 3 章」；同一章只寫一次 */
export function rangeLabel(s: Pick<BookSummary, "from" | "to">, chapters: BookChapter[] | string[]): string {
  const title = (i: number) => {
    const c = chapters[i];
    return (typeof c === "string" ? c : c?.title) || `第 ${i + 1} 章`;
  };
  // 結尾剛好在下一章開頭時，其實只涵蓋到前一章
  const endIndex = s.to.charOffset === 0 && s.to.chapterIndex > s.from.chapterIndex ? s.to.chapterIndex - 1 : s.to.chapterIndex;
  return endIndex === s.from.chapterIndex ? title(endIndex) : `${title(s.from.chapterIndex)} → ${title(endIndex)}`;
}

export function buildSummaryPrompt(input: {
  bookTitle: string;
  author?: string;
  text: string;
  previous?: BookSummary;
}): APIMessage[] {
  const head = [`書名：《${input.bookTitle}》`, input.author ? `作者：${input.author}` : ""].filter(Boolean).join("\n");
  const previous = input.previous
    ? `\n\n前一段的摘要（讓你接得上前情，不要重複總結）：\n${input.previous.title}\n${input.previous.content}`
    : "";
  return [
    {
      role: "system",
      content: [
        "你是讀書筆記助手，幫讀者總結他剛讀完的這一段。",
        "只能根據提供的原文，不可以補充或猜測原文以外、後面的情節。",
        "用繁體中文，回傳 JSON：{\"title\": \"一句短標題\", \"content\": \"條列重點\"}",
        "title 不超過 16 字，例如「蜩與學鳩笑大鵬」。",
        "content 用「- 」開頭條列，每條一行，總共不超過 300 字；涵蓋人物、事件、論點與轉折。",
        "只回 JSON，不要其他文字。",
      ].join("\n"),
    },
    {
      role: "user",
      content: `${head}${previous}\n\n以下是要總結的原文：\n\n${input.text}`,
    },
  ];
}

/** 解析摘要；content 給成陣列時接成條列 */
export function parseSummary(text: string): { title: string; content: string } | null {
  const json = extractJson<{ title?: unknown; content?: unknown }>(text);
  if (!json || typeof json !== "object" || Array.isArray(json)) return null;
  const title = typeof json.title === "string" ? json.title.trim() : "";
  const raw = json.content;
  const content = Array.isArray(raw)
    ? raw
        .filter((x): x is string => typeof x === "string" && !!x.trim())
        .map((x) => (/^[-*•]/.test(x.trim()) ? x.trim() : `- ${x.trim()}`))
        .join("\n")
    : typeof raw === "string"
      ? raw.trim()
      : "";
  if (!content) return null;
  return { title: title || content.split("\n")[0].replace(/^[-*•]\s*/, "").slice(0, 16), content };
}

/**
 * 總結 [from, to)：超過上限就分次，每完成一則就呼叫 onEach（讓畫面先存起來）
 * @param existing 已有的摘要（拿前一則接前情）
 * @param maxCalls 最多打幾次，剩下的不做
 * @returns 這次做好的摘要
 */
export async function summarizeRange(input: {
  bookTitle: string;
  author?: string;
  chapters: BookChapter[];
  from: BookPosition;
  to: BookPosition;
  existing?: BookSummary[];
  auto: boolean;
  maxCalls?: number;
  onEach?: (summary: BookSummary, done: number, total: number) => void | Promise<void>;
}): Promise<BookSummary[]> {
  const parts = splitRange(input.chapters, input.from, input.to).slice(0, input.maxCalls ?? Infinity);
  const made: BookSummary[] = [];
  for (const part of parts) {
    const previous = made[made.length - 1] ?? summariesBefore(input.existing, part.from, 1)[0];
    const text = textBetween(input.chapters, part.from, part.to);
    const reply = await askAI(
      buildSummaryPrompt({ bookTitle: input.bookTitle, author: input.author, text, previous }),
      { task: "summary", temperature: 0.3 },
    );
    const parsed = parseSummary(reply);
    if (!parsed) throw new Error("AI 回的摘要格式不對");
    const now = Date.now();
    const summary: BookSummary = {
      id: crypto.randomUUID(),
      from: part.from,
      to: part.to,
      title: parsed.title,
      content: parsed.content,
      auto: input.auto,
      createdAt: now,
      updatedAt: now,
    };
    made.push(summary);
    await input.onEach?.(summary, made.length, parts.length);
  }
  return made;
}
