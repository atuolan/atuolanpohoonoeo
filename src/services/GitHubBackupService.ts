/**
 * GitHub 雲端備份服務
 *
 * 使用 Git Blobs API 上傳大型備份檔案（支援 >100MB）。
 * 備份資料先由 AutoBackupService.buildBackupZipStreaming() 產生 ZIP，
 * 再分片上傳至使用者 fork 的 GitHub 倉庫。
 *
 * 倉庫結構：
 *   backups/
 *     {timestamp}/
 *       manifest.json   — 分片清單、校驗碼、備份元資料
 *       part_000.zip    — 分片 0
 *       part_001.zip    — 分片 1
 *       ...
 *
 * 使用者只需提供：
 *   1. GitHub Personal Access Token（fine-grained，repo contents 讀寫權限）
 *   2. fork 後的倉庫全名（owner/repo）
 */

import { db, DB_STORES } from "@/db/database";

// ============================================================
// 常數
// ============================================================

/** 每片大小上限（25MB），base64 編碼後約 33MB，在 GitHub Blobs API 限制內 */
const CHUNK_SIZE = 25 * 1024 * 1024;

/** GitHub API 基礎 URL */
const GITHUB_API = "https://api.github.com";

/** 預設的上游倉庫名（你提供給使用者 fork 的） */
export const DEFAULT_UPSTREAM_REPO = "Mikaluotuo/aguaphone-cloud-backup";

/** IndexedDB 中儲存設定的 key */
const IDB_SETTINGS_KEY = "github-backup-settings";

// ============================================================
// 類型
// ============================================================

export interface GitHubBackupSettings {
  /** GitHub Personal Access Token */
  token: string;
  /** 使用者 fork 後的倉庫全名，如 "username/aguaphone-cloud-backup" */
  repo: string;
  /** 預設分支 */
  branch: string;
  /** 上次備份時間戳 */
  lastBackupAt: number | null;
  /** 上次備份狀態訊息 */
  lastBackupMessage: string;
  /** 最多保留幾份遠端備份（0 = 不限，預設 1 = 只保留最新） */
  maxRemoteBackups: number;
}

export const DEFAULT_GITHUB_SETTINGS: GitHubBackupSettings = {
  token: "",
  repo: "",
  branch: "main",
  lastBackupAt: null,
  lastBackupMessage: "",
  maxRemoteBackups: 1,
};

export interface BackupManifest {
  version: "1.0" | "2.0";
  createdAt: string;
  totalSize: number;
  chunkSize: number;
  chunks: ManifestChunk[];
  checksum: string;
  /** v2.0: 流式上傳，備份可能超過 2GB */
  streaming?: boolean;
}

interface ManifestChunk {
  filename: string;
  size: number;
  sha: string;
}

export type GitHubBackupProgress = {
  phase: string;
  current?: number;
  total?: number;
};

// ============================================================
// 設定讀寫
// ============================================================

export async function loadGitHubSettings(): Promise<GitHubBackupSettings> {
  try {
    await db.init();
    const saved = await db.get<GitHubBackupSettings>(
      DB_STORES.APP_SETTINGS,
      IDB_SETTINGS_KEY,
    );
    return saved
      ? { ...DEFAULT_GITHUB_SETTINGS, ...saved }
      : { ...DEFAULT_GITHUB_SETTINGS };
  } catch {
    return { ...DEFAULT_GITHUB_SETTINGS };
  }
}

export async function saveGitHubSettings(
  settings: GitHubBackupSettings,
): Promise<void> {
  await db.init();
  await db.put(DB_STORES.APP_SETTINGS, { ...settings, id: IDB_SETTINGS_KEY });
}

// ============================================================
// GitHub API 底層工具
// ============================================================

