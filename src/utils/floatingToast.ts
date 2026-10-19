/**
 * 畫面底部的短暫提示。直接掛在 body 上，頁面切走（元件卸載）後也看得到，
 * 例如離開編輯頁時的「已自動儲存」、App 存檔完成的位置。
 */
export function showFloatingToast(message: string, isError = false): void {
  if (typeof document === "undefined") return;
  const el = document.createElement("div");
  el.textContent = message;
  el.setAttribute("role", "status");
  Object.assign(el.style, {
    position: "fixed",
    left: "50%",
    bottom: "calc(var(--safe-area-inset-bottom, env(safe-area-inset-bottom, 0px)) + 72px)",
    transform: "translateX(-50%)",
    maxWidth: "min(88vw, 360px)",
    padding: "10px 16px",
    borderRadius: "12px",
    background: isError ? "rgba(180, 40, 40, 0.92)" : "rgba(30, 30, 30, 0.88)",
    color: "#fff",
    fontSize: "14px",
    lineHeight: "1.4",
    textAlign: "center",
    wordBreak: "break-all",
    zIndex: "2147483647",
    pointerEvents: "none",
  } satisfies Partial<CSSStyleDeclaration>);
  document.body.appendChild(el);
  setTimeout(() => el.remove(), isError ? 5000 : 3500);
}
