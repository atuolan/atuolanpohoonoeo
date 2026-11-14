/**
 * MVU（MagVarUpdate）變數更新指令解析
 *
 * 對齊原版 MVU 的語意：
 * - `_.set(路徑, 新值)` / `_.set(路徑, 舊值, 新值)`：取最後一個參數當新值
 * - `_.add(路徑, 變化量)`：數字加減
 * - `_.insert(路徑, 值)` / `_.insert(路徑, 鍵或索引, 值)`（`_.assign` 同義）：插入陣列／物件
 * - `_.remove(路徑)` / `_.remove(路徑, 值或索引)`（`_.delete` / `_.unset` 同義）：刪除
 * - 指令後面的 `//原因` 會當成這筆變化的原因
 * - `<JSONPatch>` 裡的 replace / delta / add / insert / remove / move
 *
 * 參數用「看得懂引號和括號」的方式切開，字串裡有逗號、括號也不會切錯。
 */
import jsYaml from "js-yaml";

export interface MvuCommand {
  name: "set" | "add" | "insert" | "remove";
  /** 原始指令名稱（assign、unset 這類別名） */
  rawName: string;
  args: unknown[];
  reason: string;
}

export interface MvuPatchOp {
  op: string;
  path: string;
  value?: unknown;
  from?: string;
}

const COMMAND_ALIASES: Record<string, MvuCommand["name"]> = {
  set: "set",
  add: "add",
  insert: "insert",
  assign: "insert",
  remove: "remove",
  unset: "remove",
  delete: "remove",
};

const MIN_ARGS: Record<MvuCommand["name"], number> = {
  set: 2,
  add: 2,
  insert: 2,
  remove: 1,
};

/** 從 `(` 的位置找到對應的 `)`，引號裡的括號不算 */
function findMatchingParen(text: string, openIndex: number): number {
  let depth = 0;
  let quote: string | null = null;
  for (let i = openIndex; i < text.length; i++) {
    const ch = text[i];
    if (quote) {
      if (ch === "\\") {
        i++;
        continue;
      }
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      quote = ch;
      continue;
    }
    if (ch === "(") depth++;
    else if (ch === ")") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/** 依最外層的逗號切參數（引號、()[]{} 裡的逗號不算） */
export function splitTopLevelArgs(text: string): string[] {
  const args: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  let current = "";
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quote) {
      current += ch;
      if (ch === "\\" && i + 1 < text.length) {
        current += text[++i];
        continue;
      }
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      quote = ch;
      current += ch;
      continue;
    }
    if (ch === "(" || ch === "[" || ch === "{") depth++;
    else if (ch === ")" || ch === "]" || ch === "}") depth--;
    if (ch === "," && depth === 0) {
      args.push(current.trim());
      current = "";
      continue;
    }
    current += ch;
  }
  if (current.trim()) args.push(current.trim());
  return args;
}

