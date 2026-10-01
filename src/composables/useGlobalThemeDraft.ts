/**
 * 全局美化彈窗的「草稿」狀態
 *
 * 自訂 CSS 與字體設定在彈窗裡是先改草稿、按「套用」或關閉彈窗時才寫進 theme store。
 * 但 store 也會被別處改動（AI 美化助手、套用主題包、恢復預設），草稿若不跟上，
 * 關閉彈窗時就會把舊草稿寫回去、蓋掉剛才的改動。
 *
 * 規則：store 一變，草稿就跟著換成 store 的值。所以草稿和 store 不同時，
 * 只可能是使用者剛在彈窗裡改的，關閉時才需要寫回。
 */
import { ref, watch } from "vue";
import { useThemeStore, type GlobalFontOverride } from "@/stores/theme";

/** 把字體設定序列化成固定欄位順序的字串，用來比對草稿與 store 是否相同 */
function fontKey(font: GlobalFontOverride): string {
  return JSON.stringify([
    font.enabled,
    font.importUrl,
    font.fontFamily,
    font.fontWeight,
    font.source,
    font.fontSize,
    font.letterSpacing,
    font.lineHeight,
  ]);
}

export function useGlobalThemeDraft() {
  const themeStore = useThemeStore();

  const tempCustomCSS = ref<string>(themeStore.customCSS);
  const tempGlobalFont = ref<GlobalFontOverride>({ ...themeStore.globalFont });

  // flush: "sync" 讓草稿在 store 變動的當下就同步，不留「store 已變、草稿還沒跟上」的空檔
  watch(
    () => themeStore.customCSS,
    (css) => {
      tempCustomCSS.value = css;
    },
    { flush: "sync" },
  );
  watch(
    () => themeStore.globalFont,
    (font) => {
      tempGlobalFont.value = { ...font };
    },
    { flush: "sync", deep: true },
  );

  /** 丟掉草稿，重新以 store 的值為準（開啟彈窗、恢復預設時用） */
  function syncFromStore() {
    tempCustomCSS.value = themeStore.customCSS;
    tempGlobalFont.value = { ...themeStore.globalFont };
  }

  /** 使用者可能貼上整句 @import url("...")，取出其中的 URL 寫回草稿 */
  function normalizeFontUrl(): string {
    let importUrl = tempGlobalFont.value.importUrl.trim();
    const importMatch = importUrl.match(/@import\s+url\(["']?([^"')]+)["']?\)/);
    if (importMatch) {
      importUrl = importMatch[1];
      tempGlobalFont.value.importUrl = importUrl;
    }
    return importUrl;
  }

  /** 把 CSS 草稿寫進 store */
  function applyCSS() {
    themeStore.updateCustomCSS(tempCustomCSS.value);
  }

  /** 把字體草稿寫進 store（套用即視為啟用） */
  function applyFont() {
    const importUrl = normalizeFontUrl();
    themeStore.updateGlobalFont({
      ...tempGlobalFont.value,
      enabled: true,
      importUrl,
    });
  }

  /** 關閉彈窗時呼叫：只把使用者改過、還沒套用的草稿寫回 */
  function commit() {
    if (tempCustomCSS.value !== themeStore.customCSS) {
      applyCSS();
    }
    if (fontKey(tempGlobalFont.value) !== fontKey(themeStore.globalFont)) {
      applyFont();
    }
  }

  return {
    tempCustomCSS,
    tempGlobalFont,
    syncFromStore,
    normalizeFontUrl,
    applyCSS,
    applyFont,
    commit,
  };
}
