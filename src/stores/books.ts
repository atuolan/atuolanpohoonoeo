import { db, DB_STORES } from "@/db/database";
import { BookService } from "@/services/BookService";
import type { BookMeta, BookReadingProgress, ReaderPrefs, StoredBook } from "@/types/book";
import { toBookMeta } from "@/utils/bookReading";
import { defineStore } from "pinia";
import { ref } from "vue";

const READER_PREFS_KEY = "reader-prefs";

export const DEFAULT_READER_PREFS: ReaderPrefs = {
  fontSize: 18,
  lineHeight: 1.9,
  fontFamily: "serif",
  background: "sepia",
};

export const useBooksStore = defineStore("books", () => {
  /** 書架只放摘要；要讀內文用 loadBook */
  const books = ref<BookMeta[]>([]);
  const progressByBook = ref<Record<string, BookReadingProgress>>({});
  const readerPrefs = ref<ReaderPrefs>({ ...DEFAULT_READER_PREFS });
  const isLoading = ref(false);
  const importError = ref<string | null>(null);
  let prefsLoaded = false;

  async function loadBooks() {
    const [shelf, progress] = await Promise.all([
      BookService.getShelf(),
      BookService.getAllProgress(),
    ]);
    books.value = shelf;
    progressByBook.value = Object.fromEntries(progress.map((p) => [p.bookId, p]));
  }

  async function loadBook(id: string): Promise<StoredBook | undefined> {
    return BookService.getBook(id);
  }

  async function importFile(file: File): Promise<StoredBook | null> {
    isLoading.value = true;
    importError.value = null;
    try {
      const book = await BookService.importFile(file);
      books.value.unshift(toBookMeta(book));
      return book;
    } catch (e: any) {
      importError.value = e.message || "導入失敗";
      return null;
    } finally {
      isLoading.value = false;
    }
  }

  async function deleteBook(id: string) {
    await BookService.deleteBook(id);
    books.value = books.value.filter((b) => b.id !== id);
    const { [id]: _removed, ...rest } = progressByBook.value;
    progressByBook.value = rest;
  }

  // 同一本書的紀錄可能同時被翻頁、計時、劃線寫入，排隊合併，避免互相蓋掉
  let writeQueue: Promise<void> = Promise.resolve();

  /** 合併更新一本書的閱讀紀錄（沒給的欄位保留原值） */
  function patchProgress(
    bookId: string,
    patch: Partial<BookReadingProgress> | ((current: BookReadingProgress | undefined) => Partial<BookReadingProgress>),
  ): Promise<void> {
    writeQueue = writeQueue
      .then(async () => {
        const current = progressByBook.value[bookId] ?? (await BookService.getProgress(bookId));
        const changes = typeof patch === "function" ? patch(current) : patch;
        const base: BookReadingProgress = current ?? {
          bookId,
          chapterIndex: 0,
          scrollPosition: 0,
          lastReadAt: Date.now(),
        };
        const merged: BookReadingProgress = { ...base, ...changes, bookId };
        progressByBook.value = { ...progressByBook.value, [bookId]: merged };
        await BookService.saveProgress(merged);
      })
      .catch((e) => console.warn("[books] 儲存閱讀紀錄失敗:", e));
    return writeQueue;
  }

  async function saveProgress(progress: BookReadingProgress) {
    await patchProgress(progress.bookId, progress);
  }

  async function getProgress(bookId: string): Promise<BookReadingProgress | undefined> {
    const progress = await BookService.getProgress(bookId);
    if (progress) progressByBook.value = { ...progressByBook.value, [bookId]: progress };
    return progress;
  }

  async function loadReaderPrefs() {
    if (prefsLoaded) return;
    try {
      const saved = await db.get<ReaderPrefs & { id: string }>(
        DB_STORES.APP_SETTINGS,
        READER_PREFS_KEY,
      );
      if (saved) {
        const { id: _id, ...prefs } = saved;
        readerPrefs.value = { ...DEFAULT_READER_PREFS, ...prefs };
      }
      prefsLoaded = true;
    } catch (e) {
      console.warn("[books] 讀取閱讀設定失敗:", e);
    }
  }

  async function setReaderPrefs(patch: Partial<ReaderPrefs>) {
    readerPrefs.value = { ...readerPrefs.value, ...patch };
    try {
      await db.put(DB_STORES.APP_SETTINGS, { ...readerPrefs.value, id: READER_PREFS_KEY });
    } catch (e) {
      console.warn("[books] 儲存閱讀設定失敗:", e);
    }
  }

  return {
    books,
    progressByBook,
    readerPrefs,
    isLoading,
    importError,
    loadBooks,
    loadBook,
    importFile,
    deleteBook,
    patchProgress,
    saveProgress,
    getProgress,
    loadReaderPrefs,
    setReaderPrefs,
  };
});
