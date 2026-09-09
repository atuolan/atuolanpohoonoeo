import { afterEach, describe, expect, it, vi } from "vitest";
import { createDefaultMiniMaxTTSSettings, synthesizeSpeech } from "./MiniMaxTTSApi";

afterEach(() => vi.unstubAllGlobals());

describe("MiniMax TTS language hints", () => {
  it.each([
    [undefined, "auto"],
    ["Japanese", "Japanese"],
    ["Chinese", "Chinese"],
    ["", undefined],
  ])("sends the expected language hint for setting %s", async (setting, expected) => {
    const fetchMock = vi.fn().mockResolvedValue({
      json: async () => ({ base_resp: { status_code: 0 }, data: { audio: "https://example.com/audio.mp3" } }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const settings = createDefaultMiniMaxTTSSettings();
    settings.apiKey = "test-key";
    if (setting !== undefined) settings.languageBoost = setting;

    const result = await synthesizeSpeech("お邪魔します。", settings);

    expect(result.success).toBe(true);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.language_boost).toBe(expected);
    expect(body.text).toBe("お邪魔します。");
  });
});
