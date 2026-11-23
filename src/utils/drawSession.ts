/**
 * 調畫風工作紀錄（DrawSession）的純函式：從工具呼叫建步驟、更新、找試畫、給模型的摘要。
 */
import {
  CHOOSE_IMAGE_TOOL_NAME,
  DANBOORU_ARTISTS_TOOL_NAME,
  DANBOORU_TAGS_TOOL_NAME,
  GENERATE_IMAGE_TOOL_NAME,
  VIEW_CHAT_IMAGE_TOOL_NAME,
} from "@/services/toolCalling/imageToolNames";
import type { DrawSession, DrawStep, DrawStepKind } from "@/types/drawSession";

const KIND_BY_TOOL: Record<string, DrawStepKind> = {
  [GENERATE_IMAGE_TOOL_NAME]: "draw",
  [CHOOSE_IMAGE_TOOL_NAME]: "choose",
  [VIEW_CHAT_IMAGE_TOOL_NAME]: "look",
  [DANBOORU_ARTISTS_TOOL_NAME]: "artists",
  [DANBOORU_TAGS_TOOL_NAME]: "tags",
};

/** 這個工具呼叫要記進工作紀錄（而不是一般的工具膠囊） */
export function isDrawSessionTool(toolName: string): boolean {
  return toolName in KIND_BY_TOOL;
}

const text = (value: unknown): string => (typeof value === "string" ? value.trim() : "");
const list = (value: unknown): string[] =>
  (Array.isArray(value) ? value : [value]).map(text).filter(Boolean);

function lookTitle(args: Record<string, unknown>): string {
  if (args.style_ref === true) return "看畫風參考圖";
  const draft = typeof args.draft === "number" ? args.draft : undefined;
  if (draft) return `看試畫 #${draft}`;
  const nth = typeof args.nth === "number" && args.nth > 1 ? `往回第 ${args.nth} 張` : "最新一張";
  const who = args.sender === "user" ? "你傳的圖" : args.sender === "character" ? "自己畫的圖" : "聊天裡的圖";
  return `看${who}（${nth}）`;
}

/** 工具開始執行：建一個進行中的步驟 */
export function stepFromToolCall(
  call: { id: string; name: string; arguments: Record<string, unknown> },
  at = Date.now(),
): DrawStep | null {
  const kind = KIND_BY_TOOL[call.name];
  if (!kind) return null;
  const args = call.arguments || {};
  const base = { id: call.id, kind, status: "running" as const, at };
  switch (kind) {
    case "draw":
      return {
        ...base,
        title: "試畫",
        prompt: text(args.prompt) || undefined,
        negativePrompt: text(args.negative) || undefined,
        note: text(args.note) || undefined,
      };
    case "choose":
      return { ...base, title: typeof args.attempt === "number" ? `選定 #${args.attempt}` : "選定" };
    case "look":
      return { ...base, title: lookTitle(args) };
    case "artists":
      return { ...base, title: `找相似繪師：${list(args.queries).join("／") || "（沒給標籤）"}` };
    case "tags":
      return { ...base, title: `查標籤寫法：${list(args.queries).join("、") || "（沒給關鍵字）"}` };
  }
}

/** 新增或合併一個步驟（同 id 合併欄位），回傳新的 session */
export function upsertDrawStep(session: DrawSession, step: Partial<DrawStep> & { id: string }): DrawSession {
  const index = session.steps.findIndex((s) => s.id === step.id);
  if (index === -1) {
    if (!step.kind) return session;
    return { ...session, steps: [...session.steps, step as DrawStep] };
  }
  const steps = [...session.steps];
  steps[index] = { ...steps[index], ...step };
  return { ...session, steps };
}

