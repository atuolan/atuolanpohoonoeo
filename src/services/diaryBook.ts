/**
 * 角色挑的日記本存在 settings 表 diary-book-${characterId}（自動進備份和同步），
 * 刪角色時一起刪
 */
import { db, DB_STORES } from "@/db/database";
import {
  DIARY_HANDS,
  DIARY_INKS,
  DIARY_PAPERS,
  DIARY_TAPES,
  isDiaryStickerId,
  type DiaryBook,
  type DiaryHand,
  type DiaryInk,
  type DiaryPaper,
  type DiaryTape,
} from "@/utils/diaryStyle";

function keyOf(characterId: string): string {
  return `diary-book-${characterId}`;
}

const isKey = (table: object, value: unknown): boolean =>
  typeof value === "string" && Object.prototype.hasOwnProperty.call(table, value);

/** 壞資料（欄位缺或不合法）回 null，當成還沒挑 */
export async function loadDiaryBook(characterId: string): Promise<DiaryBook | null> {
  const saved = await db.get<Partial<DiaryBook>>(DB_STORES.SETTINGS, keyOf(characterId));
  if (!saved) return null;
  const { paper, hand, ink, tape } = saved;
  if (
    !isKey(DIARY_PAPERS, paper) ||
    !isKey(DIARY_HANDS, hand) ||
    !isKey(DIARY_INKS, ink) ||
    !isKey(DIARY_TAPES, tape)
  ) {
    return null;
  }
  const book: DiaryBook = {
    paper: paper as DiaryPaper,
    hand: hand as DiaryHand,
    ink: ink as DiaryInk,
    tape: tape as DiaryTape,
    cover: typeof saved.cover === "string" ? saved.cover : "",
  };
  if (typeof saved.coverNote === "string" && saved.coverNote) book.coverNote = saved.coverNote;
  if (typeof saved.coverSticker === "string" && isDiaryStickerId(saved.coverSticker)) {
    book.coverSticker = saved.coverSticker;
  }
  return book;
}

export async function saveDiaryBook(characterId: string, book: DiaryBook): Promise<void> {
  await db.put(DB_STORES.SETTINGS, { ...book }, keyOf(characterId));
}

export async function deleteDiaryBook(characterId: string): Promise<void> {
  await db.delete(DB_STORES.SETTINGS, keyOf(characterId));
}
