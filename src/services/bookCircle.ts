/**
 * 閱讀 App「共讀圈」：你和幾個聊天角色在段落上留邊註，AI 主持整理爭議
 * 角色不各自打一次 PromptBuilder，而是一次呼叫挑 1–2 個角色回，省錢
 * 送給 AI 的段落一律只到讀到的位置為止
 */

import type { APIMessage } from "@/api/OpenAICompatible";
import { extractJson } from "@/services/BookAIService";
import type { CircleNote, ReadingCircle } from "@/types/book";

export const HOST_ID = "host";
export const USER_ID = "user";
export const HOST_NAME = "AI 主持";
/** 新留言累積幾則才重算討論摘要 */
export const SUMMARY_REFRESH_NOTES = 3;
export const SYNC_EVERY_OPTIONS = [1, 3, 5, 10] as const;
export const MAX_MEMBERS = 4;

const NO_SPOILER = "只能根據讀者已經讀到的內容，不可以透露或暗示後面的情節。";

export interface CircleMember {
  id: string;
  name: string;
  /** 角色描述與個性（已截短） */
  persona: string;
  /** 從私聊記憶抓的一句 */
  memory?: string;
}

export interface CircleBookInfo {
  bookTitle: string;
  author?: string;
  chapterTitle: string;
  /** 前情摘要（排版好的文字，可以是空字串） */
  summaries: string;
}

export function newCircle(name: string, memberIds: string[], now = Date.now()): ReadingCircle {
  return {
    name: name.trim(),
    memberIds: memberIds.slice(0, MAX_MEMBERS),
    syncReading: false,
    syncEvery: 3,
    pagesSinceSync: 0,
    notes: [],
    createdAt: now,
  };
}

export function newNote(
  fields: Pick<CircleNote, "chapterIndex" | "paraStart" | "quote" | "authorId" | "authorName" | "content" | "parentId">,
  now = Date.now(),
): CircleNote {
  return { id: crypto.randomUUID(), agreeIds: [], createdAt: now, ...fields };
}

// ===== 分組與小工具 =====

export interface CircleThread {
  note: CircleNote;
  replies: CircleNote[];
}

export interface ParagraphGroup {
  key: string;
  chapterIndex: number;
  paraStart: number;
  quote: string;
  threads: CircleThread[];
  /** 這段裡最後一則留言的時間 */
  lastAt: number;
  count: number;
}

export function paraKey(chapterIndex: number, paraStart: number): string {
  return `${chapterIndex}:${paraStart}`;
}

/** 依段落分組，段落照書中位置排；每段裡頂層留言照時間排，回覆跟在底下 */
export function notesByParagraph(notes: CircleNote[]): ParagraphGroup[] {
  const ids = new Set(notes.map((n) => n.id));
  const groups = new Map<string, ParagraphGroup>();
  const sorted = [...notes].sort((a, b) => a.createdAt - b.createdAt);
  for (const n of sorted) {
    const key = paraKey(n.chapterIndex, n.paraStart);
    let g = groups.get(key);
    if (!g) {
      g = { key, chapterIndex: n.chapterIndex, paraStart: n.paraStart, quote: n.quote, threads: [], lastAt: 0, count: 0 };
      groups.set(key, g);
    }
    g.lastAt = Math.max(g.lastAt, n.createdAt);
    g.count++;
    // 回覆的對象被刪掉了就當成頂層
    if (n.parentId && ids.has(n.parentId)) continue;
    g.threads.push({ note: n, replies: [] });
  }
  for (const n of sorted) {
    if (!n.parentId || !ids.has(n.parentId)) continue;
    const g = groups.get(paraKey(n.chapterIndex, n.paraStart));
    const root = rootOf(n, notes);
    g?.threads.find((t) => t.note.id === root.id)?.replies.push(n);
  }
  return [...groups.values()].sort((a, b) => a.chapterIndex - b.chapterIndex || a.paraStart - b.paraStart);
}

/** 回覆的回覆也收在同一串底下 */
function rootOf(note: CircleNote, notes: CircleNote[]): CircleNote {
  let cur = note;
  const seen = new Set<string>();
  while (cur.parentId && !seen.has(cur.id)) {
    seen.add(cur.id);
    const parent = notes.find((n) => n.id === cur.parentId);
    if (!parent) break;
    cur = parent;
  }
  return cur;
}

/** 有留言的段落起點（閱讀器頁邊畫頭像點用） */
export function notedParagraphs(notes: CircleNote[] | undefined, chapterIndex: number): Map<number, string[]> {
  const map = new Map<number, string[]>();
  for (const n of notes ?? []) {
    if (n.chapterIndex !== chapterIndex) continue;
    const list = map.get(n.paraStart) ?? [];
    if (!list.includes(n.authorId)) list.push(n.authorId);
    map.set(n.paraStart, list);
  }
  return map;
}

export function toggleAgree(note: CircleNote, who: string): CircleNote {
  const has = note.agreeIds.includes(who);
  return { ...note, agreeIds: has ? note.agreeIds.filter((x) => x !== who) : [...note.agreeIds, who] };
}

