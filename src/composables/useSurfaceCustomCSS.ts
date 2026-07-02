/**
 * Per-UI 表面自訂 CSS 聚合器
 *
 * AI 美化助手的「表面型」動作工具會把「裸 CSS 內容」（不含外層選擇器）以
 * surfaceId 為鍵存進 theme store 的 `surfaceCustomCSS`。本 composable 負責：
 *   1. 蒐集所有帶 CSS 的表面
 *   2. 依該表面在 uiSurfaceRegistry 的 rootSelector，把每條規則自動加上
 *      作用域前綴 `#app <rootSelector> ...`（`:scope` 換成表面根本身）
 *   3. 合併注入單一 <style id="aguaphone-surface-css"> 標籤
 *
 * 作用域包裝邏輯與 useWidgetCustomCSS 共用 cssScoping.ts，差別只在前綴來源
 * 改為表面的 rootSelector。`#app` 前綴用來壓過 Vue scoped 的 [data-v-xxx]
 * 特異性，讓全域注入的 CSS 能穿透 modal / screen 元件而不需改動原始碼。
 */
import { watch } from "vue";
import { storeToRefs } from "pinia";
import { useThemeStore } from "@/stores/theme";
import { scopeCSS } from "@/utils/cssScoping";
import { getSurface } from "@/services/themeAssistant/uiSurfaceRegistry";

const STYLE_ID = "aguaphone-surface-css";

/** 把單一表面的裸 CSS 加上作用域前綴（依 registry 的 rootSelector） */
export function scopeSurfaceCSS(surfaceId: string, rawCSS: string): string {
  if (!rawCSS || !rawCSS.trim()) return "";
  const surface = getSurface(surfaceId);
  if (!surface) return "";

  // #app 前綴壓過 Vue scoped [data-v-xxx] 特異性，確保能穿透元件樣式
  const prefix = `#app ${surface.rootSelector}`;
  return scopeCSS(rawCSS, {
    scopeRoots: [prefix],
    descendantPrefix: prefix,
  });
}

/** 蒐集所有表面的 CSS，組合成最終要注入的字串 */
function buildAggregatedCSS(surfaceCSS: Record<string, string>): string {
  const parts: string[] = [];
  for (const [surfaceId, raw] of Object.entries(surfaceCSS)) {
    if (raw && raw.trim()) {
      const scoped = scopeSurfaceCSS(surfaceId, raw);
      if (scoped) {
        parts.push(`/* surface: ${surfaceId} */\n${scoped}`);
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
 * 啟動 per-表面 CSS 聚合器。應在 App 根層級呼叫一次，
 * 之後 surfaceCustomCSS 任一變動都會自動重新注入。
 */
export function useSurfaceCustomCSS(): void {
  const themeStore = useThemeStore();
  const { surfaceCustomCSS } = storeToRefs(themeStore);

  watch(
    surfaceCustomCSS,
    (map) => {
      applyAggregatedCSS(buildAggregatedCSS(map ?? {}));
    },
    { deep: true, immediate: true },
  );
}
