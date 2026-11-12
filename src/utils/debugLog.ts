// Debug 紀錄：console 輸出、沒接住的錯誤、每次 AI 請求的結果都留一份在記憶體裡。
// 玩家出問題之後才打開 debug 視窗也看得到先前的紀錄，還能整份複製給開發者。
// 這個檔不碰 DOM（除了裝監聽），畫面在 debugOverlay.ts。

export type DebugLogLevel = "log" | "info" | "warn" | "error";

export interface DebugLogEntry {
  id: number;
  at: number;
  level: DebugLogLevel;
  text: string;
}

export type DebugRequestStatus = "pending" | "ok" | "empty" | "error" | "aborted";

export interface DebugRequestRecord {
  id: number;
  at: number;
  /** API 主機（不含路徑、不含金鑰） */
  host: string;
  /** 經過本站代理轉送 */
  viaProxy: boolean;
  model: string;
  stream: boolean;
  messageCount: number;
  status: DebugRequestStatus;
  durationMs?: number;
  contentLength?: number;
  finishReason?: string;
  error?: string;
  promptTokens?: number;
  completionTokens?: number;
  /** 出問題時才留：完整診斷（已截短） */
  diagnostics?: string;
}

export interface DebugRequestResult {
  content?: string;
  finishReason?: string;
  rawFinishReason?: string;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  diagnostics?: unknown;
  /** 模型這次是呼叫工具（沒有文字也算成功） */
  toolCallCount?: number;
}

export interface DebugRequestTracker {
  finish(result: DebugRequestResult): void;
  fail(error: unknown): void;
  abort(): void;
}

const MAX_LOGS = 500;
const MAX_REQUESTS = 30;
/** 沒開 debug 視窗時每則只留這麼長，省記憶體也省序列化的時間 */
const QUIET_TEXT_LIMIT = 600;
const VERBOSE_TEXT_LIMIT = 6000;
const DIAGNOSTICS_LIMIT = 3000;

const logs: DebugLogEntry[] = [];
const requests: DebugRequestRecord[] = [];
let nextId = 1;
let verbose = false;
let installed = false;

type Listener = () => void;
const logListeners = new Set<(entry: DebugLogEntry) => void>();
const requestListeners = new Set<Listener>();

// ===== 文字處理 =====

const SECRET_HINT = /sk-|bearer|aiza|key|token|authorization|password|secret/i;

