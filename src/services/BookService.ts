/**
 * BookService - 書籍導入與解析服務
 * 支援格式：TXT、EPUB、PDF；解析細節在 bookParsing.ts
 */

import { db, DB_STORES } from "@/db/database";
import {
  decodeEntities,
  decodeTextBytes,
  firstHeading,
  htmlToText,
  joinPdfTextItems,
  parseAttributes,
  parseNavDoc,
  parseNcx,
  parseOpf,
  parseTxtChapters,
  reflowPdfLines,
  resolveEpubPath,
  splitLongChapters,
} from "@/services/bookParsing";
import type { BookChapter, BookMeta, BookReadingProgress, StoredBook } from "@/types/book";
import { toBookMeta } from "@/utils/bookReading";

function totalCharsOf(chapters: BookChapter[]): number {
  return chapters.reduce((sum, c) => sum + c.content.length, 0);
}

/** 內文第一行跟章名一樣時拿掉，閱讀器已經會顯示章名 */
function dropDuplicateHeading(title: string, content: string): string {
  const [first, ...rest] = content.split("\n");
  return first.trim() === title.trim() && rest.join("").trim() ? rest.join("\n").trim() : content;
}

// ============================================================
// TXT
// ============================================================

async function importTxt(file: File): Promise<StoredBook> {
  const text = decodeTextBytes(new Uint8Array(await file.arrayBuffer()));
  const chapters = splitLongChapters(parseTxtChapters(text));
  if (chapters.length === 0) throw new Error("這個 TXT 是空的");

  return {
    id: crypto.randomUUID(),
    title: file.name.replace(/\.txt$/i, ""),
    format: "txt",
    chapters,
    totalChars: totalCharsOf(chapters),
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

// ============================================================
// EPUB
// ============================================================

const IMAGE_MIME: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
};

function dirOf(path: string): string {
  return path.includes("/") ? path.slice(0, path.lastIndexOf("/") + 1) : "";
}

async function importEpub(file: File): Promise<StoredBook> {
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(await file.arrayBuffer());

  // 有些 EPUB 內部路徑大小寫跟 manifest 寫的不一樣
  const lowerPaths = new Map(Object.keys(zip.files).map((p) => [p.toLowerCase(), p]));
  const entry = (path: string) => zip.file(path) ?? zip.file(lowerPaths.get(path.toLowerCase()) ?? "");
  const readText = async (path: string) => (await entry(path)?.async("text")) ?? undefined;

  const containerXml = await readText("META-INF/container.xml");
  if (!containerXml) throw new Error("無效的 EPUB 文件");
  const rootfile = containerXml.match(/<rootfile\b[^>]*>/i)?.[0];
  const opfPath = rootfile ? parseAttributes(rootfile)["full-path"] : undefined;
  if (!opfPath) throw new Error("找不到 OPF 文件路徑");

  const opf = await readText(opfPath);
  if (!opf) throw new Error("無法讀取 OPF 文件");
  const opfDir = dirOf(opfPath);
  const info = parseOpf(opf);
  const bookTitle = info.title || file.name.replace(/\.epub$/i, "");

  // 目錄：章節檔案 → 標題（EPUB3 nav 優先，其次 NCX）
  const tocLabels = new Map<string, string>();
  const addToc = (docPath: string, entries: Array<{ href: string; label: string }>) => {
    const base = dirOf(docPath);
    for (const e of entries) {
      const path = resolveEpubPath(base, e.href);
      if (!tocLabels.has(path)) tocLabels.set(path, e.label);
    }
  };
  if (info.navHref) {
    const navPath = resolveEpubPath(opfDir, info.navHref);
    const nav = await readText(navPath);
    if (nav) addToc(navPath, parseNavDoc(nav));
  }
  const ncxItem = info.ncxId ? info.manifest[info.ncxId] : undefined;
  if (tocLabels.size === 0 && ncxItem) {
    const ncxPath = resolveEpubPath(opfDir, ncxItem.href);
    const ncx = await readText(ncxPath);
    if (ncx) addToc(ncxPath, parseNcx(ncx));
  }

  let cover: string | undefined;
  if (info.coverHref) {
    const coverPath = resolveEpubPath(opfDir, info.coverHref);
    const data = await entry(coverPath)?.async("base64");
    const ext = coverPath.split(".").pop()?.toLowerCase() ?? "";
    if (data) cover = `data:${IMAGE_MIME[ext] ?? "image/jpeg"};base64,${data}`;
  }

  const chapters: BookChapter[] = [];
  for (const idref of info.spine) {
    const item = info.manifest[idref];
    if (!item || (item.mediaType && !/html|xml/i.test(item.mediaType))) continue;
    const path = resolveEpubPath(opfDir, item.href);
    const html = await readText(path);
    if (!html) continue;

    const text = htmlToText(html);
    if (text.length < 10) continue; // 封面、空白頁

    const titleTag = decodeEntities(html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] ?? "").trim();
    const title =
      tocLabels.get(path) ??
      firstHeading(html) ??
      (titleTag && titleTag !== bookTitle ? titleTag : `第 ${chapters.length + 1} 章`);

    chapters.push({
      id: crypto.randomUUID(),
      title,
      content: dropDuplicateHeading(title, text),
      order: chapters.length,
    });
  }

  if (chapters.length === 0) throw new Error("EPUB 中沒有可讀取的章節");
  const split = splitLongChapters(chapters);

  return {
    id: crypto.randomUUID(),
    title: bookTitle,
    author: info.author,
    cover,
    format: "epub",
    chapters: split,
    totalChars: totalCharsOf(split),
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

// ============================================================
// PDF（PDF.js）
// ============================================================

/** 頁首頁尾常見的純頁碼行 */
const PAGE_NUMBER_LINE = /^[\s\-–—]*(\d{1,4}|[ivxlcdm]{1,6})[\s\-–—]*$/i;

async function importPdf(file: File): Promise<StoredBook> {
  const pdfjsLib = await import("pdfjs-dist");
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url,
  ).toString();

  const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
  const pageCount: number = pdf.numPages;

  // 每頁的文字行
  const pageLines: string[][] = [];
  for (let i = 1; i <= pageCount; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const items = (content.items as Array<{ str?: string; hasEOL?: boolean }>)
      .filter((it) => typeof it.str === "string")
      .map((it) => ({ str: it.str as string, hasEOL: it.hasEOL }));
    pageLines.push(joinPdfTextItems(items).filter((l) => !PAGE_NUMBER_LINE.test(l)));
    page.cleanup();
  }

  const textOfPages = (from: number, to: number) =>
    reflowPdfLines(pageLines.slice(from, to).flat()).join("\n");

  // 書籤 → 起始頁（只取第一層）
  const starts: Array<{ title: string; page: number }> = [];
  const outline = await pdf.getOutline().catch(() => null);
  for (const item of outline ?? []) {
    try {
      const dest = typeof item.dest === "string" ? await pdf.getDestination(item.dest) : item.dest;
      const ref = Array.isArray(dest) ? dest[0] : null;
      if (ref == null) continue;
      const page = typeof ref === "number" ? ref : await pdf.getPageIndex(ref);
      if (page >= 0 && page < pageCount) starts.push({ title: item.title?.trim() || "", page });
    } catch {
      // 書籤指不到頁面就略過
    }
  }
  starts.sort((a, b) => a.page - b.page);
  const uniqueStarts = starts.filter((s, i) => i === 0 || s.page !== starts[i - 1].page);

  const chapters: BookChapter[] = [];
  const push = (title: string, content: string) => {
    if (content.trim().length < 10) return;
    chapters.push({ id: crypto.randomUUID(), title, content: content.trim(), order: chapters.length });
  };

  if (uniqueStarts.length > 0) {
    if (uniqueStarts[0].page > 0) push("開頭", textOfPages(0, uniqueStarts[0].page));
    uniqueStarts.forEach((s, i) => {
      const end = uniqueStarts[i + 1]?.page ?? pageCount;
      push(s.title || `第 ${i + 1} 章`, textOfPages(s.page, end));
    });
  } else {
    const perChapter = 10;
    for (let start = 0; start < pageCount; start += perChapter) {
      const end = Math.min(start + perChapter, pageCount);
      push(`第 ${start + 1}–${end} 頁`, textOfPages(start, end));
    }
  }

  if (chapters.length === 0) throw new Error("PDF 中沒有可提取的文字（可能是掃描圖片）");
  const split = splitLongChapters(chapters);

  return {
    id: crypto.randomUUID(),
    title: file.name.replace(/\.pdf$/i, ""),
    format: "pdf",
    chapters: split,
    totalChars: totalCharsOf(split),
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

// ============================================================
// 書架索引（appSettings 裡的快取，從 books 推算）
// ============================================================

const SHELF_INDEX_KEY = "book-shelf-index";

interface ShelfIndex {
  id: typeof SHELF_INDEX_KEY;
  books: Record<string, BookMeta>;
}

async function readShelfIndex(): Promise<Record<string, BookMeta>> {
  const saved = await db.get<ShelfIndex>(DB_STORES.APP_SETTINGS, SHELF_INDEX_KEY).catch(() => undefined);
  return { ...(saved?.books ?? {}) };
}

async function writeShelfIndex(books: Record<string, BookMeta>): Promise<void> {
  const record: ShelfIndex = { id: SHELF_INDEX_KEY, books };
  await db.put(DB_STORES.APP_SETTINGS, JSON.parse(JSON.stringify(record)));
}

// ============================================================
// 公開 API
// ============================================================

export const BookService = {
  /**
   * 導入書籍文件，自動識別格式
   */
  async importFile(file: File): Promise<StoredBook> {
    const ext = file.name.split(".").pop()?.toLowerCase();
    let book: StoredBook;

    if (ext === "txt") {
      book = await importTxt(file);
    } else if (ext === "epub") {
      book = await importEpub(file);
    } else if (ext === "pdf") {
      book = await importPdf(file);
    } else {
      throw new Error(`不支援的格式：${ext}，請使用 TXT、EPUB 或 PDF`);
    }

    await db.put(DB_STORES.BOOKS, JSON.parse(JSON.stringify(book)));
    const index = await readShelfIndex();
    index[book.id] = toBookMeta(book);
    await writeShelfIndex(index);
    return book;
  },

  /**
   * 書架清單：讀索引，跟 books 的 key 對帳（備份還原、舊資料會在這裡補齊）
   */
  async getShelf(): Promise<BookMeta[]> {
    const [keys, index] = await Promise.all([
      db.getAllKeys(DB_STORES.BOOKS),
      readShelfIndex(),
    ]);
    const ids = new Set(keys.map(String));
    let changed = false;

    for (const id of Object.keys(index)) {
      if (!ids.has(id)) {
        delete index[id];
        changed = true;
      }
    }
    for (const id of ids) {
      if (index[id]) continue;
      const book = await db.get<StoredBook>(DB_STORES.BOOKS, id);
      if (book) {
        index[id] = toBookMeta(book);
        changed = true;
      }
    }

    if (changed) await writeShelfIndex(index);
    return Object.values(index);
  },

  async getAllBooks(): Promise<StoredBook[]> {
    return db.getAll<StoredBook>(DB_STORES.BOOKS);
  },

  async getBook(id: string): Promise<StoredBook | undefined> {
    return db.get<StoredBook>(DB_STORES.BOOKS, id);
  },

  async deleteBook(id: string): Promise<void> {
    await db.delete(DB_STORES.BOOKS, id);
    await db.delete(DB_STORES.BOOK_PROGRESS, id).catch(() => {});
    const index = await readShelfIndex();
    if (index[id]) {
      delete index[id];
      await writeShelfIndex(index);
    }
  },

  async saveProgress(progress: BookReadingProgress): Promise<void> {
    await db.put(DB_STORES.BOOK_PROGRESS, JSON.parse(JSON.stringify(progress)));
  },

  async getProgress(bookId: string): Promise<BookReadingProgress | undefined> {
    return db.get<BookReadingProgress>(DB_STORES.BOOK_PROGRESS, bookId);
  },

  async getAllProgress(): Promise<BookReadingProgress[]> {
    return db.getAll<BookReadingProgress>(DB_STORES.BOOK_PROGRESS);
  },
};
