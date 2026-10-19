/// <reference types="vitest/globals" />

/**
 * App 寫檔：分段寫入不能掉資料、同名不覆蓋、圖片寫不進去要退回匯出資料夾。
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

/** 假的手機檔案系統：key 是「directory:path」 */
const files = new Map<string, Uint8Array>();
let appendCalls = 0;
let failExternalStorage = false;

function key(directory: string, path: string) {
  return `${directory}:${path}`;
}

function decode(base64: string): Uint8Array {
  return Uint8Array.from(Buffer.from(base64, "base64"));
}

vi.mock("@capacitor/filesystem", () => ({
  Directory: { Documents: "DOCUMENTS", ExternalStorage: "EXTERNAL_STORAGE" },
  Filesystem: {
    writeFile: vi.fn(async ({ path, data, directory }) => {
      if (failExternalStorage && directory === "EXTERNAL_STORAGE") {
        throw new Error("permission denied");
      }
      files.set(key(directory, path), decode(data));
    }),
    appendFile: vi.fn(async ({ path, data, directory }) => {
      appendCalls++;
      const prev = files.get(key(directory, path)) ?? new Uint8Array(0);
      const next = decode(data);
      const merged = new Uint8Array(prev.length + next.length);
      merged.set(prev);
      merged.set(next, prev.length);
      files.set(key(directory, path), merged);
    }),
    deleteFile: vi.fn(async ({ path, directory }) => {
      files.delete(key(directory, path));
    }),
    stat: vi.fn(async ({ path, directory }) => {
      if (!files.has(key(directory, path))) throw new Error("not found");
      return { type: "file", size: files.get(key(directory, path))!.length };
    }),
    readdir: vi.fn(async ({ path, directory }) => {
      const prefix = key(directory, `${path}/`);
      return {
        files: [...files.keys()]
          .filter((k) => k.startsWith(prefix) && !k.slice(prefix.length).includes("/"))
          .map((k) => ({ name: k.slice(prefix.length), type: "file" })),
      };
    }),
  },
}));

vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: () => true },
}));

const native = await import("./nativeFiles");

function randomBytes(size: number): Uint8Array {
  const out = new Uint8Array(size);
  for (let i = 0; i < size; i++) out[i] = (i * 7919 + 13) & 0xff;
  return out;
}

beforeEach(() => {
  files.clear();
  appendCalls = 0;
  failExternalStorage = false;
});

describe("bytesToBase64", () => {
  it("跟 Node 的 base64 一致，包含超過分段大小的資料", () => {
    for (const size of [0, 1, 2, 3, 0x8000, 0x8000 + 1, 100_000]) {
      const bytes = randomBytes(size);
      expect(native.bytesToBase64(bytes)).toBe(Buffer.from(bytes).toString("base64"));
    }
  });
});

describe("sanitizeFilename", () => {
  it("換掉 Android 不接受的字元", () => {
    expect(native.sanitizeFilename('角色:小明/v2?.json')).toBe("角色_小明_v2_.json");
    expect(native.sanitizeFilename("   ")).toBe("未命名");
  });
});

describe("openNativeBackupFile", () => {
  it("很多小 chunk 寫完後內容完整，而且有合併成大段才送出", async () => {
    const writer = await native.openNativeBackupFile("aguaphone-backup-a.zip");
    const expected: number[] = [];
    // 3000 個 2KB chunk ≈ 6MB
    for (let i = 0; i < 3000; i++) {
      const chunk = randomBytes(2048).map((b) => (b + i) & 0xff);
      expected.push(...chunk);
      await writer.write(chunk);
    }
    await writer.close();

    const written = files.get("DOCUMENTS:203Phone/aguaphone-backup-a.zip")!;
    expect(written.length).toBe(expected.length);
    expect(Buffer.from(written).equals(Buffer.from(expected))).toBe(true);
    // 每 2MB 才過一次原生橋，不是每個 chunk 都過
    expect(appendCalls).toBeLessThanOrEqual(4);
  });

  it("abort 會刪掉寫到一半的檔案", async () => {
    const writer = await native.openNativeBackupFile("aguaphone-backup-b.zip");
    await writer.write(randomBytes(10));
    await writer.abort();
    expect(files.has("DOCUMENTS:203Phone/aguaphone-backup-b.zip")).toBe(false);
  });

  it("listNativeBackupFiles 列出備份資料夾的檔案，不含匯出子資料夾", async () => {
    files.set("DOCUMENTS:203Phone/aguaphone-backup-1.zip", new Uint8Array(1));
    files.set("DOCUMENTS:203Phone/匯出/角色.json", new Uint8Array(1));
    expect(await native.listNativeBackupFiles()).toEqual(["aguaphone-backup-1.zip"]);
  });
});

describe("saveBlobToDevice", () => {
  it("一般檔案存進匯出資料夾，同名不覆蓋", async () => {
    const first = await native.saveBlobToDevice(new Blob(["a"]), "角色.json");
    const second = await native.saveBlobToDevice(new Blob(["b"]), "角色.json");
    expect(first).toBe("文件／203Phone／匯出／角色.json");
    expect(second).toBe("文件／203Phone／匯出／角色 (1).json");
    expect(Buffer.from(files.get("DOCUMENTS:203Phone/匯出/角色.json")!).toString()).toBe("a");
    expect(Buffer.from(files.get("DOCUMENTS:203Phone/匯出/角色 (1).json")!).toString()).toBe("b");
  });

  it("圖片存進圖片資料夾；寫不進去就退回匯出資料夾", async () => {
    const blob = new Blob([randomBytes(5)], { type: "image/png" });
    expect(await native.saveBlobToDevice(blob, "截圖.png")).toBe("圖片／203Phone／截圖.png");
    expect(files.has("EXTERNAL_STORAGE:Pictures/203Phone/截圖.png")).toBe(true);

    failExternalStorage = true;
    expect(await native.saveBlobToDevice(blob, "截圖2.png")).toBe("文件／203Phone／匯出／截圖2.png");
  });
});
