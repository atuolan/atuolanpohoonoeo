/**
 * MVU 的 `$meta` 結構限制
 *
 * 卡片作者在 [initvar] 裡用 `$meta` 決定 AI 能不能新增、刪除鍵：
 * - 物件：`{ "$meta": { extensible, required, recursiveExtensible, template } }`
 * - 陣列：放一個 `{ "$meta": {...}, "$arrayMeta": true }` 項目，或放字串 "$__META_EXTENSIBLE__$" 表示可增減
 * - 根層的 `$meta.strictSet`：`_.set` 遇到 [值, 說明] 時整個換掉，不只改值
 *
 * 只有卡片真的用了 `$meta`（或陣列標記）才套用限制；沒用的卡片維持寬鬆，
 * 不然一般設定的插入、刪除會全部被擋掉。
 * `$meta` 只存在角色設定裡，送給 AI 的 stat_data 會拿掉。
 */
import _ from "lodash";

export const ARRAY_EXTENSIBLE_MARKER = "$__META_EXTENSIBLE__$";

export interface MvuMeta {
  extensible?: boolean;
  required?: string[];
  recursiveExtensible?: boolean;
  template?: unknown;
  /** 根層：_.set 遇到 [值, 說明] 時整個換掉 */
  strictSet?: boolean;
  /** 根層：陣列 template 遇到單一值時不自動包成陣列 */
  strictTemplate?: boolean;
}

function isArrayMetaItem(item: unknown): item is { $meta?: MvuMeta; $arrayMeta: true } {
  return !!item && typeof item === "object" && (item as { $arrayMeta?: unknown }).$arrayMeta === true;
}

/** 這份初始資料有沒有用到 `$meta` 或陣列標記 */
export function usesMvuMeta(data: unknown): boolean {
  if (Array.isArray(data)) {
    return data.some((item) => item === ARRAY_EXTENSIBLE_MARKER || isArrayMetaItem(item) || usesMvuMeta(item));
  }
  if (data && typeof data === "object") {
    return Object.entries(data as Record<string, unknown>).some(
      ([key, value]) => key === "$meta" || usesMvuMeta(value),
    );
  }
  return false;
}

/** 拿掉 `$meta`、`$arrayMeta` 項目和陣列標記（送給 AI 的 stat_data 用） */
export function stripMvuMeta<T>(data: T): T {
  if (Array.isArray(data)) {
    return data
      .filter((item) => item !== ARRAY_EXTENSIBLE_MARKER && !isArrayMetaItem(item))
      .map((item) => stripMvuMeta(item)) as T;
  }
  if (data && typeof data === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
      if (key === "$meta") continue;
      out[key] = stripMvuMeta(value);
    }
    return out as T;
  }
  return data;
}

interface NodeInfo {
  /** 初始資料裡這個節點（陣列裡的項目用第一個實際項目當樣板） */
  node: unknown;
  meta: MvuMeta;
  /** 祖先有 recursiveExtensible（而且中間沒有被 extensible:false 擋下） */
  inheritedExtensible: boolean;
}

function metaOf(node: unknown): MvuMeta {
  if (Array.isArray(node)) {
    const metaItem = node.find(isArrayMetaItem);
    return { ...(metaItem?.$meta ?? {}) };
  }
  if (node && typeof node === "object") {
    const meta = (node as { $meta?: unknown }).$meta;
    return meta && typeof meta === "object" ? { ...(meta as MvuMeta) } : {};
  }
  return {};
}

/** 沿著路徑找到初始資料裡對應的節點和它的 `$meta` */
function resolveNode(schemaRoot: unknown, path: string): NodeInfo | null {
  let node: unknown = schemaRoot;
  let inherited = false;
  const update = (n: unknown) => {
    const meta = metaOf(n);
    if (meta.extensible === false) inherited = false;
    else if (meta.recursiveExtensible) inherited = true;
  };
  update(node);
  for (const segment of path ? _.toPath(path) : []) {
    if (Array.isArray(node)) {
      const items = node.filter((item) => item !== ARRAY_EXTENSIBLE_MARKER && !isArrayMetaItem(item));
      const template = metaOf(node).template;
      node = items[0] ?? template;
    } else if (node && typeof node === "object") {
      node = (node as Record<string, unknown>)[segment];
    } else {
      return null;
    }
    if (node === undefined) return null;
    update(node);
  }
  return { node, meta: metaOf(node), inheritedExtensible: inherited };
}

