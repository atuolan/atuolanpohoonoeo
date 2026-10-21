/**
 * App 裡把檔案寫進手機的公開資料夾。
 *
 * - 備份：文件/203Phone/
 * - 其他匯出（角色卡、聊天記錄…）：文件/203Phone/匯出/
 * - 圖片：圖片/203Phone/（相簿看得到），寫不進去才退回匯出資料夾
 * - iOS：都在 App 自己的「文件」（檔案 App › 我的 iPhone › 203 Phone），沒有公用圖片資料夾，解除安裝會一起刪掉
 *
 * 公開資料夾的檔案在解除安裝 App 後還會留著。Android 11 起 App 只看得到
 * 自己建立的檔案，重裝後舊檔案列不出來也刪不掉，但用檔案選擇器還是能導入。
 *
 * 原生橋只能傳字串，二進位資料要轉 base64；一次傳太大會卡住或閃退，
 * 所以累積到 CHUNK_BYTES 就 append 一次。
 */
import { Directory, Filesystem } from "@capacitor/filesystem";
import { isIosApp, nativeBackupLocation } from "./platform";

export { nativeBackupLocation };

export const NATIVE_BACKUP_DIR = "203Phone";
const EXPORT_DIR = "203Phone/匯出";
const PICTURES_DIR = "Pictures/203Phone";

/** 每次交給原生橋的位元組數（base64 後約 1.33 倍） */
const CHUNK_BYTES = 2 * 1024 * 1024;

/** 給使用者看的位置 */
const PICTURES_LOCATION = "圖片／203Phone";

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  // String.fromCharCode 一次吃太多參數會爆堆疊
  const step = 0x8000;
  for (let i = 0; i < bytes.length; i += step) {
    binary += String.fromCharCode(...bytes.subarray(i, i + step));
  }
  return btoa(binary);
}

/** 檔名裡 Android 不接受的字元換掉 */
export function sanitizeFilename(name: string): string {
  const cleaned = name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").trim();
  return cleaned || "未命名";
}

interface ChunkedWriter {
  write(chunk: Uint8Array): Promise<void>;
  close(): Promise<void>;
  abort(): Promise<void>;
}

/** 建立（或覆寫）一個檔案，之後分段寫入 */
async function openChunkedWriter(path: string, directory: Directory): Promise<ChunkedWriter> {
  // 先建出空檔，順便建好資料夾
  await Filesystem.writeFile({ path, data: "", directory, recursive: true });

  let buffer: Uint8Array[] = [];
  let buffered = 0;

  const flush = async () => {
    if (buffered === 0) return;
    const merged = new Uint8Array(buffered);
    let offset = 0;
    for (const part of buffer) {
      merged.set(part, offset);
      offset += part.length;
    }
    buffer = [];
    buffered = 0;
    await Filesystem.appendFile({ path, data: bytesToBase64(merged), directory });
  };

  return {
    async write(chunk) {
      buffer.push(chunk);
      buffered += chunk.length;
      if (buffered >= CHUNK_BYTES) await flush();
    },
    async close() {
      await flush();
    },
    async abort() {
      buffer = [];
      buffered = 0;
      await Filesystem.deleteFile({ path, directory }).catch(() => {});
    },
  };
}

// ============================================================
// 備份
// ============================================================

/** 在備份資料夾開一個檔案，ZIP 邊打包邊寫入 */
export function openNativeBackupFile(filename: string): Promise<ChunkedWriter> {
  return openChunkedWriter(`${NATIVE_BACKUP_DIR}/${filename}`, Directory.Documents);
}

export async function deleteNativeBackupFile(filename: string): Promise<void> {
  await Filesystem.deleteFile({
    path: `${NATIVE_BACKUP_DIR}/${filename}`,
    directory: Directory.Documents,
  });
}

/** 備份資料夾裡的檔名；資料夾還不存在時回傳空陣列 */
export async function listNativeBackupFiles(): Promise<string[]> {
  try {
    const { files } = await Filesystem.readdir({
      path: NATIVE_BACKUP_DIR,
      directory: Directory.Documents,
    });
    return files.filter((f) => f.type === "file").map((f) => f.name);
  } catch {
    return [];
  }
}

// ============================================================
// 一般匯出（取代 <a download>）
// ============================================================

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|bmp|avif)$/i;

async function exists(path: string, directory: Directory): Promise<boolean> {
  try {
    await Filesystem.stat({ path, directory });
    return true;
  } catch {
    return false;
  }
}

/** 同名檔案已存在時加上 (1)、(2)…，不覆蓋使用者之前匯出的檔案 */
async function uniquePath(dir: string, filename: string, directory: Directory): Promise<string> {
  const dot = filename.lastIndexOf(".");
  const base = dot > 0 ? filename.slice(0, dot) : filename;
  const ext = dot > 0 ? filename.slice(dot) : "";
  let candidate = `${dir}/${filename}`;
  for (let n = 1; (await exists(candidate, directory)) && n < 1000; n++) {
    candidate = `${dir}/${base} (${n})${ext}`;
  }
  return candidate;
}

async function writeBlob(blob: Blob, path: string, directory: Directory): Promise<void> {
  const writer = await openChunkedWriter(path, directory);
  try {
    for (let offset = 0; offset < blob.size; offset += CHUNK_BYTES) {
      const slice = blob.slice(offset, offset + CHUNK_BYTES);
      await writer.write(new Uint8Array(await slice.arrayBuffer()));
    }
    await writer.close();
  } catch (err) {
    await writer.abort();
    throw err;
  }
}

/**
 * 把檔案存進手機，回傳給使用者看的位置（例如「文件／203Phone／匯出／角色.json」）。
 */
export async function saveBlobToDevice(blob: Blob, filename: string): Promise<string> {
  const name = sanitizeFilename(filename);

  if (!isIosApp() && (IMAGE_EXT.test(name) || blob.type.startsWith("image/"))) {
    try {
      // 圖片放「圖片」資料夾，相簿才看得到
      const path = await uniquePath(PICTURES_DIR, name, Directory.ExternalStorage);
      await writeBlob(blob, path, Directory.ExternalStorage);
      return `${PICTURES_LOCATION}／${path.slice(PICTURES_DIR.length + 1)}`;
    } catch (err) {
      console.warn("[NativeFiles] 圖片資料夾寫入失敗，改存到匯出資料夾:", err);
    }
  }

  const path = await uniquePath(EXPORT_DIR, name, Directory.Documents);
  await writeBlob(blob, path, Directory.Documents);
  return `${nativeBackupLocation()}／匯出／${path.slice(EXPORT_DIR.length + 1)}`;
}
