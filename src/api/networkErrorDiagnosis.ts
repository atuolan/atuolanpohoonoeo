/**
 * 網路錯誤（fetch 直接丟錯、沒有 HTTP 狀態碼）的診斷文字。
 *
 * 各瀏覽器的錯誤字樣不同，iOS（WebKit）只會給一句「Load failed」，
 * 這裡統一辨識，並補上斷在哪個階段、連的是哪台主機、花了多久、
 * 期間 App 有沒有切到背景，方便判斷是誰的問題。
 */

const NETWORK_ERROR_PATTERNS = [
  "load failed", // iOS / Safari
  "failed to fetch", // Chrome
  "network", // Firefox 的 NetworkError、iOS 的 network connection was lost
  "internet connection appears to be offline",
  "request timed out",
  "err_connection",
];

export function isNetworkErrorMessage(message: string): boolean {
  const lower = message.toLowerCase();
  return NETWORK_ERROR_PATTERNS.some((pattern) => lower.includes(pattern));
}

// 記下最後一次切到背景的時間，用來判斷請求期間 App 有沒有被切走
let lastHiddenAt = 0;
if (typeof document !== "undefined") {
  if (document.visibilityState === "hidden") lastHiddenAt = Date.now();
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") lastHiddenAt = Date.now();
  });
}

export function wentBackgroundSince(startedAt: number): boolean {
  if (typeof document !== "undefined" && document.visibilityState === "hidden") return true;
  return lastHiddenAt >= startedAt;
}

/** 從請求網址取出代理主機與實際的 AI 服務主機（走 /ai-proxy/<host>/... 的情況） */
export function describeEndpoint(url: string): string {
  try {
    const parsed = new URL(url);
    const match = parsed.pathname.match(/^\/ai-proxy(?:-http)?\/([^/]+)/);
    return match ? `${match[1]}（經代理 ${parsed.host}）` : parsed.host;
  } catch {
    return url;
  }
}

export interface NetworkErrorContext {
  endpoint: string;
  startedAt: number;
  /** 已收到的串流片段數；都是 0 代表還沒收到回應就斷了 */
  chunkCount?: number;
  totalBytes?: number;
  /** 沒有片段計數時，改用已收到的正文字數 */
  receivedChars?: number;
  /** 已經自動重試過一次 */
  retried?: boolean;
}

export function buildNetworkDiagnosis(context: NetworkErrorContext): string {
  const elapsed = ((Date.now() - context.startedAt) / 1000).toFixed(1);
  const chunkCount = context.chunkCount ?? 0;
  const receivedChars = context.receivedChars ?? 0;
  const midStream = chunkCount > 0 || receivedChars > 0;
  const lines = [
    `[診斷] 網路連線中斷，沒有收到伺服器的錯誤回應。`,
    `・主機：${describeEndpoint(context.endpoint)}`,
    midStream
      ? `・階段：串流中途斷開（已收到 ${chunkCount > 0 ? `${chunkCount} 段 / ${context.totalBytes ?? 0} bytes` : `${receivedChars} 字`}，經過 ${elapsed} 秒）`
      : `・階段：還沒收到任何回應就斷了（經過 ${elapsed} 秒）`,
  ];
  if (context.retried) lines.push("・已自動重試一次，仍然失敗");

  const offline = typeof navigator !== "undefined" && navigator.onLine === false;
  const backgrounded = wentBackgroundSince(context.startedAt);
  if (offline) {
    lines.push("・裝置目前顯示離線，請確認 Wi-Fi／行動網路");
  }
  if (backgrounded) {
    lines.push("・請求期間 App 切到過背景：iOS 會在背景切斷連線，建議開啟「背景運行模式」或生成時留在前景");
  }
  if (!offline && !backgrounded) {
    lines.push(
      midStream
        ? "・可能原因：代理或 AI 服務逾時、網路不穩（切換 Wi-Fi／行動網路時常見）"
        : "・可能原因：連不到代理或 AI 服務（VPN／DNS、網址錯誤、服務掛掉），或剛好切換網路",
    );
  }
  return `\n${lines.join("\n")}`;
}
