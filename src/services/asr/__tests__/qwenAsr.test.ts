import { describe, expect, it, vi } from "vitest";
import { isQwenErrorText, transcribeWithQwen } from "@/services/asr/qwenAsr";

function fetchReturning(data: unknown[]) {
  return vi.fn(async (url: string, _init?: RequestInit) => {
    if (url.endsWith("/upload")) return new Response(JSON.stringify(["/tmp/a.wav"]));
    if (url.endsWith("/call/asr_inference")) {
      return new Response(JSON.stringify({ event_id: "e1" }));
    }
    return new Response(`event: complete\ndata: ${JSON.stringify(data)}\n\n`);
  });
}

const wav = new Blob(["x"], { type: "audio/wav" });

describe("transcribeWithQwen", () => {
  it("回傳文字與語種，並帶入 context", async () => {
    const fetchImpl = fetchReturning(["喂，你在干嘛？", "中文 / Chinese"]);
    await expect(
      transcribeWithQwen(wav, { context: "小雪、阿明", fetchImpl: fetchImpl as typeof fetch }),
    ).resolves.toEqual({ text: "喂，你在干嘛？", language: "中文 / Chinese" });
    expect(fetchImpl.mock.calls[0][0]).toBe(
      "https://qwen-qwen3-asr-demo.ms.show/gradio_api/upload",
    );
    const body = JSON.parse(String(fetchImpl.mock.calls[1][1]?.body));
    expect(body.data.slice(1)).toEqual(["小雪、阿明", "auto", false]);
  });

  it("Demo 的錯誤訊息不算辨識結果", async () => {
    expect(isQwenErrorText("响应结构不完整")).toBe(true);
    await expect(
      transcribeWithQwen(wav, {
        fetchImpl: fetchReturning(["响应结构不完整", null]) as typeof fetch,
      }),
    ).rejects.toMatchObject({ kind: "server-error" });
  });

  it("auto 模式有文字卻沒有語種，視為失敗", async () => {
    await expect(
      transcribeWithQwen(wav, { fetchImpl: fetchReturning(["你好", null]) as typeof fetch }),
    ).rejects.toMatchObject({ kind: "server-error" });
  });

  it("沒有內容時回傳空字串", async () => {
    await expect(
      transcribeWithQwen(wav, { fetchImpl: fetchReturning(["", null]) as typeof fetch }),
    ).resolves.toEqual({ text: "", language: null });
  });
});
