/**
 * App 裡的 Discord 授權：網頁版用彈出視窗，App 沒有彈出視窗，
 * 改用系統瀏覽器（Custom Tab）打開授權頁，授權完 push Worker 導回
 * uk.aguacloud.aguaphone://oauth/<auth|push>/...，Android 切回 App 後由這裡接手。
 */
import { NATIVE_URL_SCHEME } from "./platform";

/** 與 AuthService 的 DISCORD_OAUTH_RESULT_KEY、public/discord-callback.html 一致 */
const DISCORD_OAUTH_RESULT_KEY = "discord_oauth_result";

export interface OAuthReturn {
  purpose: "auth" | "push";
  /** 含開頭的 ?，格式和網頁版 discord-callback.html 收到的一樣 */
  search: string;
}

/** 解析導回 App 的網址；不是 OAuth 回傳就回傳 null */
export function parseOAuthReturnUrl(url: string): OAuthReturn | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== `${NATIVE_URL_SCHEME}:` || parsed.host !== "oauth") return null;
  const purpose = parsed.pathname.split("/")[1];
  if (purpose !== "auth" && purpose !== "push") return null;
  return { purpose, search: parsed.search };
}

/**
 * 用系統瀏覽器打開授權頁。
 * onClosed：使用者直接關掉瀏覽器（沒有授權）時呼叫；授權完切回 App 也可能觸發。
 */
export async function openExternalAuth(url: string, onClosed?: () => void): Promise<void> {
  const { Browser } = await import("@capacitor/browser");
  if (onClosed) {
    const handle = await Browser.addListener("browserFinished", () => {
      handle.remove();
      onClosed();
    });
  }
  await Browser.open({ url });
}

/**
 * 處理導回 App 的網址。回傳 true 表示是 OAuth 回傳、已處理。
 *
 * 登入驗證：照網頁版 discord-callback.html 寫進 localStorage，
 * 再發一個 storage 事件，驗證頁（AuthScreen 的 handleStorage）就會接手。
 * 同一個頁面寫 localStorage 不會自己觸發 storage 事件，所以要手動發。
 */
export async function handleOAuthReturnUrl(url: string): Promise<boolean> {
  const result = parseOAuthReturnUrl(url);
  if (!result) return false;

  import("@capacitor/browser")
    .then(({ Browser }) => Browser.close())
    .catch(() => {
      /* 瀏覽器已經關了 */
    });

  if (result.purpose === "auth") {
    const value = JSON.stringify({ search: result.search, timestamp: Date.now() });
    localStorage.setItem(DISCORD_OAUTH_RESULT_KEY, value);
    window.dispatchEvent(new StorageEvent("storage", { key: DISCORD_OAUTH_RESULT_KEY, newValue: value }));
    return true;
  }

  const { useCloudPushStore } = await import("@/stores/cloudPush");
  await useCloudPushStore().handleDiscordOAuthCallback(result.search);
  return true;
}
