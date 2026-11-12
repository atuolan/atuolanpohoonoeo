// ===== Debug Overlay（懸浮視窗版）=====
// 可拖拽的懸浮視窗。紀錄本身在 debugLog.ts（沒開視窗時也在記），這裡只管畫面：
// 全部／問題（警告和錯誤）／AI 請求／環境 四個分頁、搜尋、複製診斷報告。

import {
  buildDebugReport,
  clearDebugLogs,
  clearDebugRequests,
  collectDebugReportSections,
  describeDebugRequest,
  formatDebugClock,
  getDebugLogs,
  getDebugRequests,
  installDebugLogCapture,
  onDebugLog,
  onDebugRequestsChange,
  setDebugLogVerbose,
  type DebugLogEntry,
  type DebugRequestRecord,
} from "./debugLog";
import { showFloatingToast } from "./floatingToast";

type Tab = "all" | "problems" | "requests" | "env";

/** 重新整理後要不要自動再打開 */
const ENABLED_KEY = "aguaphone:debug-overlay";
const MAX_LINES = 400;
/** 超過這麼長的日誌先收起來，點一下展開 */
const COLLAPSE_AT = 280;

let overlay: HTMLDivElement | null = null;
let titleEl: HTMLSpanElement | null = null;
let tabBar: HTMLDivElement | null = null;
let searchInput: HTMLInputElement | null = null;
let pinnedBar: HTMLDivElement | null = null;
let body: HTMLDivElement | null = null;
let isMinimized = false;
let envTimer: number | null = null;
let activeTab: Tab = "all";
let keyword = "";
let warnCount = 0;
let errorCount = 0;
let unsubscribeLog: (() => void) | null = null;
let unsubscribeRequests: (() => void) | null = null;
const expandedRequests = new Set<number>();

// 自訂常駐資訊行（key -> 文字），固定在分頁列下面，不會被滾動日誌淹沒。
// 例如輪數診斷：setDebugInfoLine("turns", "輪數: 設定20 / 實際20")
const customInfoLines = new Map<string, string>();

/**
 * 設定/更新 debug 視窗裡的一條常駐自訂資訊。
 * 即使 debug overlay 尚未開啟也可呼叫（值會被保存，開啟後立即顯示）。
 * @param key  唯一識別鍵（同一 key 會覆蓋）
 * @param text 顯示文字；傳入空字串可清除該行
 */
export function setDebugInfoLine(key: string, text: string): void {
  if (text) {
    customInfoLines.set(key, text);
  } else {
    customInfoLines.delete(key);
  }
  renderPinned();
}

// 拖拽狀態
let isDragging = false;
let dragStartX = 0;
let dragStartY = 0;
let overlayStartX = 0;
let overlayStartY = 0;

export function isDebugOverlayActive(): boolean {
  return overlay !== null;
}

function rememberEnabled(on: boolean): void {
  try {
    if (on) localStorage.setItem(ENABLED_KEY, "1");
    else localStorage.removeItem(ENABLED_KEY);
  } catch {
    /* 無痕模式之類存不了就算了 */
  }
}

/** 啟動時呼叫：上次開著 debug 視窗的話，重新整理後接著開（才看得到開機階段的問題） */
export function restoreDebugOverlayIfEnabled(): void {
  try {
    if (localStorage.getItem(ENABLED_KEY) === "1") initDebugOverlay();
  } catch {
    /* 同上 */
  }
}

