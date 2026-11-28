/// <reference types="vitest/globals" />
import { strFromU8, strToU8, zipSync, Zip, ZipDeflate, ZipPassThrough } from "fflate";
import { openLazyZip } from "@/utils/lazyZip";

describe("openLazyZip", () => {
  it("讀得出 zipSync 做的 ZIP（壓縮、不壓縮、子資料夾）", async () => {
    const big = new Uint8Array(200_000).map((_, i) => i % 251);
    const bytes = zipSync({
      "backup.json": strToU8('{"hello":"世界"}'),
      "chats/a.json": [strToU8("x".repeat(5000)), { level: 9 }],
      "media/img.png": [big, { level: 0 }],
    });
    const zip = await openLazyZip(new Blob([bytes]));
    expect(zip.names.sort()).toEqual(["backup.json", "chats/a.json", "media/img.png"]);
    expect(strFromU8(await zip.read("backup.json"))).toBe('{"hello":"世界"}');
    expect(strFromU8(await zip.read("chats/a.json"))).toBe("x".repeat(5000));
    expect(await zip.read("media/img.png")).toEqual(big);
    expect(zip.has("nope")).toBe(false);
  });

  it("讀得出流式寫的 ZIP（data descriptor，和備份匯出同一種寫法）", async () => {
    const chunks: Uint8Array[] = [];
    const done = new Promise<void>((resolve, reject) => {
      const zip = new Zip((err, data, final) => {
        if (err) return reject(err);
        chunks.push(data);
        if (final) resolve();
      });
      const a = new ZipDeflate("chats/1.json", { level: 6 });
      zip.add(a);
      a.push(strToU8('{"id":"1"}'), true);
      const b = new ZipPassThrough("media/x.bin");
      zip.add(b);
      b.push(new Uint8Array([1, 2, 3]), true);
      zip.end();
    });
    await done;
    const zip = await openLazyZip(new Blob(chunks));
    expect(strFromU8(await zip.read("chats/1.json"))).toBe('{"id":"1"}');
    expect(Array.from(await zip.read("media/x.bin"))).toEqual([1, 2, 3]);
  });

  it("不是 ZIP 就丟錯", async () => {
    await expect(openLazyZip(new Blob([strToU8("not a zip at all")]))).rejects.toThrow();
  });
});
