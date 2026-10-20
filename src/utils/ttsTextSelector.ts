import { traditionalToSimplified } from "@/data/zhConversionMap";
import { cleanTTSTags } from "./ttsTagCleaner";

export type TTSLanguageMode = "auto" | "all" | "foreign" | "chinese";

const CJK_RE = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/u;
const LETTER_RE = /\p{L}/u;
const KANA_RE = /[\p{Script=Hiragana}\p{Script=Katakana}]/u;
const HTML_TAG_RE = /<\/?[a-z][^>]*>/gi;
const HTML_BREAK_RE = /<\s*br\s*\/?>/gi;

export function convertTTSContentToSimplified(text: string, languageBoost = ""): string {
  // Kanji alone is ambiguous; an explicit Japanese setting also protects it.
  if (languageBoost === "Japanese" || KANA_RE.test(text)) return text;
  return [...text].map((char) => traditionalToSimplified[char] || char).join("");
}

function stripHtmlForTTS(text: string): string {
  return text
    .replace(HTML_BREAK_RE, "\n")
    .replace(HTML_TAG_RE, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .trim();
}

function hasChinese(text: string): boolean {
  return [...text].some((char) => CJK_RE.test(char));
}

function hasForeignLetters(text: string): boolean {
  return [...text].some((char) => LETTER_RE.test(char) && !CJK_RE.test(char));
}

function splitLines(text: string): string[] {
  return text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
}

type LineLanguage = "foreign" | "chinese" | null;

const EMOTION_TAG_RE = /\[emotion=[^\]]*\]/gi;

function lastEmotionTag(line: string): string | undefined {
  return line.match(EMOTION_TAG_RE)?.pop();
}

function lineLanguage(line: string): LineLanguage {
  const content = cleanTTSTags(line);
  if (KANA_RE.test(content) || (hasForeignLetters(content) && !hasChinese(content))) return "foreign";
  if (hasChinese(content) && !hasForeignLetters(content)) return "chinese";
  return null;
}

/**
 * 「原文＋翻譯」一組兩行（順序看第一行是哪種語言），找第 index 行同一組的另一行。
 * 組裡第一行往後找、第二行往前找，跳過分不出語言的行。
 */
function findPairPartner(kinds: LineLanguage[], index: number): number {
  const leading = kinds.find(Boolean);
  const step = kinds[index] === leading ? 1 : -1;
  for (let j = index + step; j >= 0 && j < kinds.length; j += step) {
    if (kinds[j] && kinds[j] !== kinds[index]) return j;
  }
  return -1;
}

function selectPairedLanguageLines(lines: string[], language: "foreign" | "chinese"): string[] {
  const kinds = lines.map(lineLanguage);
  if (!kinds.includes("foreign") || !kinds.includes("chinese")) return [];

  const selected = lines.map((line, i) => (kinds[i] === language ? line : null));
  // 被拿掉那行的 [emotion=...] 交給同一組留下的那行，不然整句沒有情緒標記，
  // 第一次合成會沒聲音、重新生成會變成沒有情緒的整段朗讀
  lines.forEach((line, i) => {
    if (kinds[i] === language || !kinds[i]) return;
    const tag = lastEmotionTag(line);
    const partner = findPairPartner(kinds, i);
    if (tag && partner !== -1 && selected[partner] !== null && !lastEmotionTag(selected[partner]!)) {
      selected[partner] += tag;
    }
  });
  return selected.filter((line): line is string => line !== null);
}

/** 全部朗讀時，沒標記的那行跟著同一組另一行的情緒，原文和翻譯才會各自成段、不會漏念 */
function shareEmotionTagsWithinPairs(lines: string[]): string[] {
  const kinds = lines.map(lineLanguage);
  if (!kinds.includes("foreign") || !kinds.includes("chinese")) return lines;
  return lines.map((line, i) => {
    if (!kinds[i] || lastEmotionTag(line)) return line;
    const partner = findPairPartner(kinds, i);
    const tag = partner === -1 ? undefined : lastEmotionTag(lines[partner]);
    return tag ? line + tag : line;
  });
}

