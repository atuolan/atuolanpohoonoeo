/**
 * 圖片備註（<pic-note>）：user 傳圖的那一輪，模型看圖時順手寫一兩句圖片內容，存進那則圖片訊息。
 * 之後的回合不再重送圖片（每輪省下上千 token），歷史裡改用這段文字讓角色記得圖裡有什麼。
 */

/** 備註最長字數；提示詞要求 60 字內，這裡只是保險 */
export const PIC_NOTE_MAX_LENGTH = 120;

/** <pic-note text="..."/>、<pic-note>...</pic-note>；第 1 組是屬性，第 2 組是包起來的文字 */
const PIC_NOTE_TAG_REGEX =
  /<pic-note(\s(?:[^>"']|"[^"]*"|'[^']*')*?)?\s*(?:\/>|>([^<]*)<\/pic-note>|>)/gi;
/** 串流到一半還沒寫完的標籤 */
const PIC_NOTE_PARTIAL_REGEX = /<pic-note\b[^>]*$/i;

/** 從回覆移除所有 <pic-note>（含寫到一半的） */
export function stripPicNote(text: string): string {
  if (!/<pic-note/i.test(text)) return text;
  return text.replace(PIC_NOTE_TAG_REGEX, "").replace(PIC_NOTE_PARTIAL_REGEX, "").trim();
}

/** 取出備註（有好幾個時取最後一個有字的），並回傳拿掉標籤後的回覆 */
export function extractPicNote(text: string): { content: string; note: string | null } {
  let note: string | null = null;
  for (const match of text.matchAll(PIC_NOTE_TAG_REGEX)) {
    const quoted = (match[1] ?? "").match(/\btext\s*=\s*(?:"([^"]*)"|'([^']*)')/i);
    const raw = (quoted ? (quoted[1] ?? quoted[2]) : undefined) ?? match[2] ?? "";
    const cleaned = raw.replace(/\s+/g, " ").trim().slice(0, PIC_NOTE_MAX_LENGTH);
    if (cleaned) note = cleaned;
  }
  return { content: stripPicNote(text), note };
}

/** 傳圖那一輪附加給模型的指示 */
export function buildPicNoteInstruction(userName: string): string {
  return [
    "[圖片備註]",
    `${userName} 這一輪傳了圖片。回覆照常寫，另外在整個回覆最後（有 </content> 就放在 </content> 之後）加一個：`,
    '<pic-note text="圖片內容"/>',
    `用一兩句客觀寫下圖片裡有什麼（主體、場景、看得到的文字），60 字內。這段不會顯示給 ${userName}，只用來在之後的對話記得這張圖。`,
  ].join("\n");
}

interface TurnMessage {
  role: string;
  imageData?: string;
  imageMimeType?: string;
}

/**
 * 這一輪 user 傳的圖：最後一則 AI 回覆之後最新的一張，沒有就回傳 undefined。
 * 範圍跟 PromptBuilder 的「最後一輪使用者訊息」一樣：遇到 AI 回覆就停，system 訊息跳過
 */
export function findTurnImageMessage<T extends TurnMessage>(messages: T[]): T | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role === "ai") return undefined;
    if (m.role === "user" && m.imageData && m.imageMimeType) return m;
  }
  return undefined;
}

/** 圖片換成給模型看的文字：有備註用備註，沒有就用 user 寫的說明或文生圖提示詞 */
export function describeImageForPrompt(
  content: string,
  image: { imageNote?: string; imageCaption?: string; imagePrompt?: string },
): string {
  const desc = image.imageNote || image.imageCaption || image.imagePrompt || "圖片";
  const text = content.trim();
  if (!text || text === "[圖片]") return `[圖片：${desc}]`;
  return `${content}\n[圖片：${desc}]`;
}

/** 點開圖片「讀圖」時給模型的指示 */
export function buildReadImagePrompt(caption?: string): string {
  return [
    "請看這張圖片，用一兩句客觀寫下圖片裡有什麼（主體、場景、看得到的文字），60 字內。",
    caption?.trim() ? `傳圖的人附上的說明：「${caption.trim()}」` : "",
    "只輸出描述本身，不要加開頭、引號或任何標籤。",
  ]
    .filter(Boolean)
    .join("\n");
}

/** 整理「讀圖」的回覆：拿掉思考、模型自己包的 <pic-note> 與引號，收成一行 */
export function cleanImageNoteReply(reply: string): string {
  const { content, note } = extractPicNote(
    reply.replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi, ""),
  );
  return (note ?? content)
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^["「『]+|["」』]+$/g, "")
    .trim()
    .slice(0, PIC_NOTE_MAX_LENGTH);
}
