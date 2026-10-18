import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { effectScope, nextTick, ref } from "vue";
import { useRootBackground } from "./useRootBackground";

describe("useRootBackground", () => {
  beforeEach(() => {
    vi.stubGlobal("document", {
      documentElement: { style: { background: "" } },
      body: { style: { background: "#fff8f5" } },
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  const bg = () => [document.documentElement.style.background, document.body.style.background];

  it("開著時換成畫面底色，跟著變；離開後換回原本的", async () => {
    const color = ref("#e6e5e2");
    const scope = effectScope();
    scope.run(() => useRootBackground(color));
    expect(bg()).toEqual(["#e6e5e2", "#e6e5e2"]);

    color.value = "#f6f5f2";
    await nextTick();
    expect(bg()).toEqual(["#f6f5f2", "#f6f5f2"]);

    scope.stop();
    expect(bg()).toEqual(["", "#fff8f5"]);
  });

  it("換頁時新頁先掛上、舊頁才卸下：留下新頁的顏色", () => {
    const select = effectScope();
    select.run(() => useRootBackground(ref("#e6e5e2")));
    const phone = effectScope();
    phone.run(() => useRootBackground(ref("#151517")));
    expect(bg()[1]).toBe("#151517");

    select.stop();
    expect(bg()[1]).toBe("#151517");

    phone.stop();
    expect(bg()[1]).toBe("#fff8f5");
  });
});
