/**
 * 角色便利貼（<sticky-note>）
 * char 在線上聊天、主動訊息裡寫的便利貼，顯示在主畫面的心情便籤上。
 * 所有角色共用一份清單（新的在前），存在 appSettings 表；寫入後發事件讓主畫面即時換面。
 */

import { db, DB_STORES } from "@/db/database";
import { formatNoteTime } from "@/utils/noteTime";

export const CHAR_STICKY_NOTE_ADDED_EVENT = "aguaphone:char-sticky-note-added";

/** 最多留幾張，超過就丟最舊的 */
export const CHAR_STICKY_NOTE_LIMIT = 20;

/** 同一個聊天在這段時間內又寫一張就取代上一張（重新生成回覆時不會疊出好幾張） */
export const CHAR_STICKY_NOTE_REPLACE_WINDOW_MS = 10 * 60 * 1000;

const STORE_KEY = "char-sticky-notes";

export interface CharStickyNote {
  id: string;
  chatId: string;
  characterId: string;
  /** 寫入當下的名字，角色被刪掉時拿來顯示 */
  characterName: string;
  text: string;
  createdAt: number;
}

interface StoredCharStickyNotes {
  id: string;
  notes: CharStickyNote[];
}

export async function loadCharStickyNotes(): Promise<CharStickyNote[]> {
  const stored = await db.get<StoredCharStickyNotes>(DB_STORES.APP_SETTINGS, STORE_KEY);
  return Array.isArray(stored?.notes) ? stored.notes : [];
}

export async function addCharStickyNote(input: {
  chatId: string;
  characterId: string;
  characterName: string;
  text: string;
  createdAt?: number;
}): Promise<CharStickyNote> {
  const note: CharStickyNote = {
    id: `note-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    chatId: input.chatId,
    characterId: input.characterId,
    characterName: input.characterName,
    text: input.text,
    createdAt: input.createdAt ?? Date.now(),
  };

  const kept = (await loadCharStickyNotes()).filter(
    (n) =>
      !(
        n.chatId === note.chatId &&
        note.createdAt - n.createdAt < CHAR_STICKY_NOTE_REPLACE_WINDOW_MS
      ),
  );
  const notes = [note, ...kept].slice(0, CHAR_STICKY_NOTE_LIMIT);
  await db.put(DB_STORES.APP_SETTINGS, { id: STORE_KEY, notes });

  try {
    window.dispatchEvent(
      new CustomEvent<CharStickyNote>(CHAR_STICKY_NOTE_ADDED_EVENT, { detail: note }),
    );
  } catch {
    // 忽略（非瀏覽器環境 / 測試環境）
  }
  return note;
}

/**
 * 這個聊天最新一張便利貼，給 {{charStickyNote}} 用，例如「今天 14:20：記得帶傘」
 * @returns 沒寫過或讀取失敗時回傳空字串
 */
export async function getCharStickyNoteForPrompt(
  chatId: string,
  now = Date.now(),
): Promise<string> {
  try {
    const latest = (await loadCharStickyNotes()).find((n) => n.chatId === chatId);
    return latest ? `${formatNoteTime(latest.createdAt, now)}：${latest.text}` : "";
  } catch (error) {
    console.warn("[charStickyNotes] 讀取便利貼失敗:", error);
    return "";
  }
}
