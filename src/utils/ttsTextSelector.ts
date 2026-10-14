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

function selectPairedLanguageLines(lines: string[], language: "foreign" | "chinese"): string[] {
  const foreignLines = lines.filter((line) => {
    const content = cleanTTSTags(line);
    return KANA_RE.test(content) || (hasForeignLetters(content) && !hasChinese(content));
  });
  const chineseLines = lines.filter((line) => {
    const content = cleanTTSTags(line);
    return hasChinese(content) && !hasForeignLetters(content);
  });
  if (foreignLines.length > 0 && chineseLines.length > 0) {
    return language === "foreign" ? foreignLines : chineseLines;
  }
  return [];
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
  if (!cleaned || mode === "all") return cleaned;

  const lines = splitLines(cleaned);
  const paired = selectPairedLanguageLines(lines, mode === "chinese" ? "chinese" : "foreign");
  if (paired.length > 0) {
    return (mode === "foreign" ? paired.map(removeJapaneseTranslation) : paired).join("\n").trim();
  }
  if (mode === "foreign") return removeChineseRuns(cleaned);
  if (mode === "chinese") return removeForeignRuns(cleaned);

  return cleaned;
}