function isExtensible(info: NodeInfo): boolean {
  if (info.meta.extensible !== undefined) return info.meta.extensible;
  if (info.meta.recursiveExtensible) return true;
  if (Array.isArray(info.node) && info.node.includes(ARRAY_EXTENSIBLE_MARKER)) return true;
  return info.inheritedExtensible;
}

export interface MvuInsertCheck {
  ok: boolean;
  /** 套用 template 之後要插入的值 */
  value: unknown;
  reason?: string;
}

/**
 * 能不能在 path 插入／新增鍵；可以的話回傳套用 template 後的值。
 * 卡片沒用 `$meta` 時一律允許、不改值。
 */
export function checkMvuInsert(
  schemaRoot: unknown,
  path: string,
  value: unknown,
  key?: string | number,
): MvuInsertCheck {
  if (!usesMvuMeta(schemaRoot)) return { ok: true, value };
  const info = resolveNode(schemaRoot, path);
  // 卡片沒宣告這個位置：交給上一層決定能不能長出新東西
  if (!info) {
    const parent = path.includes(".") ? path.slice(0, path.lastIndexOf(".")) : "";
    const parentInfo = resolveNode(schemaRoot, parent);
    if (!parentInfo || !isExtensible(parentInfo)) {
      return { ok: false, value, reason: `「${path}」不在卡片宣告的結構裡` };
    }
    return { ok: true, value };
  }

  const container = info.node;
  const isArrayKey = key === undefined || key === "-" || typeof key === "number" || /^\d+$/.test(String(key));
  const addsNewKey =
    Array.isArray(container) ||
    (container && typeof container === "object" && (key === undefined || !(String(key) in (container as object))));
  if (addsNewKey && !isExtensible(info)) {
    return { ok: false, value, reason: `「${path}」不能新增（卡片沒有開放 extensible）` };
  }

  const template = info.meta.template;
  if (template === undefined) return { ok: true, value };
  const strictTemplate = metaOf(schemaRoot).strictTemplate === true;
  if (Array.isArray(container) && isArrayKey) {
    if (Array.isArray(template)) {
      return { ok: true, value: Array.isArray(value) ? [...template, ...value] : strictTemplate ? value : [...template, value] };
    }
    if (template && typeof template === "object" && value && typeof value === "object" && !Array.isArray(value)) {
      return { ok: true, value: _.merge({}, template, value) };
    }
    return { ok: true, value };
  }
  if (key !== undefined && template && typeof template === "object" && !Array.isArray(template)) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return { ok: true, value: _.merge({}, template, value) };
    }
  }
  return { ok: true, value };
}

/** 能不能刪掉 path（或 path 底下的某一項）；卡片沒用 `$meta` 時一律允許 */
export function checkMvuRemove(
  schemaRoot: unknown,
  path: string,
  target?: unknown,
): { ok: boolean; reason?: string } {
  if (!usesMvuMeta(schemaRoot)) return { ok: true };
  let containerPath = path;
  let key: string | undefined;
  if (target === undefined) {
    const segments = _.toPath(path);
    key = segments.pop();
    containerPath = segments.join(".");
  } else if (typeof target === "string") {
    key = target;
  }
  const info = resolveNode(schemaRoot, containerPath);
  // 卡片沒宣告的東西（AI 自己長出來的）可以刪
  if (!info) return { ok: true };
  if (!isExtensible(info)) {
    return { ok: false, reason: `「${containerPath || "根層"}」不能刪除（卡片沒有開放 extensible）` };
  }
  if (key && !Array.isArray(info.node) && info.meta.required?.includes(key)) {
    return { ok: false, reason: `「${key}」是必要的，不能刪除` };
  }
  return { ok: true };
}

/** `_.set` 能不能寫到一個還不存在的路徑 */
export function checkMvuCreate(schemaRoot: unknown, path: string): { ok: boolean; reason?: string } {
  if (!usesMvuMeta(schemaRoot)) return { ok: true };
  if (resolveNode(schemaRoot, path)) return { ok: true };
  const segments = _.toPath(path);
  // 找最近一個卡片有宣告的祖先，看它能不能長出新東西
  for (let i = segments.length - 1; i >= 0; i--) {
    const info = resolveNode(schemaRoot, segments.slice(0, i).join("."));
    if (info) {
      return isExtensible(info)
        ? { ok: true }
        : { ok: false, reason: `「${path}」不在卡片宣告的結構裡` };
    }
  }
  return { ok: false, reason: `「${path}」不在卡片宣告的結構裡` };
}

/** 根層 `$meta.strictSet`：`_.set` 遇到 [值, 說明] 時整個換掉 */
export function isStrictSet(schemaRoot: unknown): boolean {
  return metaOf(schemaRoot).strictSet === true;
}