function removeJapaneseTranslation(text: string): string {
  if (!KANA_RE.test(text)) return text;
  // Treat Han-only brackets as translations; unmarked Japanese asides are ambiguous.
  return text.replace(/\([^()]*\)|（[^（）]*）|\[[^\[\]]*\]|【[^【】]*】/gu, (part) => {
    const content = cleanTTSTags(part);
    return hasChinese(content) && !hasForeignLetters(content) ? "" : part;
  });
}

function removeChineseRuns(text: string): string {
  return text.split("\n").map((line) => {
    if (KANA_RE.test(line)) return removeJapaneseTranslation(line).trim();
    return line.replace(/[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]+/gu, "");
  }).join("\n").replace(/\s{2,}/g, " ").trim();
}

function removeForeignRuns(text: string): string {
  const markers: string[] = [];
  const protectedText = text.replace(
    /\([a-z-]+\)|<#[\d.]+#>|\[emotion=[^\]]+\]/gi,
    (marker) => {
      const index = markers.push(marker) - 1;
      return `\uE000${index}\uE001`;
    },
  );
  const stripped = protectedText
    .replace(/[^\s\p{P}\p{S}\p{N}\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uE000-\uE001]+/gu, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  return stripped.replace(/\uE000(\d+)\uE001/g, (_, index: string) => markers[Number(index)] || "");
}

const TRANSLATION_BRACKET_RE = /\([^()]*\)|（[^（）]*）|\[[^\[\]]*\]|【[^【】]*】/gu;
const WRAPPED_RE = /^(?:\(([\s\S]*)\)|（([\s\S]*)）|\[([\s\S]*)\]|【([\s\S]*)】)$/u;

/** 外語：有假名，或有拼音字母且沒有漢字 */
function isForeignText(text: string): boolean {
  const content = cleanTTSTags(text);
  return KANA_RE.test(content) || (hasForeignLetters(content) && !hasChinese(content));
}

/** 中文：有漢字，沒有假名或拼音字母 */
function isChineseText(text: string): boolean {
  const content = cleanTTSTags(text);
  return hasChinese(content) && !hasForeignLetters(content);
}

function unwrapBrackets(text: string): string {
  const match = text.trim().match(WRAPPED_RE);
  return (match ? match[1] ?? match[2] ?? match[3] ?? match[4] : text).trim();
}

/**
 * 把擠在同一句的「原文＋中文翻譯」拆開。
 * 只在能確定哪段是外語時才拆（全漢字的日文分不出來），拆不出回傳 null，不刪任何字。
 */
export function splitEmbeddedTranslation(
  text: string,
): { original: string; translation: string } | null {
  const cleaned = stripHtmlForTTS(text);
  const lines = splitLines(cleaned);
  if (lines.length > 1) {
    const foreign = lines.filter(isForeignText);
    const chinese = lines.filter((line) => !isForeignText(line) && isChineseText(line));
    if (!foreign.length || !chinese.length || foreign.length + chinese.length !== lines.length) {
      return null;
    }
    return {
      original: foreign.join("\n"),
      translation: chinese.map(unwrapBrackets).join("\n"),
    };
  }

  const translations: string[] = [];
  const original = cleaned
    .replace(TRANSLATION_BRACKET_RE, (part) => {
      if (!isChineseText(part)) return part;
      translations.push(unwrapBrackets(part));
      return "";
    })
    .replace(/[ \t]{2,}/g, " ")
    .trim();
  if (!translations.length || !original || !isForeignText(original)) return null;
  return { original, translation: translations.join(" ") };
}

export function prepareTTSContent(text: string, mode: TTSLanguageMode = "auto"): string {
  const cleaned = stripHtmlForTTS(text);
  if (!cleaned) return cleaned;

  const lines = splitLines(cleaned);
  if (mode === "all") {
    const shared = shareEmotionTagsWithinPairs(lines);
    return shared.every((line, i) => line === lines[i]) ? cleaned : shared.join("\n");
  }
  const paired = selectPairedLanguageLines(lines, mode === "chinese" ? "chinese" : "foreign");
  if (paired.length > 0) {
    return (mode === "foreign" ? paired.map(removeJapaneseTranslation) : paired).join("\n").trim();
  }
  if (mode === "foreign") return removeChineseRuns(cleaned);
  if (mode === "chinese") return removeForeignRuns(cleaned);

  return cleaned;
}
