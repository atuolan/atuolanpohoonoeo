import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createDefaultFishAudioSettings,
  fetchFishAudioVoices,
  synthesizeFishAudio,
  testFishAudioConnection,
  toFishAudioText,
} from "./FishAudioTTSApi";
import { synthesizeSpeech, createDefaultMiniMaxTTSSettings } from "./MiniMaxTTSApi";
import {
  applyTTSVoiceOverride,
  getOverrideMemberVoices,
  getOverrideVoice,
  isTTSConfigured,
} from "./ttsProvider";

function settings(patch = {}) {
  return { ...createDefaultFishAudioSettings(), apiKey: "fish-key", ...patch };
}

function audioResponse() {
  return new Response(new Blob([new Uint8Array([1, 2, 3])], { type: "audio/mpeg" }), {
    status: 200,
    headers: { "Content-Type": "audio/mpeg" },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("toFishAudioText", () => {
  it("converts MiniMax tone tags, pauses and emotion into Fish Audio markers", () => {
    expect(
      toFishAudioText("真的嗎(laughs)？<#0.4#>太好了<#1.2#>(gasps)走吧", { emotion: "happy", markers: true }),
    ).toBe("(happy) 真的嗎(laughing)？(break)太好了(long-break)走吧");
  });

  it("maps emotions that Fish Audio names differently and ignores unknown ones", () => {
    expect(toFishAudioText("嗯", { emotion: "fearful", markers: true })).toBe("(scared) 嗯");
    expect(toFishAudioText("嗯", { emotion: "calm", markers: true })).toBe("(relaxed) 嗯");
    expect(toFishAudioText("嗯", { emotion: "neutral", markers: true })).toBe("嗯");
    expect(toFishAudioText("嗯", { emotion: "慵懶", markers: true })).toBe("嗯");
  });

  it("strips every marker when markers are off", () => {
    expect(toFishAudioText("你好(sighs)<#0.5#>再見", { emotion: "sad", markers: false })).toBe("你好，再見");
  });
});

describe("synthesizeFishAudio", () => {
  it("sends model header, reference_id and prosody, and returns a data URL", async () => {
    const fetchMock = vi.fn().mockResolvedValue(audioResponse());
    vi.stubGlobal("fetch", fetchMock);

    const result = await synthesizeFishAudio("你好(laughs)", settings({ referenceId: "default-voice" }), {
      referenceId: "chat-voice",
      speed: 3,
      emotion: "sad",
    });

    expect(result.success).toBe(true);
    expect(result.audioUrl).toMatch(/^data:audio\/mpeg;base64,/);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.fish.audio/v1/tts");
    expect(init.headers).toMatchObject({ Authorization: "Bearer fish-key", model: "s1" });
    expect(JSON.parse(init.body)).toMatchObject({
      text: "(sad) 你好(laughing)",
      reference_id: "chat-voice",
      format: "mp3",
      prosody: { speed: 2 },
    });
  });

  it("sends plain text to speech-1.x models", async () => {
    const fetchMock = vi.fn().mockResolvedValue(audioResponse());
    vi.stubGlobal("fetch", fetchMock);

    await synthesizeFishAudio("你好(laughs)", settings({ model: "speech-1.6" }), { emotion: "happy" });

    expect(JSON.parse(fetchMock.mock.calls[0][1].body).text).toBe("你好");
  });

  it("explains common HTTP errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ message: "Invalid api key" }), { status: 401 })),
    );

    const result = await synthesizeFishAudio("你好", settings());

    expect(result).toEqual({ success: false, error: "API Key 不對或沒帶到（401：Invalid api key）" });
  });

  it("fails without an API key and without calling the API", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await synthesizeFishAudio("你好", settings({ apiKey: "" }));

    expect(result.success).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("fetchFishAudioVoices", () => {
  it("lists your own voices", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ total: 1, items: [{ _id: "abc", title: "小雨", created_at: "2026-05-01T00:00:00Z" }] }),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchFishAudioVoices(settings({ baseUrl: "https://proxy.example/proxy/api.fish.audio/" }));

    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://proxy.example/proxy/api.fish.audio/model?page_size=100&page_number=1&self=true",
    );
    expect(result.voices).toEqual([
      expect.objectContaining({ id: "abc", title: "小雨", mine: true, createdAt: "2026-05-01" }),
    ]);
  });
});

