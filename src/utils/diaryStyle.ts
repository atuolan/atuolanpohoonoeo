/**
 * 角色日記本（純函式）：選項代號、模型輸出解析、內文記號、字型與提示詞
 */

export type DiaryPaper =
  | "lined"
  | "grid"
  | "dot"
  | "plain"
  | "memo"
  | "letter"
  | "binder"
  | "kraft"
  | "watercolor"
  | "washi"
  | "aged"
  | "black";
export type DiaryHand = "neat" | "round" | "scrawl";
export type DiaryInk =
  | "black"
  | "blue"
  | "crimson"
  | "berry"
  | "green"
  | "pencil"
  | "brown"
  | "purple"
  | "white"
  | "gold";
export type DiaryTape = "none" | "yellow" | "mint" | "pink-dot" | "blue-check" | "gold-dot" | "kraft";
export type DiaryStickerId =
  | "star"
  | "heart"
  | "moon"
  | "cloud"
  | "raindrop"
  | "flower"
  | "coffee"
  | "cat"
  | "sun"
  | "paperclip"
  | "strawberry"
  | "cake"
  | "envelope"
  | "note"
  | "rainbow"
  | "clover"
  | "lightning"
  | "bow"
  | "leaf"
  | "snowflake"
  | "bandage"
  | "fire"
  | "dog"
  | "exclaim";
export type ChineseScript = "hant" | "hans";

export interface DiaryBook {
  paper: DiaryPaper;
  hand: DiaryHand;
  ink: DiaryInk;
  tape: DiaryTape;
  cover: string;
  coverNote?: string;
  coverSticker?: DiaryStickerId;
}

export interface DiaryPage {
  weather?: string;
  mood?: string;
  stickers: DiaryStickerId[];
}

export interface DiarySegment {
  kind: "text" | "strike" | "mark";
  text: string;
}

export interface DiaryParagraph {
  segments: DiarySegment[];
  margins: string[];
}

export const DIARY_PAPERS: Record<DiaryPaper, { name: string }> = {
  lined: { name: "橫線" },
  grid: { name: "方格" },
  dot: { name: "點格" },
  plain: { name: "米白道林" },
  memo: { name: "撕下的便條" },
  letter: { name: "信紙" },
  binder: { name: "活頁紙" },
  kraft: { name: "牛皮紙" },
  watercolor: { name: "水彩紙" },
  washi: { name: "和紙" },
  aged: { name: "泛黃舊紙" },
  black: { name: "黑卡紙" },
};

export const DIARY_HANDS: Record<DiaryHand, { name: string }> = {
  neat: { name: "工整" },
  round: { name: "圓圓手寫" },
  scrawl: { name: "潦草" },
};

export const DIARY_INKS: Record<DiaryInk, { name: string; color: string }> = {
  black: { name: "黑", color: "#1d2126" },
  blue: { name: "藍", color: "#2b4c9b" },
  crimson: { name: "深紅", color: "#8f2335" },
  berry: { name: "莓果", color: "#a12d62" },
  green: { name: "墨綠", color: "#2f6b4f" },
  pencil: { name: "鉛筆灰", color: "#6a7079" },
  brown: { name: "咖啡", color: "#5a3d2b" },
  purple: { name: "紫", color: "#5b3f8f" },
  white: { name: "白", color: "#f1ece2" },
  gold: { name: "金", color: "#d8b45a" },
};

export const DIARY_TAPES: Record<DiaryTape, { name: string }> = {
  none: { name: "不貼" },
  yellow: { name: "半透明黃" },
  mint: { name: "薄荷條紋" },
  "pink-dot": { name: "粉點點" },
  "blue-check": { name: "藍格紋" },
  "gold-dot": { name: "金色碎點" },
  kraft: { name: "牛皮紙膠帶" },
};

export const DIARY_STICKERS: Record<DiaryStickerId, { name: string }> = {
  star: { name: "星星" },
  heart: { name: "愛心" },
  moon: { name: "月亮" },
  cloud: { name: "雲" },
  raindrop: { name: "雨滴" },
  flower: { name: "小花" },
  coffee: { name: "咖啡" },
  cat: { name: "貓" },
  sun: { name: "太陽" },
  paperclip: { name: "迴紋針" },
  strawberry: { name: "草莓" },
  cake: { name: "蛋糕" },
  envelope: { name: "信封" },
  note: { name: "音符" },
  rainbow: { name: "彩虹" },
  clover: { name: "四葉草" },
  lightning: { name: "閃電" },
  bow: { name: "蝴蝶結" },
  leaf: { name: "葉子" },
  snowflake: { name: "雪花" },
  bandage: { name: "OK繃" },
  fire: { name: "火氣" },
  dog: { name: "狗" },
  exclaim: { name: "驚嘆" },
};

/** 還沒挑日記本、舊日記用的樣式 */
export const DEFAULT_DIARY_BOOK: DiaryBook = {
  paper: "lined",
  hand: "neat",
  ink: "black",
  tape: "none",
  cover: "",
};