export function initDebugOverlay(): void {
  if (overlay) return;

  installDebugLogCapture();
  setDebugLogVerbose(true);
  rememberEnabled(true);

  overlay = document.createElement("div");
  overlay.id = "debug-overlay";
  overlay.style.cssText = `
    position: fixed;
    bottom: 60px;
    left: 8px;
    right: 8px;
    max-height: 45vh;
    background: rgba(15, 23, 42, 0.94);
    color: #4ade80;
    font-family: 'Courier New', monospace;
    font-size: 11px;
    z-index: 999999;
    display: flex;
    flex-direction: column;
    backdrop-filter: blur(10px);
    border: 1px solid rgba(74, 222, 128, 0.3);
    border-radius: 12px;
    overflow: hidden;
    box-shadow: 0 8px 32px rgba(0,0,0,0.5);
  `;

  // 標題列（可拖拽）
  const header = document.createElement("div");
  header.style.cssText = `
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 8px 12px;
    background: rgba(15, 23, 42, 0.98);
    border-bottom: 1px solid rgba(74, 222, 128, 0.2);
    flex-shrink: 0;
    cursor: grab;
    user-select: none;
    -webkit-user-select: none;
    touch-action: none;
  `;
  titleEl = document.createElement("span");
  titleEl.style.cssText = "font-weight:bold;color:#4ade80;white-space:nowrap;";
  header.appendChild(titleEl);

  // 拖拽事件
  header.addEventListener("mousedown", onDragStart);
  header.addEventListener("touchstart", onDragStart, { passive: false });

  // 按鈕組
  const btnGroup = document.createElement("div");
  btnGroup.style.cssText = "display:flex;gap:6px;flex-shrink:0;";

  const copyBtn = createButton("複製報告", "#22c55e", () => void copyDebugReport());
  const clearBtn = createButton("清除", "#f97316", () => {
    if (activeTab === "requests") {
      expandedRequests.clear();
      clearDebugRequests();
    } else {
      clearDebugLogs();
      warnCount = 0;
      errorCount = 0;
      renderTitle();
      renderBody();
    }
  });
  const minBtn = createButton("—", "#38bdf8", () => {
    isMinimized = !isMinimized;
    if (!overlay) return;
    overlay.style.maxHeight = isMinimized ? "36px" : "45vh";
  });
  const closeBtn = createButton("✕", "#ef4444", () => destroyDebugOverlay());

  btnGroup.append(copyBtn, clearBtn, minBtn, closeBtn);
  header.appendChild(btnGroup);
  overlay.appendChild(header);

  // 分頁列＋搜尋
  tabBar = document.createElement("div");
  tabBar.style.cssText = `
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    border-bottom: 1px solid rgba(74, 222, 128, 0.15);
    flex-shrink: 0;
  `;
  overlay.appendChild(tabBar);

  // 常駐資訊（輪數診斷等）
  pinnedBar = document.createElement("div");
  pinnedBar.style.cssText = `
    padding: 4px 12px;
    border-bottom: 1px solid rgba(74, 222, 128, 0.15);
    color: #fbbf24;
    font-weight: bold;
    line-height: 1.5;
    flex-shrink: 0;
    display: none;
  `;
  overlay.appendChild(pinnedBar);

  // 內容
  body = document.createElement("div");
  body.style.cssText = `
    flex: 1;
    overflow-y: auto;
    padding: 6px 12px;
    -webkit-overflow-scrolling: touch;
  `;
  overlay.appendChild(body);

  document.body.appendChild(overlay);

  // 開視窗之前就記下來的也算進去
  warnCount = 0;
  errorCount = 0;
  for (const entry of getDebugLogs()) countEntry(entry);

  unsubscribeLog = onDebugLog(onNewLog);
  unsubscribeRequests = onDebugRequestsChange(() => {
    renderTabs();
    if (activeTab === "requests") renderBody();
  });

  renderTitle();
  renderTabs();
  renderPinned();
  renderBody();
}

// ===== 拖拽邏輯 =====
function onDragStart(e: MouseEvent | TouchEvent): void {
  if (!overlay) return;
  // 不攔截按鈕點擊
  if ((e.target as HTMLElement).tagName === "BUTTON") return;

  isDragging = true;
  const point = "touches" in e ? e.touches[0] : e;
  dragStartX = point.clientX;
  dragStartY = point.clientY;

  const rect = overlay.getBoundingClientRect();
  overlayStartX = rect.left;
  overlayStartY = rect.top;

  // 切換到 top/left 定位（從 bottom 切過來）
  overlay.style.bottom = "auto";
  overlay.style.right = "auto";
  overlay.style.top = `${rect.top}px`;
  overlay.style.left = `${rect.left}px`;

  document.addEventListener("mousemove", onDragMove);
  document.addEventListener("mouseup", onDragEnd);
  document.addEventListener("touchmove", onDragMove, { passive: false });
  document.addEventListener("touchend", onDragEnd);

  if ("preventDefault" in e) e.preventDefault();
}

function onDragMove(e: MouseEvent | TouchEvent): void {
  if (!isDragging || !overlay) return;
  const point = "touches" in e ? e.touches[0] : e;
  const dx = point.clientX - dragStartX;
  const dy = point.clientY - dragStartY;

  const newX = Math.max(0, Math.min(window.innerWidth - 60, overlayStartX + dx));
  const newY = Math.max(0, Math.min(window.innerHeight - 36, overlayStartY + dy));

  overlay.style.left = `${newX}px`;
  overlay.style.top = `${newY}px`;

  if ("preventDefault" in e) e.preventDefault();
}

