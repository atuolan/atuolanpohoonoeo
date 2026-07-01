/**
 * Per-組件自訂 CSS 聚合器
 *
 * AI 創建型工具（創建組件樣式）會把「裸 CSS 內容」存進每個組件 data 的
 * `customCSS` 欄位（不含外層選擇器）。本 composable 負責：
 *   1. 蒐集所有帶 customCSS 的組件
 *   2. 把每條規則自動加上該組件的作用域前綴
 *      `#app [data-widget-id="<id>"] ...`（`:scope` 換成組件根本身）
 *   3. 合併注入單一 <style id="aguaphone-widget-css"> 標籤
 *
 * 作用域包裝邏輯與 theme.ts 的 boostCSSSpecificity 同款，只是前綴參數化，
 * 確保 AI 永遠不需要、也不能寫真實選擇器。
 */
import { watch } from "vue";
import { storeToRefs } from "pinia";
import { useCanvasStore } from "@/stores/canvas";

const STYLE_ID = "aguaphone-widget-css";

/** 把單一組件的裸 CSS 加上作用域前綴 */
export function scopeWidgetCSS(widgetId: string, rawCSS: string): string {
  if (!rawCSS || !rawCSS.trim()) return "";
  const prefix = `#app [data-widget-id="${widgetId}"]`;

  // 移除註解（用佔位符），避免註解內 {} 干擾分塊
  const comments: string[] = [];
  const stripped = rawCSS.replace(/\/\*[\s\S]*?\*\//g, (match) => {
    const idx = comments.length;
    comments.push(match);
    return `/*__C_${idx}__*/`;
  });

  const scoped = scopeBlocks(stripped, prefix);

  // 還原註解
  return scoped.replace(/\/\*__C_(\d+)__\*\//g, (_, idx) => comments[parseInt(idx)]);
}

/** 對頂層 CSS 區塊加上作用域前綴 */
function scopeBlocks(css: string, prefix: string): string {
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
      result.push(`${atSelector}\n${scopeBlocks(inner, prefix)}\n}`);
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
    // 關鍵：`:scope` 必須落在「真正畫底色 / 毛玻璃」那層，而不是外層透明容器
    // （.widget-wrapper 與 .widget-content 兩層本身都是透明的，套 background 看不到效果）。
    // 多數組件的可見根就是 .widget-content > *；但流動按鈕(fluid-button)例外：
    //   .widget-content > *（.fluid-button）只是透明 flex 容器，
    //   薄荷綠底色其實畫在更內層的 .blob-shape 上。
    // 若 :scope 只對映 .widget-content > *，對流動按鈕下 background:transparent
    // 會打到透明容器、圓塊底色紋風不動（先前「只有書架成功、流動按鈕全失敗」的主因）。
    // 因此 :scope 同時對映這兩層；.blob-shape 只存在於流動按鈕，
    // 對其他組件不會誤傷（選擇器單純不匹配）。
    const roots = [
      `${prefix} .widget-content > *`,
      `${prefix} .widget-content .blob-shape`,
    ];
    const scopedSelectors = selector.split(",").flatMap((s) => {
      const sel = s.trim();
      if (!sel) return [sel];
      // :scope 代表組件「真正畫底色」的可見層（可能不只一層）
      if (sel === ":scope") return roots;
      if (sel.startsWith(":scope")) {
        const suffix = sel.slice(":scope".length);
        return roots.map((r) => `${r}${suffix}`);
      }
      // 一般選擇器：作用域內的後代
      return [`${prefix} ${sel}`];
    });

    result.push(`${scopedSelectors.join(",\n")} ${body}`);
  }

  return result.join("\n\n");
}

/** 按頂層大括號分割 CSS 區塊（已去除註解） */
function splitTopLevelBlocks(css: string): string[] {
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
function extractInnerContent(block: string, openBraceIdx: number): string {
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

/** 蒐集所有組件的 customCSS，組合成最終要注入的字串 */
function buildAggregatedCSS(
  widgets: { id: string; data: { customCSS?: string } }[],
): string {
  const parts: string[] = [];
  for (const w of widgets) {
    const raw = w.data?.customCSS;
    if (raw && raw.trim()) {
      const scoped = scopeWidgetCSS(w.id, raw);
      if (scoped) {
        parts.push(`/* widget: ${w.id} */\n${scoped}`);
      }
    }
  }
  return parts.join("\n\n");
}

/** 注入 / 更新 / 移除 <style> 標籤 */
function applyAggregatedCSS(css: string): void {
  let styleEl = document.getElementById(STYLE_ID) as HTMLStyleElement | null;

  if (!css.trim()) {
    if (styleEl) styleEl.remove();
    return;
  }

  if (!styleEl) {
    styleEl = document.createElement("style");
    styleEl.id = STYLE_ID;
    document.body.appendChild(styleEl);
  }
  styleEl.textContent = css;
}

/**
 * 啟動 per-組件 CSS 聚合器。應在 App 根層級呼叫一次，
 * 之後任一組件的 customCSS 變動都會自動重新注入。
 */
export function useWidgetCustomCSS(): void {
  const canvasStore = useCanvasStore();
  const { widgets } = storeToRefs(canvasStore);

  watch(
    // 只追蹤 id + customCSS，避免拖曳 / resize 等無關變動觸發重算
    () =>
      widgets.value.map((w) => ({
        id: w.id,
        css: w.data?.customCSS ?? "",
      })),
    (list) => {
      const css = buildAggregatedCSS(
        list.map((item) => ({ id: item.id, data: { customCSS: item.css } })),
      );
      applyAggregatedCSS(css);
    },
    { deep: true, immediate: true },
  );
}
