/**
 * 書籍解析的純函式（不碰 IndexedDB、不碰 JSZip／PDF.js），方便測試
 */

import type { BookChapter } from "@/types/book";

// ============================================================
// 文字編碼
// ============================================================

/** 繁簡共用的高頻字，用來判斷哪種解碼比較像正常中文 */
const COMMON_CHARS = new Set(
  "的一是不了人我在有他这這个個们們中来來上大为為和国國地到以说說时時要就出会會可也你对對生能而子那得于於着著下自之年过過发發后後作里裡用道行所然家种種事成方多经經么麼去法学學如都同现現当當没沒动動面起看定天分还還进進好小部其些主样樣理心她本前开開但因只从從想实實",
);

function scoreDecoded(text: string): number {
  let score = 0;
  for (const ch of text) {
    if (ch === "�") score -= 5;
    else if (COMMON_CHARS.has(ch)) score += 1;
  }
  return score;
}

/**
 * 把 TXT 的位元組轉成字串：UTF-8／UTF-16 看 BOM，
 * 不是合法 UTF-8 時在 GB18030（簡體）與 Big5（繁體）之間挑比較像中文的那個
 */
export function decodeTextBytes(bytes: Uint8Array): string {
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return new TextDecoder("utf-8").decode(bytes.subarray(3));
  }
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder("utf-16le").decode(bytes.subarray(2));
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder("utf-16be").decode(bytes.subarray(2));

  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    // 不是 UTF-8
  }

  const sample = bytes.subarray(0, 64 * 1024);
  let best = { label: "gb18030", score: -Infinity };
  for (const label of ["gb18030", "big5"]) {
    try {
      const score = scoreDecoded(new TextDecoder(label).decode(sample));
      if (score > best.score) best = { label, score };
    } catch {
      // 這個環境不支援該編碼
    }
  }
  return new TextDecoder(best.score === -Infinity ? "utf-8" : best.label).decode(bytes);
}

// ============================================================
// 章節
// ============================================================

const CHAPTER_HEADING =
  /^(第[零〇一二兩三四五六七八九十百千萬\d]+[章節回卷篇集部]|chapter\s+\d+|卷[零〇一二三四五六七八九十百千\d]+|[序前後终終尾]章|序[言幕]|楔子|尾聲|番外)/i;

/** 一行像不像章節標題：符合格式、夠短、不是以句末標點結尾的對白 */
export function isChapterHeading(line: string): boolean {
  const t = line.trim();
  if (!t || t.length > 40) return false;
  if (/[。！？!?」』…]$/.test(t) && t.length > 12) return false;
  return CHAPTER_HEADING.test(t);
}

/** 將 TXT 文本按章節分割；沒有章節標題時整本當一章（之後再由 splitLongChapters 切段） */
export function parseTxtChapters(text: string): BookChapter[] {
  const chapters: BookChapter[] = [];
  let title = "正文";
  let buffer: string[] = [];

  const flush = () => {
    const content = buffer.join("\n").trim();
    if (content) {
      chapters.push({ id: crypto.randomUUID(), title, content, order: chapters.length });
    }
  };

  for (const line of text.replace(/\r\n?/g, "\n").split("\n")) {
    if (isChapterHeading(line)) {
      flush();
      title = line.trim();
      buffer = [];
    } else {
      buffer.push(line);
    }
  }
  flush();

  if (chapters.length === 0 && text.trim()) {
    chapters.push({ id: crypto.randomUUID(), title: "全文", content: text.trim(), order: 0 });
  }
  return chapters;
}

/**
 * 太長的章節按段落切開，避免整本沒分章的 TXT 一次塞進閱讀器
 * 切出來的標題是「原標題（2/5）」
 */
export function splitLongChapters(
  chapters: BookChapter[],
  maxChars = 30000,
  targetChars = 15000,
): BookChapter[] {
  const out: BookChapter[] = [];
  for (const chapter of chapters) {
    if (chapter.content.length <= maxChars) {
      out.push({ ...chapter, order: out.length });
      continue;
    }
    const parts: string[] = [];
    let current = "";
    for (const para of chapter.content.split("\n")) {
      if (current.length >= targetChars && para.trim()) {
        parts.push(current.trim());
        current = "";
      }
      current += para + "\n";
      // 單一段落本身就超長時硬切
      while (current.length > maxChars) {
        parts.push(current.slice(0, targetChars).trim());
        current = current.slice(targetChars);
      }
    }
    if (current.trim()) parts.push(current.trim());
    parts.forEach((content, i) => {
      out.push({
        id: i === 0 ? chapter.id : crypto.randomUUID(),
        title: `${chapter.title}（${i + 1}/${parts.length}）`,
        content,
        order: out.length,
      });
    });
  }
  return out;
}

