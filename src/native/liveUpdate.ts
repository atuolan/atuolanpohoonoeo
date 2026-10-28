/**
 * App 熱更新：網頁版部署後，App 在背景下載變動的檔案。
 * 下載好時，如果剛開 App、還停在主畫面、也沒在生成，就直接換上（開啟時多重新載入一次）；
 * 不然跳一行提示讓使用者自己點，沒點就等下次開 App 再換（不會在聊天、AI 生成到一半時換掉）。
 *
 * 不用更新套件的 next()：它會在 App 切到背景時就換版重新載入，切回來畫面和生成中的回覆都沒了。
 * 改成自己記下載好的版本，開 App 時再呼叫 set() 換上。
 *
 * 新版開起來後要呼叫 notifyAppReady；20 秒內沒呼叫，更新套件會當成新版壞掉、自動退回上一版。
 * 裝新的 APK 時（versionCode 變了）會清掉下載過的網頁，改用 APK 裡的。
 */
import { App } from "@capacitor/app";
import { CapacitorHttp } from "@capacitor/core";
import { CapacitorUpdater, type BundleInfo } from "@capgo/capacitor-updater";
import { useAIGenerationStore } from "@/stores/aiGeneration";
import { showFloatingToast } from "@/utils/floatingToast";
import { reactive, watch } from "vue";
import {
  LIVE_UPDATE_MANIFEST,
  decideLiveUpdate,
  isLiveUpdateManifest,
  toDownloadEntries,
  type LiveUpdateDecision,
  type LiveUpdateManifest,
} from "./liveUpdateManifest";
import { LIVE_UPDATE_ORIGINS } from "./platform";
import { showUpdateReadyHint } from "./updateReadyHint";
import { readWebVersion } from "./webVersion";

/** 開 App 後等這麼久才檢查，讓開機時的資料載入先跑完 */
const STARTUP_CHECK_DELAY_MS = 8000;
/** 開 App 後這段時間內下載好，又還停在主畫面、沒在生成，就直接換上 */
const STARTUP_APPLY_WINDOW_MS = 30 * 1000;
/** 回到前景時，距離上次檢查超過這麼久才再檢查 */
const RESUME_CHECK_INTERVAL_MS = 30 * 60 * 1000;
/** 下載好、等下次開 App 換上的版本 id */
const PENDING_BUNDLE_KEY = "aguaphone.liveUpdate.pendingBundle";
/** 換上後開不起來、被自動退回的版本（只留最近幾個） */
const FAILED_VERSIONS_KEY = "aguaphone.liveUpdate.failedVersions";
const MAX_FAILED_VERSIONS = 5;
/** 上一次檢查更新做到哪一步，開發者選項的「熱更新」顯示（關掉 App 也留著，才看得出卡在哪） */
const LAST_CHECK_KEY = "aguaphone.liveUpdate.lastCheck";
/** 這次開 App 開始下載的版本；存 sessionStorage：網頁重新載入還在，App 被關掉就沒了 */
const DOWNLOAD_STARTED_KEY = "aguaphone.liveUpdate.downloadStarted";
/** 下載失敗時同一次開 App 內最多試幾次、每次之間等多久 */
const DOWNLOAD_ATTEMPTS = 4;
const DOWNLOAD_RETRY_DELAY_MS = 3000;

export type LiveUpdateCheckResult =
  LiveUpdateDecision | "checking" | "downloading" | "downloaded" | "error";

export interface LiveUpdateCheckRecord {
  at: number;
  result: LiveUpdateCheckResult;
  /** 伺服器上的最新版 */
  remoteVersion?: string;
  /** 清單是從哪個網站拿到的 */
  origin?: string;
  error?: string;
}

function readLastCheck(): LiveUpdateCheckRecord | null {
  try {
    const data: unknown = JSON.parse(localStorage.getItem(LAST_CHECK_KEY) ?? "null");
    return data && typeof data === "object" && "result" in data
      ? (data as LiveUpdateCheckRecord)
      : null;
  } catch {
    return null;
  }
}

/** 開發者選項跟著變：檢查中、下載進度、上次結果 */
export const liveUpdateState = reactive<{
  checking: boolean;
  /** 這次開 App 正在下載時的百分比，沒在下載是 null */
  downloadPercent: number | null;
  lastCheck: LiveUpdateCheckRecord | null;
}>({ checking: false, downloadPercent: null, lastCheck: readLastCheck() });

function recordCheck(patch: Partial<LiveUpdateCheckRecord>, fresh = false): void {
  const base =
    fresh || !liveUpdateState.lastCheck
      ? { at: Date.now(), result: "checking" as const }
      : liveUpdateState.lastCheck;
  liveUpdateState.lastCheck = { ...base, ...patch };
  try {
    localStorage.setItem(LAST_CHECK_KEY, JSON.stringify(liveUpdateState.lastCheck));
  } catch {
    // 存不了只是重開後看不到
  }
}

