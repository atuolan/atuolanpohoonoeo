import { describe, expect, it } from "vitest";
import { prepareTTSContent } from "./ttsTextSelector";

describe("prepareTTSContent", () => {
  it("removes HTML tags without sending tag names to TTS", () => {
    expect(prepareTTSContent("Hello<br>world", "all")).toBe("Hello\nworld");
  });

  it("auto-selects the foreign-language line when paired with Chinese", () => {
    expect(prepareTTSContent("How are you?<br>你最近好嗎？", "auto")).toBe(
      "How are you?",
    );
  });

  it("supports explicit Chinese selection", () => {
    expect(prepareTTSContent("How are you?<br>你最近好嗎？", "chinese")).toBe(
      "你最近好嗎？",
    );
  });

  it("keeps TTS markers when selecting Chinese from a mixed line", () => {
    expect(
      prepareTTSContent("你好(laughs) Hello [emotion=calm]", "chinese"),
    ).toBe("你好(laughs) [emotion=calm]");
  });
});
