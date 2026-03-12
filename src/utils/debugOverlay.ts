// ===== Debug Overlay（懸浮視窗版）=====
// 可拖拽的懸浮視窗，顯示即時視口資訊和 console 日誌

let overlay: HTMLDivElement | null = null;
let infoBar: HTMLDivElement | null = null;
let logContainer: HTMLDivElement | null = null;
let isMinimized = false;
let updateTimer: number | null = null;

// 拖拽狀態
let isDragging = false;
let dragStartX = 0;
let dragStartY = 0;
let overlayStartX = 0;
let overlayStartY = 0;

// 保存原始 console 方法
const originalConsole = {
  log: console.log,
  warn: console.warn,
  error: console.error,
  info: console.info,
};

export function isDebugOverlayActive(): boolean {
  return overlay !== null;
}

export function initDebugOverlay(): void {
  if (overlay) return;

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
    padding: 8px 12px;
    background: rgba(15, 23, 42, 0.98);
    border-bottom: 1px solid rgba(74, 222, 128, 0.2);
    flex-shrink: 0;
    cursor: grab;
    user-select: none;
    -webkit-user-select: none;
    touch-action: none;
  `;
  header.innerHTML = `<span style="font-weight:bold;color:#4ade80;">🐛 Debug</span>`;

  // 拖拽事件
  header.addEventListener("mousedown", onDragStart);
  header.addEventListener("touchstart", onDragStart, { passive: false });

  // 按鈕組
  const btnGroup = document.createElement("div");
  btnGroup.style.cssText = "display:flex;gap:8px;";

  const clearBtn = createButton("清除", "#f97316", () => {
    if (logContainer) logContainer.innerHTML = "";
  });
  const minBtn = createButton("—", "#38bdf8", () => {
    isMinimized = !isMinimized;
    if (!overlay) return;
    if (isMinimized) {
      overlay.style.maxHeight = "36px";
      overlay.style.borderRadius = "12px";
    } else {
      overlay.style.maxHeight = "45vh";
    }
  });
  const closeBtn = createButton("✕", "#ef4444", () => destroyDebugOverlay());

  btnGroup.append(clearBtn, minBtn, closeBtn);
  header.appendChild(btnGroup);
  overlay.appendChild(header);

  // 資訊列
  infoBar = document.createElement("div");
  infoBar.style.cssText = `
    padding: 6px 12px;
    border-bottom: 1px solid rgba(74, 222, 128, 0.15);
    color: #38bdf8;
    font-size: 11px;
    line-height: 1.5;
    flex-shrink: 0;
  `;
  overlay.appendChild(infoBar);

  // 日誌容器
  logContainer = document.createElement("div");
  logContainer.style.cssText = `
    flex: 1;
    overflow-y: auto;
    padding: 6px 12px;
    -webkit-overflow-scrolling: touch;
  `;
  overlay.appendChild(logContainer);

  document.body.appendChild(overlay);

  // 攔截 console
  console.log = (...args: unknown[]) => { originalConsole.log(...args); addLog("log", args); };
  console.warn = (...args: unknown[]) => { originalConsole.warn(...args); addLog("warn", args); };
  console.error = (...args: unknown[]) => { originalConsole.error(...args); addLog("error", args); };
  console.info = (...args: unknown[]) => { originalConsole.info(...args); addLog("info", args); };

  updateInfo();
  updateTimer = window.setInterval(updateInfo, 2000);
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
  if (updateTimer) { clearInterval(updateTimer); updateTimer = null; }
  console.log = originalConsole.log;
  console.warn = originalConsole.warn;
  console.error = originalConsole.error;
  console.info = originalConsole.info;
  if (overlay) { overlay.remove(); overlay = null; infoBar = null; logContainer = null; }
}

function createButton(text: string, bg: string, onClick: () => void): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.textContent = text;
  btn.style.cssText = `
    padding: 4px 12px;
    background: ${bg};
    color: white;
    border: none;
    border-radius: 6px;
    font-size: 12px;
    font-weight: bold;
    cursor: pointer;
    touch-action: manipulation;
  `;
  btn.addEventListener("click", (e) => { e.stopPropagation(); onClick(); });
  return btn;
}

function updateInfo(): void {
  if (!infoBar) return;
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

  infoBar.innerHTML = [
    `vv: ${vvW}×${vvH} | inner: ${iW}×${iH} | screen: ${sH} | dpr: ${dpr}`,
    `standalone: ${isStandalone} | safe: T=${safeTop} B=${safeBottom} | --app-height: ${appHeight || "unset"}`,
    `probe: ${probeH} | #app: ${appRect}`,
  ].join("<br>");
}

function addLog(type: "log" | "warn" | "error" | "info", args: unknown[]): void {
  if (!logContainer) return;

  const colors: Record<string, string> = {
    log: "#4ade80", warn: "#fbbf24", error: "#f87171", info: "#38bdf8",
  };

  const now = new Date();
  const time = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}:${String(now.getSeconds()).padStart(2, "0")}`;

  const line = document.createElement("div");
  line.style.cssText = `
    padding: 3px 0;
    border-bottom: 1px solid rgba(255,255,255,0.05);
    color: ${colors[type]};
    word-break: break-all;
    line-height: 1.4;
  `;

  const text = args.map((a) => {
    if (typeof a === "string") return a;
    // Error 物件的 message/stack 是不可枚舉的，JSON.stringify 會輸出 {}
    if (a instanceof Error) return `${a.name}: ${a.message}`;
    if (a && typeof a === 'object' && 'message' in a) {
      return (a as { message: string }).message;
    }
    try {
      const s = JSON.stringify(a, null, 0);
      // 防止物件序列化為空 {}，改用 String()
      if (s === '{}' && a !== null && typeof a === 'object') return String(a);
      return s;
    } catch { return String(a); }
  }).join(" ");

  line.textContent = `[${time}] ${type === "error" ? "❌" : type === "warn" ? "⚠️" : "🚀"} ${text}`;
  logContainer.appendChild(line);
  logContainer.scrollTop = logContainer.scrollHeight;

  while (logContainer.children.length > 200) {
    logContainer.removeChild(logContainer.firstChild!);
  }
}
