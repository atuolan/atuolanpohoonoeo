import { describe, expect, it } from "vitest";
import {
  buildInsertPlan,
  insertRowsAt,
  movePendingRows,
  parseImportedPromptItems,
  removeRows,
  type ImportedPromptItem,
  type TransferRow,
} from "@/utils/promptImportTransfer";

const item = (id: string): ImportedPromptItem => ({
  sourceIdentifier: id,
  name: id,
  content: `${id} content`,
  role: "system",
  enabled: true,
  injection_position: 0,
  injection_depth: 0,
  injection_order: 100,
  marker: false,
  system_prompt: false,
});

const existing = (id: string): TransferRow => ({
  kind: "existing",
  key: `e:${id}`,
  identifier: id,
});

const pending = (id: string): TransferRow => ({
  kind: "pending",
  key: `p:${id}`,
  sourceKey: `s:${id}`,
  item: item(id),
});

const keysOf = (rows: TransferRow[]) => rows.map((row) => row.key);

/** 模擬 store 依計畫逐一 splice 插入，驗證最終順序 */
function simulateApply(rows: TransferRow[]): string[] {
  const order = rows
    .filter((row) => row.kind === "existing")
    .map((row) => (row as { identifier: string }).identifier);
  for (const step of buildInsertPlan(rows)) {
    order.splice(step.insertIndex, 0, step.item.sourceIdentifier);
  }
  return order;
}

describe("parseImportedPromptItems", () => {
  it("缺少 prompts 陣列時丟出錯誤", () => {
    expect(() => parseImportedPromptItems({})).toThrow();
  });

  it("補上預設值並正規化 role", () => {
    const [parsed] = parseImportedPromptItems({
      prompts: [{ identifier: "a", role: "weird", injection_position: 1 }],
    });
    expect(parsed.name).toBe("a");
    expect(parsed.role).toBe("system");
    expect(parsed.injection_position).toBe(1);
    expect(parsed.enabled).toBe(true);
  });
});

describe("insertRowsAt", () => {
  it("插入到指定位置並限制範圍", () => {
    const rows = [existing("a"), existing("b")];
    expect(keysOf(insertRowsAt(rows, [pending("x")], 1))).toEqual([
      "e:a",
      "p:x",
      "e:b",
    ]);
    expect(keysOf(insertRowsAt(rows, [pending("x")], 99))[2]).toBe("p:x");
    expect(keysOf(insertRowsAt(rows, [pending("x")], -3))[0]).toBe("p:x");
  });
});

describe("movePendingRows", () => {
  const rows = [existing("a"), pending("x"), existing("b"), pending("y"), existing("c")];

  it("往下移時扣掉原本在前面的列", () => {
    const result = movePendingRows(rows, ["p:x"], 4);
    expect(keysOf(result.rows)).toEqual(["e:a", "e:b", "p:y", "p:x", "e:c"]);
    expect(result.index).toBe(3);
  });

  it("往上移到最前面", () => {
    const result = movePendingRows(rows, ["p:y"], 0);
    expect(keysOf(result.rows)).toEqual(["p:y", "e:a", "p:x", "e:b", "e:c"]);
    expect(result.index).toBe(0);
  });

  it("多列一起移動時保持相對順序", () => {
    const result = movePendingRows(rows, ["p:y", "p:x"], 5);
    expect(keysOf(result.rows)).toEqual(["e:a", "e:b", "e:c", "p:x", "p:y"]);
  });

  it("不會移動既有條目", () => {
    const result = movePendingRows(rows, ["e:a"], 5);
    expect(result.rows).toBe(rows);
  });
});

describe("removeRows", () => {
  it("只移除待加入條目", () => {
    const rows = [existing("a"), pending("x")];
    expect(keysOf(removeRows(rows, ["p:x", "e:a"]))).toEqual(["e:a"]);
  });
});

describe("buildInsertPlan", () => {
  it("依序插入後得到與畫面一致的順序", () => {
    const rows = [
      pending("x"),
      existing("a"),
      pending("y"),
      pending("z"),
      existing("b"),
      existing("c"),
      pending("w"),
    ];
    expect(simulateApply(rows)).toEqual(["x", "a", "y", "z", "b", "c", "w"]);
  });

  it("沒有待加入條目時回傳空計畫", () => {
    expect(buildInsertPlan([existing("a")])).toEqual([]);
  });
});
