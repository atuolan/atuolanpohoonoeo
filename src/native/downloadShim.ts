/**
 * App 的內建瀏覽器不支援 <a download>：blob:／data: 網址點了沒有任何反應。
 * 程式裡有二十幾處用它匯出檔案（角色卡、聊天記錄、截圖…），
 * 這裡統一攔截，改存進手機的公開資料夾，不用每個地方各改一次。
 */
import { saveBlobToDevice } from "./nativeFiles";

/** 改回原本行為時用：避免再被自己攔截 */
const bypass = new WeakSet<HTMLAnchorElement>();
let originalClick: (this: HTMLAnchorElement) => void = HTMLAnchorElement.prototype.click;

function filenameFrom(anchor: HTMLAnchorElement): string {
  if (anchor.download) return anchor.download;
  try {
    const last = new URL(anchor.href).pathname.split("/").pop();
    if (last) return decodeURIComponent(last);
  } catch {
    /* blob:／data: 沒有檔名 */
  }
  return `203phone-${Date.now()}`;
}

function showToast(message: string, isError = false): void {
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

/**
 * 把連結指向的檔案存進手機。
 * 必須同步呼叫 fetch：很多地方 click() 完立刻 revokeObjectURL，
 * fetch 在 revoke 之前開始就讀得到。
 */
function saveAnchorTarget(anchor: HTMLAnchorElement): void {
  const href = anchor.href;
  const filename = filenameFrom(anchor);
  const pending = fetch(href).then((res) => {
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.blob();
  });

  pending
    .then((blob) => saveBlobToDevice(blob, filename))
    .then((location) => showToast(`已存到 ${location}`))
    .catch((err) => {
      console.error("[NativeDownload] 存檔失敗:", err);
      if (/^https?:/i.test(href)) {
        // 遠端檔案抓不到（多半是 CORS）：交給系統瀏覽器下載
        bypass.add(anchor);
        originalClick.call(anchor);
        return;
      }
      showToast(`存檔失敗：${err instanceof Error ? err.message : String(err)}`, true);
    });
}

function shouldIntercept(anchor: HTMLAnchorElement): boolean {
  if (bypass.has(anchor) || !anchor.hasAttribute("download")) return false;
  return /^(blob:|data:|https?:)/i.test(anchor.href);
}

export function installNativeDownloadShim(): void {
  // 程式裡的 a.click()
  originalClick = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) {
    if (shouldIntercept(this)) {
      saveAnchorTarget(this);
      return;
    }
    originalClick.call(this);
  };

  // 模板裡寫死的 <a download>，使用者直接點到
  document.addEventListener(
    "click",
    (event) => {
      const target = event.target as Element | null;
      const anchor = target?.closest?.("a[download]") as HTMLAnchorElement | null;
      if (!anchor) return;
      if (bypass.has(anchor)) {
        // 退回原本行為的那一下：放行
        bypass.delete(anchor);
        return;
      }
      if (!shouldIntercept(anchor)) return;
      event.preventDefault();
      saveAnchorTarget(anchor);
    },
    true,
  );
}