/** 把看起來像金鑰的東西蓋掉：紀錄會被截圖、複製給別人 */
export function redactSecrets(text: string): string {
  if (!SECRET_HINT.test(text)) return text;
  return text
    .replace(/\bsk-[A-Za-z0-9_-]{8,}/g, "sk-***")
    .replace(/\bAIza[0-9A-Za-z_-]{16,}/g, "AIza***")
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/gi, "Bearer ***")
    .replace(/([?&](?:key|api_key|apikey|access_token|token)=)[^&\s"']+/gi, "$1***")
    .replace(
      /(["']?(?:api[-_]?key|authorization|x-api-key|x-goog-api-key|access[-_]?token|refresh[-_]?token|password|secret)["']?\s*[:=]\s*["']?)(?!\*\*\*)(?:Bearer\s+)?[^"'\s,}&]{6,}/gi,
      "$1***",
    );
}

/** 不展開整個物件的簡短預覽（沒開 debug 視窗時用，大物件也不會卡） */
function previewValue(value: unknown, depth: number, budget: { left: number }): string {
  if (budget.left <= 0) return "…";
  if (value === null || value === undefined) return String(value);
  if (typeof value === "string") {
    const s = value.length > 120 ? `${value.slice(0, 120)}…` : value;
    budget.left -= s.length;
    return JSON.stringify(s);
  }
  if (typeof value !== "object") {
    const s = String(value);
    budget.left -= s.length;
    return s;
  }
  if (Array.isArray(value)) {
    if (depth <= 0) return `[${value.length} 項]`;
    const parts: string[] = [];
    for (const item of value.slice(0, 5)) {
      if (budget.left <= 0) break;
      parts.push(previewValue(item, depth - 1, budget));
    }
    return `[${parts.join(",")}${value.length > parts.length ? `,…共${value.length}項` : ""}]`;
  }
  if (depth <= 0) return "{…}";
  const parts: string[] = [];
  let count = 0;
  for (const key in value as Record<string, unknown>) {
    count++;
    if (parts.length >= 8 || budget.left <= 0) continue;
    budget.left -= key.length;
    let inner: string;
    try {
      inner = previewValue((value as Record<string, unknown>)[key], depth - 1, budget);
    } catch {
      inner = "?";
    }
    parts.push(`${key}:${inner}`);
  }
  return `{${parts.join(",")}${count > parts.length ? ",…" : ""}}`;
}

function formatError(err: Error, full: boolean): string {
  const head = `${err.name}: ${err.message}`;
  if (!full || !err.stack) return head;
  // Chrome 的 stack 開頭就是 name: message（訊息可能有好幾行），不重複；Safari 沒有這段
  const stack = err.stack.startsWith(head) ? err.stack.slice(head.length) : err.stack;
  const frames = stack
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 4);
  return frames.length ? `${head}\n  ${frames.join("\n  ")}` : head;
}

function formatArg(arg: unknown, full: boolean): string {
  if (typeof arg === "string") return arg;
  if (arg instanceof Error) return formatError(arg, full);
  if (arg === null || typeof arg !== "object") return String(arg);
  if (!full) return previewValue(arg, 2, { left: 300 });
  try {
    const s = JSON.stringify(arg);
    if (s === undefined) return String(arg);
    // Event、DOMException 之類序列化出來是 {}：補上看得懂的內容
    if (s === "{}") {
      const message = (arg as { message?: unknown }).message;
      return typeof message === "string" ? message : String(arg);
    }
    return s;
  } catch {
    return previewValue(arg, 2, { left: 300 });
  }
}

/** console 的參數 → 一行文字（full=false 時物件只給簡短預覽） */
export function formatDebugArgs(args: unknown[], full = true): string {
  const limit = full ? VERBOSE_TEXT_LIMIT : QUIET_TEXT_LIMIT;
  let text = args.map((a) => formatArg(a, full)).join(" ");
  if (text.length > limit) text = `${text.slice(0, limit)}…（共 ${text.length} 字，已截短）`;
  return redactSecrets(text);
}

// ===== 日誌 =====

export function pushDebugLog(level: DebugLogLevel, args: unknown[]): DebugLogEntry {
  // 警告和錯誤一律留完整內容；一般訊息只有開著 debug 視窗才展開物件
  const full = verbose || level === "warn" || level === "error";
  const entry: DebugLogEntry = { id: nextId++, at: Date.now(), level, text: formatDebugArgs(args, full) };
  logs.push(entry);
  if (logs.length > MAX_LOGS) logs.splice(0, logs.length - MAX_LOGS);
  for (const listener of logListeners) {
    try {
      listener(entry);
    } catch {
      /* 畫面那邊壞了不能影響到原本的 console */
    }
  }
  return entry;
}

export function getDebugLogs(): readonly DebugLogEntry[] {
  return logs;
}

export function clearDebugLogs(): void {
  logs.length = 0;
}

export function onDebugLog(listener: (entry: DebugLogEntry) => void): () => void {
  logListeners.add(listener);
  return () => logListeners.delete(listener);
}

/** 開著 debug 視窗時把一般訊息裡的物件也完整展開 */
export function setDebugLogVerbose(on: boolean): void {
  verbose = on;
}

const originalConsole: Partial<Record<DebugLogLevel, (...args: unknown[]) => void>> = {};

/**
 * 接上 console 和沒接住的錯誤。重複呼叫沒關係。
 * 沒有 window 的環境（測試）什麼都不做。
 */
export function installDebugLogCapture(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;

  for (const level of ["log", "info", "warn", "error"] as const) {
    const original = console[level].bind(console);
    originalConsole[level] = original;
    console[level] = (...args: unknown[]) => {
      original(...args);
      try {
        pushDebugLog(level, args);
      } catch {
        /* 紀錄失敗不能讓呼叫 console 的地方壞掉 */
      }
    };
  }

  window.addEventListener("error", (event) => {
    const where = event.filename ? `（${event.filename.split("/").pop()}:${event.lineno}）` : "";
    pushDebugLog("error", [`[沒接住的錯誤]${where}`, event.error ?? event.message]);
  });
  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason;
    // 切到背景時瀏覽器取消請求是正常的，不算錯誤
    if (reason instanceof Error && reason.name === "AbortError") return;
    pushDebugLog("error", ["[沒接住的 Promise 錯誤]", reason]);
  });
}

