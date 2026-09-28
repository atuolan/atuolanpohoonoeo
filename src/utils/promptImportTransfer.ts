/**
 * 導入條目（預設轉移）工具
 * 解析酒館預設 JSON，並處理「待加入條目」在目標順序中的排列與套用計畫
 */

export interface ImportedPromptItem {
  sourceIdentifier: string;
  name: string;
  content: string;
  role: "system" | "user" | "assistant";
  enabled: boolean;
  injection_position: 0 | 1;
  injection_depth: number;
  injection_order: number;
  marker: boolean;
  system_prompt: boolean;
}

/** 目標模式中既有的條目（顯示用） */
export interface ImportTargetEntry {
  identifier: string;
  name: string;
  role?: "system" | "user" | "assistant";
  enabled: boolean;
  marker: boolean;
}

/** 目標清單的一列：既有條目（不可移出）或待加入條目 */
export type TransferRow =
  | { kind: "existing"; key: string; identifier: string }
  | {
      kind: "pending";
      key: string;
      /** 來源清單中的 key，用來標記「已移入」 */
      sourceKey: string;
      item: ImportedPromptItem;
    };

export interface InsertPlanStep {
  item: ImportedPromptItem;
  /** 依序插入時，在目標順序中的索引 */
  insertIndex: number;
}

export function parseImportedPromptItems(raw: unknown): ImportedPromptItem[] {
  if (!raw || typeof raw !== "object" || !Array.isArray((raw as any).prompts)) {
    throw new Error("找不到 prompts 陣列，這不是可識別的酒館預設格式。");
  }

  return (raw as any).prompts
    .filter((item: unknown) => item && typeof item === "object")
    .map((item: any, index: number) => ({
      sourceIdentifier: String(item.identifier || `imported_${index}`),
      name: String(item.name || item.identifier || `導入條目 ${index + 1}`),
      content: typeof item.content === "string" ? item.content : "",
      role:
        item.role === "user" || item.role === "assistant" ? item.role : "system",
      enabled: item.enabled !== false,
      injection_position: item.injection_position === 1 ? 1 : 0,
      injection_depth:
        typeof item.injection_depth === "number" ? item.injection_depth : 0,
      injection_order:
        typeof item.injection_order === "number" ? item.injection_order : 100,
      marker: Boolean(item.marker),
      system_prompt: Boolean(item.system_prompt),
    }));
}

function clampIndex(index: number, length: number): number {
  if (!Number.isFinite(index)) return length;
  return Math.max(0, Math.min(Math.trunc(index), length));
}

/** 在 index 位置插入新列，回傳新陣列 */
export function insertRowsAt(
  rows: TransferRow[],
  newRows: TransferRow[],
  index: number,
): TransferRow[] {
  const safeIndex = clampIndex(index, rows.length);
  return [...rows.slice(0, safeIndex), ...newRows, ...rows.slice(safeIndex)];
}

/**
 * 把指定的待加入列移到 toIndex（以移動前的列表計算的插槽位置，0..length）
 * 既有條目不會被移動。回傳新陣列與移動後第一列所在的索引。
 */
export function movePendingRows(
  rows: TransferRow[],
  keys: string[],
  toIndex: number,
): { rows: TransferRow[]; index: number } {
  const keySet = new Set(keys);
  const safeTo = clampIndex(toIndex, rows.length);
  const moving: TransferRow[] = [];
  const remaining: TransferRow[] = [];
  let movedBefore = 0;

  rows.forEach((row, i) => {
    if (row.kind === "pending" && keySet.has(row.key)) {
      moving.push(row);
      if (i < safeTo) movedBefore += 1;
    } else {
      remaining.push(row);
    }
  });

  if (moving.length === 0) return { rows, index: safeTo };

  const index = safeTo - movedBefore;
  return { rows: insertRowsAt(remaining, moving, index), index };
}

export function removeRows(rows: TransferRow[], keys: string[]): TransferRow[] {
  const keySet = new Set(keys);
  return rows.filter((row) => !(row.kind === "pending" && keySet.has(row.key)));
}

/**
 * 產生依序插入的計畫：由上而下插入，每一步的 insertIndex 就是它在最終列表中的位置。
 * 前提是既有條目的相對順序與目標順序一致。
 */
export function buildInsertPlan(rows: TransferRow[]): InsertPlanStep[] {
  const plan: InsertPlanStep[] = [];
  rows.forEach((row, index) => {
    if (row.kind === "pending") {
      plan.push({ item: row.item, insertIndex: index });
    }
  });
  return plan;
}
