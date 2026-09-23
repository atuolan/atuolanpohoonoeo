/**
 * OPFS 寫檔 Worker
 *
 * iOS Safari 的 OPFS 在主線程沒有 `createWritable()`，只有 Worker 內的
 * `createSyncAccessHandle()`。備份 ZIP 若不能邊打包邊落地，就只能整份
 * 組在 JS heap 裡，資料量大時會被系統直接殺掉（症狀：打包途中閃退，
 * 「上次備份」什麼都沒留下）。
 *
 * 通訊協議（每個請求帶 id，回覆同 id）：
 *   open  { name }   建立／清空檔案並取得 SyncAccessHandle
 *   write { chunk }  依序追加寫入（chunk 以 transferable 傳入）
 *   close            flush 後關閉 handle，檔案保留供主線程 getFile()
 *   abort            關閉 handle 並刪除檔案
 */

/* eslint-disable no-restricted-globals */

let handle: any = null;
let root: any = null;
let fileName = "";
let offset = 0;

function reply(id: number, error?: unknown) {
  if (error === undefined) {
    self.postMessage({ id, ok: true });
  } else {
    const message =
      error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    self.postMessage({ id, ok: false, error: message });
  }
}

function closeHandle() {
  if (!handle) return;
  try {
    handle.flush();
  } catch {
    /* 已關閉 */
  }
  try {
    handle.close();
  } catch {
    /* 已關閉 */
  }
  handle = null;
}

self.onmessage = async (e: MessageEvent) => {
  const { id, type } = e.data;
  try {
    switch (type) {
      case "open": {
        closeHandle();
        root = await (navigator as any).storage.getDirectory();
        fileName = e.data.name;
        const fileHandle = await root.getFileHandle(fileName, { create: true });
        if (typeof fileHandle.createSyncAccessHandle !== "function") {
          throw new Error("createSyncAccessHandle 不可用");
        }
        handle = await fileHandle.createSyncAccessHandle();
        handle.truncate(0);
        offset = 0;
        reply(id);
        break;
      }
      case "write": {
        if (!handle) throw new Error("檔案尚未開啟");
        const chunk: Uint8Array = e.data.chunk;
        let written = 0;
        // write() 可能只寫入部分位元組，迴圈直到全部寫完
        while (written < chunk.length) {
          const n = handle.write(chunk.subarray(written), {
            at: offset + written,
          });
          if (!n) throw new Error("OPFS 寫入 0 位元組（可能空間不足）");
          written += n;
        }
        offset += written;
        reply(id);
        break;
      }
      case "close": {
        closeHandle();
        reply(id);
        break;
      }
      case "abort": {
        closeHandle();
        if (root && fileName) {
          await root.removeEntry(fileName).catch(() => {});
        }
        reply(id);
        break;
      }
      default:
        throw new Error(`未知指令: ${type}`);
    }
  } catch (err) {
    reply(id, err);
  }
};
