/**
 * App（Capacitor 打包的 APK）與網頁版的差異集中在這裡判斷。
 *
 * App 的網頁檔打包在 APK 裡，網址是固定的 https://localhost：
 * 沒有自己的伺服器，相對路徑的代理（/ai-proxy/、/image-proxy）在 App 裡不存在，
 * 要改連線上的代理 Worker。
 */
import { Capacitor } from "@capacitor/core";

/** 在 Android／iOS App 裡（不是瀏覽器） */
export function isNativeApp(): boolean {
  return Capacitor.isNativePlatform();
}

/**
 * 通用代理 Worker（cloudflare-worker/tight-sun-f7fa），支援 /proxy/、/ai-proxy/、/ai-proxy-http/、/image-proxy。
 * 同一個 Worker 有兩個網址：workers.dev 和自訂網域 nai-proxy.aguacloud.uk。
 */
export const PROXY_WORKERS_DEV = "https://tight-sun-f7fa.a23971123.workers.dev";
export const NATIVE_PROXY_HOST = "https://nai-proxy.aguacloud.uk";

/**
 * AI 請求（聊天、拉模型、Embedding）用的代理網址。
 *
 * *.workers.dev 在大陸被封。網頁版的使用者多半靠瀏覽器的 VPN／安全 DNS 繞過，
 * 新裝的 App 常常不在 VPN 的分應用清單裡、用的是系統 DNS，就會 Failed to fetch；
 * App 改走同一個 Worker 的自訂網域。
 */
export function aiProxyHost(): string {
  return isNativeApp() ? NATIVE_PROXY_HOST : PROXY_WORKERS_DEV;
}

/**
 * 網頁版用的相對代理路徑，在 App 裡改成指向代理 Worker 的完整網址。
 * 網頁版原樣回傳。
 */
export function resolveProxyPath(path: string): string {
  if (!path.startsWith("/") || !isNativeApp()) return path;
  return `${NATIVE_PROXY_HOST}${path}`;
}

/**
 * App 的專屬連結開頭（AndroidManifest 的 intent-filter 與 strings.xml 的 custom_url_scheme）。
 * 外部瀏覽器打開這種連結，Android 就會切回 App。
 */
export const NATIVE_URL_SCHEME = "uk.aguacloud.aguaphone";

/**
 * Discord OAuth 的 state：授權完 push Worker 會導回這個網址（見 cloud-push 的 redirectBack）。
 * auth = 登入驗證，push = 通知設定裡的連結 Discord。
 */
export function nativeOAuthReturnBase(purpose: "auth" | "push"): string {
  return `${NATIVE_URL_SCHEME}://oauth/${purpose}`;
}

/** App 的備份資料夾，給使用者看的位置（實際路徑在 nativeFiles.ts） */
export const NATIVE_BACKUP_LOCATION = "文件／203Phone";