// ============================================================
// HTML → 純文字
// ============================================================

const NAMED_ENTITIES: Record<string, string> = {
  nbsp: " ",
  lt: "<",
  gt: ">",
  amp: "&",
  quot: '"',
  apos: "'",
  hellip: "…",
  mdash: "—",
  ndash: "–",
  ldquo: "“",
  rdquo: "”",
  lsquo: "‘",
  rsquo: "’",
  middot: "·",
  bull: "•",
  copy: "©",
  ensp: " ",
  emsp: "　",
  thinsp: " ",
  zwj: "",
  zwnj: "",
  shy: "",
};

export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, code: string) => {
    if (code[0] === "#") {
      const n = code[1] === "x" || code[1] === "X" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : match;
    }
    return NAMED_ENTITIES[code.toLowerCase()] ?? match;
  });
}

/** 章節 XHTML 轉純文字：去掉 head／style／script／注音，區塊元素換行 */
export function htmlToText(html: string): string {
  const body = html
    .replace(/<head[\s\S]*?<\/head>/gi, "")
    .replace(/<(script|style|rt|rp)[\s\S]*?<\/\1>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "");
  const text = body
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|li|blockquote|section|article|tr|dd|dt|pre)>/gi, "\n")
    .replace(/<(p|div|h[1-6]|li|blockquote|section|article|tr)(\s[^>]*)?>/gi, "\n")
    .replace(/<[^>]+>/g, "");
  return decodeEntities(text)
    .split("\n")
    .map((line) => line.replace(/[ \t\f\v]+/g, " ").trim())
    .filter(Boolean)
    .join("\n")
    .trim();
}

/** 第一個 h1–h3 的文字 */
export function firstHeading(html: string): string | undefined {
  const m = html.match(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/i);
  const text = m ? htmlToText(m[1]).replace(/\n+/g, " ").trim() : "";
  return text || undefined;
}

// ============================================================
// EPUB 結構
// ============================================================

/** 解析標籤屬性，不管屬性順序與引號種類 */
export function parseAttributes(tag: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (const m of tag.matchAll(/([\w:.-]+)\s*=\s*("([^"]*)"|'([^']*)')/g)) {
    attrs[m[1].toLowerCase()] = m[3] ?? m[4] ?? "";
  }
  return attrs;
}

/** 相對於某目錄解析路徑，處理 ../、./ 與 %20 */
export function resolveEpubPath(baseDir: string, href: string): string {
  let decoded = href.split("#")[0];
  try {
    decoded = decodeURIComponent(decoded);
  } catch {
    // 保留原字串
  }
  const parts = (decoded.startsWith("/") ? decoded.slice(1) : baseDir + decoded).split("/");
  const out: string[] = [];
  for (const part of parts) {
    if (part === "..") out.pop();
    else if (part && part !== ".") out.push(part);
  }
  return out.join("/");
}

export interface OpfManifestItem {
  id: string;
  href: string;
  mediaType: string;
  properties: string;
}

export interface OpfInfo {
  title?: string;
  author?: string;
  manifest: Record<string, OpfManifestItem>;
  spine: string[];
  /** spine 上 toc 屬性指向的 NCX id */
  ncxId?: string;
  coverHref?: string;
  navHref?: string;
}

