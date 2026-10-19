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

describe("MiniMax 音色混合", () => {
  async function synthesizeBody(patch: Partial<ReturnType<typeof createDefaultMiniMaxTTSSettings>>) {
    const fetchMock = vi.fn().mockResolvedValue({
      json: async () => ({ base_resp: { status_code: 0 }, data: { audio: "https://example.com/a.mp3" } }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const settings = { ...createDefaultMiniMaxTTSSettings(), apiKey: "test-key", ...patch };
    await synthesizeSpeech("你好", settings);
    return JSON.parse(fetchMock.mock.calls[0][1].body);
  }

  it("timbre_weights 放在請求體頂層，voice_setting.voice_id 留空字串", async () => {
    const body = await synthesizeBody({
      timberWeightsEnabled: true,
      timberWeights: [
        { voiceId: " female-yujie ", weight: 70.4 },
        { voiceId: "", weight: 50 },
        { voiceId: "female-shaonv", weight: 30 },
      ],
    });

    expect(body.timbre_weights).toEqual([
      { voice_id: "female-yujie", weight: 70 },
      { voice_id: "female-shaonv", weight: 30 },
    ]);
    expect(body.voice_setting.voice_id).toBe("");
    expect(body.voice_setting.timber_weights).toBeUndefined();
    expect(body.voice_setting.timbre_weights).toBeUndefined();
  });

  it("最多只送 4 種", async () => {
    const body = await synthesizeBody({
      timberWeightsEnabled: true,
      timberWeights: ["a", "b", "c", "d", "e"].map((id) => ({ voiceId: `voice-${id}`, weight: 20 })),
    });

    expect(body.timbre_weights.map((tw: { voice_id: string }) => tw.voice_id)).toEqual([
      "voice-a", "voice-b", "voice-c", "voice-d",
    ]);
  });

  it("沒開混合或沒有可用音色時照常送 voice_id", async () => {
    const off = await synthesizeBody({
      voiceId: "female-yujie",
      timberWeightsEnabled: false,
      timberWeights: [{ voiceId: "female-shaonv", weight: 50 }],
    });
    const empty = await synthesizeBody({
      voiceId: "female-yujie",
      timberWeightsEnabled: true,
      timberWeights: [{ voiceId: "  ", weight: 50 }],
    });

    for (const body of [off, empty]) {
      expect(body.timbre_weights).toBeUndefined();
      expect(body.voice_setting.voice_id).toBe("female-yujie");
    }
  });
});
