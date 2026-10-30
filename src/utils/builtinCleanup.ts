/**
 * 寫死在程式裡的回覆清理（不是正則腳本，全域正則頁看不到）。
 *
 * - 反引號裡的標籤是在「談論」標籤，不能當真的標籤處理
 * - 聊天可以停用其中幾類（存在 Chat.disabledRegexIds，id 以 __cleanup_ 開頭）
 *
 * 兩種都用同一招：處理前在關鍵字元後塞一個私有區字元，清理規則就比對不到，
 * 處理完再拿掉。解析器不用知道這件事，也不用把選項一路往下傳。
 */

/** 擋住比對，還原時直接拿掉 */
const SHIELD = "";
/** 停用清理而留下的標籤；氣泡要把它顯示成文字，不然 HTML 會吃掉標籤本身 */
const SHIELD_KEPT = "";
/** 代替心聲的 ˇ（只有一個字元，塞字元擋不住） */
const SHIELD_VOICE = "";

export const CLEANUP_CONTROL_BLOCKS = "__cleanup_control_blocks";
export const CLEANUP_STATUS_NOTES = "__cleanup_status_notes";
export const CLEANUP_INNER_VOICE = "__cleanup_inner_voice";
export const CLEANUP_LEAK_LINES = "__cleanup_leak_lines";

export const BUILTIN_CLEANUP_ITEMS = [
  {
    id: CLEANUP_CONTROL_BLOCKS,
    name: "[內建清理] 隱藏控制區塊",
    hint: "<UpdateVariable>、<update>、<horae> 等",
  },
  {
    id: CLEANUP_STATUS_NOTES,
    name: "[內建清理] 隱藏時間與狀態標記",
    hint: "[time:…]、[轉帳／紅包／邀請狀態:…]",
  },
  {
    id: CLEANUP_INNER_VOICE,
    name: "[內建清理] 收起心聲",
    hint: "ˇ想法ˇ、~(想法)~；關掉後留在訊息裡",
  },
  {
    id: CLEANUP_LEAK_LINES,
    name: "[內建清理] 刪除思考外漏行",
    hint: "Scene 1.2 — …、基拉祈&雪拉比：…",
  },
] as const;

export interface ParseReplyOptions {
  /** 這個聊天停用的正則／內建清理 id（Chat.disabledRegexIds） */
  disabledRegexIds?: readonly string[];
}

function shieldInlineCode(text: string): string {
  if (!text.includes("`")) return text;
  return text.replace(/```[\s\S]*?(?:```|$)|`[^`\n]+`/g, (span) => {
    if (span.startsWith("```")) return span;
    // 反引號落單時，兩則訊息之間可能被配成一段 code；這種不是在談論標籤
    if (/<\/(?:msg|content|think(?:ing)?)>[\s\S]*<(?:msg|content)[\s>]/i.test(span)) {
      return span;
    }
    return span.replace(/[<[]/g, `$&${SHIELD}`);
  });
}

function shieldDisabledCleanups(text: string, ids: readonly string[]): string {
  let result = text;
  if (ids.includes(CLEANUP_CONTROL_BLOCKS)) {
    result = result.replace(
      /<(?=\/?(?:UpdateVariable|update|horae|horaeevent)>|StatusPlaceHolderImpl\b)/gi,
      `<${SHIELD_KEPT}`,
    );
  }
  if (ids.includes(CLEANUP_STATUS_NOTES)) {
    result = result.replace(
      /\[(?=time(?:stamp)?\s*[:：]|(?:轉帳|紅包|邀請)狀態[:：])/gi,
      `[${SHIELD}`,
    );
  }
  if (ids.includes(CLEANUP_INNER_VOICE)) {
    result = result.replace(/ˇ/g, SHIELD_VOICE).replace(/~\(/g, `~${SHIELD}(`);
  }
  if (ids.includes(CLEANUP_LEAK_LINES)) {
    result = result
      .replace(/S(?=cene\s*[\d.]+\s*[—\-–])/gi, `$&${SHIELD}`)
      .replace(/基(?=拉祈[&＆]雪拉比[：:])/g, `$&${SHIELD}`);
  }
  return result;
}

export function shieldReply(
  text: string,
  disabledIds?: readonly string[],
): string {
  const shielded = shieldInlineCode(text);
  return disabledIds?.length ? shieldDisabledCleanups(shielded, disabledIds) : shielded;
}

export function unshieldReply(text: string, escapeKept = false): string {
  return text
    .replace(new RegExp(`<${SHIELD_KEPT}`, "g"), escapeKept ? "&lt;" : "<")
    .replace(new RegExp(`[${SHIELD}${SHIELD_KEPT}]`, "g"), "")
    .replace(new RegExp(SHIELD_VOICE, "g"), "ˇ");
}

/** 解析結果裡的字串全部還原（欄位很多，一個一個列會漏） */
export function unshieldDeep<T>(value: T): T {
  if (typeof value === "string") return unshieldReply(value) as T;
  if (Array.isArray(value)) return value.map(unshieldDeep) as T;
  if (value && Object.getPrototypeOf(value) === Object.prototype) {
    const record = value as Record<string, unknown>;
    for (const key of Object.keys(record)) record[key] = unshieldDeep(record[key]);
  }
  return value;
}

/** 只跑清理、不解析的地方用（氣泡顯示） */
export function withReplyShield(
  text: string,
  disabledIds: readonly string[] | undefined,
  clean: (shielded: string) => string,
  options?: { escapeKept?: boolean },
): string {
  const shielded = shieldReply(text, disabledIds);
  if (shielded === text) return clean(text);
  return unshieldReply(clean(shielded), options?.escapeKept);
}
