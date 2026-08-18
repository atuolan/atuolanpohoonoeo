import { describe, expect, it } from "vitest";
import { injectTTSInlineButtons } from "./ttsInlineButtons";

describe("injectTTSInlineButtons", () => {
  it("adds a button when regenerated content has no emotion marker", () => {
    const html = injectTTSInlineButtons("Verstanden? 聽懂了嗎？", [
      { emotion: "neutral", audioUrl: "data:audio/mp3;base64,new" },
    ]);

    expect(html).toContain('class="tts-inline-btn"');
    expect(html).toContain('data-tts-idx="0"');
    expect(html).toContain("Verstanden? 聽懂了嗎？");
  });

  it("replaces emotion markers in their existing positions", () => {
    const html = injectTTSInlineButtons("[emotion=happy]太好了", [
      { emotion: "happy", audioUrl: "data:audio/mp3;base64,new" },
    ]);

    expect(html).toContain('data-tts-idx="0"');
    expect(html).not.toContain("[emotion=happy]");
  });
});
