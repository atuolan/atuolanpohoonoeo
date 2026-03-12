import { BookService } from "@/services/BookService";
import type { BookReadingProgress, StoredBook } from "@/types/book";
import { defineStore } from "pinia";
import { ref } from "vue";

export const useBooksStore = defineStore("books", () => {
  const books = ref<StoredBook[]>([]);
  const isLoading = ref(false);
  const importError = ref<string | null>(null);

  async function loadBooks() {
    books.value = await BookService.getAllBooks();
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
  }

  async function saveProgress(progress: BookReadingProgress) {
    await BookService.saveProgress(progress);
  }

  async function getProgress(bookId: string): Promise<BookReadingProgress | undefined> {
    return BookService.getProgress(bookId);
  }

  return {
    books,
    isLoading,
    importError,
    loadBooks,
    importFile,
    deleteBook,
    saveProgress,
    getProgress,
  };
});