// ===== AI 請求紀錄 =====

function notifyRequests(): void {
  for (const listener of requestListeners) {
    try {
      listener();
    } catch {
      /* 同上 */
    }
  }
}

function describeEndpoint(endpoint: string): { host: string; viaProxy: boolean } {
  try {
    const base = typeof location !== "undefined" ? location.href : "http://localhost/";
    const url = new URL(endpoint, base);
    // 本站代理：/ai-proxy/真正的主機/...
    const proxied = url.pathname.match(/^\/ai-proxy(?:-http)?\/([^/]+)/);
    if (proxied) return { host: proxied[1], viaProxy: true };
    return { host: url.host, viaProxy: false };
  } catch {
    return { host: "（網址解析不了）", viaProxy: false };
  }
}

/** 開始一次 AI 請求的紀錄；結束時呼叫回傳物件的 finish／fail／abort 其中一個 */
export function beginDebugRequest(info: {
  endpoint: string;
  model: string;
  stream: boolean;
  messageCount: number;
}): DebugRequestTracker {
  const startedAt = Date.now();
  const record: DebugRequestRecord = {
    id: nextId++,
    at: startedAt,
    ...describeEndpoint(info.endpoint),
    model: info.model || "（沒填模型）",
    stream: info.stream,
    messageCount: info.messageCount,
    status: "pending",
  };
  requests.push(record);
  if (requests.length > MAX_REQUESTS) requests.splice(0, requests.length - MAX_REQUESTS);
  notifyRequests();

  let settled = false;
  const settle = (apply: () => void) => {
    if (settled) return;
    settled = true;
    record.durationMs = Date.now() - startedAt;
    apply();
    notifyRequests();
  };
  const keepDiagnostics = (diagnostics: unknown) => {
    if (diagnostics === undefined || diagnostics === null) return;
    try {
      const text = redactSecrets(JSON.stringify(diagnostics));
      record.diagnostics =
        text.length > DIAGNOSTICS_LIMIT ? `${text.slice(0, DIAGNOSTICS_LIMIT)}…（已截短）` : text;
    } catch {
      /* 序列化不了就不留 */
    }
  };

  return {
    finish(result) {
      settle(() => {
        const content = result.content ?? "";
        record.contentLength = content.length;
        record.finishReason = result.rawFinishReason || result.finishReason;
        record.promptTokens = result.usage?.prompt_tokens;
        record.completionTokens = result.usage?.completion_tokens;
        record.status = content.trim() || result.toolCallCount ? "ok" : "empty";
        // 正常的回覆不留診斷，只有空的才留
        if (record.status === "empty") keepDiagnostics(result.diagnostics);
      });
    },
    fail(error) {
      settle(() => {
        record.status = "error";
        record.error = redactSecrets(error instanceof Error ? error.message : String(error)).slice(0, 1500);
      });
    },
    abort() {
      settle(() => {
        record.status = "aborted";
      });
    },
  };
}

export function getDebugRequests(): readonly DebugRequestRecord[] {
  return requests;
}

export function clearDebugRequests(): void {
  requests.length = 0;
  notifyRequests();
}

export function onDebugRequestsChange(listener: Listener): () => void {
  requestListeners.add(listener);
  return () => requestListeners.delete(listener);
}

// ===== 診斷報告 =====

const pad = (n: number) => String(n).padStart(2, "0");