/** 原生插件丟的錯誤不一定是 Error，盡量拿到看得懂的訊息 */
function describeError(err: unknown): string {
  if (err instanceof Error) return err.message || err.name;
  if (err && typeof err === "object" && "message" in err)
    return String((err as { message: unknown }).message);
  return String(err);
}

let checking = false;
let lastCheckAt = 0;
let launchedAt = Date.now();
/** 這次開 App 已經提示過的版本，回前景重新檢查時不再重複跳 */
let hintedBundleId: string | null = null;

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

/**
 * 這版是不是這次開 App 才開始下載的（中間網頁重新載入過也算，原生那邊還在下載）。
 * 不是的話，代表上次下載到一半 App 就被關掉（iOS 切到背景很容易被收掉），
 * 套件裡那份會永遠停在「下載中」。
 */
function startedDownloadThisLaunch(version: string): boolean {
  try {
    return sessionStorage.getItem(DOWNLOAD_STARTED_KEY) === version;
  } catch {
    return false;
  }
}

function markDownloadStarted(version: string): void {
  try {
    sessionStorage.setItem(DOWNLOAD_STARTED_KEY, version);
  } catch {
    // 存不了頂多網頁重新載入後重下一次
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
  const errors: string[] = [];
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
      errors.push(`${new URL(origin).host}：${describeError(err)}`);
    }
  }
  throw new Error(`拿不到更新清單（${errors.join("；")}）`);
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

/** 還停在主畫面（App.vue 把目前頁面記在 history.state.page，還沒換過頁時是 null） */
function isOnHomePage(): boolean {
  const state: unknown = window.history.state;
  if (state === null) return true;
  return typeof state === "object" && (state as { page?: unknown }).page === "home";
}

/** 換上下載好的版本，會立刻重新載入 */
async function applyBundle(bundle: BundleInfo): Promise<void> {
  writePendingBundle(null);
  console.info(`[LiveUpdate] 換上新版 ${bundle.version}`);
  await CapacitorUpdater.set({ id: bundle.id });
}

function applyBundleNow(bundle: BundleInfo): void {
  applyBundle(bundle).catch((err) => console.warn("[LiveUpdate] 換上新版失敗:", err));
}

/** 跳提示讓使用者自己點換上；生成中先不跳，等回完再跳 */
function offerHint(bundle: BundleInfo): void {
  const generation = useAIGenerationStore();
  if (generation.hasActiveGeneration) {
    const stop = watch(
      () => generation.hasActiveGeneration,
      (active) => {
        if (active) return;
        stop();
        offerHint(bundle);
      },
    );
    return;
  }
  // 等的期間已經換上或下載了更新的版本
  if (readPendingBundle() !== bundle.id) return;
  showUpdateReadyHint(() => {
    if (generation.hasActiveGeneration) {
      showFloatingToast("AI 還在回覆，回完會再提示一次");
      offerHint(bundle);
      return;
    }
    applyBundleNow(bundle);
  });
}

/** 新版下載好了：剛開 App 還沒開始用就直接換上，不然跳提示 */
function offerBundle(bundle: BundleInfo): void {
  // 已經切到背景就留到下次開 App 或回前景再說
  if (document.visibilityState !== "visible") return;
  const justLaunched = Date.now() - launchedAt <= STARTUP_APPLY_WINDOW_MS;
  if (justLaunched && isOnHomePage() && !useAIGenerationStore().hasActiveGeneration) {
    applyBundleNow(bundle);
    return;
  }
  if (hintedBundleId === bundle.id) return;
  hintedBundleId = bundle.id;
  offerHint(bundle);
}

/**
 * 下載新版。套件只要有一個檔失敗整批就算失敗（進度停在 70% 後報錯），但下載好的檔會留在快取，
 * 網路不穩（大陸走 VPN）時多試幾次、輪流換網站，每次都接著上次的進度。
 */
async function downloadBundle(manifest: LiveUpdateManifest, firstOrigin: string): Promise<BundleInfo> {
  const origins = [firstOrigin, ...LIVE_UPDATE_ORIGINS.filter((o) => o !== firstOrigin)];
  const errors: string[] = [];
  for (let attempt = 0; attempt < DOWNLOAD_ATTEMPTS; attempt++) {
    const origin = origins[attempt % origins.length];
    if (attempt > 0) {
      await new Promise((resolve) => setTimeout(resolve, DOWNLOAD_RETRY_DELAY_MS));
      // 失敗的那筆還在清單裡，同一版要先刪掉才能再下載
      const { bundles } = await CapacitorUpdater.list();
      for (const b of bundles) {
        if (b.version === manifest.version) await CapacitorUpdater.delete({ id: b.id }).catch(() => {});
      }
    }
    liveUpdateState.downloadPercent = 0;
    try {
      return await CapacitorUpdater.download({
        url: `${origin}/${LIVE_UPDATE_MANIFEST}`,
        version: manifest.version,
        manifest: toDownloadEntries(manifest, origin),
      });
    } catch (err) {
      errors.push(`第 ${attempt + 1} 次（${new URL(origin).host}）：${describeError(err)}`);
      recordCheck({ error: errors.join("；") });
    }
  }
  throw new Error(errors.join("；"));
}

