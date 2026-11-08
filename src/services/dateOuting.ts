/**
 * 約會出門：存檔、回憶、結束時的回顧
 *
 * - 進行中的約會存在 settings 表 date-session-${chatId}（自動進備份）
 * - 結束的約會存成回憶 date-memories-${characterId}
 * - 結束時請 AI 寫一段回顧和角色的日記；失敗就只留基本資料
 */
import { OpenAICompatibleClient } from "@/api/OpenAICompatible";
import { db, DB_STORES } from "@/db/database";
import { useSettingsStore } from "@/stores/settings";
import type { DateMemory, DateSession } from "@/types/date";
import {
  createDefaultImportantEventsLog,
  createImportantEvent,
  type ImportantEventsLog,
} from "@/types/importantEvents";
import { pickGenerationToggles } from "@/utils/generationToggles";

const sessionKey = (chatId: string) => `date-session-${chatId}`;
const memoriesKey = (characterId: string) => `date-memories-${characterId}`;

/** 回憶最多留幾筆 */
const DATE_MEMORIES_MAX = 100;

// ===== 進行中的約會 =====

export async function loadDateSession(chatId: string): Promise<DateSession | null> {
  if (!chatId) return null;
  await db.init();
  const saved = await db.get<DateSession>(DB_STORES.SETTINGS, sessionKey(chatId));
  return saved && typeof saved.id === "string" ? saved : null;
}

export async function saveDateSession(session: DateSession): Promise<void> {
  await db.put(DB_STORES.SETTINGS, JSON.parse(JSON.stringify(session)), sessionKey(session.chatId));
}

export async function clearDateSession(chatId: string): Promise<void> {
  await db.delete(DB_STORES.SETTINGS, sessionKey(chatId));
}

// ===== 回憶 =====

export async function loadDateMemories(characterId: string): Promise<DateMemory[]> {
  const saved = await db.get<{ memories?: DateMemory[] }>(DB_STORES.SETTINGS, memoriesKey(characterId));
  return Array.isArray(saved?.memories) ? saved.memories : [];
}

export async function addDateMemory(memory: DateMemory): Promise<void> {
  const list = await loadDateMemories(memory.characterId);
  const next = [memory, ...list.filter((m) => m.id !== memory.id)].slice(0, DATE_MEMORIES_MAX);
  await db.put(
    DB_STORES.SETTINGS,
    { memories: JSON.parse(JSON.stringify(next)) },
    memoriesKey(memory.characterId),
  );
}

export async function deleteDateMemories(characterId: string): Promise<void> {
  await db.delete(DB_STORES.SETTINGS, memoriesKey(characterId));
}

// ===== 重要事件 =====

/** 約會結束寫一筆重要事件：聊到地點或事件才想起（優先級 2） */
export async function recordDateImportantEvent(
  chatId: string,
  characterId: string,
  content: string,
  keywords: string[],
): Promise<void> {
  try {
    let log = await db.get<ImportantEventsLog>(DB_STORES.IMPORTANT_EVENTS, chatId);
    if (!log) log = createDefaultImportantEventsLog(characterId, chatId);
    if (!log.settings.enabled) return;
    const event = createImportantEvent(content, {
      category: "relationship",
      priority: 2,
      source: "system",
      tags: ["約會", ...keywords],
    });
    event.vectorKeywords = ["約會", ...keywords].filter((k, i, all) => k && all.indexOf(k) === i);
    log.events.unshift(event);
    if (log.events.length > log.settings.maxEvents) log.events = log.events.slice(0, log.settings.maxEvents);
    log.updatedAt = Date.now();
    await db.put(DB_STORES.IMPORTANT_EVENTS, JSON.parse(JSON.stringify(log)));
  } catch (e) {
    console.warn("[約會] 寫入重要事件失敗:", e);
  }
}

// ===== 回顧與日記 =====

export interface DateRecap {
  recap: string;
  diary: string;
}

export function parseDateRecap(text: string): DateRecap | null {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const raw = JSON.parse(match[0]);
    const recap = typeof raw.recap === "string" ? raw.recap.trim().slice(0, 200) : "";
    const diary = typeof raw.diary === "string" ? raw.diary.trim().slice(0, 600) : "";
    return recap || diary ? { recap, diary } : null;
  } catch {
    return null;
  }
}

/** 請 AI 依約會中的對話寫回顧（第三人稱一兩句）和角色當晚的日記 */
export async function generateDateRecap(input: {
  charName: string;
  userName: string;
  place: string;
  conversation: string;
  eventText?: string;
  paymentNote?: string;
}): Promise<DateRecap | null> {
  const taskConfig = useSettingsStore().getAPIForTask("importantEvents");
  if (!taskConfig.api?.apiKey && !taskConfig.api?.endpoint) return null;
  const client = new OpenAICompatibleClient(taskConfig.api);
  const facts = [
    `地點：${input.place}`,
    input.eventText ? `途中發生：${input.eventText}` : "",
    input.paymentNote ? `付錢：${input.paymentNote}` : "",
  ]
    .filter(Boolean)
    .join("\n");
  const result = await client.generate({
    messages: [
      {
        role: "system",
        content:
          `${input.charName}和${input.userName}剛約會回來。依下面的對話寫兩樣東西，只輸出 JSON：\n` +
          `{"recap": "用第三人稱、一兩句話寫這次約會最難忘的地方，40 字內", "diary": "${input.charName}當晚寫的日記，用${input.charName}的口吻，100 到 200 字"}`,
      },
      { role: "user", content: `${facts}\n\n約會中的對話：\n${input.conversation.slice(-6000)}` },
    ],
    settings: {
      maxContextLength: taskConfig.generation.maxContextLength || 200000,
      maxResponseLength: 800,
      temperature: 0.8,
      topP: 0.95,
      frequencyPenalty: 0,
      presencePenalty: 0,
      repetitionPenalty: 1,
      stopSequences: [],
      streaming: false,
      useStreamingWindow: false,
      ...pickGenerationToggles(taskConfig.generation),
    },
    apiSettings: taskConfig.api,
  });
  return parseDateRecap(result.content ?? "");
}
