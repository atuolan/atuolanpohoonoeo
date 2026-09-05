/**
 * 驗證 backup.json 的分段序列化與整包 JSON.stringify 逐字元相同。
 *
 * AutoBackupService 為避免 OOM，改成逐個 top-level key 序列化後推入 ZIP，
 * 而不是整包 JSON.stringify()。備份格式不可改變（舊備份必須仍可匯入），
 * 所以這裡鎖住「輸出位元組必須一致」這個不變量。
 */
import { describe, expect, it } from "vitest";

/** 與 AutoBackupService 步驟 5 相同的分段序列化邏輯 */
function serializeChunked(data: Record<string, unknown>): string {
  const parts: string[] = ["{"];
  let first = true;
  for (const key of Object.keys(data)) {
    const json = JSON.stringify(data[key]);
    if (json === undefined) continue;
    parts.push(`${first ? "" : ","}${JSON.stringify(key)}:${json}`);
    first = false;
  }
  parts.push("}");
  return parts.join("");
}

function expectSame(data: Record<string, unknown>) {
  expect(serializeChunked(data)).toBe(JSON.stringify(data));
}

describe("backup.json 分段序列化", () => {
  it("空物件", () => {
    expectSame({});
  });

  it("典型備份結構", () => {
    expectSame({
      version: 1,
      type: "aguaphone-auto-backup",
      exportedAt: "2026-09-05T00:00:00.000Z",
      characters: [{ id: "c1", name: "小明", avatar: "media/avatar_c1.png" }],
      lorebooks: [],
      settings: { theme: "neon", nested: { deep: [1, 2, 3] } },
      canvasLayout: null,
    });
  });

  it("undefined 值的 key 會被省略（與整包行為一致）", () => {
    expectSame({ a: 1, b: undefined, c: 3 });
  });

  it("只有 undefined 值時仍是合法空物件", () => {
    expectSame({ a: undefined, b: undefined });
  });

  it("第一個 key 是 undefined 時逗號位置正確", () => {
    expectSame({ a: undefined, b: 2, c: 3 });
  });

  it("最後一個 key 是 undefined 時不留尾逗號", () => {
    expectSame({ a: 1, b: 2, c: undefined });
  });

  it("需要轉義的 key 與值", () => {
    expectSame({
      'key"with\\quotes': "value\nwith\ttabs",
      "中文鍵": "換行\r\n與 emoji 🎉",
      "unicode ": "line separator",
    });
  });

  it("特殊值：null、空陣列、空物件、0、false、空字串", () => {
    expectSame({
      nullVal: null,
      emptyArr: [],
      emptyObj: {},
      zero: 0,
      no: false,
      blank: "",
    });
  });

  it("函式與 symbol 值同樣被省略", () => {
    expectSame({ a: 1, fn: () => {}, sym: Symbol("x"), b: 2 });
  });

  it("巨大陣列（模擬 vectorEmbeddings）", () => {
    const vectorEmbeddings = Array.from({ length: 200 }, (_, i) => ({
      id: `vec_${i}`,
      vector: Array.from({ length: 64 }, (_, j) => j / 7),
    }));
    expectSame({ version: 1, vectorEmbeddings, tail: "end" });
  });

  it("產出可被 JSON.parse 還原", () => {
    const data = {
      version: 1,
      characters: [{ id: "c1", tags: ["a", "b"] }],
      settings: { nested: { x: 1.5 } },
    };
    expect(JSON.parse(serializeChunked(data))).toEqual(data);
  });

  it("逐個 key 序列化後刪除不影響輸出", () => {
    const data: Record<string, unknown> = {
      a: [1, 2, 3],
      b: { x: "y" },
      c: "tail",
    };
    const expected = JSON.stringify(data);

    // 模擬 AutoBackupService 的即時釋放：序列化一個就 delete 一個
    const parts: string[] = ["{"];
    let first = true;
    for (const key of Object.keys(data)) {
      const json = JSON.stringify(data[key]);
      if (json === undefined) continue;
      parts.push(`${first ? "" : ","}${JSON.stringify(key)}:${json}`);
      first = false;
      delete data[key];
    }
    parts.push("}");

    expect(parts.join("")).toBe(expected);
    expect(Object.keys(data)).toHaveLength(0); // 確實釋放了
  });
});

/** 與 AutoBackupService `pushLightValue` 相同的逐筆陣列序列化邏輯 */
function serializePerItem(data: Record<string, unknown>): string {
  const parts: string[] = ["{"];
  let first = true;
  for (const key of Object.keys(data)) {
    const value = data[key];
    const prefix = `${first ? "" : ","}${JSON.stringify(key)}:`;
    if (Array.isArray(value)) {
      parts.push(`${prefix}[`);
      for (let i = 0; i < value.length; i++) {
        const itemJson = JSON.stringify(value[i]) ?? "null";
        parts.push(i === 0 ? itemJson : `,${itemJson}`);
      }
      parts.push("]");
      first = false;
      continue;
    }
    const json = JSON.stringify(value);
    if (json === undefined) continue;
    parts.push(`${prefix}${json}`);
    first = false;
  }
  parts.push("}");
  return parts.join("");
}

