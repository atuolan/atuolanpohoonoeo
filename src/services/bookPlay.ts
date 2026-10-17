/**
 * 閱讀 App「好玩模式」的純邏輯：靈獸成長、擂台出題、平行宇宙、召喚作者的提示詞
 * 所有 AI 內容都只能根據使用者讀到的部分，不能劇透
 */

import type { APIMessage } from "@/api/OpenAICompatible";
import { extractJson } from "@/services/BookAIService";

const NO_SPOILER = "只能根據下面這段已讀內容，不可以透露或猜測後面的情節。";

// ============================================================
// 08 讀書靈獸
// ============================================================

export interface PetStage {
  name: string;
  minXp: number;
}

export const PET_STAGES: PetStage[] = [
  { name: "魚卵", minXp: 0 },
  { name: "小鯤", minXp: 30 },
  { name: "大鯤", minXp: 200 },
  { name: "大鵬", minXp: 800 },
];

/** 讀一分鐘 1 點、劃一條線 3 點、寫一則筆記再加 5 點 */
export function petXp(stats: { totalMinutes: number; highlights: number; notes: number }): number {
  return Math.max(0, Math.floor(stats.totalMinutes)) + stats.highlights * 3 + stats.notes * 5;
}

export interface PetState {
  xp: number;
  level: number;
  stageIndex: number;
  stage: PetStage;
  next?: PetStage;
  /** 到下一階段的進度 0–1（最後一階段為 1） */
  progress: number;
}

export function petState(xp: number): PetState {
  let stageIndex = 0;
  PET_STAGES.forEach((s, i) => {
    if (xp >= s.minXp) stageIndex = i;
  });
  const stage = PET_STAGES[stageIndex];
  const next = PET_STAGES[stageIndex + 1];
  const progress = next ? (xp - stage.minXp) / (next.minXp - stage.minXp) : 1;
  return { xp, level: Math.floor(xp / 20) + 1, stageIndex, stage, next, progress };
}

/** 靈獸說的話：看今天讀了沒、連讀幾天、快不快進化 */
export function petLine(
  state: PetState,
  today: { minutes: number; goal: number; streak: number },
): string {
  if (state.next && state.progress >= 0.9) return `我感覺身體要變了……再讀一點點就要變成${state.next.name}！`;
  if (today.minutes === 0) return "咕嚕……今天還沒讀書耶，我有點餓";
  if (today.minutes >= today.goal) {
    return today.streak >= 3 ? `連讀 ${today.streak} 天了！我吃得好飽` : "今天的份吃飽了，謝謝你";
  }
  return `剛剛那幾頁好好吃，再讀 ${today.goal - today.minutes} 分鐘我就飽了`;
}

// ============================================================
// 09 擂台
// ============================================================

export interface DuelQuestion {
  question: string;
  options: string[];
  /** 正解的選項位置 0–3 */
  answer: number;
  /** 公布答案時的說明（引用原文） */
  explain: string;
  /** 對手角色選哪個 */
  rivalPick: number;
  /** 對手作答時說的話 */
  rivalLine: string;
}

export function buildDuelPrompt(
  bookTitle: string,
  readingText: string,
  rival: { name: string; description?: string; personality?: string },
  count = 5,
): APIMessage[] {
  return [
    {
      role: "system",
      content: [
        `你要為讀《${bookTitle}》的讀者出 ${count} 題四選一的閱讀小測驗，${NO_SPOILER}`,
        "題目要考細節或理解，選項要有一個看起來很像的陷阱。",
        `同時扮演對手「${rival.name}」作答：照他的個性決定答對或答錯（大約答對六成），並寫一句他作答時會說的話。`,
        rival.description ? `${rival.name} 的資料：${rival.description}` : "",
        rival.personality ? `個性：${rival.personality}` : "",
        "只輸出 JSON 陣列，不要其他文字，格式：",
        '[{"question":"題目","options":["A","B","C","D"],"answer":0,"explain":"說明（引用原文）","rivalPick":1,"rivalLine":"他說的話"}]',
      ]
        .filter(Boolean)
        .join("\n"),
    },
    { role: "user", content: `已讀內容：\n${readingText}` },
  ];
}

