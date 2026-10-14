import { describe, expect, it } from "vitest";
import {
  createDefaultCallVoiceInputSettings,
  normalizeCallVoiceInputSettings,
} from "@/types/settings";

describe("通話語音設定", () => {
  it("預設值", () => {
    expect(createDefaultCallVoiceInputSettings()).toEqual({
      endSilenceMs: 1200,
      sensitivity: "medium",
      autoTone: true,
    });
  });

  it("舊資料或錯誤值回到預設", () => {
    expect(normalizeCallVoiceInputSettings(undefined)).toEqual(
      createDefaultCallVoiceInputSettings(),
    );
    expect(
      normalizeCallVoiceInputSettings({ endSilenceMs: 999, sensitivity: "loud", autoTone: "yes" }),
    ).toEqual(createDefaultCallVoiceInputSettings());
    expect(
      normalizeCallVoiceInputSettings({ endSilenceMs: 2000, sensitivity: "high", autoTone: false }),
    ).toEqual({ endSilenceMs: 2000, sensitivity: "high", autoTone: false });
  });
});
