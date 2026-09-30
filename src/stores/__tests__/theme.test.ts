import "fake-indexeddb/auto";
import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GLOBAL_SCOPE_PREFIX } from "@/utils/cssScoping";
import { db } from "@/db/database";
import { useThemeStore } from "../theme";
import { installThemeDomStub, type ThemeDomStub } from "./helpers/themeDomStub";

const CUSTOM_STYLE_ID = "aguaphone-custom-css";

let dom: ThemeDomStub;

function readSavedTheme() {
  return db.get<Record<string, any>>("settings", "user-theme");
}

describe("useThemeStore", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    dom = installThemeDomStub();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  describe("全局自訂 CSS", () => {
    it("注入時加上能涵蓋 body 底下彈窗的前綴", () => {
      const theme = useThemeStore();
      theme.updateCustomCSS(".soft-modal { color: red; }");
      expect(dom.styleText(CUSTOM_STYLE_ID)).toBe(
        `${GLOBAL_SCOPE_PREFIX} .soft-modal { color: red; }`,
      );
    });

    it("清空後移除 <style>", () => {
      const theme = useThemeStore();
      theme.updateCustomCSS(".a { color: red; }");
      theme.updateCustomCSS("");
      expect(dom.styleText(CUSTOM_STYLE_ID)).toBeNull();
    });
  });

  describe("介面表面 CSS", () => {
    it("updateSurfaceCSS 會寫進 IndexedDB", async () => {
      const theme = useThemeStore();
      theme.updateSurfaceCSS("global-theme-modal", ".modal-header { color: red; }");
      await vi.waitFor(async () => {
        expect((await readSavedTheme())?.surfaceCustomCSS).toEqual({
          "global-theme-modal": ".modal-header { color: red; }",
        });
      });
    });

    it("clearSurfaceCSS 會把清除結果寫進 IndexedDB", async () => {
      const theme = useThemeStore();
      theme.updateSurfaceCSS("global-theme-modal", ".modal-header { color: red; }");
      await vi.waitFor(async () => {
        expect((await readSavedTheme())?.surfaceCustomCSS).toEqual({
          "global-theme-modal": ".modal-header { color: red; }",
        });
      });
      theme.clearSurfaceCSS("global-theme-modal");
      await vi.waitFor(async () => {
        expect((await readSavedTheme())?.surfaceCustomCSS).toEqual({});
      });
    });
  });
});
