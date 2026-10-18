/**
 * 便簽留言板
 * user 按確定送出的心情、char 回覆心情的紙條（<mood-reply>）與主動寫的紙條（<sticky-note>）
 * 都釘在同一面牆上。整面牆存在 appSettings 表的一筆；寫入後發事件，主畫面與留言板即時更新。
 */

import { db, DB_STORES } from "@/db/database";

export const NOTE_BOARD_CHANGED_EVENT = "aguaphone:note-board-changed";

/** 各清單最多留幾筆（新的在前，超過就丟最舊的） */
export const NOTE_BOARD_LIMITS = { posts: 500, notes: 1000, verbalReplies: 500 };

/** 同一個聊天、同一種紙條在這段時間內又寫一張就取代上一張（重新生成回覆時不會疊出好幾張） */
export const CHAR_NOTE_REPLACE_WINDOW_MS = 10 * 60 * 1000;

const STORE_KEY = "note-board";
/** 上一版（心情便籤整張換成 char 那面）存便利貼的 key */
const LEGACY_STORE_KEY = "char-sticky-notes";

export type MoodKey = "happy" | "sad" | "neutral" | "love" | "excited";

/** user 按確定送出的一則心情 */
export interface MoodPost {
  id: string;
  text: string;
  /** 送出時點過的心情；沒點過就沒有 */
  mood?: MoodKey;
  createdAt: number;
}

/** char 寫的紙條 */
export interface BoardCharNote {
  id: string;
  chatId: string;
  characterId: string;
  /** 寫入當下的名字，角色被刪掉時拿來顯示 */
  characterName: string;
  text: string;
  createdAt: number;
  /** 回覆的心情 id；沒有就是主動寫的提醒 */
  replyTo?: string;
}

/** char 只在聊天裡回應了某則心情、沒留紙條 */
export interface MoodReplyMark {
  postId: string;
  chatId: string;
  repliedAt: number;
}

export interface NoteBoardData {
  posts: MoodPost[];
  notes: BoardCharNote[];
  verbalReplies: MoodReplyMark[];
  /** 上次打開留言板的時間；之後寫的紙條算新的 */
  seenAt: number;
}

interface StoredNoteBoard extends NoteBoardData {
  id: string;
}

interface LegacyStickyNote {
  id: string;
  chatId: string;
  characterId: string;
  characterName: string;
  text: string;
  createdAt: number;
}

function newId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export async function loadNoteBoard(): Promise<NoteBoardData> {
  const stored = await db.get<StoredNoteBoard>(DB_STORES.APP_SETTINGS, STORE_KEY);
  if (stored) {
    return {
      posts: Array.isArray(stored.posts) ? stored.posts : [],
      notes: Array.isArray(stored.notes) ? stored.notes : [],
      verbalReplies: Array.isArray(stored.verbalReplies) ? stored.verbalReplies : [],
      seenAt: typeof stored.seenAt === "number" ? stored.seenAt : 0,
    };
  }

  // 上一版的便利貼轉成提醒紙條；當時已經在主畫面看過，不算新的
  const legacy = await db.get<{ notes?: LegacyStickyNote[] }>(
    DB_STORES.APP_SETTINGS,
    LEGACY_STORE_KEY,
  );
  const legacyNotes = Array.isArray(legacy?.notes) ? legacy.notes : [];
  return {
    posts: [],
    notes: legacyNotes.map((n) => ({
      id: n.id,
      chatId: n.chatId,
      characterId: n.characterId,
      characterName: n.characterName,
      text: n.text,
      createdAt: n.createdAt,
    })),
    verbalReplies: [],
    seenAt: legacyNotes.reduce((latest, n) => Math.max(latest, n.createdAt), 0),
  };
}

async function saveNoteBoard(data: NoteBoardData): Promise<void> {
  const stored: StoredNoteBoard = { id: STORE_KEY, ...data };
  await db.put(DB_STORES.APP_SETTINGS, stored);
  try {
    window.dispatchEvent(new CustomEvent(NOTE_BOARD_CHANGED_EVENT));
  } catch {
    // 忽略（非瀏覽器環境 / 測試環境）
  }
}

export async function addMoodPost(input: {
  text: string;
  mood?: MoodKey;
  createdAt?: number;
}): Promise<MoodPost> {
  const post: MoodPost = {
    id: newId("mood"),
    text: input.text,
    ...(input.mood ? { mood: input.mood } : {}),
    createdAt: input.createdAt ?? Date.now(),
  };
  const data = await loadNoteBoard();
  data.posts = [post, ...data.posts].slice(0, NOTE_BOARD_LIMITS.posts);
  await saveNoteBoard(data);
  return post;
}

export async function addCharNote(input: {
  chatId: string;
  characterId: string;
  characterName: string;
  text: string;
  replyTo?: string;
  createdAt?: number;
}): Promise<BoardCharNote> {
  const note: BoardCharNote = {
    id: newId("note"),
    chatId: input.chatId,
    characterId: input.characterId,
    characterName: input.characterName,
    text: input.text,
    createdAt: input.createdAt ?? Date.now(),
    ...(input.replyTo ? { replyTo: input.replyTo } : {}),
  };

  const data = await loadNoteBoard();
  const kept = data.notes.filter(
    (n) =>
      !(
        n.chatId === note.chatId &&
        (n.replyTo ?? null) === (note.replyTo ?? null) &&
        note.createdAt - n.createdAt < CHAR_NOTE_REPLACE_WINDOW_MS
      ),
  );
  data.notes = [note, ...kept].slice(0, NOTE_BOARD_LIMITS.notes);
  await saveNoteBoard(data);
  return note;
}

/** 記下 char 只在聊天裡回應了這則心情；同一組只記一次 */
export async function markMoodReplied(postId: string, chatId: string, at = Date.now()): Promise<void> {
  const data = await loadNoteBoard();
  if (data.verbalReplies.some((r) => r.postId === postId && r.chatId === chatId)) return;
  data.verbalReplies = [{ postId, chatId, repliedAt: at }, ...data.verbalReplies].slice(
    0,
    NOTE_BOARD_LIMITS.verbalReplies,
  );
  await saveNoteBoard(data);
}

/** 打開留言板時呼叫；已讀時間只往後推 */
export async function markNoteBoardSeen(at = Date.now()): Promise<void> {
  const data = await loadNoteBoard();
  if (at <= data.seenAt) return;
  data.seenAt = at;
  await saveNoteBoard(data);
}

/** 還沒在留言板看過的 char 紙條（新的在前） */
export function unreadCharNotes(data: NoteBoardData): BoardCharNote[] {
  return data.notes.filter((n) => n.createdAt > data.seenAt);
}