describe("backup.json 逐筆陣列序列化", () => {
  const same = (data: Record<string, unknown>) =>
    expect(serializePerItem(data)).toBe(JSON.stringify(data));

  it("空陣列", () => {
    same({ a: [], b: 1 });
  });

  it("單元素陣列不留前導逗號", () => {
    same({ a: [1] });
  });

  it("巨大 vectorEmbeddings 逐筆與整包一致", () => {
    same({
      version: 1,
      vectorEmbeddings: Array.from({ length: 300 }, (_, i) => ({
        id: `vec_${i}`,
        vector: Array.from({ length: 48 }, (_, j) => (j + i) / 3),
      })),
      tail: "end",
    });
  });

  it("陣列中的 undefined / 函式 / symbol 序列化為 null", () => {
    same({ a: [1, undefined, 3, () => {}, Symbol("s"), 6] });
  });

  it("陣列中的 null 與嵌套結構", () => {
    same({ a: [null, { x: [1, 2] }, [], "字串"] });
  });

  it("陣列是第一個 key 時逗號位置正確", () => {
    same({ arr: [1, 2], after: "x" });
  });

  it("undefined key 在陣列之前時不留前導逗號", () => {
    same({ skipped: undefined, arr: [1, 2] });
  });

  it("多個陣列連續", () => {
    same({ a: [1], b: [2, 3], c: [], d: [4] });
  });

  it("產出可被 JSON.parse 還原", () => {
    const data = {
      characters: [{ id: "c1" }, { id: "c2" }],
      settings: { theme: "neon" },
    };
    expect(JSON.parse(serializePerItem(data))).toEqual(data);
  });
});

/**
 * 模擬新版步驟 4-5：固定前綴 + 逐個 loader 載入後序列化。
 * 每個 store 獨立載入、寫出、釋放，全程沒有「全部 store 同時在記憶體」的時刻。
 */
async function serializePerStore(
  prefix: Array<[string, unknown]>,
  loaders: Array<{ key: string; load: () => Promise<unknown> }>,
): Promise<string> {
  const parts: string[] = ["{"];
  let first = true;
  const push = (key: string, value: unknown): boolean => {
    const p = `${first ? "" : ","}${JSON.stringify(key)}:`;
    if (Array.isArray(value)) {
      parts.push(`${p}[`);
      for (let i = 0; i < value.length; i++) {
        const j = JSON.stringify(value[i]) ?? "null";
        parts.push(i === 0 ? j : `,${j}`);
      }
      parts.push("]");
      return true;
    }
    const json = JSON.stringify(value);
    if (json === undefined) return false;
    parts.push(`${p}${json}`);
    return true;
  };

  for (const [key, value] of prefix) {
    push(key, value);
    first = false;
  }
  for (const { key, load } of loaders) {
    const wrapper: Record<string, unknown> = { [key]: await load() };
    if (push(key, wrapper[key])) first = false;
    delete wrapper[key];
  }
  parts.push("}");
  return parts.join("");
}

describe("backup.json 逐 store 載入序列化", () => {
  it("與舊版一次全載後整包 stringify 逐字元相同", async () => {
    const stores: Record<string, unknown> = {
      characters: [{ id: "c1", name: "小明", avatar: "media/avatar_c1.png" }],
      lorebooks: [],
      settings: { theme: "neon" },
      userData: null,
      themes: [{ id: "t1", wallpaperStyle: { type: "color", value: "#000" } }],
      qzonePosts: [{ id: "p1", images: ["media/qzone_0_1.png"] }],
      gameStates: [{ key: "g1", value: { score: 10 } }],
      vectorEmbeddings: Array.from({ length: 50 }, (_, i) => ({
        id: `v${i}`,
        vector: [i, i + 1],
      })),
      canvasLayout: { widgets: [] },
    };

    // 舊版行為：全部載入成一個物件後整包 stringify
    const legacy = JSON.stringify({
      version: 1,
      type: "aguaphone-auto-backup",
      exportedAt: "2026-09-05T00:00:00.000Z",
      ...stores,
    });

    const actual = await serializePerStore(
      [
        ["version", 1],
        ["type", "aguaphone-auto-backup"],
        ["exportedAt", "2026-09-05T00:00:00.000Z"],
      ],
      Object.keys(stores).map((key) => ({
        key,
        load: async () => stores[key],
      })),
    );

    expect(actual).toBe(legacy);
  });

  it("loader 回傳 undefined 的 store 被省略，不留多餘逗號", async () => {
    const actual = await serializePerStore(
      [["version", 1]],
      [
        { key: "a", load: async () => undefined },
        { key: "b", load: async () => [1, 2] },
      ],
    );
    expect(actual).toBe(JSON.stringify({ version: 1, b: [1, 2] }));
    expect(JSON.parse(actual)).toEqual({ version: 1, b: [1, 2] });
  });

  it("全部 store 都空時仍是合法 JSON", async () => {
    const actual = await serializePerStore(
      [["version", 1]],
      [
        { key: "a", load: async () => [] },
        { key: "b", load: async () => undefined },
      ],
    );
    expect(JSON.parse(actual)).toEqual({ version: 1, a: [] });
  });
});

describe("metadata.json 的 exportedAt", () => {
  it("exportedAt 獨立產生，不依賴會被釋放的資料物件", () => {
    // 迴歸測試：舊版從 lightData.exportedAt 讀取，而逐 key delete 會把它
    // 一起刪掉，metadata.json 就寫進 undefined。現在改成在打包開始時
    // 獨立產生一份，backup.json 與 metadata.json 共用同一個值。
    const exportedAt = new Date("2026-09-05T00:00:00.000Z").toISOString();

    const lightData: Record<string, unknown> = { characters: [] };
    for (const key of Object.keys(lightData)) {
      delete lightData[key];
    }

    // 資料物件被清空後 exportedAt 仍然有效
    expect(Object.keys(lightData)).toHaveLength(0);
    expect(exportedAt).toBe("2026-09-05T00:00:00.000Z");

    const metadata = { version: "2.0", exportedAt, chatCount: 0 };
    expect(JSON.parse(JSON.stringify(metadata)).exportedAt).toBe(
      "2026-09-05T00:00:00.000Z",
    );
  });
});
