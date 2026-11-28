/**
 * 按需讀取的 ZIP：只讀中央目錄，要哪個檔案才從磁碟切那一段出來解壓。
 *
 * 備份導入原本把整個 ZIP 讀進記憶體再全部解壓，上百 MB 的備份在 iPhone 上
 * 會把 App 撐爆、直接重開。改成這樣，記憶體裡同時只有正在處理的那幾個檔案。
 *
 * 只支援 stored(0) 與 deflate(8)，不支援 ZIP64 與加密；遇到就丟錯，呼叫端退回整包解壓。
 */
import { inflateSync } from "fflate";

export interface LazyZipEntry {
  name: string;
  method: number;
  compressedSize: number;
  uncompressedSize: number;
  localHeaderOffset: number;
}

export interface LazyZip {
  /** 所有檔案（不含資料夾）的名稱，照 ZIP 內的順序 */
  readonly names: string[];
  has(name: string): boolean;
  read(name: string): Promise<Uint8Array>;
}

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;
const EOCD_MIN_SIZE = 22;
/** EOCD 後面最多還有 65535 bytes 的註解 */
const EOCD_SEARCH_SIZE = EOCD_MIN_SIZE + 0xffff;

async function readSlice(blob: Blob, start: number, end: number): Promise<Uint8Array> {
  return new Uint8Array(await blob.slice(start, end).arrayBuffer());
}

function findEocd(tail: Uint8Array): number {
  const view = new DataView(tail.buffer, tail.byteOffset, tail.byteLength);
  for (let i = tail.length - EOCD_MIN_SIZE; i >= 0; i--) {
    if (view.getUint32(i, true) === EOCD_SIGNATURE) return i;
  }
  return -1;
}

export async function openLazyZip(blob: Blob): Promise<LazyZip> {
  const tailStart = Math.max(0, blob.size - EOCD_SEARCH_SIZE);
  const tail = await readSlice(blob, tailStart, blob.size);
  const eocdPos = findEocd(tail);
  if (eocdPos < 0) throw new Error("找不到 ZIP 目錄");

  const eocd = new DataView(tail.buffer, tail.byteOffset + eocdPos, EOCD_MIN_SIZE);
  const entryCount = eocd.getUint16(10, true);
  const cdSize = eocd.getUint32(12, true);
  const cdOffset = eocd.getUint32(16, true);
  if (entryCount === 0xffff || cdSize === 0xffffffff || cdOffset === 0xffffffff) {
    throw new Error("不支援 ZIP64");
  }
  if (cdOffset + cdSize > blob.size) throw new Error("ZIP 目錄位置不正確");

  const cd = await readSlice(blob, cdOffset, cdOffset + cdSize);
  const view = new DataView(cd.buffer, cd.byteOffset, cd.byteLength);
  const decoder = new TextDecoder();
  const entries = new Map<string, LazyZipEntry>();
  const names: string[] = [];

  let p = 0;
  for (let i = 0; i < entryCount; i++) {
    if (p + 46 > cd.length || view.getUint32(p, true) !== CENTRAL_SIGNATURE) {
      throw new Error("ZIP 目錄損壞");
    }
    const flags = view.getUint16(p + 8, true);
    const method = view.getUint16(p + 10, true);
    const compressedSize = view.getUint32(p + 20, true);
    const uncompressedSize = view.getUint32(p + 24, true);
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    const localHeaderOffset = view.getUint32(p + 42, true);
    const name = decoder.decode(cd.subarray(p + 46, p + 46 + nameLen));
    p += 46 + nameLen + extraLen + commentLen;

    if (name.endsWith("/")) continue;
    if (flags & 0x1) throw new Error("不支援加密的 ZIP");
    if (method !== 0 && method !== 8) throw new Error(`不支援的壓縮方式 ${method}`);
    if (
      compressedSize === 0xffffffff ||
      uncompressedSize === 0xffffffff ||
      localHeaderOffset === 0xffffffff
    ) {
      throw new Error("不支援 ZIP64");
    }
    if (!entries.has(name)) names.push(name);
    entries.set(name, { name, method, compressedSize, uncompressedSize, localHeaderOffset });
  }

  async function read(name: string): Promise<Uint8Array> {
    const entry = entries.get(name);
    if (!entry) throw new Error(`ZIP 裡沒有 ${name}`);
    const header = await readSlice(blob, entry.localHeaderOffset, entry.localHeaderOffset + 30);
    const hv = new DataView(header.buffer, header.byteOffset, header.byteLength);
    if (header.length < 30 || hv.getUint32(0, true) !== LOCAL_SIGNATURE) {
      throw new Error(`ZIP 檔案標頭損壞：${name}`);
    }
    const dataStart =
      entry.localHeaderOffset + 30 + hv.getUint16(26, true) + hv.getUint16(28, true);
    const raw = await readSlice(blob, dataStart, dataStart + entry.compressedSize);
    if (entry.method === 0) return raw;
    return inflateSync(raw, { out: new Uint8Array(entry.uncompressedSize) });
  }

  return {
    names,
    has: (name) => entries.has(name),
    read,
  };
}
