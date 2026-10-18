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

/** 通用代理 Worker（cloudflare-worker/tight-sun-f7fa），支援 /ai-proxy/、/ai-proxy-http/、/image-proxy */
export const NATIVE_PROXY_HOST = "https://tight-sun-f7fa.a23971123.workers.dev";

/**
 * 網頁版用的相對代理路徑，在 App 裡改成指向代理 Worker 的完整網址。
 * 網頁版原樣回傳。
 */
export function resolveProxyPath(path: string): string {
  if (!path.startsWith("/") || !isNativeApp()) return path;
  return `${NATIVE_PROXY_HOST}${path}`;
}

/** App 的備份資料夾，給使用者看的位置（實際路徑在 nativeFiles.ts） */
export const NATIVE_BACKUP_LOCATION = "文件／203Phone";
