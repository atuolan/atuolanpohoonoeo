/**
 * 通話台詞：解析 AI 輸出、雙語欄位正規化，以及顯示／語音／紀錄三種文字轉換
 */
import { MINIMAX_LANGUAGES } from "@/api/MiniMaxTTSApi";
import { PLURK_BLOCK_STRIP_PATTERN } from "@/utils/plurkFormat";
import { toTraditional } from "@/utils/toTraditional";
import { cleanTTSTags } from "@/utils/ttsTagCleaner";
import { prepareTTSContent, splitEmbeddedTranslation } from "@/utils/ttsTextSelector";

export interface CallLine {
  text: string;
  tone?: string;
  /** 中文字幕（雙語模式、原文不是中文時才有） */
  translation?: string;
  /** MiniMax 語言增強名稱，例如 Japanese */
  lang?: string;
}

export interface ParsedCallOutput {
  messages: CallLine[];
  hangup?: { reason?: string };
}

const LANGUAGE_NAMES = new Map(
  MINIMAX_LANGUAGES.filter((l) => l.value && l.value !== "auto").map(
    (l) => [l.value.toLowerCase(), l.value] as const,
  ),
);

/** 只認 MiniMax 支援的語言名稱，回傳正式寫法 */
export function normalizeCallLanguage(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  return LANGUAGE_NAMES.get(raw.trim().toLowerCase());
}

/** 顯示用純文字：<br> 變換行，拿掉 HTML 與語音標記 */
export function toPlainCallText(text: string): string {
  return cleanTTSTags(prepareTTSContent(text || "", "all"));
}

function readText(value: unknown): string {
  return value === undefined || value === null ? "" : String(value).trim();
}

function readTone(raw: Record<string, unknown>): string | undefined {
  const value = raw.tone || raw.emotion;
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

/** 一句台詞的欄位正規化；沒有內容回傳 null */
export function normalizeCallLine(
  raw: Record<string, unknown>,
  bilingual: boolean,
): CallLine | null {
  let text = readText(raw.text ?? raw.content);
  const tone = readTone(raw);
  if (!bilingual) return text ? { text, tone } : null;

  let translation = readText(raw.zh ?? raw.translation);
  let lang = normalizeCallLanguage(raw.lang);
  // 只寫了字幕：當成中文句，原本標的語言也不可信
  if (!text && translation) {
    text = translation;
    translation = "";
    lang = undefined;
  }
  if (!text) return null;

  const embedded = splitEmbeddedTranslation(text);
  if (embedded) {
    text = embedded.original;
    if (!translation) translation = embedded.translation;
  }
  translation = toPlainCallText(translation);
  if (lang === "Chinese" || translation === toPlainCallText(text)) translation = "";

  return {
    text,
    tone,
    ...(translation && { translation }),
    ...(lang && { lang }),
  };
}

/** 解析通話回覆（JSON 陣列為主，退回 <voice> 或純文字） */
export function parsePhoneCallOutput(
  content: string,
  options: { bilingual?: boolean } = {},
): ParsedCallOutput {
  const bilingual = !!options.bilingual;
  if (!content?.trim()) return { messages: [{ text: "..." }] };
  let cleaned = content.replace(/^[\s\S]*?<\/think(?:ing)?>\s*/si, "")
    .replace(/```json\s*/gi, "").replace(/```\s*/g, "")
    // 剝離 MVU 變量更新標籤（卡內帶 MVU 時 AI 會輸出這些）
    .replace(/<UpdateVariable>[\s\S]*?<\/UpdateVariable>/gi, "")
    .replace(/<update>[\s\S]*?<\/update>/gi, "")
    .replace(/<Analysis>[\s\S]*?<\/Analysis>/gi, "")
    // 剝離 affinity-update 標籤
    .replace(/<affinity-update\s+[^>]*?\s*\/?>/gi, "")
    // 剝離噗浪發文標籤
    .replace(PLURK_BLOCK_STRIP_PATTERN, "")
    .trim();
  // 來電 assistant prefill 會導致 AI 回覆缺少開頭的 [，自動補齊
  if (cleaned.startsWith("{") && !cleaned.startsWith("[")) {
    cleaned = "[" + cleaned;
  }
  const jsonMatch = cleaned.match(/\[\s*\{[\s\S]*\}\s*\]/);
  if (jsonMatch) {
    try {
      const s = jsonMatch[0].replace(/[“”]/g, '"').replace(/[‘’]/g, "'");
      const parsed = JSON.parse(s);
      if (Array.isArray(parsed) && parsed.length > 0) {
        const messages: CallLine[] = [];
        let hangup: { reason?: string } | undefined;
        for (const item of parsed) {
          if (!item || typeof item !== "object") continue;
          const action = typeof item.action === "string" ? item.action.toLowerCase() : "";
          const isHangup =
            action === "hangup" ||
            action === "hang_up" ||
            action === "endcall" ||
            action === "end_call" ||
            item.endCall === true ||
            item.hangup === true;
          if (isHangup) {
            hangup = { reason: typeof item.reason === "string" ? item.reason : undefined };
          }
          // 掛斷動作項目也可能附帶最後一句話
          const line = normalizeCallLine(item, bilingual);
          if (line) messages.push(line);
        }
        if (messages.length === 0 && !hangup) {
          messages.push({ text: "..." });
        }
        return { messages, hangup };
      }
    } catch { /* fall through */ }
  }
  const voiceMatch = cleaned.match(/<voice>([\s\S]*?)<\/voice>/i);
  if (voiceMatch) return { messages: [{ text: voiceMatch[1].trim() || "..." }] };
  cleaned = cleaned.replace(/<\/?(?:voice|content|msg)>/gi, "").trim();
  return { messages: cleaned ? [{ text: cleaned }] : [{ text: "..." }] };
}

/** 字幕轉繁體（opencc 載入失敗就沿用原文） */
export async function toTraditionalCallLines(lines: CallLine[]): Promise<CallLine[]> {
  return Promise.all(
    lines.map(async (line) =>
      line.translation ? { ...line, translation: await toTraditional(line.translation) } : line,
    ),
  );
}

/** 泡泡顯示：有字幕時中文為主、原文在下 */
export function getCallLineDisplay(line: {
  content: string;
  translation?: string;
}): { main: string; sub?: string } {
  const original = toPlainCallText(line.content);
  const translation = line.translation ? toPlainCallText(line.translation) : "";
  if (!translation) return { main: original };
  return original ? { main: translation, sub: original } : { main: translation };
}

const EMOTION_MARKER_RE = /\[emotion=[^\]]*\]/gi;

/** 送 TTS 的文字：拿掉 HTML 與 [emotion=...]，保留語氣標籤與停頓給 MiniMax */
export function toCallSpeechText(content: string): string {
  return prepareTTSContent((content || "").replace(EMOTION_MARKER_RE, ""), "all")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

/** 寫回聊天的文字版紀錄：有字幕時寫成「原文（中文）」 */
export function formatCallLineForRecord(line: { content: string; translation?: string }): string {
  if (!line.translation) return line.content;
  return `${toPlainCallText(line.content)}（${toPlainCallText(line.translation)}）`;
}