export async function checkForLiveUpdate(): Promise<void> {
  if (checking) return;
  checking = true;
  liveUpdateState.checking = true;
  lastCheckAt = Date.now();
  recordCheck({}, true);
  try {
    const { origin, manifest } = await fetchRemoteManifest();
    recordCheck({ origin, remoteVersion: manifest.version });
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
    if (decision !== "update") {
      recordCheck({ result: decision });
      return;
    }

    const { bundles } = await CapacitorUpdater.list();
    let bundle = bundles.find((b) => b.version === manifest.version);
    if (bundle?.status === "downloading" && startedDownloadThisLaunch(manifest.version)) {
      recordCheck({ result: "downloading" });
      return;
    }
    // 下載失敗的、上次下載到一半被關掉的：刪掉重下（已下載完的檔案套件有快取，不會從頭來）
    if (bundle?.status === "error" || bundle?.status === "downloading") {
      await CapacitorUpdater.delete({ id: bundle.id }).catch(() => {});
      bundle = undefined;
    }
    if (!bundle) {
      console.info(`[LiveUpdate] 下載新版 ${manifest.version}（${origin}）`);
      recordCheck({ result: "downloading" });
      markDownloadStarted(manifest.version);
      bundle = await downloadBundle(manifest, origin);
    }

    writePendingBundle(bundle.id);
    await deleteStaleBundles(bundle.id);
    console.info(`[LiveUpdate] 新版 ${manifest.version} 已下載`);
    recordCheck({ result: "downloaded" });
    offerBundle(bundle);
  } catch (err) {
    console.warn("[LiveUpdate] 檢查更新失敗:", err);
    recordCheck({ result: "error", error: describeError(err) });
  } finally {
    checking = false;
    liveUpdateState.checking = false;
    liveUpdateState.downloadPercent = null;
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
  await applyBundle(target);
  return true;
}

export interface LiveUpdateStatus {
  /** App 外殼的版本名稱與 versionCode */
  appVersion: string;
  /** 目前跑的是 APK／IPA 內建的網頁（從沒換上過熱更新） */
  runningBuiltin: boolean;
  /** 下載好、還沒換上的版本 */
  pendingVersion: string | null;
  /** 手機裡下載過的每一版和狀態 */
  downloads: string[];
  /** 換上後開不起來、被退回的版本 */
  failedVersions: string[];
}

/** 開發者選項的「熱更新」：看熱更新卡在哪一步 */
export async function readLiveUpdateStatus(): Promise<LiveUpdateStatus> {
  const [info, { bundle: current }, { bundles }] = await Promise.all([
    App.getInfo(),
    CapacitorUpdater.current(),
    CapacitorUpdater.list(),
  ]);
  const pendingId = readPendingBundle();
  return {
    appVersion: `${info.version}（${info.build}）`,
    runningBuiltin: current.id === "builtin",
    pendingVersion: bundles.find((b) => b.id === pendingId)?.version ?? null,
    downloads: bundles.filter((b) => b.id !== "builtin").map((b) => `${b.version}（${b.status}）`),
    failedVersions: readFailedVersions(),
  };
}

/** 開發者選項的「換上新版」：馬上換上下載好的版本（會重新載入）；沒有可換的回傳 false */
export async function applyDownloadedUpdate(): Promise<boolean> {
  const pendingId = readPendingBundle();
  if (!pendingId) return false;
  const { bundles } = await CapacitorUpdater.list();
  const target = bundles.find((b) => b.id === pendingId);
  if (!target || target.status === "error") return false;
  await applyBundle(target);
  return true;
}

export function initLiveUpdate(): void {
  launchedAt = Date.now();
  // 走到這裡代表這份網頁開得起來，告訴更新套件不用退回
  CapacitorUpdater.notifyAppReady().catch((err) =>
    console.warn("[LiveUpdate] notifyAppReady 失敗:", err),
  );
  CapacitorUpdater.addListener("download", ({ percent }) => {
    if (liveUpdateState.downloadPercent !== null) liveUpdateState.downloadPercent = percent;
  }).catch(() => {});

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
