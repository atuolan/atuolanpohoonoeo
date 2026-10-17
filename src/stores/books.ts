import { db, DB_STORES } from "@/db/database";
import { BookService } from "@/services/BookService";
import type { BookReadingProgress, ReaderPrefs, StoredBook } from "@/types/book";
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
  const books = ref<StoredBook[]>([]);
  const progressByBook = ref<Record<string, BookReadingProgress>>({});
  const readerPrefs = ref<ReaderPrefs>({ ...DEFAULT_READER_PREFS });
  const isLoading = ref(false);
  const importError = ref<string | null>(null);
  let prefsLoaded = false;

  async function loadBooks() {
    const [all, progress] = await Promise.all([
      BookService.getAllBooks(),
      BookService.getAllProgress(),
    ]);
    books.value = all;
    progressByBook.value = Object.fromEntries(progress.map((p) => [p.bookId, p]));
  }

  async function importFile(file: File): Promise<StoredBook | null> {
    isLoading.value = true;
    importError.value = null;
    try {
      const book = await BookService.importFile(file);
      books.value.unshift(book);
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

  async function saveProgress(progress: BookReadingProgress) {
    progressByBook.value = { ...progressByBook.value, [progress.bookId]: progress };
    await BookService.saveProgress(progress);
  }

  async function getProgress(bookId: string): Promise<BookReadingProgress | undefined> {
    return BookService.getProgress(bookId);
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
    importFile,
    deleteBook,
    saveProgress,
    getProgress,
    loadReaderPrefs,
    setReaderPrefs,
  };
});
