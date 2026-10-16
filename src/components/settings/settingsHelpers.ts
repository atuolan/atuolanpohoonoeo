/**
 * 設定 App 各頁共用的小工具（格式化、剪貼簿、API 資訊顯示）。
 */

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function formatDateTime(ts: number | null | undefined): string {
  if (!ts) return "";
  const d = new Date(ts);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function formatBackupTime(ts: number | null | undefined): string {
  if (!ts) return "從未備份";
  return formatDateTime(ts);
}

export function formatClock(ts: number | null | undefined): string {
  if (!ts) return "";
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** 「2 小時前」這種相對時間，首頁摘要用 */
export function formatRelativeTime(ts: number | null | undefined): string {
  if (!ts) return "";
  const diff = Date.now() - ts;
  if (diff < 60_000) return "剛剛";
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 60) return `${minutes} 分鐘前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小時前`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} 天前`;
  return formatDateTime(ts).slice(0, 10);
}

export async function copyTextWithFallback(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const el = document.createElement("textarea");
    el.value = text;
    document.body.appendChild(el);
    el.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(el);
    return ok;
  }
}

/** 從一段文字裡找出端點和密鑰（支援「端點：…」「密鑰：…」或直接貼網址和 key） */
export function parseEndpointAndKey(raw: string): { endpoint?: string; apiKey?: string } {
  const result: { endpoint?: string; apiKey?: string } = {};
  if (!raw) return result;

  const lines = raw
    .split(/\r?\n+/)
    .map((l) => l.trim())
    .filter(Boolean);
  for (const line of lines) {
    const m = /^(?:端點|endpoint|url|api[_\s-]*url)\s*[:：=]\s*(.+)$/i.exec(line);
    if (m && !result.endpoint) {
      result.endpoint = m[1].trim();
      continue;
    }
    const k = /^(?:密鑰|金鑰|key|api[_\s-]*key|token)\s*[:：=]\s*(.+)$/i.exec(line);
    if (k && !result.apiKey) {
      result.apiKey = k[1].trim();
      continue;
    }
  }

  if (!result.endpoint) {
    const urlMatch = raw.match(/https?:\/\/[^\s"'<>]+/i);
    if (urlMatch) result.endpoint = urlMatch[0].trim();
  }
  if (!result.apiKey) {
    // 常見的 key 字首：sk- / pst- / Bearer / 較長無空白片段
    const keyMatch = raw.match(
      /(?:Bearer\s+)?(sk-[A-Za-z0-9_\-]{16,}|pst-[A-Za-z0-9_\-]{16,}|[A-Za-z0-9_\-]{32,})/,
    );
    if (keyMatch) result.apiKey = keyMatch[1].trim();
  }

  return result;
}

export function getProviderLabel(provider: string | undefined): string {
  switch (provider) {
    case "openai":
      return "OpenAI";
    case "claude":
      return "Claude";
    case "gemini":
      return "Gemini";
    case "openrouter":
      return "OpenRouter";
    case "custom":
      return "自定義";
    default:
      return provider || "";
  }
}

export function getEndpointHost(endpoint: string | undefined): string {
  if (!endpoint) return "";
  try {
    const url = new URL(endpoint);
    return url.host || endpoint;
  } catch {
    return endpoint.length > 32 ? endpoint.slice(0, 32) + "…" : endpoint;
  }
}

export function getMaskedApiKey(key: string | undefined): string {
  if (!key) return "未設定密鑰";
  if (key.length <= 8) return "sk-…" + key.slice(-2);
  return key.slice(0, 4) + "…" + key.slice(-4);
}

/** 在 Worker 代理上包一層（解決 CORS 與 mixed content） */
export function toWorkerProxyUrl(url: string, directConnect: boolean | undefined): string {
  if (directConnect) return url;
  if (typeof window === "undefined") return url;
  try {
    const parsed = new URL(url, window.location.origin);
    if (parsed.origin === window.location.origin) return url;
    return `https://tight-sun-f7fa.a23971123.workers.dev/proxy/${parsed.host}${parsed.pathname}${parsed.search}`;
  } catch {
    return url;
  }
}

/** Embedding 與備用 API 用的代理格式（/ai-proxy/ 或 /ai-proxy-http/） */
export function toAiProxyUrl(url: string, directConnect: boolean | undefined): string {
  if (directConnect) return url;
  if (typeof window === "undefined") return url;
  try {
    const parsed = new URL(url, window.location.origin);
    if (parsed.origin === window.location.origin) return url;
    const prefix = parsed.protocol === "http:" ? "/ai-proxy-http/" : "/ai-proxy/";
    return `https://tight-sun-f7fa.a23971123.workers.dev${prefix}${parsed.host}${parsed.pathname}`;
  } catch {
    return url;
  }
}
