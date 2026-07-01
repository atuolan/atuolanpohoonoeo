/**
 * 工具參數規格與驗證輔助
 *
 * 提供宣告式的參數規格（列舉 / 數值範圍 / 顏色 / 字串 / 布林 / 自由 CSS），
 * 以及對應的驗證 + 正規化函式。themeTools.ts 用這些規格描述每個工具的參數，
 * buildToolPrompt.ts 用這些規格自動生成給 AI 的說明，
 * ThemeAssistantService.ts 用 validateArgs 在執行前守住安全。
 */

// ===== 參數規格型別 =====

export type ToolParamSpec =
  | EnumParamSpec
  | NumberParamSpec
  | ColorParamSpec
  | StringParamSpec
  | StringArrayParamSpec
  | BooleanParamSpec
  | CSSParamSpec;

interface BaseParamSpec {
  /** 參數名（對應 args 的 key） */
  name: string;
  /** 給 AI 看的說明 */
  description: string;
  /** 是否必填（預設 true） */
  required?: boolean;
}

/** 列舉型：值只能從白名單挑 */
export interface EnumParamSpec extends BaseParamSpec {
  type: "enum";
  /** 合法值清單 */
  values: readonly string[];
}

/** 數值型：含範圍夾限 */
export interface NumberParamSpec extends BaseParamSpec {
  type: "number";
  min: number;
  max: number;
  /** 是否須為整數（預設 false） */
  integer?: boolean;
}

/** 顏色型：hex（#RGB / #RRGGBB）或允許漸層字串 */
export interface ColorParamSpec extends BaseParamSpec {
  type: "color";
  /** 是否允許 linear-gradient(...) 等漸層字串（預設 false） */
  allowGradient?: boolean;
}

/** 一般字串 */
export interface StringParamSpec extends BaseParamSpec {
  type: "string";
  /** 最大長度（預設 500） */
  maxLength?: number;
  /** 是否對內容跑 CSS 安全與顏色函式檢查（用於會注入全域的完整 CSS 字串） */
  validateCSS?: boolean;
}

/** 布林 */
export interface BooleanParamSpec extends BaseParamSpec {
  type: "boolean";
}

/** 自由 CSS 內容（創建型工具用，裸內容，由接口包裝作用域） */
export interface CSSParamSpec extends BaseParamSpec {
  type: "css";
  /** 最大長度（預設 4000） */
  maxLength?: number;
}

/** 字串陣列（用於「詢問使用者」工具的選項清單） */
export interface StringArrayParamSpec extends BaseParamSpec {
  type: "stringArray";
  /** 每個元素最大長度（預設 100） */
  itemMaxLength?: number;
  /** 陣列最大長度（預設 6） */
  maxItems?: number;
}

// ===== 驗證結果 =====

export interface ParamValidationResult {
  ok: boolean;
  /** 正規化後的值（夾限 / 去空白等） */
  value?: unknown;
  /** 失敗原因 */
  error?: string;
}

export interface ArgsValidationResult {
  ok: boolean;
  /** 正規化後的整組參數 */
  args: Record<string, unknown>;
  errors: string[];
}

// ===== 單一參數驗證 =====

// 接受 3/4/6/8 碼 hex；4 與 8 碼含 alpha 通道（用於透明 / 半透明）
const HEX_RE = /^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