/** 通用 GitHub API 請求 */
async function ghFetch(
  path: string,
  token: string,
  options: RequestInit = {},
): Promise<Response> {
  const url = path.startsWith("http") ? path : `${GITHUB_API}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    // 提供更友善的錯誤訊息
    if (res.status === 404) {
      throw new Error(
        `找不到資源 (404)：${path.split("?")[0]} — 請確認倉庫名稱和分支是否正確`,
      );
    }
    if (res.status === 403) {
      throw new Error(
        `權限不足 (403)：${body.slice(0, 200)} — 請確認 Token 有 Contents Read and write 權限`,
      );
    }
    throw new Error(`GitHub API ${res.status}: ${body.slice(0, 300)}`);
  }
  return res;
}

/**
 * 使用 Git Blobs API 上傳二進位資料（base64 編碼）。
 * 回傳 blob 的 SHA。
 * 單次上限約 100MB（GitHub 限制），我們分片控制在 50MB 以內。
 */
async function createBlob(
  repo: string,
  token: string,
  data: Uint8Array,
): Promise<string> {
  // Uint8Array → base64（分塊避免 call stack 溢出）
  const base64 = uint8ToBase64(data);
  const res = await ghFetch(`/repos/${repo}/git/blobs`, token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content: base64, encoding: "base64" }),
  });
  const json = await res.json();
  return json.sha as string;
}

/** 取得指定分支的最新 commit SHA */
async function getLatestCommitSha(
  repo: string,
  branch: string,
  token: string,
): Promise<string> {
  const res = await ghFetch(`/repos/${repo}/git/ref/heads/${branch}`, token);
  const json = await res.json();
  return json.object.sha as string;
}

/** 取得 repo 的預設分支名稱（main 或 master） */
async function getDefaultBranch(repo: string, token: string): Promise<string> {
  const res = await ghFetch(`/repos/${repo}`, token);
  const json = await res.json();
  return (json.default_branch as string) || "main";
}

/** 取得 commit 對應的 tree SHA */
async function getCommitTreeSha(
  repo: string,
  commitSha: string,
  token: string,
): Promise<string> {
  const res = await ghFetch(`/repos/${repo}/git/commits/${commitSha}`, token);
  const json = await res.json();
  return json.tree.sha as string;
}

/** 建立新的 tree（包含要上傳的檔案） */
async function createTree(
  repo: string,
  token: string,
  baseTreeSha: string,
  files: Array<{ path: string; sha: string }>,
): Promise<string> {
  const tree = files.map((f) => ({
    path: f.path,
    mode: "100644" as const,
    type: "blob" as const,
    sha: f.sha,
  }));
  const res = await ghFetch(`/repos/${repo}/git/trees`, token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ base_tree: baseTreeSha, tree }),
  });
  const json = await res.json();
  return json.sha as string;
}

/** 建立新的 commit */
async function createCommit(
  repo: string,
  token: string,
  message: string,
  treeSha: string,
  parentSha: string,
): Promise<string> {
  const res = await ghFetch(`/repos/${repo}/git/commits`, token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message,
      tree: treeSha,
      parents: [parentSha],
    }),
  });
  const json = await res.json();
  return json.sha as string;
}

/** 更新分支指向新的 commit */
async function updateRef(
  repo: string,
  branch: string,
  token: string,
  commitSha: string,
): Promise<void> {
  await ghFetch(`/repos/${repo}/git/refs/heads/${branch}`, token, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sha: commitSha }),
  });
}

// ============================================================
// 工具函式
// ============================================================

/** Uint8Array → base64（分塊處理，避免 btoa 的 call stack 限制） */
function uint8ToBase64(bytes: Uint8Array): string {
  const BLOCK = 0x8000; // 32KB 一塊
  const parts: string[] = [];
  for (let i = 0; i < bytes.length; i += BLOCK) {
    parts.push(String.fromCharCode(...bytes.subarray(i, i + BLOCK)));
  }
  return btoa(parts.join(""));
}

/** 簡易 SHA-256 校驗碼（使用 Web Crypto API） */
async function sha256Hex(data: Uint8Array): Promise<string> {
  const hashBuffer = await crypto.subtle.digest(
    "SHA-256",
    new Uint8Array(data).buffer as ArrayBuffer,
  );
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** 將 ZIP 資料切成固定大小的分片 */
function splitIntoChunks(data: Uint8Array, chunkSize: number): Uint8Array[] {
  const chunks: Uint8Array[] = [];
  for (let offset = 0; offset < data.length; offset += chunkSize) {
    chunks.push(
      data.subarray(offset, Math.min(offset + chunkSize, data.length)),
    );
  }
  return chunks;
}

/** 讓出主線程 */
function yieldToMain(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

// ============================================================
// 備份（上傳）
// ============================================================

/**
 * 執行 GitHub 雲端備份。
 *
 * @param zipData - 由 buildBackupZipStreaming() 產生的完整 ZIP Uint8Array
 * @param onProgress - 進度回調
 */
export async function uploadToGitHub(
  zipData: Uint8Array,
  onProgress?: (p: GitHubBackupProgress) => void,
): Promise<{ success: boolean; message: string }> {
  const settings = await loadGitHubSettings();
  if (!settings.token || !settings.repo) {
    return { success: false, message: "請先設定 GitHub Token 和倉庫名稱" };
  }

  const { token, repo } = settings;

  try {
    // 0. 自動偵測預設分支
    const branch = await getDefaultBranch(repo, token);

    // 1. 計算校驗碼
    onProgress?.({ phase: "計算校驗碼..." });
    const checksum = await sha256Hex(zipData);

    // 2. 分片
    onProgress?.({ phase: "分片處理..." });
    const chunks = splitIntoChunks(zipData, CHUNK_SIZE);
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupDir = `backups/${timestamp}`;

    // 3. 取得目前分支的最新 commit
    onProgress?.({ phase: "連接 GitHub..." });
    const latestCommitSha = await getLatestCommitSha(repo, branch, token);
    const baseTreeSha = await getCommitTreeSha(repo, latestCommitSha, token);

    // 4. 逐片上傳 blob
    const manifestChunks: ManifestChunk[] = [];
    const treeFiles: Array<{ path: string; sha: string }> = [];

    for (let i = 0; i < chunks.length; i++) {
      const filename = `part_${String(i).padStart(3, "0")}.zip`;
      onProgress?.({
        phase: "上傳分片",
        current: i + 1,
        total: chunks.length,
      });
      await yieldToMain();

      const blobSha = await createBlob(repo, token, chunks[i]);
      manifestChunks.push({
        filename,
        size: chunks[i].length,
        sha: blobSha,
      });
      treeFiles.push({ path: `${backupDir}/${filename}`, sha: blobSha });
    }

    // 5. 建立 manifest.json 並上傳
    onProgress?.({ phase: "寫入清單..." });
    const manifest: BackupManifest = {
      version: "1.0",
      createdAt: new Date().toISOString(),
      totalSize: zipData.length,
      chunkSize: CHUNK_SIZE,
      chunks: manifestChunks,
      checksum,
    };
    const manifestBytes = new TextEncoder().encode(
      JSON.stringify(manifest, null, 2),
    );
    const manifestSha = await createBlob(repo, token, manifestBytes);
    treeFiles.push({ path: `${backupDir}/manifest.json`, sha: manifestSha });

    // 6. 建立 tree → commit → 更新 ref
    onProgress?.({ phase: "提交到 GitHub..." });
    const newTreeSha = await createTree(repo, token, baseTreeSha, treeFiles);
    const sizeInMB = (zipData.length / (1024 * 1024)).toFixed(1);
    const commitMsg = `backup: ${timestamp} (${sizeInMB}MB, ${chunks.length} chunks)`;
    const newCommitSha = await createCommit(
      repo,
      token,
      commitMsg,
      newTreeSha,
      latestCommitSha,
    );
    await updateRef(repo, branch, token, newCommitSha);

    // 7. 自動清理舊備份
    if (settings.maxRemoteBackups > 0) {
      onProgress?.({ phase: "清理舊備份..." });
      try {
        await cleanOldRemoteBackups(settings.maxRemoteBackups, onProgress);
      } catch (cleanErr) {
        console.warn(
          "[GitHubBackup] 清理舊備份失敗（不影響本次備份）:",
          cleanErr,
        );
      }
    }

    // 8. 更新本地設定
    const msg = `備份成功: ${timestamp} (${sizeInMB}MB)`;
    settings.lastBackupAt = Date.now();
    settings.lastBackupMessage = msg;
    await saveGitHubSettings(settings);

    return { success: true, message: msg };
  } catch (e: any) {
    const msg = `GitHub 備份失敗: ${e.message || e}`;
    console.error("[GitHubBackup]", msg);
    return { success: false, message: msg };
  }
}

// ============================================================
// 流式上傳（支援超大備份，記憶體峰值 ≈ CHUNK_SIZE）
// ============================================================

/**
 * 流式上傳：接收 fflate Zip 流產生的 chunks，
 * 每累積到 CHUNK_SIZE 就立即上傳一個 blob，不在記憶體中持有完整 ZIP。
 *
 * 使用方式：
 *   const uploader = await createStreamingUploader(onProgress)
 *   // 在 fflate Zip 的 callback 中：
 *   await uploader.pushChunk(chunk)
 *   // ZIP 結束後：
 *   const result = await uploader.finalize()
 */
export async function createStreamingUploader(
  onProgress?: (p: GitHubBackupProgress) => void,
): Promise<{
  pushChunk: (chunk: Uint8Array) => Promise<void>;
  finalize: () => Promise<{ success: boolean; message: string }>;
}> {
  const settings = await loadGitHubSettings();
  if (!settings.token || !settings.repo) {
    throw new Error("請先設定 GitHub Token 和倉庫名稱");
  }

  const { token, repo } = settings;
  const branch = await getDefaultBranch(repo, token);
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupDir = `backups/${timestamp}`;

  // 取得目前分支的最新 commit
  onProgress?.({ phase: "連接 GitHub..." });
  const latestCommitSha = await getLatestCommitSha(repo, branch, token);
  const baseTreeSha = await getCommitTreeSha(repo, latestCommitSha, token);

  // 內部狀態
  let buffer = new Uint8Array(0);
  let partIndex = 0;
  let totalSize = 0;
  const manifestChunks: ManifestChunk[] = [];
  const treeFiles: Array<{ path: string; sha: string }> = [];

  // 用於增量計算 SHA-256
  // Web Crypto 不支援增量 hash，所以我們對每個分片單獨算 hash，
  // 最後把所有分片 hash 串接再算一次作為整體校驗碼
  const partHashes: string[] = [];

  /** 將 buffer 中累積的資料作為一個分片上傳 */
  async function flushBuffer(): Promise<void> {
    if (buffer.length === 0) return;

    const filename = `part_${String(partIndex).padStart(3, "0")}.zip`;
    onProgress?.({
      phase: "上傳分片",
      current: partIndex + 1,
      total: -1, // 流式模式不知道總數
    });

    const partData = buffer;
    buffer = new Uint8Array(0); // 立即釋放

    const partHash = await sha256Hex(partData);
    partHashes.push(partHash);

    const blobSha = await createBlob(repo, token, partData);
    manifestChunks.push({ filename, size: partData.length, sha: blobSha });
    treeFiles.push({ path: `${backupDir}/${filename}`, sha: blobSha });

    totalSize += partData.length;
    partIndex++;
  }

  return {
    /** 接收 fflate 產生的 chunk，累積到 CHUNK_SIZE 時自動上傳 */
    async pushChunk(chunk: Uint8Array): Promise<void> {
      // 合併到 buffer
      const merged = new Uint8Array(buffer.length + chunk.length);
      merged.set(buffer);
      merged.set(chunk, buffer.length);
      buffer = merged;

      // 如果超過 CHUNK_SIZE，切出並上傳
      while (buffer.length >= CHUNK_SIZE) {
        const toUpload = buffer.slice(0, CHUNK_SIZE);
        buffer = buffer.slice(CHUNK_SIZE);

        const filename = `part_${String(partIndex).padStart(3, "0")}.zip`;
        onProgress?.({ phase: "上傳分片", current: partIndex + 1, total: -1 });
        await yieldToMain();

        const partHash = await sha256Hex(toUpload);
        partHashes.push(partHash);

        const blobSha = await createBlob(repo, token, toUpload);
        manifestChunks.push({ filename, size: toUpload.length, sha: blobSha });
        treeFiles.push({ path: `${backupDir}/${filename}`, sha: blobSha });

        totalSize += toUpload.length;
        partIndex++;
      }
    },

    /** ZIP 結束後呼叫，上傳剩餘資料並建立 commit */
    async finalize(): Promise<{ success: boolean; message: string }> {
      try {
        // 上傳剩餘的 buffer
        await flushBuffer();

        // 計算整體校驗碼（所有分片 hash 串接後再 hash）
        onProgress?.({ phase: "計算校驗碼..." });
        const combinedHashInput = new TextEncoder().encode(
          partHashes.join(":"),
        );
        const checksum = await sha256Hex(combinedHashInput);

        // 建立 manifest
        onProgress?.({ phase: "寫入清單..." });
        const manifest: BackupManifest = {
          version: "2.0",
          createdAt: new Date().toISOString(),
          totalSize,
          chunkSize: CHUNK_SIZE,
          chunks: manifestChunks,
          checksum,
          streaming: true,
        };
        const manifestBytes = new TextEncoder().encode(
          JSON.stringify(manifest, null, 2),
        );
        const manifestSha = await createBlob(repo, token, manifestBytes);
        treeFiles.push({
          path: `${backupDir}/manifest.json`,
          sha: manifestSha,
        });

        // 建立 tree → commit → 更新 ref
        onProgress?.({ phase: "提交到 GitHub..." });
        const newTreeSha = await createTree(
          repo,
          token,
          baseTreeSha,
          treeFiles,
        );
        const sizeInMB = (totalSize / (1024 * 1024)).toFixed(1);
        const commitMsg = `backup: ${timestamp} (${sizeInMB}MB, ${partIndex} chunks, streaming)`;
        const newCommitSha = await createCommit(
          repo,
          token,
          commitMsg,
          newTreeSha,
          latestCommitSha,
        );
        await updateRef(repo, branch, token, newCommitSha);

        // 更新本地設定
        const msg = `備份成功: ${timestamp} (${sizeInMB}MB, 流式上傳)`;
        settings.lastBackupAt = Date.now();
        settings.lastBackupMessage = msg;
        await saveGitHubSettings(settings);

        return { success: true, message: msg };
      } catch (e: any) {
        const msg = `GitHub 流式備份失敗: ${e.message || e}`;
        console.error("[GitHubBackup]", msg);
        return { success: false, message: msg };
      }
    },
  };
}

// ============================================================
// 還原（下載）
// ============================================================

/** 列出倉庫中所有備份（按時間倒序） */
export async function listRemoteBackups(): Promise<
  Array<{ name: string; path: string; createdAt: string }>
> {
  const settings = await loadGitHubSettings();
  if (!settings.token || !settings.repo) return [];

  const { token, repo } = settings;

  try {
    const branch = await getDefaultBranch(repo, token);
    // 取得 backups/ 目錄下的子目錄
    const res = await ghFetch(
      `/repos/${repo}/contents/backups?ref=${branch}`,
      token,
    );
    const items: Array<{ name: string; path: string; type: string }> =
      await res.json();
    const dirs = items
      .filter((item) => item.type === "dir")
      .sort((a, b) => b.name.localeCompare(a.name)); // 最新的在前

    return dirs.map((d) => ({
      name: d.name,
      path: d.path,
      createdAt: d.name.replace(/-/g, (m, i) => {
        // 簡單還原 ISO 格式供顯示
        if (i === 4 || i === 7) return "-";
        if (i === 13) return ":";
        if (i === 16) return ":";
        if (i === 10) return "T";
        return m;
      }),
    }));
  } catch (e: any) {
    console.error("[GitHubBackup] 列出備份失敗:", e);
    return [];
  }
}

/**
 * 從 GitHub 下載指定備份並合併為完整 ZIP。
 *
 * @param backupPath - 備份目錄路徑，如 "backups/2026-03-28T12-00-00-000Z"
 * @param onProgress - 進度回調
 * @returns 合併後的完整 ZIP Uint8Array
 */
export async function downloadFromGitHub(
  backupPath: string,
  onProgress?: (p: GitHubBackupProgress) => void,
): Promise<Uint8Array> {
  const settings = await loadGitHubSettings();
  if (!settings.token || !settings.repo) {
    throw new Error("請先設定 GitHub Token 和倉庫名稱");
  }

  const { token, repo } = settings;
  const branch = await getDefaultBranch(repo, token);

  // 1. 讀取 manifest.json
  onProgress?.({ phase: "讀取備份清單..." });
  const manifestRes = await ghFetch(
    `/repos/${repo}/contents/${backupPath}/manifest.json?ref=${branch}`,
    token,
  );
  const manifestFile = await manifestRes.json();
  const manifestContent = atob(manifestFile.content.replace(/\n/g, ""));
  const manifest: BackupManifest = JSON.parse(manifestContent);

  // 2. 逐片下載（使用 Blobs API 取得原始資料）
  const allChunks: Uint8Array[] = [];
  for (let i = 0; i < manifest.chunks.length; i++) {
    const chunk = manifest.chunks[i];
    onProgress?.({
      phase: "下載分片",
      current: i + 1,
      total: manifest.chunks.length,
    });
    await yieldToMain();

    // 透過 blob SHA 直接取得原始資料
    const blobRes = await ghFetch(
      `/repos/${repo}/git/blobs/${chunk.sha}`,
      token,
      { headers: { Accept: "application/vnd.github.raw+json" } },
    );
    const arrayBuffer = await blobRes.arrayBuffer();
    allChunks.push(new Uint8Array(arrayBuffer));
  }

  // 3. 合併分片
  onProgress?.({ phase: "合併分片..." });
  const totalSize = allChunks.reduce((sum, c) => sum + c.length, 0);
  const merged = new Uint8Array(totalSize);
  let offset = 0;
  for (const chunk of allChunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }

  // 4. 校驗
  onProgress?.({ phase: "校驗資料完整性..." });
  if (manifest.streaming || manifest.version === "2.0") {
    // v2.0 流式備份：校驗碼是所有分片 hash 串接後再 hash
    const partHashes: string[] = [];
    for (let i = 0; i < allChunks.length; i++) {
      partHashes.push(await sha256Hex(allChunks[i]));
    }
    const combinedHashInput = new TextEncoder().encode(partHashes.join(":"));
    const checksum = await sha256Hex(combinedHashInput);
    if (checksum !== manifest.checksum) {
      throw new Error(
        `校驗失敗：預期 ${manifest.checksum.slice(0, 12)}...，實際 ${checksum.slice(0, 12)}...`,
      );
    }
  } else {
    // v1.0：整體 SHA-256
    const checksum = await sha256Hex(merged);
    if (checksum !== manifest.checksum) {
      throw new Error(
        `校驗失敗：預期 ${manifest.checksum.slice(0, 12)}...，實際 ${checksum.slice(0, 12)}...`,
      );
    }
  }

  return merged;
}

// ============================================================
// 刪除遠端備份
// ============================================================

/** 刪除指定的遠端備份目錄 */
export async function deleteRemoteBackup(
  backupPath: string,
): Promise<{ success: boolean; message: string }> {
  const settings = await loadGitHubSettings();
  if (!settings.token || !settings.repo) {
    return { success: false, message: "請先設定 GitHub Token 和倉庫名稱" };
  }

  const { token, repo } = settings;

  try {
    const branch = await getDefaultBranch(repo, token);
    // 列出目錄下所有檔案
    const res = await ghFetch(
      `/repos/${repo}/contents/${backupPath}?ref=${branch}`,
      token,
    );
    const files: Array<{ name: string; path: string; sha: string }> =
      await res.json();

    // 逐個刪除
    for (const file of files) {
      await ghFetch(`/repos/${repo}/contents/${file.path}`, token, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: `delete backup: ${backupPath}`,
          sha: file.sha,
          branch,
        }),
      });
    }

    return { success: true, message: "備份已刪除" };
  } catch (e: any) {
    return { success: false, message: `刪除失敗: ${e.message || e}` };
  }
}

// ============================================================
// 自動清理舊備份
// ============================================================

/**
 * 保留最新的 maxKeep 份備份，刪除其餘的。
 * 在 uploadToGitHub 成功後自動呼叫。
 */
async function cleanOldRemoteBackups(
  maxKeep: number,
  onProgress?: (p: GitHubBackupProgress) => void,
): Promise<void> {
  const backups = await listRemoteBackups();
  if (backups.length <= maxKeep) return;

  // backups 已按時間倒序（最新在前），刪除 maxKeep 之後的
  const toDelete = backups.slice(maxKeep);
  for (let i = 0; i < toDelete.length; i++) {
    onProgress?.({ phase: `清理舊備份 ${i + 1}/${toDelete.length}` });
    try {
      await deleteRemoteBackup(toDelete[i].path);
    } catch (e) {
      console.warn(`[GitHubBackup] 刪除舊備份 ${toDelete[i].name} 失敗:`, e);
    }
  }
}

// ============================================================
// 驗證連線
// ============================================================

/** 驗證 token 和 repo 是否有效 */
export async function validateConnection(): Promise<{
  valid: boolean;
  message: string;
  username?: string;
}> {
  const settings = await loadGitHubSettings();
  if (!settings.token) {
    return { valid: false, message: "未設定 Token" };
  }
  if (!settings.repo) {
    return { valid: false, message: "未設定倉庫名稱" };
  }

  try {
    // 驗證 token
    const userRes = await ghFetch("/user", settings.token);
    const user = await userRes.json();

    // 驗證 repo 存取
    await ghFetch(`/repos/${settings.repo}`, settings.token);

    return {
      valid: true,
      message: `已連接：${user.login}`,
      username: user.login,
    };
  } catch (e: any) {
    if (e.message?.includes("401")) {
      return { valid: false, message: "Token 無效或已過期" };
    }
    if (e.message?.includes("404")) {
      return { valid: false, message: "找不到倉庫，請確認名稱或先 fork" };
    }
    return { valid: false, message: `連線失敗: ${e.message}` };
  }
}