function onDragEnd(): void {
  isDragging = false;
  document.removeEventListener("mousemove", onDragMove);
  document.removeEventListener("mouseup", onDragEnd);
  document.removeEventListener("touchmove", onDragMove);
  document.removeEventListener("touchend", onDragEnd);
}

export function destroyDebugOverlay(): void {
  if (envTimer) {
    clearInterval(envTimer);
    envTimer = null;
  }
  unsubscribeLog?.();
  unsubscribeRequests?.();
  unsubscribeLog = null;
  unsubscribeRequests = null;
  // 紀錄照樣留著（之後還能複製報告），只是一般訊息不再展開物件
  setDebugLogVerbose(false);
  rememberEnabled(false);
  if (overlay) {
    overlay.remove();
    overlay = null;
    titleEl = null;
    tabBar = null;
    searchInput = null;
    pinnedBar = null;
    body = null;
  }
  isMinimized = false;
}

// ===== 診斷報告 =====

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const el = document.createElement("textarea");
    el.value = text;
    el.style.cssText = "position:fixed;top:0;left:0;opacity:0;";
    document.body.appendChild(el);
    el.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(el);
    return ok;
  }
}

/** 複製整份診斷報告到剪貼簿 */
export async function copyDebugReport(): Promise<void> {
  try {
    const report = await buildDebugReport();
    if (await copyText(report)) showFloatingToast("診斷報告已複製，貼給開發者就可以了");
    else showFloatingToast("複製失敗，改用「存成檔案」", true);
  } catch (err) {
    showFloatingToast(`複製失敗：${err instanceof Error ? err.message : String(err)}`, true);
  }
}

