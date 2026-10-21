/**
 * App 熱更新：網頁版部署後，App 在背景下載變動的檔案，
 * 等下次開 App 時才換上（開啟時多重新載入一次；不會在聊天、AI 生成到一半時換掉）。
 *
 * 不用更新套件的 next()：它會在 App 切到背景時就換版重新載入，切回來畫面和生成中的回覆都沒了。
 * 改成自己記下載好的版本，開 App 時再呼叫 set() 換上。
 *
 * 新版開起來後要呼叫 notifyAppReady；20 秒內沒呼叫，更新套件會當成新版壞掉、自動退回上一版。
 * 裝新的 APK 時（versionCode 變了）會清掉下載過的網頁，改用 APK 裡的。
 */
import { App } from "@capacitor/app";
import { CapacitorHttp } from "@capacitor/core";
import { CapacitorUpdater } from "@capgo/capacitor-updater";
import {
  LIVE_UPDATE_MANIFEST,
  decideLiveUpdate,
  isLiveUpdateManifest,
  toDownloadEntries,
  type LiveUpdateManifest,
} from "./liveUpdateManifest";
import { LIVE_UPDATE_ORIGINS } from "./platform";
import { readWebVersion } from "./webVersion";

/** 開 App 後等這麼久才檢查，讓開機時的資料載入先跑完 */
const STARTUP_CHECK_DELAY_MS = 8000;
/** 回到前景時，距離上次檢查超過這麼久才再檢查 */
const RESUME_CHECK_INTERVAL_MS = 60 * 60 * 1000;
/** 下載好、等下次開 App 換上的版本 id */
const PENDING_BUNDLE_KEY = "aguaphone.liveUpdate.pendingBundle";
/** 換上後開不起來、被自動退回的版本（只留最近幾個） */
const FAILED_VERSIONS_KEY = "aguaphone.liveUpdate.failedVersions";
const MAX_FAILED_VERSIONS = 5;

let checking = false;
let lastCheckAt = 0;

function readPendingBundle(): string | null {
  try {
    return localStorage.getItem(PENDING_BUNDLE_KEY);
  } catch {
    return null;
  }
}

function writePendingBundle(id: string | null): void {
  try {
    if (id) localStorage.setItem(PENDING_BUNDLE_KEY, id);
    else localStorage.removeItem(PENDING_BUNDLE_KEY);
  } catch {
    // 存不了就等下次檢查再下載
  }
}

