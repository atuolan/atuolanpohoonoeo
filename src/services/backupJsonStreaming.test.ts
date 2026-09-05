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

describe("metadata.json 的 exportedAt", () => {
  it("逐 key 釋放前必須先存下 exportedAt", () => {
    // 迴歸測試：逐 key delete 會把 exportedAt 一起刪掉，
    // 之後 metadata.json 讀 lightData.exportedAt 就變成 undefined
    const lightData: Record<string, unknown> = {
      exportedAt: "2026-09-05T00:00:00.000Z",
      characters: [],
    };
    const exportedAt = lightData.exportedAt; // 必須在迴圈前取

    for (const key of Object.keys(lightData)) {
      delete lightData[key];
    }

    expect(exportedAt).toBe("2026-09-05T00:00:00.000Z");
    expect(lightData.exportedAt).toBeUndefined();
    const metadata = { version: "2.0", exportedAt, chatCount: 0 };
    expect(JSON.parse(JSON.stringify(metadata)).exportedAt).toBe(
      "2026-09-05T00:00:00.000Z",
    );
  });
});
