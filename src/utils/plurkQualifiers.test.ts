import { describe, expect, it } from "vitest";
import {
  FREESTYLE,
  getQualifierColor,
  isKnownQualifier,
  normalizeQualifier,
  PLURK_QUALIFIERS,
  QUALIFIER_NEUTRAL_COLOR,
} from "./plurkQualifiers";

describe("PLURK_QUALIFIERS", () => {
  it("有 18 個且不重複", () => {
    expect(PLURK_QUALIFIERS).toHaveLength(18);
    expect(new Set(PLURK_QUALIFIERS.map((q) => q.label)).size).toBe(18);
    expect(new Set(PLURK_QUALIFIERS.map((q) => q.en)).size).toBe(18);
  });
  it("第一個是「說」", () => {
    expect(PLURK_QUALIFIERS[0]).toEqual({ label: "說", en: "says", color: "#C7442B" });
  });
});

describe("normalizeQualifier", () => {
  it("中文原樣", () => expect(normalizeQualifier("覺得")).toBe("覺得"));
  it("英文換中文、不分大小寫", () => {
    expect(normalizeQualifier("loves")).toBe("愛");
    expect(normalizeQualifier("Wonders")).toBe("好奇");
    expect(normalizeQualifier("is")).toBe("正在");
    expect(normalizeQualifier("has")).toBe("已經");
  });
  it("舊的「會」換成打算", () => expect(normalizeQualifier("會")).toBe("打算"));
  it("空白與 null 是自由發揮", () => {
    expect(normalizeQualifier("  ")).toBe(FREESTYLE);
    expect(normalizeQualifier(null)).toBe(FREESTYLE);
    expect(normalizeQualifier(undefined)).toBe(FREESTYLE);
  });
  it("不認得的原樣回傳（去空白）", () => expect(normalizeQualifier(" 轉噗 ")).toBe("轉噗"));
});

describe("getQualifierColor", () => {
  it("已知發語詞回傳表上的顏色", () => {
    expect(getQualifierColor("想")).toBe("#6B4FB8");
    expect(getQualifierColor("thinks")).toBe("#6B4FB8");
  });
  it("自由發揮沒有色塊", () => expect(getQualifierColor("")).toBeNull());
  it("不認得的用中性灰", () => expect(getQualifierColor("轉噗")).toBe(QUALIFIER_NEUTRAL_COLOR));
});

describe("isKnownQualifier", () => {
  it("中英文都算", () => {
    expect(isKnownQualifier("期待")).toBe(true);
    expect(isKnownQualifier("hopes")).toBe(true);
    expect(isKnownQualifier("轉噗")).toBe(false);
    expect(isKnownQualifier("")).toBe(false);
  });
});
