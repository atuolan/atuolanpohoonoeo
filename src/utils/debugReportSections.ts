// 診斷報告裡的「環境」「API 設定」「上次執行留下的錯誤」三段。
// 放在這裡而不是 debugLog.ts：那個檔要保持不認識 store，很早就能載入。
import { isNativeApp } from "@/native/platform";
import { readWebVersion } from "@/native/webVersion";
import { redactSecrets, registerDebugReportSection, type DebugReportSection } from "./debugLog";
import { getRuntimeDiagnostics } from "./runtimeDiagnostics";

/** 只留主機：端點的路徑或參數裡可能夾著金鑰 */
export function endpointHost(endpoint: string): string {
  if (!endpoint?.trim()) return "（沒填）";
  try {
    return new URL(endpoint.trim()).host;
  } catch {
    return "（網址格式不對）";
  }
}

async function environmentSection(): Promise<DebugReportSection> {
  const nav = navigator as Navigator & { standalone?: boolean };
  const standalone =
    nav.standalone === true || window.matchMedia("(display-mode: standalone)").matches;
  const where = isNativeApp() ? "App" : standalone ? "加到主畫面的網頁" : "瀏覽器";
  const offsetHours = -new Date().getTimezoneOffset() / 60;
  return {
    title: "環境",
    lines: [
      `網頁版本：${(await readWebVersion()) ?? "讀不到"}`,
      `開啟方式：${where}`,
      `裝置：${navigator.userAgent}`,
      `畫面：${window.innerWidth}×${window.innerHeight}（dpr ${window.devicePixelRatio}）`,
      `網路：${navigator.onLine ? "有連線" : "離線"}｜時區：UTC${offsetHours >= 0 ? "+" : ""}${offsetHours}`,
    ],
  };
}

async function apiSection(): Promise<DebugReportSection> {
  const { useSettingsStore, ROUTABLE_TASKS } = await import("@/stores/settings");
  const settings = useSettingsStore();
  const describe = (api: { endpoint: string; model: string; apiKey: string; directConnect?: boolean; useClaudeNativeCache?: boolean }) =>
    [
      `${api.model || "（沒填模型）"} @ ${endpointHost(api.endpoint)}`,
      api.apiKey ? "" : "沒填金鑰",
      api.directConnect ? "直連" : "經代理",
      api.useClaudeNativeCache ? "Claude 原生快取" : "",
    ]
      .filter(Boolean)
      .join("｜");

  const lines = [
    `主 API：${describe(settings.api)}`,
    `串流：${settings.generation.streamingEnabled ? "開" : "關"}｜串流視窗：${settings.generation.useStreamingWindow ? "開" : "關"}` +
      `｜上下文上限 ${settings.generation.maxContextLength}｜回覆上限 ${settings.generation.maxTokens}`,
  ];

  if (settings.auxiliary.enabled) {
    for (const task of ROUTABLE_TASKS) {
      const profileId = settings.auxiliary.taskBindings[task];
      if (!profileId) continue;
      const profile = settings.auxiliary.profiles.find((p) => p.id === profileId);
      lines.push(`備用 API（${task}）：${profile ? describe(profile.api) : "綁定的設定找不到"}`);
    }
  } else {
    lines.push("備用 API：關");
  }
  return { title: "API 設定", lines };
}

function previousRunSection(): DebugReportSection | null {
  const entries = getRuntimeDiagnostics()
    .filter((entry) => entry.kind === "error" || entry.kind === "reload")
    .slice(-8);
  if (!entries.length) return null;
  return {
    title: "先前留下的錯誤與重新載入紀錄",
    lines: entries.map((entry) => {
      const d = new Date(entry.timestamp);
      const when = `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
      return redactSecrets(`${when} [${entry.source}] ${entry.message}`).slice(0, 400);
    }),
  };
}

let registered = false;

/** 啟動時呼叫一次 */
export function registerDefaultDebugReportSections(): void {
  if (registered) return;
  registered = true;
  registerDebugReportSection(environmentSection);
  registerDebugReportSection(apiSection);
  registerDebugReportSection(previousRunSection);
}
