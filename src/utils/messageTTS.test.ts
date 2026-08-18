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
        ttsRawContent: "原始(laughs)",
      }),
    ).toBe("原始(laughs)");
  });

  it("falls back to message content", () => {
    expect(getMessageTTSSource({ content: "普通文字" })).toBe("普通文字");
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
