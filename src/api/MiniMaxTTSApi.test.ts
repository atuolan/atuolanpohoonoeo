import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cloneVoice,
  createDefaultMiniMaxTTSSettings,
  fetchVoiceList,
  synthesizeSpeech,
  validateCloneVoiceId,
} from "./MiniMaxTTSApi";

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

describe("MiniMax 音色複刻", () => {
  const settings = () => ({ ...createDefaultMiniMaxTTSSettings(), apiKey: "test-key", proxyUrl: "" });
  const audio = () => new File([new Uint8Array([1, 2, 3])], "voice.mp3", { type: "audio/mpeg" });

  it.each([
    ["MyVoice01", null],
    ["my-voice_02", null],
    ["short1", "至少要 8 個字"],
    ["1abcdefgh", "第一個字要是英文字母"],
    ["my voice 01", "只能用英文、數字、- 和 _"],
    ["MyVoice01_", "最後一個字不能是 - 或 _"],
  ])("檢查 voice_id %s", (id, expected) => {
    expect(validateCloneVoiceId(id)).toBe(expected);
  });

  it("先上傳檔案拿 file_id，再用 JSON 呼叫 voice_clone，大數字 file_id 不失真", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        status: 200,
        text: async () => '{"file":{"file_id":123456789012345678901,"purpose":"voice_clone"},"base_resp":{"status_code":0}}',
      })
      .mockResolvedValueOnce({ json: async () => ({ base_resp: { status_code: 0, status_msg: "success" } }) });
    vi.stubGlobal("fetch", fetchMock);

    const result = await cloneVoice(settings(), audio(), " MyVoice01 ");

    expect(result).toEqual({ success: true, voiceId: "MyVoice01" });
    const [uploadUrl, uploadInit] = fetchMock.mock.calls[0];
    expect(uploadUrl).toBe("https://api.minimax.io/v1/files/upload");
    expect(uploadInit.body.get("purpose")).toBe("voice_clone");
    expect(uploadInit.body.get("file")).toBeInstanceOf(File);
    const [cloneUrl, cloneInit] = fetchMock.mock.calls[1];
    expect(cloneUrl).toBe("https://api.minimax.io/v1/voice_clone");
    expect(cloneInit.headers["Content-Type"]).toBe("application/json");
    expect(cloneInit.body).toBe('{"file_id":123456789012345678901,"voice_id":"MyVoice01"}');
  });

  it("上傳失敗就不呼叫複刻，並帶出原因", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({
      status: 200,
      text: async () => '{"base_resp":{"status_code":2038,"status_msg":"no permission"}}',
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await cloneVoice(settings(), audio(), "MyVoice01");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.success).toBe(false);
    expect(result.error).toContain("沒有複刻權限");
  });

  it("voice_id 不合規時不送出任何請求", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await cloneVoice(settings(), audio(), "abc");

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result).toEqual({ success: false, error: "音色名稱至少要 8 個字" });
  });
});

describe("MiniMax 音色清單", () => {
  it("讀得到系統音色名稱和複刻音色", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      json: async () => ({
        system_voice: [{ voice_id: "female-yujie", voice_name: "御姐音色" }],
        voice_cloning: [{ voice_id: "MyVoice01", created_time: "2026-10-19" }],
        voice_generation: [{ voice_id: "ttv-voice-1", created_time: "2026-10-18" }],
        base_resp: { status_code: 0 },
      }),
    }));

    const result = await fetchVoiceList({ ...createDefaultMiniMaxTTSSettings(), apiKey: "test-key" });

    expect(result.voices).toEqual([
      { voice_id: "female-yujie", name: "御姐音色", voice_type: "system" },
      { voice_id: "MyVoice01", name: "MyVoice01", voice_type: "cloning", created_time: "2026-10-19" },
      { voice_id: "ttv-voice-1", name: "ttv-voice-1", voice_type: "generation", created_time: "2026-10-18" },
    ]);
  });
});

describe("MiniMax 情緒與語速", () => {
  function mockFetch(...responses: object[]) {
    const fetchMock = vi.fn();
    for (const r of responses) fetchMock.mockResolvedValueOnce({ json: async () => r });
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }
  const ok = { base_resp: { status_code: 0 }, data: { audio: "https://example.com/a.mp3" } };
  const bodyOf = (fetchMock: ReturnType<typeof vi.fn>, i = 0) => JSON.parse(fetchMock.mock.calls[i][1].body);

  it.each([
    ["happy", "speech-2.8-hd", "happy"],
    [" Calm ", "speech-2.8-hd", "calm"],
    ["auto", "speech-2.8-hd", undefined],
    ["neutral", "speech-2.8-hd", undefined],
    ["慵懶、帶笑", "speech-2.8-hd", undefined],
    ["fluent", "speech-2.8-hd", undefined],
    ["fluent", "speech-2.6-hd", "fluent"],
    ["whisper", "speech-2.6-turbo", "whisper"],
  ])("emotion %s 在 %s 送出 %s", async (emotion, model, expected) => {
    const fetchMock = mockFetch(ok);
    const settings = { ...createDefaultMiniMaxTTSSettings(), apiKey: "k", model: model as never };

    await synthesizeSpeech("你好", settings, { emotion });

    expect(bodyOf(fetchMock).voice_setting.emotion).toBe(expected);
  });

  it("模型拒絕 emotion 時拿掉 emotion 重試一次", async () => {
    const fetchMock = mockFetch(
      { base_resp: { status_code: 2013, status_msg: "invalid params, voice_setting emotion" } },
      ok,
    );
    const settings = { ...createDefaultMiniMaxTTSSettings(), apiKey: "k" };

    const result = await synthesizeSpeech("你好", settings, { emotion: "happy" });

    expect(result.success).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(bodyOf(fetchMock, 0).voice_setting.emotion).toBe("happy");
    expect(bodyOf(fetchMock, 1).voice_setting.emotion).toBeUndefined();
  });

  it("語速、音調超出範圍時夾回 API 允許的範圍", async () => {
    const fetchMock = mockFetch(ok, ok);
    const base = { ...createDefaultMiniMaxTTSSettings(), apiKey: "k" };

    await synthesizeSpeech("你好", { ...base, speed: 3, pitch: 20.4 });
    await synthesizeSpeech("你好", { ...base, speed: 0.2, pitch: -15 });

    expect(bodyOf(fetchMock, 0).voice_setting).toMatchObject({ speed: 2, pitch: 12 });
    expect(bodyOf(fetchMock, 1).voice_setting).toMatchObject({ speed: 0.5, pitch: -12 });
  });
});