describe("provider switching", () => {
  const minimax = { ...createDefaultMiniMaxTTSSettings(), apiKey: "mm-key" };
  const fishProvider = { ...minimax, provider: "fishaudio" as const, fishAudio: settings({ referenceId: "fish-default" }) };

  it("checks the API key of the selected provider", () => {
    expect(isTTSConfigured(minimax)).toBe(true);
    expect(isTTSConfigured({ ...fishProvider, fishAudio: settings({ apiKey: "" }) })).toBe(false);
    expect(isTTSConfigured({ ...fishProvider, apiKey: "" })).toBe(true);
  });

  it("keeps per-chat voices separate for each provider", () => {
    const override = { voiceId: "mm-voice", memberVoices: { a: "mm-a" }, fishVoiceId: "fish-voice", fishMemberVoices: { a: "fish-a" } };
    expect(getOverrideVoice(minimax, override)).toBe("mm-voice");
    expect(getOverrideVoice(fishProvider, override)).toBe("fish-voice");
    expect(getOverrideMemberVoices(fishProvider, override)).toEqual({ a: "fish-a" });
  });

  it("applies a voice override to the right field", () => {
    expect(applyTTSVoiceOverride({ ...minimax, timberWeightsEnabled: true }, "v")).toMatchObject({
      voiceId: "v",
      timberWeightsEnabled: false,
    });
    expect(applyTTSVoiceOverride(fishProvider, "f").fishAudio?.referenceId).toBe("f");
    expect(applyTTSVoiceOverride(fishProvider, undefined)).toBe(fishProvider);
  });

  it("routes synthesizeSpeech to Fish Audio with the chat speed and voice", async () => {
    const fetchMock = vi.fn().mockResolvedValue(audioResponse());
    vi.stubGlobal("fetch", fetchMock);

    const result = await synthesizeSpeech("你好", { ...applyTTSVoiceOverride(fishProvider, "chat-fish"), speed: 1.3 }, {
      emotion: "happy",
    });

    expect(result.success).toBe(true);
    expect(fetchMock.mock.calls[0][0]).toBe("https://api.fish.audio/v1/tts");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({
      text: "(happy) 你好",
      reference_id: "chat-fish",
      prosody: { speed: 1.3 },
    });
  });
});

describe("connection", () => {
  it("accepts a pasted /v1/tts address as the API base", async () => {
    const fetchMock = vi.fn().mockResolvedValue(audioResponse());
    vi.stubGlobal("fetch", fetchMock);

    await synthesizeFishAudio("你好", settings({ baseUrl: "https://api.fish.audio/v1/tts/" }));

    expect(fetchMock.mock.calls[0][0]).toBe("https://api.fish.audio/v1/tts");
  });

  it("goes through the app proxy worker when the proxy is on", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ credit: "12.5" })));
    vi.stubGlobal("fetch", fetchMock);

    const result = await testFishAudioConnection(settings({ useProxy: true, baseUrl: "https://ignored.example" }));

    expect(result).toEqual({ success: true, credit: "12.5" });
    expect(fetchMock.mock.calls[0][0]).toMatch(/^https:\/\/[^/]+\/proxy\/api\.fish\.audio\/wallet\/self\/api-credit$/);
  });

  it("gives up with a clear message instead of hanging forever", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn((_url: string, init: RequestInit) =>
        new Promise((_, reject) => {
          init.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
        }),
      ),
    );

    const pending = testFishAudioConnection(settings());
    await vi.advanceTimersByTimeAsync(20_000);
    const result = await pending;
    vi.useRealTimers();

    expect(result.success).toBe(false);
    expect(result.error).toContain("連線逾時");
    expect(result.error).toContain("透過代理連線");
  });
});
