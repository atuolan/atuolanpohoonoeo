/**
 * BookService - 書籍導入與解析服務
 * 支援格式：TXT、EPUB、PDF
 */

import { db, DB_STORES } from "@/db/database";
import type { BookChapter, BookReadingProgress, StoredBook } from "@/types/book";

// ============================================================
// TXT 解析
// ============================================================

/**
 * 將 TXT 文本按章節分割
 * 識別常見章節標題模式：第X章、Chapter X、卷X 等
 */
function parseTxtChapters(text: string): BookChapter[] {
  const chapterRegex =
    /^(第[零一二三四五六七八九十百千萬\d]+[章節卷回篇][\s\S]*?|Chapter\s+\d+[\s\S]*?|CHAPTER\s+\d+[\s\S]*?|[序前後終]章[\s\S]*?)$/m;

  const lines = text.split("\n");
  const chapters: BookChapter[] = [];
  let currentTitle = "正文";
  let currentContent: string[] = [];
  let order = 0;

  for (const line of lines) {
    if (chapterRegex.test(line.trim()) && line.trim().length < 60) {
      // 保存上一章
      if (currentContent.join("").trim()) {
        chapters.push({
          id: crypto.randomUUID(),
          title: currentTitle,
          content: currentContent.join("\n").trim(),
          order: order++,
        });
      }
      currentTitle = line.trim();
      currentContent = [];
    } else {
      currentContent.push(line);
    }
  }

  // 最後一章
  if (currentContent.join("").trim()) {
    chapters.push({
      id: crypto.randomUUID(),
      title: currentTitle,
      content: currentContent.join("\n").trim(),
      order: order,
    });
  }

  // 如果沒有識別到章節，整本作為一章
  if (chapters.length === 0) {
    chapters.push({
      id: crypto.randomUUID(),
      title: "全文",
      content: text.trim(),
      order: 0,
    });
  }

  return chapters;
}

