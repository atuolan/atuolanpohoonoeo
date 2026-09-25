import { describe, expect, it } from "vitest";
import {
  createGradientFrom,
  getGradientAngle,
  getGradientStop,
  setGradientAngle,
  setGradientStop,
  toPickerHex,
} from "@/utils/simpleGradient";

describe("simpleGradient", () => {
  it("讀取角度與起訖色", () => {
    const g = "linear-gradient(90deg, #FF0000, #00ff00)";
    expect(getGradientAngle(g)).toBe(90);
    expect(getGradientStop(g, 0)).toBe("#ff0000");
    expect(getGradientStop(g, 1)).toBe("#00ff00");
  });

  it("支援三碼色與缺少角度", () => {
    const g = "linear-gradient(#fff, #000)";
    expect(getGradientAngle(g)).toBe(135);
    expect(getGradientStop(g, 0)).toBe("#ffffff");
    expect(getGradientStop(g, 1)).toBe("#000000");
  });

  it("修改單一色或角度時保留其他部分", () => {
    const g = "linear-gradient(45deg, #111111, #222222)";
    expect(setGradientStop(g, 1, "#333333")).toBe("linear-gradient(45deg, #111111, #333333)");
    expect(setGradientAngle(g, 180)).toBe("linear-gradient(180deg, #111111, #222222)");
  });

  it("由基底色建立漸層，基底色非 hex 時不產生 NaN", () => {
    expect(createGradientFrom("#000000")).toBe("linear-gradient(135deg, #000000, #4d4d4d)");
    expect(createGradientFrom("rgba(0,0,0,0.5)")).not.toContain("NaN");
  });

  it("color picker 值一律轉成 #rrggbb", () => {
    expect(toPickerHex("#ABC", "#000000")).toBe("#aabbcc");
    expect(toPickerHex("rgba(0,0,0,.5)", "#123456")).toBe("#123456");
    expect(toPickerHex(undefined, "#123456")).toBe("#123456");
  });
});
