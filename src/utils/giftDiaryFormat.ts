/**
 * 禮物日記生成的輸出格式：<diary>…</diary>／<margin>…</margin>，外加 <summary>一句話</summary>
 */

export interface GiftDiaryOutput {
  diary?: string;
  margin?: string;
  summary?: string;
}

function pickTag(text: string, tag: string): string | undefined {
  const m = text.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, "i"));
  const value = m?.[1].trim();
  return value || undefined;
}

/** 先拿掉思考區塊；diary 模式沒寫標籤時，整段當日記 */
export function parseGiftDiaryOutput(raw: string, mode: "diary" | "margin"): GiftDiaryOutput {
  const lastThinkEnd = Math.max(raw.lastIndexOf("</think>"), raw.lastIndexOf("</thinking>"));
  let text = lastThinkEnd >= 0 ? raw.slice(raw.indexOf(">", lastThinkEnd) + 1) : raw;
  text = text.trim();
  const result: GiftDiaryOutput = {};
  const summary = pickTag(text, "summary");
  if (summary) result.summary = summary;
  if (mode === "diary") {
    const diary = pickTag(text, "diary") ?? (text.replace(/<summary>[\s\S]*?<\/summary>/gi, "").trim() || undefined);
    if (diary) result.diary = diary;
  } else {
    const margin = pickTag(text, "margin") ?? (text.replace(/<summary>[\s\S]*?<\/summary>/gi, "").trim() || undefined);
    if (margin) result.margin = margin;
  }
  return result;
}