/** 某個成員最近的一則留言 */
export function lastNoteBy(notes: CircleNote[], authorId: string): CircleNote | undefined {
  let last: CircleNote | undefined;
  for (const n of notes) if (n.authorId === authorId && (!last || n.createdAt > last.createdAt)) last = n;
  return last;
}

/** 同步讀時挑誰留言：最久沒說話的（沒說過話的最優先） */
export function pickSyncMember(memberIds: string[], notes: CircleNote[]): string | undefined {
  let pick: string | undefined;
  let pickAt = Infinity;
  for (const id of memberIds) {
    const at = lastNoteBy(notes, id)?.createdAt ?? -1;
    if (at < pickAt) {
      pick = id;
      pickAt = at;
    }
  }
  return pick;
}

export function shouldRefreshSummary(circle: Pick<ReadingCircle, "notes" | "summary">): boolean {
  return circle.notes.length - (circle.summary?.noteCount ?? 0) >= SUMMARY_REFRESH_NOTES;
}

// ===== 提示詞 =====

function bookHead(info: CircleBookInfo): string {
  return [
    `書名：《${info.bookTitle}》${info.author ? `\n作者：${info.author}` : ""}`,
    `章節：${info.chapterTitle}`,
    info.summaries ? `前情摘要：\n${info.summaries}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

function memberList(members: CircleMember[]): string {
  return members
    .map((m) => [`- id: ${m.id}｜${m.name}`, `  人設：${m.persona || "（沒有描述）"}`, m.memory ? `  你們最近的事：${m.memory}` : ""].filter(Boolean).join("\n"))
    .join("\n");
}

function nameOf(id: string, members: CircleMember[], userName: string): string {
  if (id === USER_ID) return userName;
  if (id === HOST_ID) return HOST_NAME;
  return members.find((m) => m.id === id)?.name ?? id;
}

/** 這段已有的留言，編號給 AI 指認「同意哪一則」 */
export function numberedThread(notes: CircleNote[], members: CircleMember[], userName: string): string {
  return notes
    .map((n, i) => `[${i + 1}] ${nameOf(n.authorId, members, userName)}${n.parentId ? "（回覆）" : ""}：${n.content}`)
    .join("\n");
}

export type ReplyTrigger =
  | { kind: "note"; note: CircleNote }
  | { kind: "sync"; memberId: string }
  | { kind: "question"; question: string };

export function buildRepliesPrompt(input: {
  info: CircleBookInfo;
  /** 這段讀到的原文 */
  paragraph: string;
  members: CircleMember[];
  /** 這段已有的留言（含觸發的那則） */
  existing: CircleNote[];
  userName: string;
  trigger: ReplyTrigger;
}): APIMessage[] {
  const { trigger, members, userName } = input;
  const ask =
    trigger.kind === "note"
      ? `${userName} 剛在這段留了邊註：「${trigger.note.content}」。挑 1 到 2 個最有話想說的角色回應他（可以贊成、補充或反駁）。`
      : trigger.kind === "sync"
        ? `大家一起讀到這裡。請 ${members.find((m) => m.id === trigger.memberId)?.name ?? "一個角色"}（id: ${trigger.memberId}）在這段留一則自己的邊註，只要這一個角色。`
        : `主持人在這段丟出了一個問題：「${trigger.question}」。挑 1 到 2 個立場不同的角色回答。`;
  return [
    {
      role: "system",
      content: [
        "你在主持一個讀書會，成員是幾個角色，要用他們各自的口吻在書頁邊留短短的邊註。",
        NO_SPOILER,
        "每則邊註 60 字以內，像在頁邊隨手寫的，口語、有個性，不要客套、不要重複別人說過的。",
        "如果某個角色同意已有的某則留言，在 agreeWith 填那則的編號。",
        '用繁體中文，回傳 JSON 陣列：[{"characterId": "角色的 id", "content": "…", "agreeWith": 2}]，只回 JSON。',
      ].join("\n"),
    },
    {
      role: "user",
      content: [
        bookHead(input.info),
        `這段原文：\n${input.paragraph}`,
        `成員：\n${memberList(members)}`,
        input.existing.length ? `這段已有的留言：\n${numberedThread(input.existing, members, userName)}` : "",
        ask,
      ]
        .filter(Boolean)
        .join("\n\n"),
    },
  ];
}

export interface ParsedReply {
  characterId: string;
  content: string;
  /** 同意的留言 id */
  agreeWith?: string;
}

/** 解析角色回應：characterId 給名字也認得；不認識的角色略過，一個角色只留一則，最多 max 則 */
export function parseCircleReplies(
  text: string,
  members: CircleMember[],
  existingIds: string[],
  max = 2,
): ParsedReply[] {
  const json = extractJson<unknown>(text);
  const list = Array.isArray(json) ? json : (json as { replies?: unknown })?.replies;
  if (!Array.isArray(list)) return [];
  const out: ParsedReply[] = [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const { characterId, content, agreeWith } = item as Record<string, unknown>;
    const key = typeof characterId === "string" ? characterId.trim() : "";
    const member = members.find((m) => m.id === key) ?? members.find((m) => m.name === key);
    if (!member || typeof content !== "string" || !content.trim()) continue;
    if (out.some((r) => r.characterId === member.id)) continue;
    const n = typeof agreeWith === "number" ? agreeWith : typeof agreeWith === "string" ? Number(agreeWith) : NaN;
    out.push({ characterId: member.id, content: content.trim(), agreeWith: existingIds[n - 1] });
    if (out.length >= max) break;
  }
  return out;
}

export function buildSupplementPrompt(input: { info: CircleBookInfo; paragraph: string; note: string }): APIMessage[] {
  return [
    {
      role: "system",
      content: [
        "你是讀書會的主持人，替一則邊註補充背景：相關的典故、詞義、時代或前文脈絡。",
        NO_SPOILER,
        "不要捏造出處或引文，不確定就說不確定。100 字以內，繁體中文，直接寫內容，不要 JSON。",
      ].join("\n"),
    },
    {
      role: "user",
      content: `${bookHead(input.info)}\n\n這段原文：\n${input.paragraph}\n\n要補充的邊註：「${input.note}」`,
    },
  ];
}

/** 補充是純文字；模型硬要回 JSON 時取 content */
export function parseSupplement(text: string): string {
  const json = extractJson<{ content?: unknown }>(text);
  if (json && typeof json === "object" && !Array.isArray(json) && typeof json.content === "string") return json.content.trim();
  return text.replace(/```[\s\S]*?```/g, "").trim();
}

export function buildCircleSummaryPrompt(input: {
  bookTitle: string;
  groups: ParagraphGroup[];
  members: CircleMember[];
  userName: string;
}): APIMessage[] {
  const busiest = [...input.groups].sort((a, b) => b.count - a.count).slice(0, 3);
  const people = [
    `- id: ${USER_ID}｜${input.userName}`,
    ...input.members.map((m) => `- id: ${m.id}｜${m.name}`),
  ].join("\n");
  const threads = busiest
    .map((g) => {
      const notes = g.threads.flatMap((t) => [t.note, ...t.replies]);
      return `段落：「${g.quote}」\n${numberedThread(notes, input.members, input.userName)}`;
    })
    .join("\n\n");
  return [
    {
      role: "system",
      content: [
        "你是讀書會的主持人。找出討論最多的那段，把大家的看法分成兩派（真的只有一派就給一派）。",
        "每派一句話說清楚論點（30 字以內），列出站這派的成員 id。只根據留言，不要加新觀點。",
        '用繁體中文，回傳 JSON：{"quote": "那段原文的前 30 字", "stances": [{"claim": "…", "memberIds": ["…"]}]}，只回 JSON。',
      ].join("\n"),
    },
    { role: "user", content: `書名：《${input.bookTitle}》\n\n成員：\n${people}\n\n留言：\n${threads}` },
  ];
}

export function parseCircleSummary(
  text: string,
  validIds: string[],
): { quote: string; stances: Array<{ claim: string; memberIds: string[] }> } | null {
  const json = extractJson<{ quote?: unknown; stances?: unknown }>(text);
  if (!json || typeof json !== "object" || Array.isArray(json) || !Array.isArray(json.stances)) return null;
  const stances = json.stances
    .map((s) => {
      const claim = typeof s?.claim === "string" ? s.claim.trim() : "";
      const ids: string[] = Array.isArray(s?.memberIds)
        ? s.memberIds.filter((x: unknown): x is string => typeof x === "string")
        : [];
      return { claim, memberIds: [...new Set(ids.filter((id) => validIds.includes(id)))] };
    })
    .filter((s) => s.claim)
    .slice(0, 2);
  if (stances.length === 0) return null;
  return { quote: typeof json.quote === "string" ? json.quote.trim() : "", stances };
}

export function buildDebatePrompt(input: { info: CircleBookInfo; paragraph: string; members: CircleMember[] }): APIMessage[] {
  return [
    {
      role: "system",
      content: [
        "你是讀書會的主持人，針對這段丟出一個會讓大家意見分歧的問題（30 字以內），",
        "再挑 1 到 2 個立場不同的角色用各自的口吻回答（每則 60 字以內）。",
        NO_SPOILER,
        '用繁體中文，回傳 JSON：{"question": "…", "replies": [{"characterId": "角色的 id", "content": "…"}]}，只回 JSON。',
      ].join("\n"),
    },
    {
      role: "user",
      content: `${bookHead(input.info)}\n\n這段原文：\n${input.paragraph}\n\n成員：\n${memberList(input.members)}`,
    },
  ];
}

export function parseDebate(text: string, members: CircleMember[]): { question: string; replies: ParsedReply[] } | null {
  const json = extractJson<{ question?: unknown; replies?: unknown }>(text);
  if (!json || typeof json !== "object" || Array.isArray(json) || typeof json.question !== "string" || !json.question.trim()) {
    return null;
  }
  return {
    question: json.question.trim(),
    replies: parseCircleReplies(JSON.stringify(json.replies ?? []), members, []),
  };
}