export function formatDebugClock(at: number): string {
  const d = new Date(at);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function formatDateTime(at: number): string {
  const d = new Date(at);
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${formatDebugClock(at)}`;
}

const STATUS_LABEL: Record<DebugRequestStatus, string> = {
  pending: "進行中",
  ok: "成功",
  empty: "空回覆",
  error: "失敗",
  aborted: "已中止",
};

/** 一次請求 → 一行摘要 */
export function describeDebugRequest(record: DebugRequestRecord): string {
  const parts = [
    `${formatDebugClock(record.at)} ${STATUS_LABEL[record.status]}`,
    record.model,
    `${record.host}${record.viaProxy ? "（經代理）" : ""}`,
    record.stream ? "串流" : "非串流",
    `送出 ${record.messageCount} 則`,
  ];
  if (typeof record.durationMs === "number") parts.push(`${(record.durationMs / 1000).toFixed(1)} 秒`);
  if (typeof record.contentLength === "number") parts.push(`回覆 ${record.contentLength} 字`);
  if (record.finishReason) parts.push(`結束原因 ${record.finishReason}`);
  if (typeof record.promptTokens === "number" || typeof record.completionTokens === "number") {
    parts.push(`token ${record.promptTokens ?? "?"}→${record.completionTokens ?? "?"}`);
  }
  return parts.join("｜");
}

export interface DebugReportSection {
  title: string;
  lines: string[];
}

type SectionProvider = () => DebugReportSection | null | Promise<DebugReportSection | null>;
const sectionProviders: SectionProvider[] = [];

/** 報告裡額外的段落（版本、API 設定…）；由知道這些資料的地方登記，這個檔不用認識它們 */
export function registerDebugReportSection(provider: SectionProvider): void {
  sectionProviders.push(provider);
}

const REPORT_LINE_LIMIT = 500;
const clip = (text: string) =>
  text.length > REPORT_LINE_LIMIT ? `${text.slice(0, REPORT_LINE_LIMIT)}…` : text;

/**
 * 把手上的紀錄組成一份可以貼給開發者的文字。
 * 順序照「開發者最先想看的」排：環境 → AI 請求 → 警告錯誤 → 其他日誌。
 */
export function composeDebugReport(input: {
  now: number;
  sections: DebugReportSection[];
  requests: readonly DebugRequestRecord[];
  logs: readonly DebugLogEntry[];
}): string {
  const out: string[] = [`===== 診斷報告 ${formatDateTime(input.now)} =====`];

  for (const section of input.sections) {
    if (!section.lines.length) continue;
    out.push("", `── ${section.title} ──`, ...section.lines);
  }

  out.push("", `── 最近的 AI 請求（新→舊）──`);
  const recentRequests = input.requests.slice(-15).reverse();
  if (!recentRequests.length) out.push("（這次開啟後還沒有送過請求）");
  for (const record of recentRequests) {
    out.push(describeDebugRequest(record));
    if (record.error) out.push(`  錯誤：${clip(record.error)}`);
    if (record.diagnostics) out.push(`  診斷：${record.diagnostics}`);
  }

  const problems = input.logs.filter((e) => e.level === "warn" || e.level === "error").slice(-40);
  out.push("", `── 警告與錯誤（最近 ${problems.length} 則）──`);
  if (!problems.length) out.push("（沒有）");
  for (const entry of problems) {
    out.push(`${formatDebugClock(entry.at)} ${entry.level === "error" ? "✗" : "!"} ${clip(entry.text)}`);
  }

  const others = input.logs.filter((e) => e.level === "log" || e.level === "info").slice(-60);
  out.push("", `── 其他日誌（最近 ${others.length} 則）──`);
  for (const entry of others) {
    out.push(`${formatDebugClock(entry.at)} ${clip(entry.text)}`);
  }

  return out.join("\n");
}

/** 整份診斷報告（含登記進來的段落） */
export async function buildDebugReport(): Promise<string> {
  const sections = await collectDebugReportSections();
  return composeDebugReport({ now: Date.now(), sections, requests, logs });
}

/** 登記進來的段落（環境、API 設定…）；有一段讀不到不影響其他段 */
export async function collectDebugReportSections(): Promise<DebugReportSection[]> {
  const sections: DebugReportSection[] = [];
  for (const provider of sectionProviders) {
    try {
      const section = await provider();
      if (section) sections.push(section);
    } catch (err) {
      sections.push({ title: "（有一段讀不到）", lines: [err instanceof Error ? err.message : String(err)] });
    }
  }
  return sections;
}