function unquote(text: string): string | null {
  const first = text[0];
  const last = text[text.length - 1];
  if (text.length >= 2 && first === last && (first === "'" || first === '"' || first === "`")) {
    return text.slice(1, -1).replace(/\\(['"`\\])/g, "$1").replace(/\\n/g, "\n");
  }
  return null;
}

/**
 * 把指令參數的文字轉成值：true/false/null、數字、JSON、引號字串、YAML 風格的物件陣列；
 * 都不是就當成去掉引號的字串。
 */
export function parseMvuValue(raw: string): unknown {
  const text = raw.trim();
  if (text === "") return "";
  if (text === "true") return true;
  if (text === "false") return false;
  if (text === "null") return null;
  if (text === "undefined") return undefined;

  if (/^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(text)) return Number(text);

  try {
    return JSON.parse(text);
  } catch {
    // 不是 JSON，繼續試
  }

  const quoted = unquote(text);
  if (quoted !== null) return quoted;

  if ((text.startsWith("{") && text.endsWith("}")) || (text.startsWith("[") && text.endsWith("]"))) {
    try {
      const loaded = jsYaml.load(text);
      if (loaded && typeof loaded === "object") return loaded;
    } catch {
      // 退回字串
    }
  }

  // 簡單算式（50+5、66 - 3）
  const arithmetic = text.match(/^([+-]?\d+(?:\.\d+)?)\s*([+-])\s*(\d+(?:\.\d+)?)$/);
  if (arithmetic) {
    const a = Number(arithmetic[1]);
    const b = Number(arithmetic[3]);
    return Number((arithmetic[2] === "+" ? a + b : a - b).toPrecision(12));
  }

  return text;
}

/** 路徑參數：去掉引號；JSON Patch 風格的 `/a/b` 轉成 `a.b` */
export function parseMvuPath(raw: unknown): string {
  const text = String(raw ?? "").trim();
  const path = unquote(text) ?? text;
  if (path.startsWith("/")) return jsonPointerToPath(path);
  return path;
}

export function jsonPointerToPath(pointer: string): string {
  return pointer
    .replace(/^\/+/, "")
    .split("/")
    .filter((seg) => seg !== "")
    .map((seg) => seg.replace(/~1/g, "/").replace(/~0/g, "~"))
    .join(".");
}

/** 掃出文字裡所有 `_.xxx(...)` 指令 */
export function extractMvuCommands(text: string): MvuCommand[] {
  const commands: MvuCommand[] = [];
  const regex = /_\.(set|add|insert|assign|remove|unset|delete)\s*\(/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    const rawName = match[1];
    const name = COMMAND_ALIASES[rawName];
    const openIndex = match.index + match[0].length - 1;
    const closeIndex = findMatchingParen(text, openIndex);
    if (closeIndex === -1) continue;

    const argTexts = splitTopLevelArgs(text.slice(openIndex + 1, closeIndex));
    regex.lastIndex = closeIndex + 1;
    if (argTexts.length < MIN_ARGS[name]) continue;

    // `);//原因` 或下一行的 `// 原因`
    const rest = text.slice(closeIndex + 1);
    const reasonMatch = rest.match(/^\s*;?[ \t]*(?:\r?\n[ \t]*)?\/\/([^\n]*)/);
    const reason = reasonMatch ? reasonMatch[1].trim() : "";

    const args = argTexts.map((a, i) => (i === 0 ? parseMvuPath(a) : parseMvuValue(a)));
    commands.push({ name, rawName, args, reason });
  }
  return commands;
}

/** 去掉 ```json ``` 這類程式碼框 */
function stripCodeFence(text: string): string {
  const fenced = text.trim().match(/^```[\w-]*\s*\n?([\s\S]*?)\n?```$/);
  return fenced ? fenced[1] : text;
}

/** 解析 `<JSONPatch>` 的內容：JSON、JSON5 風格或 YAML 都可以，外面包程式碼框也行 */
export function parseJsonPatchContent(content: string): MvuPatchOp[] | null {
  const text = stripCodeFence(content).trim();
  if (!text) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    try {
      parsed = jsYaml.load(text);
    } catch {
      return null;
    }
  }
  if (parsed && !Array.isArray(parsed) && typeof parsed === "object") parsed = [parsed];
  if (!Array.isArray(parsed)) return null;
  return parsed.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const op = item as Record<string, unknown>;
    if (typeof op.op !== "string" || typeof op.path !== "string") return [];
    return [
      {
        op: op.op.toLowerCase(),
        path: op.path,
        value: op.value,
        from: typeof op.from === "string" ? op.from : undefined,
      },
    ];
  });
}

export interface MvuUpdateBlocks {
  /** 可以掃 `_.xxx()` 指令的文字 */
  commandTexts: string[];
  /** `<JSONPatch>` 的內容 */
  patchTexts: string[];
}

/**
 * 找出訊息裡的 MVU 區塊：`<UpdateVariable>…</UpdateVariable>`（沒收尾也算到結尾，
 * 模型常常輸出到一半被截斷）和 `<update>…</update>`。
 * `<Analysis>` 和 `<JSONPatch>` 不會被當成指令掃。
 */
export function extractMvuUpdateBlocks(raw: string): MvuUpdateBlocks {
  const commandTexts: string[] = [];
  const patchTexts: string[] = [];
  let rest = raw;

  const updateVariableRegex = /<UpdateVariable>([\s\S]*?)(?:<\/UpdateVariable>|$)/gi;
  rest = rest.replace(updateVariableRegex, (_all, inner: string) => {
    const withoutPatch = inner.replace(
      /<JSONPatch>([\s\S]*?)(?:<\/JSONPatch>|$)/gi,
      (_p, patch: string) => {
        patchTexts.push(patch);
        return "";
      },
    );
    commandTexts.push(withoutPatch.replace(/<Analysis>[\s\S]*?(?:<\/Analysis>|$)/gi, ""));
    return "";
  });

  const updateRegex = /<update>([\s\S]*?)<\/update>/gi;
  let match: RegExpExecArray | null;
  while ((match = updateRegex.exec(rest)) !== null) {
    const inner = match[1].replace(/<JSONPatch>([\s\S]*?)(?:<\/JSONPatch>|$)/gi, (_p, patch: string) => {
      patchTexts.push(patch);
      return "";
    });
    commandTexts.push(inner);
  }

  return { commandTexts, patchTexts };
}
