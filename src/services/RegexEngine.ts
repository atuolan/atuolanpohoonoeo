/**
 * Regex 執行引擎
 * 完全對應 SillyTavern 的 regex/engine.js 邏輯
 */

import type { RegexScript } from "@/types/character";

// ===== 對應 ST 的 regex_placement 枚舉 =====
export const regex_placement = {
  MD_DISPLAY: 0,   // 已棄用
  USER_INPUT: 1,   // 使用者輸入
  AI_OUTPUT: 2,    // AI 回應
  SLASH_COMMAND: 3, // 指令
  WORLD_INFO: 5,   // 世界書
  REASONING: 6,    // 推理區塊
} as const;

export type RegexPlacement = typeof regex_placement[keyof typeof regex_placement];

// ===== 對應 ST 的 substitute_find_regex 枚舉 =====
export const substitute_find_regex = {
  NONE: 0,
  RAW: 1,
  ESCAPED: 2,
} as const;

export interface RegexRunParams {
  characterName?: string;
  userName?: string;
  isMarkdown?: boolean;
  isPrompt?: boolean;
  isEdit?: boolean;
  depth?: number;
}

/**
 * 對應 ST 的 regexFromString()
 * 將 /pattern/flags 格式字串解析為 RegExp
 */
export function regexFromString(input: string): RegExp | undefined {
  try {
    const m = input.match(/(\/?)(.+)\1([a-z]*)/i);
    if (!m) return undefined;
    const pattern = m[2];
    const flags = m[3];
    if (flags && !/^(?!.*?(.).*?\1)[gmixsuAJ]+$/.test(flags)) {
      return new RegExp(input);
    }
    return new RegExp(pattern, flags);
  } catch {
    return undefined;
  }
}

/**
 * 對應 ST 的 escapeRegex()
 */
function escapeRegex(str: string): string {
  return str.replace(/[/\-\\^$*+?.()|[\]{}]/g, "\\$&");
}

/**
 * 展開簡單的 macro（{{char}} / {{user}}）
 */
function substituteMacros(
  str: string,
  params: RegexRunParams,
): string {
  let result = str;
  if (params.characterName) {
    result = result.replace(/\{\{char\}\}/gi, params.characterName);
  }
  if (params.userName) {
    result = result.replace(/\{\{user\}\}/gi, params.userName);
  }
  return result;
}

/**
 * 對應 ST 的 filterString()
 * 從字串中移除 trimStrings 定義的子字串
 */
function filterString(
  raw: string,
  trimStrings: string[],
  params: RegexRunParams,
): string {
  let result = raw;
  for (const trim of trimStrings) {
    if (!trim) continue;
    const expanded = substituteMacros(trim, params);
    result = result.split(expanded).join("");
  }
  return result;
}

/**
 * 對應 ST 的 runRegexScript()
 * 對單一腳本執行查找替換
 */
export function runRegexScript(
  script: RegexScript,
  rawString: string,
  params: RegexRunParams = {},
): string {
  if (!script.findRegex || script.disabled) return rawString;

  // 根據 substituteRegex 決定是否展開 findRegex 中的 macros
  let findRegexStr = script.findRegex;
  if (script.substituteRegex === substitute_find_regex.RAW) {
    findRegexStr = substituteMacros(findRegexStr, params);
  } else if (script.substituteRegex === substitute_find_regex.ESCAPED) {
    // 展開後跳脫，確保作為字面字串匹配
    const expanded = substituteMacros(findRegexStr, params);
    findRegexStr = escapeRegex(expanded);
  }

  const findRegex = regexFromString(findRegexStr);
  if (!findRegex) return rawString;

  const trimStrings = script.trimStrings ?? [];

  try {
    const result = rawString.replace(findRegex, (...args) => {
      // args: [match, ...groups, offset, string]
      const fullMatch = args[0] as string;
      const groups = args.slice(1, -2) as string[];

      // 將 replaceString 中的 {{match}} 替換為完整匹配
      let replacement = script.replaceString.replace(/\{\{match\}\}/gi, fullMatch);

      // 替換捕獲群組 $1, $2 ...
      for (let i = 0; i < groups.length; i++) {
        const groupVal = groups[i] ?? "";
        const filtered = filterString(groupVal, trimStrings, params);
        replacement = replacement.replace(
          new RegExp(`\\$${i + 1}`, "g"),
          filtered,
        );
      }

      // 展開替換結果中的 macros
      replacement = substituteMacros(replacement, params);

      return replacement;
    });

    return result;
  } catch {
    return rawString;
  }
}

