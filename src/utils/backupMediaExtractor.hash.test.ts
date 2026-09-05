/**
 * 驗證 BackupMediaExtractor 的去重快取不會保留原始 base64 大字串。
 *
 * 舊版 quickHash() 用 `str.substring()` 取前後各 1000 字元當 key，
 * 但 V8 的 substring 產生 SlicedString，會抓住整個母字串不放——
 * 於是媒體雖然已經寫進 sink，完整 base64 仍被去重快取留在 heap。
 */
import { describe, expect, it } from "vitest";
import { BackupMediaExtractor } from "@/utils/backupMediaExtractor";

/** Uint8Array → base64（不依賴 node Buffer） */
function toBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

/** 產生指定位元組數的 base64 DataURL */
function makeDataUrl(bytes: number, seed: number): string {
  const buf = new Uint8Array(bytes);
  for (let i = 0; i < bytes; i++) {
    buf[i] = (i * 31 + seed * 17) & 0xff;
  }
  return `data:image/png;base64,${toBase64(buf)}`;
}

describe("BackupMediaExtractor 去重快取", () => {
  it("hash key 是固定長度，不隨圖片大小成長", async () => {
    const written: string[] = [];
    const extractor = new BackupMediaExtractor(async (name) => {
      written.push(name);
    });

    // 兩張大小差異極大的圖片
    await extractor.extract(makeDataUrl(1024, 1), "chat");
    await extractor.extract(makeDataUrl(512 * 1024, 2), "chat");

    expect(written).toHaveLength(2);

    // 從 extractor 內部取出快取 key 檢查長度
    const keys = [...(extractor as any).cache.keys()] as string[];
    expect(keys).toHaveLength(2);
    // SHA-256 hex 是 64 字元，加上 ext 與長度前綴仍遠小於 1000
    for (const k of keys) {
      expect(k.length).toBeLessThan(120);
    }
    // 兩個 key 長度應該幾乎一樣（不隨圖片大小成長）
    expect(Math.abs(keys[0].length - keys[1].length)).toBeLessThan(10);
  });

  it("相同內容去重，不同內容不去重", async () => {
    const written: string[] = [];
    const extractor = new BackupMediaExtractor(async (name) => {
      written.push(name);
    });

    const a = makeDataUrl(4096, 1);
    const b = makeDataUrl(4096, 2); // 同大小、不同內容

    const p1 = await extractor.extract(a, "chat");
    const p2 = await extractor.extract(a, "chat"); // 完全相同
    const p3 = await extractor.extract(b, "chat");

    expect(p1).toBe(p2); // 去重命中，回傳同一路徑
    expect(p3).not.toBe(p1);
    expect(written).toHaveLength(2); // 只寫出兩份

    const result = extractor.getResult();
    expect(result.totalExtracted).toBe(3);
    expect(result.dedupeHits).toBe(1);
    expect(Object.keys(result.files)).toHaveLength(0); // sink 模式不留記憶體
  });

  it("同大小不同內容不會誤判為重複（舊版切片 hash 的風險）", async () => {
    const written: string[] = [];
    const extractor = new BackupMediaExtractor(async (name) => {
      written.push(name);
    });

    // 前後 1000 位元組相同、只有中間不同：舊版切片 hash 會誤判成同一張
    const size = 8192;
    const mk = (midByte: number) => {
      const buf = new Uint8Array(size);
      for (let i = 0; i < size; i++) buf[i] = i & 0xff;
      buf[size / 2] = midByte;
      return `data:image/png;base64,${toBase64(buf)}`;
    };

    const p1 = await extractor.extract(mk(1), "chat");
    const p2 = await extractor.extract(mk(2), "chat");

    expect(p1).not.toBe(p2); // 必須視為不同圖片
    expect(written).toHaveLength(2);
  });

  it("extractAvatar 與 extract 對相同內容產生相同 hash", async () => {
    const extractor = new BackupMediaExtractor(async () => {});
    const url = makeDataUrl(2048, 7);

    const avatarPath = await extractor.extractAvatar(url, "char1");
    const plainPath = await extractor.extract(url, "chat");

    // 內容相同 → 去重命中 → 回傳先寫出的那個路徑
    expect(plainPath).toBe(avatarPath);
    expect(extractor.getResult().dedupeHits).toBe(1);
  });

  it("無 sink 模式仍在 files 中累積（單聊天匯出用）", async () => {
    const extractor = new BackupMediaExtractor();
    await extractor.extract(makeDataUrl(1024, 3), "chat");

    const result = extractor.getResult();
    expect(Object.keys(result.files)).toHaveLength(1);
    expect(result.totalExtracted).toBe(1);
  });
});