export function parseDuelQuestions(text: string): DuelQuestion[] {
  const raw = extractJson<unknown[]>(text);
  if (!Array.isArray(raw)) return [];
  const inRange = (n: unknown) => typeof n === "number" && Number.isInteger(n) && n >= 0 && n < 4;
  return raw
    .filter((q): q is Record<string, unknown> => !!q && typeof q === "object")
    .map((q) => ({
      question: String(q.question ?? "").trim(),
      options: Array.isArray(q.options) ? q.options.map((o) => String(o).trim()) : [],
      answer: Number(q.answer),
      explain: String(q.explain ?? "").trim(),
      rivalPick: Number(q.rivalPick),
      rivalLine: String(q.rivalLine ?? "").trim(),
    }))
    .filter((q) => q.question && q.options.length === 4 && inRange(q.answer))
    .map((q) => ({ ...q, rivalPick: inRange(q.rivalPick) ? q.rivalPick : q.answer }));
}

/** 答對 100 分，剩越多秒數加越多（最多 +50） */
export function duelScore(correct: boolean, secondsLeft: number, totalSeconds: number): number {
  if (!correct) return 0;
  return 100 + Math.round((Math.max(0, secondsLeft) / totalSeconds) * 50);
}

// ============================================================
// 10 平行宇宙
// ============================================================

export interface WhatIfBranch {
  title: string;
}

export function buildBranchesPrompt(bookTitle: string, readingText: string): APIMessage[] {
  return [
    {
      role: "system",
      content: [
        `讀者正在讀《${bookTitle}》。請根據他讀到的地方，提出三個「如果……會怎樣」的平行宇宙分支。`,
        "每個分支是一個改變劇情走向的小轉折，不超過 20 字，要有趣、彼此差異大。",
        NO_SPOILER,
        '只輸出 JSON 陣列：["分支一","分支二","分支三"]',
      ].join("\n"),
    },
    { role: "user", content: `已讀內容：\n${readingText}` },
  ];
}

export function parseBranches(text: string): WhatIfBranch[] {
  const raw = extractJson<unknown[]>(text);
  const titles = Array.isArray(raw)
    ? raw.map((r) => (typeof r === "string" ? r : String((r as { title?: string })?.title ?? "")))
    : text.split("\n").map((l) => l.replace(/^(\d+[.、．)）]|[-*•])\s*/, ""));
  return titles
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 3)
    .map((title) => ({ title }));
}

export function buildBranchStoryPrompt(
  bookTitle: string,
  readingText: string,
  branch: string,
): APIMessage[] {
  return [
    {
      role: "system",
      content: [
        `你是《${bookTitle}》的作者。讀者想看一個平行宇宙：「${branch}」。`,
        "請用原著的文風與語氣，從讀者讀到的地方接著寫這個分支，約 250–400 字，寫成一段完整的小故事，有起伏、有收尾。",
        "直接輸出故事本文，不要標題、不要說明。",
      ].join("\n"),
    },
    { role: "user", content: `讀者讀到這裡：\n${readingText}` },
  ];
}

// ============================================================
// 07 召喚作者
// ============================================================

export interface SummonMessage {
  role: "user" | "author" | "guest";
  name: string;
  content: string;
  timestamp: number;
}

export type SummonStyle = "original" | "modern";

export function buildSummonPrompt(params: {
  bookTitle: string;
  author: string;
  readingText: string;
  style: SummonStyle;
  history: SummonMessage[];
  userName: string;
  /** 這次要說話的是作者還是被召喚來的客人 */
  speaker: "author" | "guest";
  guest?: string;
}): APIMessage[] {
  const { bookTitle, author, style, speaker, guest, userName } = params;
  const who = speaker === "author" ? author : guest ?? "客人";
  const styleRule =
    style === "original"
      ? `用 ${who} 原本的文風說話（古人就用文言，外國作家就用他的語言習慣翻成的中文），但要讓人讀得懂。`
      : `用輕鬆的現代白話說話，像朋友聊天，可以用現在的比喻。`;
  const roleRule =
    speaker === "author"
      ? `你是《${bookTitle}》的作者 ${author}，被讀者 ${userName} 召喚出來聊天。以作者本人的身分、觀點、性格回答，可以談創作動機、你的想法。`
      : `你是 ${guest}，被叫來和 ${author} 一起跟 ${userName} 聊《${bookTitle}》。照 ${guest} 本人的立場和性格說話，對 ${author} 的說法可以反駁、抬槓。`;

  const transcript = params.history
    .slice(-16)
    .map((m) => `${m.name}：${m.content}`)
    .join("\n");

  return [
    {
      role: "system",
      content: [
        roleRule,
        styleRule,
        `${userName} 讀到的地方如下，${NO_SPOILER}`,
        params.readingText,
        "回覆 2–5 句，不要用條列、不要加括號動作描寫，只輸出你要說的話。",
      ].join("\n\n"),
    },
    {
      role: "user",
      content: `${transcript || `（${userName} 剛召喚了 ${author}）`}\n\n輪到 ${who} 說話：`,
    },
  ];
}
