import { describe, expect, it, vi } from "vitest";
import { parseSenseVoiceOutput, transcribeWithSenseVoice } from "@/services/asr/senseVoice";

describe("parseSenseVoiceOutput", () => {
  it.each([
    ["🤧.", { text: "", events: ["cough"], emotion: null }],
    ["😀.", { text: "", events: ["laugh"], emotion: null }],
    ["😭", { text: "", events: ["cry"], emotion: null }],
    ["", { text: "", events: [], emotion: null }],
    ["喂，你在干吗？", { text: "喂，你在干吗？", events: [], emotion: null }],
    ["今天天气真好😊", { text: "今天天气真好", events: [], emotion: "happy" }],
    ["😀哈哈你好😊", { text: "哈哈你好", events: ["laugh"], emotion: "happy" }],
    ["🎼我在听歌", { text: "我在听歌", events: [], emotion: null }],
    ["👏👏", { text: "", events: ["applause"], emotion: null }],
  ])("%s", (raw, expected) => {
    expect(parseSenseVoiceOutput(raw)).toEqual(expected);
  });
});

describe("transcribeWithSenseVoice", () => {
  it("呼叫 SenseVoice Demo 並解析", async () => {
    const fetchImpl = vi.fn(async (url: string, _init?: RequestInit) => {
      if (url.endsWith("/upload")) return new Response(JSON.stringify(["/tmp/a.wav"]));
      if (url.endsWith("/call/model_inference")) {
        return new Response(JSON.stringify({ event_id: "e1" }));
      }
      return new Response('event: complete\ndata: ["🤧."]\n\n');
    });
    await expect(
      transcribeWithSenseVoice(new Blob(["x"], { type: "audio/wav" }), {
        fetchImpl: fetchImpl as typeof fetch,
      }),
    ).resolves.toEqual({ text: "", events: ["cough"], emotion: null });
    expect(fetchImpl.mock.calls[0][0]).toBe("https://iic-sensevoice.ms.show/upload");
    expect(JSON.parse(String(fetchImpl.mock.calls[1][1]?.body)).data.slice(1)).toEqual(["auto"]);
  });
});
