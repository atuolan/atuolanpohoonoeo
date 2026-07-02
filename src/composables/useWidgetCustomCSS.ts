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
 * 作用域包裝的分塊 / 去註解 / 選擇器前綴等共通邏輯已抽到 @/utils/cssScoping，
 * 與 useSurfaceCustomCSS 共用同一套實作；本檔只負責組件專屬的 `:scope` 對映策略。
 */
import { watch } from "vue";
import { storeToRefs } from "pinia";
import { useCanvasStore } from "@/stores/canvas";
import { scopeCSS } from "@/utils/cssScoping";

const STYLE_ID = "aguaphone-widget-css";

/** 把單一組件的裸 CSS 加上作用域前綴 */
export function scopeWidgetCSS(widgetId: string, rawCSS: string): string {
  if (!rawCSS || !rawCSS.trim()) return "";
  const prefix = `#app [data-widget-id="${widgetId}"]`;

  // 關鍵：`:scope` 必須落在「真正畫底色 / 毛玻璃」那層，而不是外層透明容器
  // （.widget-wrapper 與 .widget-content 兩層本身都是透明的，套 background 看不到效果）。
  // 多數組件的可見根就是 .widget-content > *；但流動按鈕(fluid-button)例外：
  //   .widget-content > *（.fluid-button）只是透明 flex 容器，
  //   薄荷綠底色其實畫在更內層的 .blob-shape 上。
  // 若 :scope 只對映 .widget-content > *，對流動按鈕下 background:transparent
  // 會打到透明容器、圓塊底色紋風不動（先前「只有書架成功、流動按鈕全失敗」的主因）。
  // 因此 :scope 同時對映這兩層；.blob-shape 只存在於流動按鈕，
  // 對其他組件不會誤傷（選擇器單純不匹配）。
  return scopeCSS(rawCSS, {
    scopeRoots: [
      `${prefix} .widget-content > *`,
      `${prefix} .widget-content .blob-shape`,
    ],
    descendantPrefix: prefix,
  });
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
