/**
 * 目前這份網頁的版本（dist/live-update/version.json）。
 * App 裡是 APK／IPA 內建的或熱更新下載來的那份；網頁版是部署上去的那份。
 */
import { LIVE_UPDATE_VERSION_FILE } from "./liveUpdateManifest";

/** 讀不到時（例如 vite dev）為 null */
export async function readWebVersion(): Promise<string | null> {
  try {
    const res = await fetch(`/${LIVE_UPDATE_VERSION_FILE}`, { cache: "no-store" });
    if (!res.ok) return null;
    const data = (await res.json()) as { version?: unknown };
    return typeof data.version === "string" ? data.version : null;
  } catch {
    return null;
  }
}
