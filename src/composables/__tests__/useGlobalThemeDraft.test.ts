import "fake-indexeddb/auto";
import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useThemeStore } from "@/stores/theme";
import { installThemeDomStub } from "@/stores/__tests__/helpers/themeDomStub";
import { useGlobalThemeDraft } from "../useGlobalThemeDraft";

describe("useGlobalThemeDraft", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    installThemeDomStub();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("草稿初始值取自 store", () => {
    const theme = useThemeStore();
    theme.updateCustomCSS(".a { color: red; }");
    theme.updateGlobalFont({ fontSize: 120 });

    const draft = useGlobalThemeDraft();

    expect(draft.tempCustomCSS.value).toBe(".a { color: red; }");
    expect(draft.tempGlobalFont.value.fontSize).toBe(120);
  });

  it("別處改了 store 的 CSS，草稿跟上，關閉時不會把舊值寫回", () => {
    const theme = useThemeStore();
    theme.updateCustomCSS(".old { color: red; }");
    const draft = useGlobalThemeDraft();

    // 模擬 AI 美化助手縮小後在背景寫入全域 CSS
    theme.updateCustomCSS(".from-ai { color: blue; }");
    expect(draft.tempCustomCSS.value).toBe(".from-ai { color: blue; }");

    draft.commit();
    expect(theme.customCSS).toBe(".from-ai { color: blue; }");
  });

  it("別處改了 store 的字體，草稿跟上，關閉時不會把舊值寫回", () => {
    const theme = useThemeStore();
    const draft = useGlobalThemeDraft();

    // 模擬 AI 的「設定全局字體大小」
    theme.updateGlobalFont({ enabled: true, fontSize: 130 });
    expect(draft.tempGlobalFont.value.fontSize).toBe(130);

    draft.commit();
    expect(theme.globalFont.fontSize).toBe(130);
  });

  it("使用者改了草稿但沒按套用，關閉時寫回", () => {
    const theme = useThemeStore();
    const draft = useGlobalThemeDraft();

    draft.tempCustomCSS.value = ".mine { color: green; }";
    draft.tempGlobalFont.value.letterSpacing = 2;
    draft.commit();

    expect(theme.customCSS).toBe(".mine { color: green; }");
    expect(theme.globalFont.letterSpacing).toBe(2);
    expect(theme.globalFont.enabled).toBe(true);
  });

  it("草稿沒動過時，關閉不會改動 store（不會把字體偷偷設成啟用）", () => {
    const theme = useThemeStore();
    const draft = useGlobalThemeDraft();
    const updateCSS = vi.spyOn(theme, "updateCustomCSS");
    const updateFont = vi.spyOn(theme, "updateGlobalFont");

    draft.commit();

    expect(updateCSS).not.toHaveBeenCalled();
    expect(updateFont).not.toHaveBeenCalled();
    expect(theme.globalFont.enabled).toBe(false);
  });

  it("恢復預設後關閉，自訂字體不會回來", () => {
    const theme = useThemeStore();
    theme.updateGlobalFont({
      enabled: true,
      fontFamily: "Huninn",
      importUrl: "https://fonts.example/huninn.css",
    });
    const draft = useGlobalThemeDraft();

    theme.resetToDefault();
    draft.syncFromStore();
    draft.commit();

    expect(theme.globalFont.enabled).toBe(false);
    expect(theme.globalFont.fontFamily).toBe("");
  });

  it("syncFromStore 會丟掉還沒套用的草稿", () => {
    const theme = useThemeStore();
    const draft = useGlobalThemeDraft();
    draft.tempCustomCSS.value = ".unsaved { color: red; }";
    draft.tempGlobalFont.value.fontSize = 150;

    draft.syncFromStore();
    draft.commit();

    expect(theme.customCSS).toBe("");
    expect(theme.globalFont.fontSize).toBe(100);
  });

  it("applyFont 會從整句 @import 取出 URL 並啟用字體", () => {
    const theme = useThemeStore();
    const draft = useGlobalThemeDraft();
    draft.tempGlobalFont.value.importUrl =
      '@import url("https://fonts.example/huninn.css");';
    draft.tempGlobalFont.value.fontFamily = "Huninn";

    draft.applyFont();

    expect(theme.globalFont.importUrl).toBe("https://fonts.example/huninn.css");
    expect(theme.globalFont.enabled).toBe(true);
    // 套用後草稿與 store 一致，再關閉不會重複寫入
    const updateFont = vi.spyOn(theme, "updateGlobalFont");
    draft.commit();
    expect(updateFont).not.toHaveBeenCalled();
  });
});
