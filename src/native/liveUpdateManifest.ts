/**
 * App 熱更新的清單格式與判斷規則（純函式，網頁建置腳本和 App 共用）。
 *
 * 網頁版每次建置都會在 dist/live-update/ 產生：
 * - manifest.json：每個檔案的路徑與 SHA-256，部署到 Cloudflare 給 App 比對
 * - version.json：這份網頁的版本，跟著網頁一起打包，App 用它知道自己現在是哪一版
 *
 * App 只下載指紋不同的檔案，其餘從 APK 或上一版直接複製（@capgo/capacitor-updater 的 manifest 模式）。
 */

export const LIVE_UPDATE_DIR = "live-update";
export const LIVE_UPDATE_MANIFEST = `${LIVE_UPDATE_DIR}/manifest.json`;
export const LIVE_UPDATE_VERSION_FILE = `${LIVE_UPDATE_DIR}/version.json`;
/**
 * HTML 的純文字副本。Cloudflare 的機器人防護會在每個 HTML 回應插入一段檢查用 script（每次都不同），
 * 照原路徑下載指紋永遠對不上；.txt 不會被改，App 改從這裡下載。
 */
export const LIVE_UPDATE_RAW_DIR = `${LIVE_UPDATE_DIR}/raw`;

/**
 * 這份網頁需要的 App 外殼版本（android/app/build.gradle 的 versionCode）。
 *
 * ⚠️ 網頁開始用到新的原生功能（新的 Capacitor 插件、權限）時，
 * 要把 versionCode 和這個數字一起加一，舊 App 才不會更新成用不了的網頁。
 */
export const LIVE_UPDATE_MIN_NATIVE_BUILD = 2;

export interface LiveUpdateFile {
  /** dist 底下的相對路徑，用 / 分隔 */
  file_name: string;
  /** 檔案內容的 SHA-256（小寫十六進位） */
  file_hash: string;
  /** 下載路徑跟 file_name 不同時才有（HTML 的純文字副本），建置時要把檔案複製過去 */
  download_path?: string;
}

export interface LiveUpdateManifest {
  version: string;
  minNativeBuild: number;
  files: LiveUpdateFile[];
}

/** Cloudflare Pages 不當成網頁檔提供的特殊檔案，下載會 404 */
const NOT_SERVED = new Set(["_headers", "_redirects", "_routes.json", "_worker.js"]);

export function shouldPublishFile(fileName: string): boolean {
  return !fileName.startsWith(`${LIVE_UPDATE_DIR}/`) && !NOT_SERVED.has(fileName);
}

function rawCopyPath(fileName: string): string | undefined {
  return /\.html?$/i.test(fileName) ? `${LIVE_UPDATE_RAW_DIR}/${fileName}.txt` : undefined;
}

/**
 * 由所有檔案的指紋算出版本：內容一樣，版本就一樣。
 * 回傳 manifest 和要寫進 version.json 的內容（version.json 本身也列在 manifest 裡）。
 */
export function buildLiveUpdateManifest(
  files: LiveUpdateFile[],
  sha256: (text: string) => string,
  minNativeBuild = LIVE_UPDATE_MIN_NATIVE_BUILD,
): { manifest: LiveUpdateManifest; versionFileContent: string } {
  const published = files
    .filter((f) => shouldPublishFile(f.file_name))
    .sort((a, b) => (a.file_name < b.file_name ? -1 : a.file_name > b.file_name ? 1 : 0));
  const version = sha256(published.map((f) => `${f.file_name}:${f.file_hash}`).join("\n")).slice(0, 16);
  const versionFileContent = JSON.stringify({ version });
  const withDownloadPaths = published.map(({ file_name, file_hash }) => {
    const download_path = rawCopyPath(file_name);
    return download_path ? { file_name, file_hash, download_path } : { file_name, file_hash };
  });
  return {
    manifest: {
      version,
      minNativeBuild,
      files: [
        ...withDownloadPaths,
        { file_name: LIVE_UPDATE_VERSION_FILE, file_hash: sha256(versionFileContent) },
      ],
    },
    versionFileContent,
  };
}

export function isLiveUpdateManifest(value: unknown): value is LiveUpdateManifest {
  if (!value || typeof value !== "object") return false;
  const m = value as Partial<LiveUpdateManifest>;
  return (
    typeof m.version === "string" &&
    m.version.length > 0 &&
    typeof m.minNativeBuild === "number" &&
    Array.isArray(m.files) &&
    m.files.length > 0 &&
    m.files.every(
      (f) => f && typeof f.file_name === "string" && typeof f.file_hash === "string",
    )
  );
}

export type LiveUpdateDecision = "up-to-date" | "needs-newer-app" | "failed-before" | "update";

export function decideLiveUpdate(options: {
  remote: LiveUpdateManifest;
  /** 目前跑的網頁版本；讀不到（舊版沒有 version.json）時為 null */
  localVersion: string | null;
  /** 已安裝 App 的 versionCode */
  nativeBuild: number;
  /** 換上後開不起來、被退回的版本：不再下載，等下一版 */
  failedVersions?: readonly string[];
}): LiveUpdateDecision {
  const { remote, localVersion, nativeBuild, failedVersions = [] } = options;
  if (remote.version === localVersion) return "up-to-date";
  if (!(nativeBuild >= remote.minNativeBuild)) return "needs-newer-app";
  if (failedVersions.includes(remote.version)) return "failed-before";
  return "update";
}

/**
 * 轉成更新套件要的格式；路徑每一段都要編碼（有中文、空白的檔名）。
 * 網址帶 ?v=版本：香港主機是 Cloudflare Pages 前面的快取代理，檔名不變的檔案（version.json、HTML 副本）
 * 會拿到舊內容；每一版換一組網址就不會讀到上一版的快取。
 */
export function toDownloadEntries(
  manifest: LiveUpdateManifest,
  origin: string,
): { file_name: string; file_hash: string; download_url: string }[] {
  const base = origin.replace(/\/+$/, "");
  const query = `?v=${encodeURIComponent(manifest.version)}`;
  return manifest.files.map((f) => ({
    file_name: f.file_name,
    file_hash: f.file_hash,
    download_url: `${base}/${(f.download_path ?? f.file_name).split("/").map(encodeURIComponent).join("/")}${query}`,
  }));
}
