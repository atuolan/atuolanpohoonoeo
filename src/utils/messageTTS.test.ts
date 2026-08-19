import { describe, expect, it } from "vitest";
import {
  canRegenerateMessageTTS,
  getMessageTTSSource,
} from "./messageTTS";

describe("message TTS helpers", () => {
  it("prefers the raw TTS source when present", () => {
    expect(
      getMessageTTSSource({
        content: "顯示文字",
        ttsRawContent: "顯示文字(laughs)",
      }),
    ).toBe("顯示文字(laughs)");
  });

  it("uses the bubble content when a raw source is unrelated", () => {
    expect(
      getMessageTTSSource({
        content: "目前訊息",
        ttsRawContent: "另一條舊訊息",
      }),
    ).toBe("目前訊息");
  });

  it("keeps the raw transcript when the bubble has the audio prefix", () => {
    expect(
      getMessageTTSSource({
        content: "[語音訊息] 你好",
        ttsRawContent: "你好",
      }),
    ).toBe("你好");
  });

  it("does not reuse a stale raw prefix when the bubble grew", () => {
    expect(
      getMessageTTSSource({
        content: "目前訊息，後續更新",
        ttsRawContent: "目前訊息",
      }),
    ).toBe("目前訊息，後續更新");
  });

  it("keeps raw tone tags after removing the audio prefix", () => {
    expect(
      getMessageTTSSource({
        content: "[語音訊息] 你好",
        ttsRawContent: "你好(laughs)",
      }),
    ).toBe("你好(laughs)");
  });

  it("normalizes an audio prefix persisted in the raw source", () => {
    expect(
      getMessageTTSSource({
        content: "[語音訊息] 你好",
        ttsRawContent: "[語音訊息] 你好(laughs)",
      }),
    ).toBe("你好(laughs)");
  });

  it("falls back to message content", () => {
    expect(getMessageTTSSource({ content: "普通文字" })).toBe("普通文字");
  });

  it("ignores a stale raw source that contains text absent from the bubble", () => {
    expect(
      getMessageTTSSource({
        content: "氣泡裡的原句",
        ttsRawContent: "氣泡裡的原句，聽懂了嗎？",
      }),
    ).toBe("氣泡裡的原句");
  });

  it("allows only non-empty AI messages", () => {
    expect(canRegenerateMessageTTS({ role: "ai", content: "一句話" })).toBe(
      true,
    );
    expect(
      canRegenerateMessageTTS({ role: "user", content: "一句話" }),
    ).toBe(false);
    expect(canRegenerateMessageTTS({ role: "ai", content: "   " })).toBe(
      false,
    );
  });
});
