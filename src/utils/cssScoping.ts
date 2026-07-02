/**
 * 共用 CSS 作用域包裝工具
 *
 * AI 美化助手（widget 型與 UI 表面型）都採「AI 只輸出裸 CSS、程式端自動包裝
 * 作用域」的機制。本模組把分塊、去註解、選擇器前綴等共通邏輯抽出並參數化，
 * 讓 useWidgetCustomCSS 與 useSurfaceCustomCSS 共用同一套實作，避免重複維護。
 *
 * 核心概念：
 *   - `:scope` 代表「該作用域真正要套樣式的可見根」，由呼叫端透過
 *     `scopeRoots` 指定（可能不只一層，例如流動按鈕的底色其實畫在 .blob-shape）。
 *   - 一般選擇器則被視為作用域內的後代，加上 `descendantPrefix` 前綴。
 *   - @media / @supports 遞迴處理內部；@keyframes / @font-face 等完全保留。
 */

export interface ScopeOptions {
  /**
   * `:scope` 對映的根選擇器（已含 #app 等特異性前綴）。
   * 可傳多個，`:scope` 會展開成逗號分隔的多條規則。
   */
  scopeRoots: string[];
  /**
   * 一般（非 :scope）選擇器的前綴（已含 #app 等特異性前綴）。
   * 最終選擇器為 `${descendantPrefix} ${原選擇器}`。
   */
  descendantPrefix: string;
}

/** 把單一段裸 CSS 依 options 加上作用域前綴 */
export function scopeCSS(rawCSS: string, options: ScopeOptions): string {
  if (!rawCSS || !rawCSS.trim()) return "";

  // 移除註解（用佔位符），避免註解內 {} 干擾分塊
  const comments: string[] = [];
  const stripped = rawCSS.replace(/\/\*[\s\S]*?\*\//g, (match) => {
    const idx = comments.length;
    comments.push(match);
    return `/*__C_${idx}__*/`;
  });

  const scoped = scopeBlocks(stripped, options);

  // 還原註解
  return scoped.replace(/\/\*__C_(\d+)__\*\//g, (_, idx) => comments[parseInt(idx)]);
}

/** 對頂層 CSS 區塊加上作用域前綴 */
function scopeBlocks(css: string, options: ScopeOptions): string {
  const blocks = splitTopLevelBlocks(css);
  const result: string[] = [];

  for (const block of blocks) {
    const trimmed = block.trimStart();
    if (!trimmed) continue;

    // 純註解佔位符直接保留
    if (/^\/\*__C_\d+__\*\/\s*$/.test(trimmed)) {
      result.push(block);
      continue;
    }

    // @media / @supports：保留 at-rule，遞迴處理內部
    if (/^@media\b|^@supports\b/.test(trimmed)) {
      const firstBrace = trimmed.indexOf("{");
      if (firstBrace === -1) {
        result.push(block);
        continue;
      }
      const atSelector = trimmed.substring(0, firstBrace + 1);
      const inner = extractInnerContent(trimmed, firstBrace);
      result.push(`${atSelector}\n${scopeBlocks(inner, options)}\n}`);
      continue;
    }

    // @keyframes / @font-face / @layer 等：完全保留（不加作用域）
    if (/^@/.test(trimmed)) {
      result.push(block);
      continue;
    }

    const firstBrace = trimmed.indexOf("{");
    if (firstBrace === -1) {
      result.push(block);
      continue;
    }

    const selector = trimmed.substring(0, firstBrace).trim();
    const body = trimmed.substring(firstBrace);

    // 逗號分隔的多選擇器，逐一加前綴
    const scopedSelectors = selector.split(",").flatMap((s) => {
      const sel = s.trim();
      if (!sel) return [sel];
      // :scope 代表作用域「真正畫底色」的可見層（可能不只一層）
      if (sel === ":scope") return options.scopeRoots;
      if (sel.startsWith(":scope")) {
        const suffix = sel.slice(":scope".length);
        return options.scopeRoots.map((r) => `${r}${suffix}`);
      }
      // 一般選擇器：作用域內的後代
      return [`${options.descendantPrefix} ${sel}`];
    });

    result.push(`${scopedSelectors.join(",\n")} ${body}`);
  }

  return result.join("\n\n");
}

/** 按頂層大括號分割 CSS 區塊（已去除註解） */
export function splitTopLevelBlocks(css: string): string[] {
  const blocks: string[] = [];
  let braceCount = 0;
  let blockStart = 0;

  for (let i = 0; i < css.length; i++) {
    const ch = css[i];
    if (ch === "{") {
      braceCount++;
    } else if (ch === "}") {
      braceCount--;
      if (braceCount === 0) {
        blocks.push(css.substring(blockStart, i + 1).trim());
        blockStart = i + 1;
      }
    }
  }
  const tail = css.substring(blockStart).trim();
  if (tail) blocks.push(tail);
  return blocks;
}

/** 提取 @media { ... } 內部內容（不含最外層大括號） */
export function extractInnerContent(block: string, openBraceIdx: number): string {
  let depth = 0;
  let endIdx = block.length - 1;
  for (let i = openBraceIdx; i < block.length; i++) {
    if (block[i] === "{") depth++;
    else if (block[i] === "}") {
      depth--;
      if (depth === 0) {
        endIdx = i;
        break;
      }
    }
  }
  return block.substring(openBraceIdx + 1, endIdx).trim();
}
