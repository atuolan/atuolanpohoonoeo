import { describe, expect, it } from "vitest";
import {
  compositeLayers,
  coverTopRange,
  firstGradientColor,
  parseCssColor,
} from "../statusBarTint";

const WHITE = { r: 255, g: 255, b: 255, a: 1 };

describe("parseCssColor", () => {
  it("解析 computed style 的 rgb / rgba", () => {
    expect(parseCssColor("rgb(26, 26, 46)")).toEqual({ r: 26, g: 26, b: 46, a: 1 });
    expect(parseCssColor("rgba(0, 0, 0, 0.5)")).toEqual({ r: 0, g: 0, b: 0, a: 0.5 });
    expect(parseCssColor("rgba(0, 0, 0, 0)")?.a).toBe(0);
  });

  it("解析空白語法與 hex", () => {
    expect(parseCssColor("rgb(10 20 30 / 40%)")).toEqual({ r: 10, g: 20, b: 30, a: 0.4 });
    expect(parseCssColor("#fff")).toEqual(WHITE);
    expect(parseCssColor("#00000080")?.a).toBeCloseTo(0.5, 2);
  });

  it("無法解析時回傳 null", () => {
    expect(parseCssColor("")).toBeNull();
    expect(parseCssColor("var(--x)")).toBeNull();
    expect(parseCssColor(undefined)).toBeNull();
  });
});

describe("firstGradientColor", () => {
  it("取第一個色標", () => {
    expect(
      firstGradientColor("linear-gradient(rgb(11, 15, 30) 0%, rgb(30, 35, 60) 100%)"),
    ).toEqual({ r: 11, g: 15, b: 30, a: 1 });
    expect(firstGradientColor("radial-gradient(#1a2340, #000)")).toEqual({
      r: 26,
      g: 35,
      b: 64,
      a: 1,
    });
  });
});

describe("compositeLayers", () => {
  it("最上層不透明時直接使用", () => {
    expect(
      compositeLayers([{ r: 10, g: 20, b: 30, a: 1 }, { r: 200, g: 0, b: 0, a: 1 }], WHITE),
    ).toEqual({ r: 10, g: 20, b: 30, a: 1 });
  });

  it("半透明疊在下層上", () => {
    // 50% 黑 疊在 白 上 → 灰
    expect(compositeLayers([{ r: 0, g: 0, b: 0, a: 0.5 }], WHITE)).toEqual({
      r: 128,
      g: 128,
      b: 128,
      a: 1,
    });
  });

  it("沒有任何圖層時退回底色", () => {
    expect(compositeLayers([], WHITE)).toEqual(WHITE);
  });
});

describe("coverTopRange", () => {
  it("圖片比畫面寬：高度完整顯示，從頂端開始", () => {
    const r = coverTopRange(2000, 1000, 400, 800, 50);
    expect(r.start).toBe(0);
    expect(r.end).toBeCloseTo(50 / 800, 5);
  });

  it("圖片比畫面高：上下裁切，起點往下移", () => {
    // 400x1600 圖、畫面 400x800 → scale 1，可見 800，起點在 (1600-800)/2 = 400
    const r = coverTopRange(400, 1600, 400, 800, 50);
    expect(r.start).toBeCloseTo(0.25, 5);
    expect(r.end).toBeCloseTo((400 + 50) / 1600, 5);
  });
});