function tagText(xml: string, tag: string): string | undefined {
  const m = xml.match(new RegExp(`<${tag}(\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, "i"));
  const text = m ? decodeEntities(m[2].replace(/<[^>]+>/g, "")).trim() : "";
  return text || undefined;
}

export function parseOpf(opf: string): OpfInfo {
  const manifest: Record<string, OpfManifestItem> = {};
  for (const m of opf.matchAll(/<item\b[^>]*>/gi)) {
    const a = parseAttributes(m[0]);
    if (!a.id || !a.href) continue;
    manifest[a.id] = {
      id: a.id,
      href: a.href,
      mediaType: a["media-type"] ?? "",
      properties: a.properties ?? "",
    };
  }

  const spineBlock = opf.match(/<spine\b([^>]*)>([\s\S]*?)<\/spine>/i);
  const spine = spineBlock
    ? [...spineBlock[2].matchAll(/<itemref\b[^>]*>/gi)]
        .map((m) => parseAttributes(m[0]))
        .filter((a) => a.linear !== "no")
        .map((a) => a.idref)
        .filter(Boolean)
    : [];
  const ncxId = spineBlock ? parseAttributes(`<spine ${spineBlock[1]}>`).toc : undefined;

  // 封面：EPUB3 用 properties="cover-image"，EPUB2 用 <meta name="cover" content="id">
  const items = Object.values(manifest);
  let coverHref = items.find((i) => i.properties.split(/\s+/).includes("cover-image"))?.href;
  if (!coverHref) {
    for (const m of opf.matchAll(/<meta\b[^>]*>/gi)) {
      const a = parseAttributes(m[0]);
      if (a.name === "cover" && a.content) {
        coverHref = manifest[a.content]?.href;
        break;
      }
    }
  }

  return {
    title: tagText(opf, "dc:title"),
    author: tagText(opf, "dc:creator"),
    manifest,
    spine,
    ncxId: ncxId || items.find((i) => i.mediaType === "application/x-dtbncx+xml")?.id,
    coverHref,
    navHref: items.find((i) => i.properties.split(/\s+/).includes("nav"))?.href,
  };
}

/** NCX 目錄：檔案路徑（相對 NCX）→ 第一個標題 */
export function parseNcx(ncx: string): Array<{ href: string; label: string }> {
  const entries: Array<{ href: string; label: string }> = [];
  for (const m of ncx.matchAll(/<navLabel>\s*<text>([\s\S]*?)<\/text>\s*<\/navLabel>\s*(<content\b[^>]*>)/gi)) {
    const src = parseAttributes(m[2]).src;
    const label = decodeEntities(m[1].replace(/<[^>]+>/g, "")).trim();
    if (src && label) entries.push({ href: src, label });
  }
  return entries;
}

/** EPUB3 nav 文件的目錄 */
export function parseNavDoc(nav: string): Array<{ href: string; label: string }> {
  const tocNav =
    nav.match(/<nav\b[^>]*epub:type\s*=\s*["'][^"']*\btoc\b[^"']*["'][^>]*>([\s\S]*?)<\/nav>/i)?.[1] ??
    nav.match(/<nav\b[^>]*>([\s\S]*?)<\/nav>/i)?.[1] ??
    "";
  const entries: Array<{ href: string; label: string }> = [];
  for (const m of tocNav.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    const href = parseAttributes(`<a ${m[1]}>`).href;
    const label = htmlToText(m[2]).replace(/\n+/g, " ").trim();
    if (href && label) entries.push({ href, label });
  }
  return entries;
}

// ============================================================
// PDF 文字
// ============================================================

const CJK = /[　-鿿豈-﫿＀-￯]/;

/** 把 PDF.js 的文字片段接成行：中文之間不加空格，英文之間補空格 */
export function joinPdfTextItems(items: Array<{ str: string; hasEOL?: boolean }>): string[] {
  const lines: string[] = [];
  let line = "";
  for (const item of items) {
    const str = item.str;
    if (str) {
      const prev = line.slice(-1);
      const next = str[0];
      const needsSpace =
        line && prev !== " " && next !== " " && !CJK.test(prev) && !CJK.test(next);
      line += (needsSpace ? " " : "") + str;
    }
    if (item.hasEOL) {
      lines.push(line.trim());
      line = "";
    }
  }
  if (line.trim()) lines.push(line.trim());
  return lines;
}

/**
 * PDF 每行都是硬換行，把同一段的行接回去：
 * 上一行以句末標點結尾、或明顯比一般行短，才當作段落結束
 */
export function reflowPdfLines(lines: string[]): string[] {
  const nonEmpty = lines.filter(Boolean);
  if (nonEmpty.length === 0) return [];
  const lengths = nonEmpty.map((l) => l.length).sort((a, b) => a - b);
  const typical = lengths[Math.floor(lengths.length * 0.75)];

  const paragraphs: string[] = [];
  let current = "";
  for (const line of lines) {
    if (!line) {
      if (current) paragraphs.push(current);
      current = "";
      continue;
    }
    if (current) {
      const joinWithSpace = !CJK.test(current.slice(-1)) && !CJK.test(line[0]);
      current += (joinWithSpace ? " " : "") + line;
    } else {
      current = line;
    }
    const endsSentence = /[。！？!?.」』"”:：]$/.test(line);
    if ((endsSentence && line.length < typical * 0.95) || line.length < typical * 0.6) {
      paragraphs.push(current);
      current = "";
    }
  }
  if (current) paragraphs.push(current);
  return paragraphs;
}
