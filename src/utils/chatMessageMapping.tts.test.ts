/// <reference types="vitest/globals" />

import { reactive } from "vue";
import { convertToStorableMessage } from "./chatMessageMapping";

describe("convertToStorableMessage ttsSegments", () => {
  it("deep-copies ttsSegments so the result is structured-cloneable", () => {
    const uiMessage = reactive({
      id: "voice-1",
      role: "ai" as const,
      content: "[語音訊息] hi",
      timestamp: 1,
      messageType: "audio" as const,
      ttsSegments: [
        { emotion: "happy", speed: 1.1, text: "hi", clean: "hi", audioUrl: "data:audio/mp3;base64,AA" },
      ],
    });

    const stored = convertToStorableMessage(uiMessage, "Assistant");

    // The segment must be a plain copy, not the reactive proxy.
    expect(stored.ttsSegments).not.toBe(uiMessage.ttsSegments);
    expect(stored.ttsSegments?.[0]).not.toBe(uiMessage.ttsSegments[0]);
    expect(stored.ttsSegments?.[0]?.audioUrl).toBe("data:audio/mp3;base64,AA");
    expect(() => structuredClone(stored)).not.toThrow();
  });

  it("leaves ttsSegments undefined for a plain message", () => {
    const stored = convertToStorableMessage(
      { id: "m1", role: "ai", content: "hello", timestamp: 1 },
      "Assistant",
    );
    expect(stored.ttsSegments).toBeUndefined();
  });
});