/** 把診斷報告存成文字檔（App 裡會存進手機的匯出資料夾） */
export async function saveDebugReport(): Promise<void> {
  try {
    const report = await buildDebugReport();
    const d = new Date();
    const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}-${formatDebugClock(d.getTime()).replace(/:/g, "")}`;
    const url = URL.createObjectURL(new Blob([report], { type: "text/plain;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `診斷報告-${stamp}.txt`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  } catch (err) {
    showFloatingToast(`存檔失敗：${err instanceof Error ? err.message : String(err)}`, true);
  }
}

// ===== 畫面 =====

function createButton(text: string, bg: string, onClick: () => void): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.textContent = text;
  btn.style.cssText = `
    padding: 4px 9px;
    background: ${bg};
    color: white;
    border: none;
    border-radius: 6px;
    font-size: 12px;
    font-weight: bold;
    cursor: pointer;
    white-space: nowrap;
    touch-action: manipulation;
  `;
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    onClick();
  });
  return btn;
}

function countEntry(entry: DebugLogEntry): void {
  if (entry.level === "warn") warnCount++;
  else if (entry.level === "error") errorCount++;
}

function renderTitle(): void {
  if (!titleEl) return;
  const counts = [warnCount ? `⚠️${warnCount}` : "", errorCount ? `❌${errorCount}` : ""].filter(Boolean).join(" ");
  titleEl.textContent = counts ? `🐛 ${counts}` : "🐛 Debug";
}

function renderTabs(): void {
  if (!tabBar) return;
  const failed = getDebugRequests().filter((r) => r.status === "error" || r.status === "empty").length;
  const tabs: Array<{ id: Tab; label: string }> = [
    { id: "all", label: "全部" },
    { id: "problems", label: "問題" },
    { id: "requests", label: failed ? `AI 請求 ❌${failed}` : "AI 請求" },
    { id: "env", label: "環境" },
  ];

  // 搜尋框留著不重建：正在打字時重畫分頁不能把焦點弄丟
  if (!searchInput) {
    searchInput = document.createElement("input");
    searchInput.type = "search";
    searchInput.placeholder = "搜尋";
    searchInput.style.cssText = `
      flex: 1;
      min-width: 0;
      padding: 3px 8px;
      background: rgba(255,255,255,0.08);
      color: #e2e8f0;
      border: 1px solid rgba(148, 163, 184, 0.3);
      border-radius: 6px;
      font-size: 12px;
      font-family: inherit;
      outline: none;
    `;
    searchInput.addEventListener("input", () => {
      keyword = searchInput?.value.trim().toLowerCase() ?? "";
      renderBody();
    });
  }

  tabBar.innerHTML = "";
  for (const tab of tabs) {
    const btn = document.createElement("button");
    btn.textContent = tab.label;
    const on = tab.id === activeTab;
    btn.style.cssText = `
      padding: 3px 8px;
      background: ${on ? "rgba(74, 222, 128, 0.22)" : "transparent"};
      color: ${on ? "#4ade80" : "#94a3b8"};
      border: 1px solid ${on ? "rgba(74, 222, 128, 0.5)" : "rgba(148, 163, 184, 0.3)"};
      border-radius: 6px;
      font-size: 12px;
      font-family: inherit;
      white-space: nowrap;
      cursor: pointer;
      touch-action: manipulation;
    `;
    btn.addEventListener("click", () => {
      if (activeTab === tab.id) return;
      activeTab = tab.id;
      renderTabs();
      renderBody();
    });
    tabBar.appendChild(btn);
  }
  searchInput.style.display = activeTab === "all" || activeTab === "problems" ? "" : "none";
  tabBar.appendChild(searchInput);
}

function renderPinned(): void {
  if (!pinnedBar) return;
  pinnedBar.innerHTML = "";
  for (const text of customInfoLines.values()) {
    const line = document.createElement("div");
    line.textContent = text;
    pinnedBar.appendChild(line);
  }
  pinnedBar.style.display = customInfoLines.size ? "" : "none";
}

function matchesTab(entry: DebugLogEntry): boolean {
  if (activeTab === "problems" && entry.level !== "warn" && entry.level !== "error") return false;
  if (activeTab !== "all" && activeTab !== "problems") return false;
  return !keyword || entry.text.toLowerCase().includes(keyword);
}

const LEVEL_COLORS: Record<DebugLogEntry["level"], string> = {
  log: "#4ade80",
  warn: "#fbbf24",
  error: "#f87171",
  info: "#38bdf8",
};

function createLogLine(entry: DebugLogEntry): HTMLDivElement {
  const line = document.createElement("div");
  line.style.cssText = `
    padding: 3px 0;
    border-bottom: 1px solid rgba(255,255,255,0.05);
    color: ${LEVEL_COLORS[entry.level]};
    word-break: break-all;
    white-space: pre-wrap;
    line-height: 1.4;
  `;
  const icon = entry.level === "error" ? "❌" : entry.level === "warn" ? "⚠️" : "🚀";
  const prefix = `[${formatDebugClock(entry.at)}] ${icon} `;
  if (entry.text.length <= COLLAPSE_AT) {
    line.textContent = prefix + entry.text;
    return line;
  }
  let expanded = false;
  const paint = () => {
    line.textContent = expanded
      ? prefix + entry.text
      : `${prefix}${entry.text.slice(0, COLLAPSE_AT)}… ▸點開看全部（${entry.text.length} 字）`;
  };
  line.style.cursor = "pointer";
  line.addEventListener("click", () => {
    // 正在選取文字（要複製）時不要收起來
    if (expanded && window.getSelection()?.toString()) return;
    expanded = !expanded;
    paint();
  });
  paint();
  return line;
}

function onNewLog(entry: DebugLogEntry): void {
  countEntry(entry);
  if (entry.level === "warn" || entry.level === "error") renderTitle();
  if (!body || !matchesTab(entry)) return;
  // 使用者往上捲在看舊的時不要把畫面拉走
  const stick = body.scrollHeight - body.scrollTop - body.clientHeight < 40;
  body.appendChild(createLogLine(entry));
  while (body.children.length > MAX_LINES) body.removeChild(body.firstChild!);
  if (stick) body.scrollTop = body.scrollHeight;
}

function emptyNote(text: string): HTMLDivElement {
  const el = document.createElement("div");
  el.style.cssText = "padding: 8px 0; color: #94a3b8;";
  el.textContent = text;
  return el;
}

function renderBody(): void {
  if (!body) return;
  if (envTimer) {
    clearInterval(envTimer);
    envTimer = null;
  }
  body.innerHTML = "";

  if (activeTab === "requests") {
    renderRequests();
    return;
  }
  if (activeTab === "env") {
    renderEnv();
    // 視口數據會跟著鍵盤、旋轉變，只有停在這頁才定時重量
    envTimer = window.setInterval(updateViewportInfo, 2000);
    return;
  }

  const entries = getDebugLogs().filter(matchesTab).slice(-MAX_LINES);
  if (!entries.length) {
    body.appendChild(emptyNote(keyword ? "沒有符合的紀錄" : activeTab === "problems" ? "沒有警告或錯誤" : "還沒有紀錄"));
    return;
  }
  const fragment = document.createDocumentFragment();
  for (const entry of entries) fragment.appendChild(createLogLine(entry));
  body.appendChild(fragment);
  body.scrollTop = body.scrollHeight;
}

const REQUEST_COLORS: Record<DebugRequestRecord["status"], string> = {
  pending: "#38bdf8",
  ok: "#4ade80",
  empty: "#f87171",
  error: "#f87171",
  aborted: "#94a3b8",
};

function renderRequests(): void {
  if (!body) return;
  const records = [...getDebugRequests()].reverse();
  if (!records.length) {
    body.appendChild(emptyNote("這次開啟後還沒有送過 AI 請求"));
    return;
  }
  for (const record of records) {
    const line = document.createElement("div");
    line.style.cssText = `
      padding: 4px 0;
      border-bottom: 1px solid rgba(255,255,255,0.05);
      color: ${REQUEST_COLORS[record.status]};
      word-break: break-all;
      white-space: pre-wrap;
      line-height: 1.5;
    `;
    const detail = [record.error ? `錯誤：${record.error}` : "", record.diagnostics ? `診斷：${record.diagnostics}` : ""]
      .filter(Boolean)
      .join("\n");
    const summary = describeDebugRequest(record);
    if (!detail) {
      line.textContent = summary;
    } else {
      const paint = () => {
        line.textContent = expandedRequests.has(record.id) ? `${summary}\n${detail}` : `${summary} ▸點開看原因`;
      };
      line.style.cursor = "pointer";
      line.addEventListener("click", () => {
        if (expandedRequests.has(record.id) && window.getSelection()?.toString()) return;
        if (expandedRequests.has(record.id)) expandedRequests.delete(record.id);
        else expandedRequests.add(record.id);
        paint();
      });
      paint();
    }
    body.appendChild(line);
  }
}

let viewportEl: HTMLDivElement | null = null;

function renderEnv(): void {
  if (!body) return;
  viewportEl = document.createElement("div");
  viewportEl.style.cssText = "color:#38bdf8;line-height:1.5;white-space:pre-wrap;word-break:break-all;";
  body.appendChild(viewportEl);
  updateViewportInfo();

  const sectionsEl = document.createElement("div");
  sectionsEl.style.cssText = "margin-top:8px;color:#e2e8f0;line-height:1.5;white-space:pre-wrap;word-break:break-all;";
  sectionsEl.textContent = "讀取中…";
  body.appendChild(sectionsEl);
  void collectDebugReportSections().then((sections) => {
    // 讀完時可能已經切到別頁
    if (!sectionsEl.isConnected) return;
    sectionsEl.textContent = sections
      .map((section) => `── ${section.title} ──\n${section.lines.join("\n")}`)
      .join("\n\n");
  });
}

function updateViewportInfo(): void {
  if (!viewportEl || !viewportEl.isConnected) return;
  const vvH = window.visualViewport?.height ?? "N/A";
  const vvW = window.visualViewport?.width ?? "N/A";
  const iH = window.innerHeight;
  const iW = window.innerWidth;
  const sH = window.screen.height;
  const dpr = window.devicePixelRatio;
  const isStandalone =
    ("standalone" in navigator &&
      (navigator as Navigator & { standalone?: boolean }).standalone) ||
    window.matchMedia("(display-mode: standalone)").matches;

  let probeH = 0;
  try {
    const probe = document.createElement("div");
    probe.style.cssText =
      "position:fixed;top:0;bottom:0;left:0;width:1px;visibility:hidden;pointer-events:none;z-index:-1;";
    document.body.appendChild(probe);
    probeH = Math.round(probe.getBoundingClientRect().height);
    document.body.removeChild(probe);
  } catch { /* ignore */ }

  const appEl = document.getElementById("app");
  const appRect = appEl ? Math.round(appEl.getBoundingClientRect().height) : 0;

  const cs = getComputedStyle(document.documentElement);
  const safeTop = cs.getPropertyValue("--safe-top").trim();
  const safeBottom = cs.getPropertyValue("--safe-bottom").trim();
  const appHeight = cs.getPropertyValue("--app-height").trim();

  viewportEl.textContent = [
    "── 視口 ──",
    `vv: ${vvW}×${vvH} | inner: ${iW}×${iH} | screen: ${sH} | dpr: ${dpr}`,
    `standalone: ${isStandalone} | safe: T=${safeTop} B=${safeBottom} | --app-height: ${appHeight || "unset"}`,
    `probe: ${probeH} | #app: ${appRect}`,
  ].join("\n");
}
