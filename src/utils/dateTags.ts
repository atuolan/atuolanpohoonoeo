/**
 * 約會標籤（放在 </content> 後面，也可能被寫在內文裡）
 * - <date-request place="水族館" reason="..."/>  角色約使用者
 * - <date-accept/> / <date-decline reason="..."/>  角色回覆使用者的邀請
 * - <date-pay payer="char|user|split"/>            約會中決定誰付錢
 * - <date-end/>                                     約會結束
 */

export const DATE_TAG_REGEX =
  /<date-(request|accept|decline|pay|end)(\s(?:[^>"']|"[^"]*"|'[^']*')*?)?\s*(?:\/>|>([^<]*)<\/date-\1>|>)/gi;

export interface ParsedDateTags {
  request?: { place: string; reason?: string };
  accept?: boolean;
  decline?: { reason?: string };
  pay?: string;
  end?: boolean;
}

function attr(attrs: string, name: string): string | undefined {
  const m = attrs.match(new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'>/]+))`, "i"));
  const value = m ? (m[1] ?? m[2] ?? m[3]) : undefined;
  return value?.replace(/\s+/g, " ").trim() || undefined;
}

/** 一則回覆裡的約會標籤；同一種有好幾個時取最後一個。沒有任何標籤回 null */
export function parseDateTags(raw: string): ParsedDateTags | null {
  const result: ParsedDateTags = {};
  let found = false;
  for (const match of raw.matchAll(DATE_TAG_REGEX)) {
    const kind = match[1].toLowerCase();
    const attrs = match[2] ?? "";
    found = true;
    if (kind === "request") {
      const place = attr(attrs, "place") ?? match[3]?.trim();
      if (place) result.request = { place: place.slice(0, 20), reason: attr(attrs, "reason")?.slice(0, 60) };
    } else if (kind === "accept") {
      result.accept = true;
    } else if (kind === "decline") {
      result.decline = { reason: (attr(attrs, "reason") ?? match[3]?.trim())?.slice(0, 60) || undefined };
    } else if (kind === "pay") {
      result.pay = attr(attrs, "payer") ?? match[3]?.trim();
    } else if (kind === "end") {
      result.end = true;
    }
  }
  return found ? result : null;
}

export function stripDateTags(text: string): string {
  return text.replace(DATE_TAG_REGEX, "");
}