/** 工具結果摘要：查繪師、查標籤只留前幾行，不然卡片太長 */
export function summarizeStepResult(kind: DrawStepKind, content: string): string | undefined {
  const trimmed = content.trim();
  if (!trimmed) return undefined;
  if (kind === "draw" || kind === "choose") return undefined;
  const lines = trimmed.split("\n").filter((line) => line.trim());
  const limit = kind === "look" ? 2 : 6;
  const head = lines.slice(0, limit).join("\n");
  return lines.length > limit ? `${head}\n…` : head;
}

/** 畫成功的試畫（照編號排） */
export function listDrafts(session: DrawSession | null | undefined): DrawStep[] {
  if (!session) return [];
  return session.steps
    .filter((s) => s.kind === "draw" && s.status === "success" && s.attempt && s.imageRef)
    .sort((a, b) => (a.attempt ?? 0) - (b.attempt ?? 0));
}

export function findDraft(session: DrawSession | null | undefined, attempt: number): DrawStep | undefined {
  return listDrafts(session).find((s) => s.attempt === attempt);
}

/** 這串調整最大的試畫編號（包含失敗的，避免重號） */
export function maxAttempt(session: DrawSession | null | undefined): number {
  if (!session) return 0;
  return session.steps.reduce((max, s) => Math.max(max, s.attempt ?? 0), 0);
}

/** 這一輪結束：還在跑的步驟標成已取消 */
export function finalizeDrawSession(session: DrawSession): DrawSession {
  if (!session.steps.some((s) => s.status === "running")) return session;
  return {
    ...session,
    steps: session.steps.map((s) => (s.status === "running" ? { ...s, status: "cancelled" as const } : s)),
  };
}

/** 存檔用：拿掉 reactive Proxy */
export function cloneDrawSession(session: DrawSession): DrawSession {
  return { ...session, steps: session.steps.map((s) => ({ ...s })) };
}

interface TurnMessage {
  role: string;
  drawSession?: DrawSession;
}

/**
 * 上一輪角色回覆裡的工作紀錄（跳過這一輪使用者的訊息，碰到再上一輪使用者的訊息就停）。
 * 只算有試畫的。
 */
export function findPrevTurnDrawSession<T extends TurnMessage>(messages: T[]): DrawSession | undefined {
  let i = messages.length - 1;
  while (i >= 0 && messages[i].role !== "ai") i--;
  for (; i >= 0; i--) {
    const m = messages[i];
    if (m.role === "user") break;
    if (m.role === "ai" && listDrafts(m.drawSession).length) return m.drawSession;
  }
  return undefined;
}

/** 下一輪給模型的摘要：每張試畫的提示詞、當時的說明、選了哪張 */
export function describeDrawSessionForPrompt(session: DrawSession, userName = "User"): string {
  const drafts = listDrafts(session);
  const lines = ["[上一輪的試畫紀錄]"];
  for (const d of drafts) {
    const chosen = d.attempt === session.chosenAttempt ? "（貼進聊天的是這張）" : "";
    lines.push(`#${d.attempt}${chosen}`);
    lines.push(`  正面提示詞：${d.prompt || "（沒有）"}`);
    if (d.negativePrompt) lines.push(`  負面提示詞：${d.negativePrompt}`);
    if (d.note) lines.push(`  你當時的說明：${d.note}`);
  }
  if (session.pickedByUser && session.chosenAttempt) {
    lines.push(`${userName} 自己把貼進聊天的圖換成了 #${session.chosenAttempt}。`);
  }
  lines.push(
    `${userName} 提到「#編號」時指的是這些試畫。要看哪一張用 view_chat_image 的 draft 參數；接著調就用 generate_image 再畫（編號會往下接），滿意了用 choose_image 選。`,
  );
  return lines.join("\n");
}

/** 聊天刪除時要一起清掉的試畫圖片 */
export function collectDrawSessionImageRefs(messages: Array<{ drawSession?: DrawSession }>): string[] {
  const refs: string[] = [];
  for (const m of messages) {
    for (const s of m.drawSession?.steps ?? []) if (s.imageRef) refs.push(s.imageRef);
  }
  return refs;
}
