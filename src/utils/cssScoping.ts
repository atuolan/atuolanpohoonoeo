/**
 * 共用 CSS 作用域包裝工具
 *
 * AI 美化助手（widget 型與 UI 表面型）都採「AI 只輸出裸 CSS、程式端自動包裝
 * 作用域」的機制；全局自訂 CSS 則是「使用者寫完整選擇器、程式端補特異性」。
 * 三者共用同一套分塊 / 去註解 / 選擇器改寫邏輯。
 *
 * 核心概念：
 *   - `:scope` 代表「該作用域真正要套樣式的可見根」，由呼叫端透過
 *     `scopeRoots` 指定（可能不只一層，例如流動按鈕的底色其實畫在 .blob-shape）。
 *   - 一般選擇器則被視為作用域內的後代，加上 `descendantPrefix` 前綴。
 *   - @media / @supports / @container / @layer 遞迴處理內部；
 *     @keyframes / @font-face 等完全保留。
 */

export interface ScopeOptions {
  /**
   * `:scope` 對映的根選擇器（已含特異性前綴）。
   * 可傳多個，`:scope` 會展開成逗號分隔的多條規則。
   */
  scopeRoots: string[];
  /**
   * 一般（非 :scope）選擇器的前綴（已含特異性前綴）。
   * 最終選擇器為 `${descendantPrefix} ${原選擇器}`。
   */
  descendantPrefix: string;
}

/**
 * 全域注入 CSS 用的特異性前綴。
 * `:is()` 的特異性取參數中最高者（#app 的 ID 級），足以壓過 Vue scoped 的
 * [data-v-xxx]；同時 body 也在參數裡，所以 Teleport 到 body、不在 #app 底下的
 * 彈窗一樣對得上。
 */
export const GLOBAL_SCOPE_PREFIX = ":is(#app, body)";

/** 把單一段裸 CSS 依 options 加上作用域前綴 */
export function scopeCSS(rawCSS: string, options: ScopeOptions): string {
  if (!rawCSS || !rawCSS.trim()) return "";
  return rewriteCSS(rawCSS, (sel) => {
    // :scope 代表作用域「真正畫底色」的可見層（可能不只一層）
    if (sel === ":scope") return options.scopeRoots;
    if (sel.startsWith(":scope")) {
      const suffix = sel.slice(":scope".length);
      return options.scopeRoots.map((r) => `${r}${suffix}`);
    }
    // 一般選擇器：作用域內的後代
    return [`${options.descendantPrefix} ${sel}`];
  });
}

/**
 * 提升全局自訂 CSS 的特異性：在非全局選擇器前加 GLOBAL_SCOPE_PREFIX。
 * :root / html / body 開頭、或已自帶 #app 前綴的選擇器保留不動。
 */
export function boostCSSSpecificity(css: string): string {
  if (!css || !css.trim()) return "";
  return rewriteCSS(css, (sel) => {
    if (sel.startsWith("#app") || sel.startsWith(GLOBAL_SCOPE_PREFIX)) {
      return [sel];
    }
    if (/^(:root|html|body)\b/.test(sel)) return [sel];
    return [`${GLOBAL_SCOPE_PREFIX} ${sel}`];
  });
}

/** 去註解 → 逐塊改寫選擇器 → 還原註解 */
function rewriteCSS(
  css: string,
  mapSelector: (selector: string) => string[],
): string {
  // 移除註解（用佔位符），避免註解內 {} 干擾分塊
  const comments: string[] = [];
  const stripped = css.replace(/\/\*[\s\S]*?\*\//g, (match) => {
    const idx = comments.length;
    comments.push(match);
    return `/*__C_${idx}__*/`;
  });

  const rewritten = rewriteBlocks(stripped, mapSelector);

  // 還原註解
  return rewritten.replace(
    /\/\*__C_(\d+)__\*\//g,
    (_, idx) => comments[parseInt(idx)],
  );
}

