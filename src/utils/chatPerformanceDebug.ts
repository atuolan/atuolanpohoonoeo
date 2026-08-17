type ChatPerformanceDetails = Record<string, unknown>;
type ChatPerformanceEntry = ChatPerformanceDetails & {
  label: string;
  atMs: number;
};

let enabledCache: boolean | undefined;

function isEnabled(): boolean {
  if (typeof window === "undefined") return false;
  if (enabledCache !== undefined) return enabledCache;
  try {
    const queryEnabled = new URLSearchParams(window.location.search).get("chatPerf") === "1";
    enabledCache = queryEnabled || window.localStorage.getItem("aguaphone:chatPerf") === "1";
  } catch {
    enabledCache = false;
  }
  return enabledCache;
}

function getMemoryDetails(): ChatPerformanceDetails {
  const memory = (performance as Performance & {
    memory?: { usedJSHeapSize: number; totalJSHeapSize: number };
  }).memory;
  if (!memory) return {};
  return {
    usedHeapMB: Math.round((memory.usedJSHeapSize / 1024 / 1024) * 10) / 10,
    totalHeapMB: Math.round((memory.totalJSHeapSize / 1024 / 1024) * 10) / 10,
  };
}

export function chatPerfMark(label: string, details: ChatPerformanceDetails = {}): void {
  if (!isEnabled()) return;
  const timestamp = Math.round(performance.now() * 10) / 10;
  const entry: ChatPerformanceEntry = {
    label,
    atMs: timestamp,
    ...getMemoryDetails(),
    ...details,
  };
  try {
    performance.mark(`aguaphone-chat:${label}`);
  } catch {
    // Performance marks are optional diagnostics and must never affect chat loading.
  }
  const debugWindow = window as Window & {
    __AGUAPHONE_CHAT_PERF__?: ChatPerformanceEntry[];
  };
  const entries = debugWindow.__AGUAPHONE_CHAT_PERF__ ??= [];
  entries.push(entry);
  if (entries.length > 500) entries.splice(0, entries.length - 500);
  try {
    window.sessionStorage.setItem("aguaphone:chatPerf:last", JSON.stringify(entry));
  } catch {
    // Session storage is optional; the in-memory entries and console remain available.
  }
  console.info("[ChatPerf]", label, entry);
}

export function chatPerfEnabled(): boolean {
  return isEnabled();
}
