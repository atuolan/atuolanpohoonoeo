import { describe, expect, it } from "vitest";
import { _messageRenderDelay, isGenerationErrorMessage } from "./chatScreenHelpers";

describe("_messageRenderDelay", () => {
  it("每字 60ms，短訊息至少 800ms、長訊息最多 3 秒", () => {
    expect(_messageRenderDelay({ content: "嗯" })).toBe(800);
    expect(_messageRenderDelay({ content: "我剛剛下班，現在在等公車回家呢" })).toBe(15 * 60);
    expect(_messageRenderDelay({ content: "長".repeat(200) })).toBe(3000);
  });

  it("貼圖、標籤、空白不算字；語音看語音內容", () => {
    expect(_messageRenderDelay({ content: "[sticker:開心]" })).toBe(800);
    expect(_messageRenderDelay({ content: "<b>哈</b>   哈" })).toBe(800);
    expect(_messageRenderDelay({ content: "", isVoice: true, voiceContent: "一".repeat(20) })).toBe(1200);
  });

  it("HTML 區塊用最短間隔", () => {
    expect(_messageRenderDelay({ content: "x".repeat(500), isHtmlBlock: true })).toBe(800);
  });
});

describe("isGenerationErrorMessage", () => {
  it("認得生成失敗的錯誤氣泡", () => {
    expect(isGenerationErrorMessage({ role: "ai", content: "[錯誤] Load failed" })).toBe(true);
  });

  it("使用者打的字、一般回覆都不算", () => {
    expect(isGenerationErrorMessage({ role: "user", content: "[錯誤] 我故意打的" })).toBe(false);
    expect(isGenerationErrorMessage({ role: "ai", content: "你說的[錯誤] 是什麼" })).toBe(false);
  });
});