const hasOwn = (table: object, key: string): boolean =>
  Object.prototype.hasOwnProperty.call(table, key);

export function isDiaryStickerId(v: string): v is DiaryStickerId {
  return hasOwn(DIARY_STICKERS, v);
}

/** 抓標籤裡的屬性，值可用雙引號或單引號 */
function parseAttrs(source: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const re = /([\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source))) {
    attrs[m[1]] = m[2] ?? m[3] ?? "";
  }
  return attrs;
}

function cleanField(value: string | undefined, max: number): string {
  return (value ?? "").trim().slice(0, max);
}

/** 紙／墨水互相限制：白、金只能配黑卡紙，黑卡紙只能配白、金 */
function fitInk(paper: DiaryPaper, ink: DiaryInk): DiaryInk {
  if (paper === "black") return ink === "white" || ink === "gold" ? ink : "white";
  return ink === "white" || ink === "gold" ? "black" : ink;
}

function parseStickers(value: string | undefined): DiaryStickerId[] {
  const out: DiaryStickerId[] = [];
  for (const part of (value ?? "").split(/[,，、\s]+/)) {
    if (!part || !isDiaryStickerId(part) || out.includes(part)) continue;
    out.push(part);
    if (out.length >= 2) break;
  }
  return out;
}

export function parseDiaryOutput(raw: string): {
  content: string;
  page?: DiaryPage;
  book?: DiaryBook;
} {
  let text = raw ?? "";
  let page: DiaryPage | undefined;
  let book: DiaryBook | undefined;

  const bookTag = /<diary-book\b([^>]*)>/i.exec(text);
  if (bookTag) {
    const attrs = parseAttrs(bookTag[1]);
    const paper: DiaryPaper = hasOwn(DIARY_PAPERS, attrs.paper)
      ? (attrs.paper as DiaryPaper)
      : DEFAULT_DIARY_BOOK.paper;
    const hand: DiaryHand = hasOwn(DIARY_HANDS, attrs.hand)
      ? (attrs.hand as DiaryHand)
      : DEFAULT_DIARY_BOOK.hand;
    const ink: DiaryInk = hasOwn(DIARY_INKS, attrs.ink)
      ? (attrs.ink as DiaryInk)
      : DEFAULT_DIARY_BOOK.ink;
    const tape: DiaryTape = hasOwn(DIARY_TAPES, attrs.tape)
      ? (attrs.tape as DiaryTape)
      : DEFAULT_DIARY_BOOK.tape;
    book = { paper, hand, ink: fitInk(paper, ink), tape, cover: cleanField(attrs.cover, 20) };
    const coverNote = cleanField(attrs["cover-note"], 30);
    if (coverNote) book.coverNote = coverNote;
    const coverSticker = cleanField(attrs["cover-sticker"], 20);
    if (coverSticker && isDiaryStickerId(coverSticker)) book.coverSticker = coverSticker;
  }

  const pageTag = /<diary-page\b([^>]*)>/i.exec(text);
  if (pageTag) {
    const attrs = parseAttrs(pageTag[1]);
    const weather = cleanField(attrs.weather, 20);
    const mood = cleanField(attrs.mood, 20);
    page = { stickers: parseStickers(attrs.stickers) };
    if (weather) page.weather = weather;
    if (mood) page.mood = mood;
  }

  text = text
    .replace(/<diary-book\b[^>]*>/gi, "")
    .replace(/<\/diary-book>/gi, "")
    .replace(/<diary-page\b[^>]*>/gi, "")
    .replace(/<\/diary-page>/gi, "");

  return { content: text.trim().replace(/\n{3,}/g, "\n\n"), page, book };
}

/** 當純文字用的地方（預覽、匯出、手帳）把記號拿掉 */
export function stripDiaryMarkup(text: string): string {
  if (!text) return "";
  return text
    .replace(/<margin>([\s\S]*?)<\/margin>/gi, "（$1）")
    .replace(/~~([\s\S]*?)~~/g, "$1")
    .replace(/==([\s\S]*?)==/g, "$1")
    .replace(/<\/?diary-(?:book|page)\b[^>]*>/gi, "")
    .replace(/<\/?margin>/gi, "");
}

/** 一段裡的頁邊小字先抽出來，再依劃掉、螢光切段（不巢狀，沒閉合當普通文字） */
function splitSegments(text: string): DiarySegment[] {
  const segments: DiarySegment[] = [];
  const re = /~~([\s\S]*?)~~|==([\s\S]*?)==/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) segments.push({ kind: "text", text: text.slice(last, m.index) });
    if (m[1] !== undefined) segments.push({ kind: "strike", text: m[1] });
    else segments.push({ kind: "mark", text: m[2] });
    last = re.lastIndex;
  }
  if (last < text.length) segments.push({ kind: "text", text: text.slice(last) });
  return segments;
}