async function importTxt(file: File): Promise<StoredBook> {
  const text = await file.text();
  const chapters = parseTxtChapters(text);
  const title = file.name.replace(/\.txt$/i, "");

  return {
    id: crypto.randomUUID(),
    title,
    format: "txt",
    chapters,
    totalChars: text.length,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

// ============================================================
// EPUB 解析（純手工解析 ZIP 結構，不依賴外部庫）
// ============================================================

async function importEpub(file: File): Promise<StoredBook> {
  // 動態載入 JSZip（如果沒有安裝則 fallback）
  let JSZip: any;
  try {
    JSZip = (await import("jszip")).default;
  } catch {
    throw new Error("請先安裝 jszip：npm install jszip");
  }

  const arrayBuffer = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(arrayBuffer);

  // 讀取 container.xml 找到 OPF 路徑
  const containerXml = await zip.file("META-INF/container.xml")?.async("text");
  if (!containerXml) throw new Error("無效的 EPUB 文件");

  const opfPathMatch = containerXml.match(/full-path="([^"]+)"/);
  if (!opfPathMatch) throw new Error("找不到 OPF 文件路徑");

  const opfPath = opfPathMatch[1];
  const opfDir = opfPath.includes("/") ? opfPath.substring(0, opfPath.lastIndexOf("/") + 1) : "";

  const opfContent = await zip.file(opfPath)?.async("text");
  if (!opfContent) throw new Error("無法讀取 OPF 文件");

  // 解析書名和作者
  const titleMatch = opfContent.match(/<dc:title[^>]*>([^<]+)<\/dc:title>/);
  const authorMatch = opfContent.match(/<dc:creator[^>]*>([^<]+)<\/dc:creator>/);
  const title = titleMatch?.[1]?.trim() || file.name.replace(/\.epub$/i, "");
  const author = authorMatch?.[1]?.trim();

  // 解析封面圖片
  let cover: string | undefined;
  const coverIdMatch = opfContent.match(/name="cover"\s+content="([^"]+)"/);
  if (coverIdMatch) {
    const coverId = coverIdMatch[1];
    const coverHrefMatch = opfContent.match(
      new RegExp(`id="${coverId}"[^>]+href="([^"]+)"`)
    );
    if (coverHrefMatch) {
      const coverFile = zip.file(opfDir + coverHrefMatch[1]);
      if (coverFile) {
        const coverData = await coverFile.async("base64");
        const ext = coverHrefMatch[1].split(".").pop()?.toLowerCase() || "jpeg";
        cover = `data:image/${ext};base64,${coverData}`;
      }
    }
  }

  // 解析 spine 順序
  const spineMatches = [...opfContent.matchAll(/idref="([^"]+)"/g)];
  const spineIds = spineMatches.map((m) => m[1]);

  // 建立 manifest id -> href 映射
  const manifestMap: Record<string, string> = {};
  const manifestMatches = [...opfContent.matchAll(/<item[^>]+id="([^"]+)"[^>]+href="([^"]+)"/g)];
  for (const m of manifestMatches) {
    manifestMap[m[1]] = m[2];
  }

  // 按 spine 順序讀取章節
  const chapters: BookChapter[] = [];
  let order = 0;
  let totalChars = 0;

  for (const id of spineIds) {
    const href = manifestMap[id];
    if (!href) continue;

    const filePath = opfDir + href.split("#")[0];
    const htmlContent = await zip.file(filePath)?.async("text");
    if (!htmlContent) continue;

    // 提取章節標題
    const chapterTitleMatch = htmlContent.match(/<title[^>]*>([^<]+)<\/title>/i) ||
      htmlContent.match(/<h[1-3][^>]*>([^<]+)<\/h[1-3]>/i);
    const chapterTitle = chapterTitleMatch?.[1]?.trim() || `第 ${order + 1} 章`;

    // 去除 HTML 標籤，保留段落換行
    const text = htmlContent
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n\n")
      .replace(/<\/div>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/g, " ")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .trim();

    if (text.length < 10) continue; // 跳過空章節

    totalChars += text.length;
    chapters.push({
      id: crypto.randomUUID(),
      title: chapterTitle,
      content: text,
      order: order++,
    });
  }

  if (chapters.length === 0) throw new Error("EPUB 中沒有可讀取的章節");

  return {
    id: crypto.randomUUID(),
    title,
    author,
    cover,
    format: "epub",
    chapters,
    totalChars,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

// ============================================================
// PDF 解析（使用 PDF.js）
// ============================================================

async function importPdf(file: File): Promise<StoredBook> {
  let pdfjsLib: any;
  try {
    pdfjsLib = await import("pdfjs-dist");
    // 設置 worker
    pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
      "pdfjs-dist/build/pdf.worker.min.mjs",
      import.meta.url
    ).toString();
  } catch {
    throw new Error("請先安裝 pdfjs-dist：npm install pdfjs-dist");
  }

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

  const title = file.name.replace(/\.pdf$/i, "");
  const chapters: BookChapter[] = [];
  let totalChars = 0;

  // 嘗試讀取書籤作為章節分割依據
  const outline = await pdf.getOutline().catch(() => null);

  if (outline && outline.length > 0) {
    // 有書籤：按書籤分章
    // 先讀取所有頁面文字
    const allPageTexts: string[] = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items.map((item: any) => item.str).join(" ");
      allPageTexts.push(pageText);
    }

    // 簡化：每個書籤對應一章（取前幾個書籤）
    const maxChapters = Math.min(outline.length, 100);
    for (let i = 0; i < maxChapters; i++) {
      const item = outline[i];
      const chapterTitle = item.title || `第 ${i + 1} 章`;
      // 估算頁碼範圍（簡化處理）
      const startPage = Math.floor((i / maxChapters) * pdf.numPages);
      const endPage = Math.floor(((i + 1) / maxChapters) * pdf.numPages);
      const content = allPageTexts.slice(startPage, endPage + 1).join("\n\n");

      if (content.trim().length < 10) continue;
      totalChars += content.length;
      chapters.push({
        id: crypto.randomUUID(),
        title: chapterTitle,
        content: content.trim(),
        order: i,
      });
    }
  } else {
    // 無書籤：每 10 頁一章
    const pagesPerChapter = 10;
    let order = 0;

    for (let startPage = 1; startPage <= pdf.numPages; startPage += pagesPerChapter) {
      const endPage = Math.min(startPage + pagesPerChapter - 1, pdf.numPages);
      const pageTexts: string[] = [];

      for (let p = startPage; p <= endPage; p++) {
        const page = await pdf.getPage(p);
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map((item: any) => item.str).join(" ");
        pageTexts.push(pageText);
      }

      const content = pageTexts.join("\n\n").trim();
      if (content.length < 10) continue;

      totalChars += content.length;
      chapters.push({
        id: crypto.randomUUID(),
        title: `第 ${order + 1} 部分（第 ${startPage}–${endPage} 頁）`,
        content,
        order: order++,
      });
    }
  }

  if (chapters.length === 0) throw new Error("PDF 中沒有可提取的文字");

  return {
    id: crypto.randomUUID(),
    title,
    format: "pdf",
    chapters,
    totalChars,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
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

    // 存入 IndexedDB（不存 cover 以節省空間，cover 單獨存）
    await db.put(DB_STORES.BOOKS, JSON.parse(JSON.stringify(book)));
    return book;
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
  },

  async saveProgress(progress: BookReadingProgress): Promise<void> {
    await db.put(DB_STORES.BOOK_PROGRESS, JSON.parse(JSON.stringify(progress)));
  },

  async getProgress(bookId: string): Promise<BookReadingProgress | undefined> {
    return db.get<BookReadingProgress>(DB_STORES.BOOK_PROGRESS, bookId);
  },
};