/** 對頂層 CSS 區塊逐一改寫選擇器 */
function rewriteBlocks(
  css: string,
  mapSelector: (selector: string) => string[],
): string {
  const result: string[] = [];

  for (const block of splitTopLevelBlocks(css)) {
    // 先把開頭的註解佔位符拆出來，否則「註解後面接 @media / body」會被誤判成一般選擇器
    const match = /^((?:\/\*__C_\d+__\*\/\s*)*)([\s\S]*)$/.exec(block);
    const leading = match ? match[1] : "";
    const rest = match ? match[2] : block;

    // 純註解直接保留
    if (!rest) {
      result.push(block);
      continue;
    }

    // 沒有大括號：@import 這類陳述式或殘段，原樣保留
    const firstBrace = findTopLevelBrace(rest);
    if (firstBrace === -1) {
      result.push(block);
      continue;
    }

    // 內含規則的 at-rule：保留 at-rule 本身，遞迴處理內部
    if (/^@(media|supports|container|layer)\b/.test(rest)) {
      const atSelector = rest.substring(0, firstBrace + 1);
      const inner = extractInnerContent(rest, firstBrace);
      result.push(
        `${leading}${atSelector}\n${rewriteBlocks(inner, mapSelector)}\n}`,
      );
      continue;
    }

    // @keyframes / @font-face 等：完全保留
    if (rest.startsWith("@")) {
      result.push(block);
      continue;
    }

    const selector = rest.substring(0, firstBrace).trim();
    const body = rest.substring(firstBrace);

    // 逗號分隔的多選擇器，逐一改寫
    const mapped = splitSelectorList(selector).flatMap((s) => {
      const sel = s.trim();
      return sel ? mapSelector(sel) : [];
    });

    result.push(`${leading}${mapped.join(",\n")} ${body}`);
  }

  return result.join("\n\n");
}

/** 從引號開頭跳到字串結尾，回傳結尾引號的位置（未閉合的字串到換行為止） */
function skipString(css: string, start: number): number {
  const quote = css[start];
  for (let i = start + 1; i < css.length; i++) {
    const ch = css[i];
    if (ch === "\\") {
      i++;
      continue;
    }
    if (ch === quote || ch === "\n") return i;
  }
  return css.length - 1;
}

/** 找出第一個不在字串內的 {，找不到回 -1 */
function findTopLevelBrace(css: string): number {
  for (let i = 0; i < css.length; i++) {
    const ch = css[i];
    if (ch === '"' || ch === "'") {
      i = skipString(css, i);
      continue;
    }
    if (ch === "{") return i;
  }
  return -1;
}

/** 按頂層逗號拆開選擇器清單；括號、方括號、字串內的逗號不算 */
export function splitSelectorList(selector: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;

  for (let i = 0; i < selector.length; i++) {
    const ch = selector[i];
    if (ch === '"' || ch === "'") {
      i = skipString(selector, i);
      continue;
    }
    if (ch === "(" || ch === "[") {
      depth++;
    } else if (ch === ")" || ch === "]") {
      depth = Math.max(0, depth - 1);
    } else if (ch === "," && depth === 0) {
      parts.push(selector.substring(start, i));
      start = i + 1;
    }
  }
  parts.push(selector.substring(start));
  return parts;
}

/** 按頂層大括號分割 CSS 區塊（已去除註解）；字串內的大括號不算 */
export function splitTopLevelBlocks(css: string): string[] {
  const blocks: string[] = [];
  let braceCount = 0;
  let blockStart = 0;

  const pushBlock = (end: number) => {
    const block = css.substring(blockStart, end).trim();
    if (block) blocks.push(block);
    blockStart = end;
  };

  for (let i = 0; i < css.length; i++) {
    const ch = css[i];
    if (ch === '"' || ch === "'") {
      i = skipString(css, i);
      continue;
    }
    if (ch === "{") {
      braceCount++;
    } else if (ch === "}") {
      // 多出來的 }：連同前面的殘段一起丟掉，避免拖累後面的規則
      if (braceCount === 0) {
        blockStart = i + 1;
        continue;
      }
      braceCount--;
      if (braceCount === 0) pushBlock(i + 1);
    } else if (ch === ";" && braceCount === 0) {
      // 頂層分號只會出現在 @import / @charset 這類陳述式，自成一塊
      pushBlock(i + 1);
    }
  }
  pushBlock(css.length);
  return blocks;
}

/** 提取 at-rule { ... } 內部內容（不含最外層大括號） */
function extractInnerContent(block: string, openBraceIdx: number): string {
  let depth = 0;
  let endIdx = block.length - 1;
  for (let i = openBraceIdx; i < block.length; i++) {
    const ch = block[i];
    if (ch === '"' || ch === "'") {
      i = skipString(block, i);
      continue;
    }
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        endIdx = i;
        break;
      }
    }
  }
  return block.substring(openBraceIdx + 1, endIdx).trim();
}