export function splitDiaryContent(content: string): DiaryParagraph[] {
  const paragraphs: DiaryParagraph[] = [];
  for (const line of (content ?? "").split(/\r?\n/)) {
    if (!line.trim()) continue;
    const margins: string[] = [];
    const rest = line.replace(/<margin>([\s\S]*?)<\/margin>/gi, (_all, inner: string) => {
      const text = inner.trim();
      if (text) margins.push(text);
      return "";
    });
    paragraphs.push({ segments: splitSegments(rest.trim()), margins });
  }
  return paragraphs;
}

const HANS_HINTS = new Set("们这说时来对会为过还没样么书长东车门问间见关开听让认识难离边头发经产业学种问题觉爱说话应该现进实欢给吗");
const HANT_HINTS = new Set("們這說時來對會為過還沒樣麼書長東車門問間見關開聽讓認識難離邊頭發經產業學種問題覺愛說話應該現進實歡給嗎");

/** 內文是繁體還是簡體，決定用哪套手寫字型 */
export function detectChineseScript(text: string): ChineseScript {
  let hans = 0;
  let hant = 0;
  for (const ch of text ?? "") {
    if (HANS_HINTS.has(ch)) hans++;
    else if (HANT_HINTS.has(ch)) hant++;
  }
  return hans > hant ? "hans" : "hant";
}

export function diaryFontFamily(hand: DiaryHand, script: ChineseScript): string {
  if (hand === "round") {
    const main = script === "hans" ? "'ZCOOL KuaiLe'" : "'Iansui'";
    return `${main}, 'Yuanti TC', 'Yuanti SC', system-ui, sans-serif`;
  }
  if (hand === "scrawl") {
    const main = script === "hans" ? "'Zhi Mang Xing'" : "'Iansui'";
    return `${main}, 'Xingkai SC', 'STXingkai', cursive`;
  }
  const main = script === "hans" ? "'Ma Shan Zheng'" : "'LXGW WenKai TC'";
  return `${main}, 'Kaiti TC', 'Kaiti SC', 'STKaiti', 'KaiTi', serif`;
}

const FONT_LINK_ID = "diary-hand-fonts";

/** 打開日記時才插一次 Google Fonts；連不到就退回系統字型 */
export function ensureDiaryFonts(): void {
  if (typeof document === "undefined" || document.getElementById(FONT_LINK_ID)) return;
  const link = document.createElement("link");
  link.id = FONT_LINK_ID;
  link.rel = "stylesheet";
  link.href =
    "https://fonts.googleapis.com/css2?family=Iansui&family=LXGW+WenKai+TC:wght@400;700&family=Ma+Shan+Zheng&family=ZCOOL+KuaiLe&family=Zhi+Mang+Xing&display=swap";
  document.head.appendChild(link);
}

/** 日記本：回傳色碼，套用紙／墨水規則 */
export function resolveInk(book: DiaryBook): string {
  return DIARY_INKS[fitInk(book.paper, book.ink)].color;
}

const FIRST_BOOK_PROMPT = [
  "這是第一篇日記，先照 {{char}} 的性格挑一本日記本。在頁首標籤之前寫一行：",
  '<diary-book paper="紙張" hand="字跡" ink="墨水" tape="紙膠帶" cover="封面上寫的一句話，15 字內" cover-note="封面上的小字，20 字內，可省略" cover-sticker="封面貼紙代號，可省略" />',
  "紙張：lined 橫線、grid 方格、dot 點格、plain 米白道林、memo 撕下的便條、letter 信紙、binder 活頁紙、kraft 牛皮紙、watercolor 水彩紙、washi 和紙、aged 泛黃舊紙、black 黑卡紙",
  "字跡：neat 工整、round 圓圓手寫、scrawl 潦草",
  "墨水：black 黑、blue 藍、crimson 深紅、berry 莓果、green 墨綠、pencil 鉛筆灰、brown 咖啡、purple 紫、white 白、gold 金（white、gold 只能配 black 黑卡紙）",
  "紙膠帶：none 不貼、yellow 半透明黃、mint 薄荷條紋、pink-dot 粉點點、blue-check 藍格紋、gold-dot 金色碎點、kraft 牛皮紙膠帶",
  "封面那句話要像 {{char}} 會寫在自己日記本上的話。",
].join("\n");

/** 提示詞裡的 {{diaryBook}}：還沒挑就給挑選規則，挑好了就叫他不要再寫標籤 */
export function buildDiaryBookPrompt(book: DiaryBook | null): string {
  if (!book) return FIRST_BOOK_PROMPT;
  const paper = DIARY_PAPERS[book.paper]?.name ?? DIARY_PAPERS[DEFAULT_DIARY_BOOK.paper].name;
  const hand = DIARY_HANDS[book.hand]?.name ?? DIARY_HANDS[DEFAULT_DIARY_BOOK.hand].name;
  const ink = DIARY_INKS[book.ink]?.name ?? DIARY_INKS[DEFAULT_DIARY_BOOK.ink].name;
  return `你的日記本已經挑好了：${paper}、${hand}字跡、${ink}墨水。不要再寫 <diary-book> 標籤。`;
}
