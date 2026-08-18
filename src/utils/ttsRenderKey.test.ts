import { describe, expect, it } from "vitest";
import { getTtsAudioRenderKey } from "@/utils/ttsRenderKey";

describe("getTtsAudioRenderKey", () => {
  it("changes when a segment audio URL is filled in place", () => {
    const segments = [
      { audioUrl: "data:audio/wav;base64,AAA" },
      { audioUrl: undefined as string | undefined },
    ];

    const before = getTtsAudioRenderKey(segments, undefined);
    segments[1].audioUrl = "data:audio/wav;base64,BBB";

    expect(getTtsAudioRenderKey(segments, undefined)).not.toBe(before);
  });
});