/**
 * 對應 ST 的 getRegexedString()
 * 對給定字串套用所有符合條件的 regex 腳本
 *
 * @param rawString - 要處理的原始字串
 * @param placement - 字串的來源位置
 * @param scripts - 要套用的腳本列表（全域 + 角色腳本合併後傳入）
 * @param params - 額外參數
 */
export function getRegexedString(
  rawString: string,
  placement: RegexPlacement,
  scripts: RegexScript[],
  params: RegexRunParams = {},
): string {
  if (!rawString || !scripts.length) return rawString;

  let result = rawString;

  for (const script of scripts) {
    if (script.disabled) continue;

    // 篩選邏輯（對應 ST engine.js）
    const { isMarkdown = false, isPrompt = false, isEdit = false } = params;

    if (script.markdownOnly && !isMarkdown) continue;
    if (script.promptOnly && !isPrompt) continue;
    if (!script.markdownOnly && !script.promptOnly && (isMarkdown || isPrompt)) continue;

    if (isEdit && !script.runOnEdit) continue;

    // 深度過濾
    if (params.depth !== undefined) {
      const min = script.minDepth ?? -1;
      const max = script.maxDepth ?? null;
      if (min >= 0 && params.depth < min) continue;
      if (max !== null && params.depth > max) continue;
    }

    // placement 過濾
    if (!script.placement?.includes(placement)) continue;

    result = runRegexScript(script, result, params);
  }

  return result;
}

/**
 * 對應 ST 的 migrateSettings()
 * 修復舊版腳本資料格式
 */
export function migrateRegexScript(script: Partial<RegexScript>): RegexScript {
  const migrated = { ...script } as RegexScript;

  // 補充缺失的 UUID
  if (!migrated.id) {
    migrated.id = crypto.randomUUID();
  }

  // 修復非陣列的 placement
  if (!Array.isArray(migrated.placement)) {
    migrated.placement = [];
  }

  // MD_DISPLAY (0) 遷移
  if (migrated.placement.includes(regex_placement.MD_DISPLAY)) {
    if (migrated.placement.length === 1) {
      migrated.placement = Object.values(regex_placement).filter(
        (v) => v !== regex_placement.MD_DISPLAY,
      );
    } else {
      migrated.placement = migrated.placement.filter(
        (v) => v !== regex_placement.MD_DISPLAY,
      );
    }
    migrated.markdownOnly = true;
    migrated.promptOnly = true;
  }

  // sendAs (4) 遷移至 SLASH_COMMAND (3)
  if (migrated.placement.includes(4 as any)) {
    if (migrated.placement.length === 1) {
      migrated.placement = [regex_placement.SLASH_COMMAND];
    } else {
      migrated.placement = migrated.placement.filter((v) => v !== (4 as any));
    }
  }

  // 補充缺失的預設值
  migrated.trimStrings = migrated.trimStrings ?? [];
  migrated.disabled = migrated.disabled ?? false;
  migrated.markdownOnly = migrated.markdownOnly ?? false;
  migrated.promptOnly = migrated.promptOnly ?? false;
  migrated.runOnEdit = migrated.runOnEdit ?? false;
  migrated.substituteRegex = migrated.substituteRegex ?? 0;
  migrated.minDepth = migrated.minDepth ?? -1;
  migrated.maxDepth = migrated.maxDepth ?? -1;

  return migrated;
}
