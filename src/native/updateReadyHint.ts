/**
 * App 熱更新下載好時的一行提示，點了就換上新版。
 * 樣式跟 floatingToast 一樣，但放在頂欄下面：聊天時底部是最新的訊息和輸入框，上面比較不擋。
 * 沒點也沒關係，下次開 App 會自動換上。
 */
const HINT_DURATION_MS = 12000;

let current: HTMLElement | null = null;

export function showUpdateReadyHint(onApply: () => void): void {
  if (typeof document === "undefined") return;
  current?.remove();
  const el = document.createElement("button");
  el.type = "button";
  el.textContent = "新版已下載，點這裡換上";
  Object.assign(el.style, {
    position: "fixed",
    left: "50%",
    top: "calc(var(--safe-area-inset-top, env(safe-area-inset-top, 0px)) + 60px)",
    transform: "translateX(-50%)",
    maxWidth: "min(88vw, 360px)",
    padding: "8px 16px",
    border: "none",
    borderRadius: "12px",
    background: "rgba(30, 30, 30, 0.88)",
    color: "#fff",
    fontSize: "14px",
    lineHeight: "1.4",
    textAlign: "center",
    whiteSpace: "nowrap",
    zIndex: "2147483647",
    cursor: "pointer",
  } satisfies Partial<CSSStyleDeclaration>);
  el.addEventListener("click", () => {
    el.remove();
    onApply();
  });
  document.body.appendChild(el);
  current = el;
  setTimeout(() => {
    el.remove();
    if (current === el) current = null;
  }, HINT_DURATION_MS);
}
