import { describe, expect, it } from "vitest";
import { isGenerationErrorMessage } from "./chatScreenHelpers";

describe("isGenerationErrorMessage", () => {
  it("認得生成失敗的錯誤氣泡", () => {
    expect(isGenerationErrorMessage({ role: "ai", content: "[錯誤] Load failed" })).toBe(true);
  });

  it("使用者打的字、一般回覆都不算", () => {
    expect(isGenerationErrorMessage({ role: "user", content: "[錯誤] 我故意打的" })).toBe(false);
    expect(isGenerationErrorMessage({ role: "ai", content: "你說的[錯誤] 是什麼" })).toBe(false);
  });
});