function readFailedVersions(): string[] {
  try {
    const list: unknown = JSON.parse(localStorage.getItem(FAILED_VERSIONS_KEY) ?? "[]");
    return Array.isArray(list) ? list.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

/** 更新套件退回過的版本記下來，之後不再下載同一版 */
async function rememberFailedUpdate(): Promise<void> {
  const failed = await CapacitorUpdater.getFailedUpdate();
  const version = failed?.bundle?.version;
  if (!version) return;
  console.warn(`[LiveUpdate] 新版 ${version} 開不起來，已退回上一版`);
  const list = [version, ...readFailedVersions().filter((v) => v !== version)];
  try {
    localStorage.setItem(FAILED_VERSIONS_KEY, JSON.stringify(list.slice(0, MAX_FAILED_VERSIONS)));
  } catch {
    // 存不了頂多再試一次
  }
}

/** 依序向各網站拿更新清單；之後的檔案也從同一個網站下載 */
async function fetchRemoteManifest(): Promise<{ origin: string; manifest: LiveUpdateManifest }> {
  let lastError: unknown = null;
  for (const origin of LIVE_UPDATE_ORIGINS) {
    try {
      // 走原生連線：App 的網址是 https://localhost，用 fetch 會被 CORS 擋
      const res = await CapacitorHttp.get({
        url: `${origin}/${LIVE_UPDATE_MANIFEST}?t=${Date.now()}`,
        responseType: "json",
      });
      if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
      const data: unknown = typeof res.data === "string" ? JSON.parse(res.data) : res.data;
      if (!isLiveUpdateManifest(data)) throw new Error("清單格式不對");
      return { origin, manifest: data };
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
}

/** 刪掉用不到的舊下載（下載好卻被更新的版本取代的） */
async function deleteStaleBundles(keepId: string): Promise<void> {
  const [{ bundles }, { bundle: current }] = await Promise.all([
    CapacitorUpdater.list(),
    CapacitorUpdater.current(),
  ]);
  for (const b of bundles) {
    if (b.id === keepId || b.id === current.id || b.id === "builtin") continue;
    await CapacitorUpdater.delete({ id: b.id }).catch(() => {});
  }
}

export async function checkForLiveUpdate(): Promise<void> {
  if (checking) return;
  checking = true;
  lastCheckAt = Date.now();
  try {
    const { origin, manifest } = await fetchRemoteManifest();
    const [localVersion, info] = await Promise.all([readWebVersion(), App.getInfo()]);
    const decision = decideLiveUpdate({
      remote: manifest,
      localVersion,
      nativeBuild: Number.parseInt(info.build, 10),
      failedVersions: readFailedVersions(),
    });
    if (decision === "needs-newer-app") {
      console.info("[LiveUpdate] 新版網頁需要較新的 App，要重新安裝 APK");
    }
    if (decision !== "update") return;

    const { bundles } = await CapacitorUpdater.list();
    let bundle = bundles.find((b) => b.version === manifest.version);
    if (bundle?.status === "downloading") return;
    if (bundle?.status === "error") {
      await CapacitorUpdater.delete({ id: bundle.id }).catch(() => {});
      bundle = undefined;
    }
    if (!bundle) {
      console.info(`[LiveUpdate] 下載新版 ${manifest.version}（${origin}）`);
      bundle = await CapacitorUpdater.download({
        url: `${origin}/${LIVE_UPDATE_MANIFEST}`,
        version: manifest.version,
        manifest: toDownloadEntries(manifest, origin),
      });
    }

    writePendingBundle(bundle.id);
    await deleteStaleBundles(bundle.id);
    console.info(`[LiveUpdate] 新版 ${manifest.version} 已下載，下次開啟 App 時套用`);
  } catch (err) {
    console.warn("[LiveUpdate] 檢查更新失敗:", err);
  } finally {
    checking = false;
  }
}

/**
 * 開 App 時換上之前下載好的新版；會立刻重新載入，回傳 true 時不用再做別的事。
 * 從 Discord 授權連結開回 App 時先不換，免得重新載入打斷登入，留到下次。
 */
async function applyPendingBundle(): Promise<boolean> {
  const pendingId = readPendingBundle();
  if (!pendingId) return false;
  const launch = await App.getLaunchUrl().catch(() => undefined);
  if (launch?.url) return false;

  writePendingBundle(null);
  const [{ bundles }, { bundle: current }] = await Promise.all([
    CapacitorUpdater.list(),
    CapacitorUpdater.current(),
  ]);
  const target = bundles.find((b) => b.id === pendingId);
  if (!target || target.status === "error" || target.id === current.id) return false;
  console.info(`[LiveUpdate] 換上新版 ${target.version}`);
  await CapacitorUpdater.set({ id: target.id });
  return true;
}

export function initLiveUpdate(): void {
  // 走到這裡代表這份網頁開得起來，告訴更新套件不用退回
  CapacitorUpdater.notifyAppReady().catch((err) =>
    console.warn("[LiveUpdate] notifyAppReady 失敗:", err),
  );

  rememberFailedUpdate()
    .catch(() => {})
    .then(() => applyPendingBundle())
    .catch((err) => {
      console.warn("[LiveUpdate] 換上新版失敗:", err);
      return false;
    })
    .then((reloading) => {
      if (!reloading) setTimeout(() => void checkForLiveUpdate(), STARTUP_CHECK_DELAY_MS);
    });
  App.addListener("resume", () => {
    if (Date.now() - lastCheckAt >= RESUME_CHECK_INTERVAL_MS) void checkForLiveUpdate();
  });
}
