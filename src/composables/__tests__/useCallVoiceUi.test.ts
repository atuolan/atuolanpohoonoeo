import { describe, expect, it, vi } from "vitest";

vi.mock("@/stores/callVoiceInput", () => ({ useCallVoiceInputStore: vi.fn() }));
vi.mock("@/stores/phoneCall", () => ({ usePhoneCallStore: vi.fn() }));

import { micButtonStateFor, voiceStatusTextFor } from "@/composables/useCallVoiceUi";

describe("useCallVoiceUi 對照", () => {
  it.each([
    ["listening", "listening"],
    ["speaking", "speaking"],
    ["paused", "paused"],
    ["off", "muted"],
    ["denied", "error"],
    ["notFound", "error"],
    ["unsupported", "error"],
    ["needsTap", "attention"],
    ["busy", "attention"],
    ["notice", "attention"],
  ] as const)("%s → %s", (phase, state) => {
    expect(micButtonStateFor(phase)).toBe(state);
  });

  it("狀態文字", () => {
    expect(voiceStatusTextFor("listening", { generating: false, canInterrupt: false })).toBe(
      "聆聽中…",
    );
    expect(voiceStatusTextFor("paused", { generating: true, canInterrupt: false })).toBe(
      "角色思考中…",
    );
    expect(voiceStatusTextFor("paused", { generating: false, canInterrupt: true })).toBe(
      "角色說話中 · 點此打斷",
    );
    expect(voiceStatusTextFor("off", { generating: false, canInterrupt: false })).toBe(
      "麥克風已關",
    );
  });
});
