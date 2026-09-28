import { describe, expect, it } from "vitest";
import { createEmptyF2FPanelLayout, parseF2FPanelLayout } from "./f2fPanel";

describe("parseF2FPanelLayout", () => {
  it("接受合法配置，並補上預設值", () => {
    const layout = parseF2FPanelLayout({
      version: 1,
      modules: [
        {
          id: "m",
          title: "文學風格",
          mode: "single",
          options: [{ id: "o", label: "白描", entries: ["e1"] }],
        },
      ],
      styles: [{ id: "s", name: "風格", selections: { m: ["o"] } }],
    });
    expect(layout).not.toBeNull();
    expect(layout!.modules[0].allowNone).toBe(false);
    expect(layout!.styles[0].desc).toBe("");
  });

  it("缺少 modules / styles 時補空陣列", () => {
    expect(parseF2FPanelLayout({ version: 1 })).toEqual(createEmptyF2FPanelLayout());
  });

  it.each([
    ["非物件", "abc"],
    ["版本不對", { version: 2, modules: [], styles: [] }],
    ["模式不對", { version: 1, modules: [{ id: "m", title: "x", mode: "radio", options: [] }] }],
    ["選項沒有條目", { version: 1, modules: [{ id: "m", title: "x", mode: "single", options: [{ id: "o", label: "o", entries: [] }] }] }],
  ])("格式錯誤（%s）時回傳 null", (_label, raw) => {
    expect(parseF2FPanelLayout(raw)).toBeNull();
  });
});
