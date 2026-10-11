// ===== 按需載入的版型字體 =====
// 特定版型專用的 Google Fonts（手帳拼貼的霞鶩文楷、大字時鐘的 Sora），
// 只在真的用到這些版型時才插入樣式表，避免所有使用者都下載用不到的字體。
// 字體未載入前由各版型 CSS 的 font-family 後備字墊底，畫面不會跳成系統字。
import { watchEffect, type Ref } from "vue";

function ensureStylesheet(id: string, href: string) {
  if (typeof document === "undefined") return;
  if (document.getElementById(id)) return;
  const link = document.createElement("link");
  link.id = id;
  link.rel = "stylesheet";
  link.href = href;
  document.head.appendChild(link);
}

/** active 為 true 時才插入字體樣式表（同一個 id 只插一次） */
export function useOnDemandFont(id: string, href: string, active: Ref<boolean>) {
  watchEffect(() => {
    if (active.value) ensureStylesheet(id, href);
  });
}

/** 手帳拼貼系列（時鐘 / 拍立得 / 便條紙 / 票根）共用的霞鶩文楷 TC */
export function useScrapbookFont(active: Ref<boolean>) {
  useOnDemandFont(
    "aguaphone-scrapbook-font",
    "https://fonts.googleapis.com/css2?family=LXGW+WenKai+TC:wght@400;700&display=swap",
    active,
  );
}

/** 大字時鐘的細體數字 */
export function useHeadlineFont(active: Ref<boolean>) {
  useOnDemandFont(
    "aguaphone-headline-font",
    "https://fonts.googleapis.com/css2?family=Sora:wght@200;300&display=swap",
    active,
  );
}