export function validateParam(
  spec: ToolParamSpec,
  raw: unknown,
): ParamValidationResult {
  const required = spec.required !== false;

  // 缺值處理
  if (raw === undefined || raw === null || raw === "") {
    if (required) {
      return { ok: false, error: `缺少必填參數「${spec.name}」` };
    }
    return { ok: true, value: undefined };
  }

  switch (spec.type) {
    case "enum": {
      const v = String(raw);
      if (!spec.values.includes(v)) {
        return {
          ok: false,
          error: `參數「${spec.name}」的值 "${v}" 不在允許清單：${spec.values.join(" / ")}`,
        };
      }
      return { ok: true, value: v };
    }

    case "number": {
      const n = typeof raw === "number" ? raw : Number(raw);
      if (Number.isNaN(n)) {
        return { ok: false, error: `參數「${spec.name}」必須是數字` };
      }
      // 夾限到合法範圍
      let clamped = Math.min(spec.max, Math.max(spec.min, n));
      if (spec.integer) clamped = Math.round(clamped);
      return { ok: true, value: clamped };
    }

    case "color": {
      const v = String(raw).trim();
      if (HEX_RE.test(v)) {
        return { ok: true, value: v };
      }
      if (spec.allowGradient && /^(linear|radial|conic)-gradient\(/.test(v)) {
        return { ok: true, value: v };
      }
      return {
        ok: false,
        error: `參數「${spec.name}」必須是 hex 顏色（如 #FF85A2；要透明 / 半透明用 8 碼 #RRGGBBAA，例如全透明 #00000000）${spec.allowGradient ? " 或漸層字串" : ""}`,
      };
    }

    case "string": {
      const v = String(raw);
      const maxLength = spec.maxLength ?? 500;
      if (v.length > maxLength) {
        return {
          ok: false,
          error: `參數「${spec.name}」超過長度上限 ${maxLength}`,
        };
      }
      // 完整 CSS 字串（會注入全域）：跑危險語法與顏色函式檢查
      if (spec.validateCSS) {
        const danger = detectDangerousCSS(v);
        if (danger) {
          return { ok: false, error: `參數「${spec.name}」含不允許的內容：${danger}` };
        }
        const badColor = detectMalformedColorFn(v);
        if (badColor) {
          return { ok: false, error: `參數「${spec.name}」${badColor}` };
        }
      }
      return { ok: true, value: v };
    }

    case "boolean": {
      if (typeof raw === "boolean") return { ok: true, value: raw };
      if (raw === "true") return { ok: true, value: true };
      if (raw === "false") return { ok: true, value: false };
      return { ok: false, error: `參數「${spec.name}」必須是布林值` };
    }

    case "stringArray": {
      const arr = Array.isArray(raw) ? raw : [raw];
      const itemMaxLength = spec.itemMaxLength ?? 100;
      const maxItems = spec.maxItems ?? 6;
      const items: string[] = [];
      for (const el of arr) {
        if (el === undefined || el === null) continue;
        const s = String(el).trim();
        if (!s) continue;
        if (s.length > itemMaxLength) {
          return {
            ok: false,
            error: `參數「${spec.name}」的選項「${s.slice(0, 12)}…」超過長度上限 ${itemMaxLength}`,
          };
        }
        items.push(s);
      }
      if (items.length === 0) {
        return { ok: false, error: `參數「${spec.name}」需至少一個選項` };
      }
      return { ok: true, value: items.slice(0, maxItems) };
    }

    case "css": {
      const v = String(raw);
      const maxLength = spec.maxLength ?? 4000;
      if (v.length > maxLength) {
        return {
          ok: false,
          error: `參數「${spec.name}」CSS 內容超過長度上限 ${maxLength}`,
        };
      }
      // 安全過濾：禁止可能逃逸作用域 / 引入外部資源的危險語法
      const danger = detectDangerousCSS(v);
      if (danger) {
        return { ok: false, error: `參數「${spec.name}」含不允許的內容：${danger}` };
      }
      const badColor = detectMalformedColorFn(v);
      if (badColor) {
        return { ok: false, error: `參數「${spec.name}」${badColor}` };
      }
      return { ok: true, value: v };
    }

    default:
      return { ok: false, error: "未知的參數型別" };
  }
}

/**
 * 偵測裸 CSS 中的危險語法。創建型工具的 CSS 會被包進組件作用域，
 * 但仍須阻擋會逃逸作用域或載入外部資源的內容。
 */
function detectDangerousCSS(css: string): string | null {
  const lowered = css.toLowerCase();
  if (lowered.includes("</style") || lowered.includes("<script")) {
    return "HTML 標籤";
  }
  if (/@import\b/.test(lowered)) {
    return "@import";
  }
  if (/javascript:/.test(lowered)) {
    return "javascript: URL";
  }
  if (/expression\s*\(/.test(lowered)) {
    return "expression()";
  }
  // 禁止 :root / html / body 等逃逸到全域的選擇器（創建型只能改組件內部）
  if (/(^|[\s,{}])(:root|html|body)\b/.test(lowered)) {
    return "全域選擇器（:root/html/body）";
  }
  return null;
}

/**
 * 偵測寫壞的顏色函式（分量數量不對）。這類值瀏覽器會靜默丟棄整條宣告，
 * 造成「工具回報成功、畫面卻沒變」，AI 收不到回饋而反覆亂猜。
 * 嚴格規則：
 *  - rgb / hsl：需 3 個分量（允許第 4 個 alpha，故 3~4）
 *  - rgba / hsla：需正好 4 個分量
 * 逗號或斜線混用、含 CSS 變數 / calc 時放行（避免誤判）。
 */
function detectMalformedColorFn(css: string): string | null {
  const fnRe = /\b(rgba?|hsla?)\s*\(([^()]*)\)/gi;
  let m: RegExpExecArray | null;
  while ((m = fnRe.exec(css)) !== null) {
    const fn = m[1].toLowerCase();
    const inner = m[2];
    // 含變數 / 計算 / 巢狀函式時無法簡單計數，放行
    if (/var\(|calc\(|env\(|clamp\(|min\(|max\(/i.test(inner)) continue;
    // 現代語法用空白 + 斜線分隔（如 rgb(255 0 0 / 50%)），計數方式不同，放行
    if (inner.includes("/")) continue;
    const parts = inner
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    // 沒有逗號（可能是空白分隔的現代語法），放行
    if (parts.length <= 1 && inner.trim().length > 0) continue;
    const hasAlpha = fn === "rgba" || fn === "hsla";
    if (hasAlpha && parts.length !== 4) {
      return `顏色函式 ${fn}() 分量數量錯誤（寫了 ${parts.length} 個，需要 4 個：${fn === "rgba" ? "R,G,B,A" : "H,S,L,A"}）。整段「${m[0]}」會被瀏覽器丟棄而不生效，請補齊，例如 rgba(255,255,255,0.25)`;
    }
    if (!hasAlpha && (parts.length < 3 || parts.length > 4)) {
      return `顏色函式 ${fn}() 分量數量錯誤（寫了 ${parts.length} 個，需要 3 個）。整段「${m[0]}」會被瀏覽器丟棄而不生效`;
    }
  }
  return null;
}

// ===== 整組參數驗證 =====

export function validateArgs(
  specs: ToolParamSpec[],
  rawArgs: Record<string, unknown>,
): ArgsValidationResult {
  const args: Record<string, unknown> = {};
  const errors: string[] = [];

  for (const spec of specs) {
    const result = validateParam(spec, rawArgs[spec.name]);
    if (!result.ok) {
      errors.push(result.error ?? `參數「${spec.name}」無效`);
      continue;
    }
    if (result.value !== undefined) {
      args[spec.name] = result.value;
    }
  }

  return { ok: errors.length === 0, args, errors };
}

// ===== 給 prompt 用的人類可讀描述 =====

export function describeParam(spec: ToolParamSpec): string {
  const req = spec.required === false ? "（選填）" : "";
  switch (spec.type) {
    case "enum":
      return `${spec.name}${req}: 列舉，可選 ${spec.values.map((v) => `"${v}"`).join(" / ")} — ${spec.description}`;
    case "number":
      return `${spec.name}${req}: 數值 ${spec.min}~${spec.max}${spec.integer ? "（整數）" : ""} — ${spec.description}`;
    case "color":
      return `${spec.name}${req}: hex 顏色${spec.allowGradient ? "或漸層" : ""}（如 #FF85A2） — ${spec.description}`;
    case "string":
      return `${spec.name}${req}: 字串 — ${spec.description}`;
    case "boolean":
      return `${spec.name}${req}: 布林 true/false — ${spec.description}`;
    case "css":
      return `${spec.name}${req}: 裸 CSS 內容（不要寫選擇器外層，作用域由系統自動包裝；禁用 :root/html/body/@import） — ${spec.description}`;
    case "stringArray":
      return `${spec.name}${req}: 字串陣列（最多 ${spec.maxItems ?? 6} 項，供使用者點選的選項） — ${spec.description}`;
  }
}
