import { afterEach, describe, expect, it, vi } from "vitest";
import {
  audioFileName,
  callGradioWithAudio,
  GradioError,
  parseGradioSse,
} from "@/services/asr/gradio";

const BASE = "https://demo.example/gradio_api";

type FetchArgs = [url: string, init?: RequestInit];

function routes(handlers: { upload?: Response; submit?: Response; result?: Response }) {
  return vi.fn(async (...[url]: FetchArgs) => {
    if (url.endsWith("/upload")) {
      return handlers.upload ?? new Response(JSON.stringify(["/tmp/a.wav"]));
    }
    if (url.endsWith("/call/asr")) {
      return handlers.submit ?? new Response(JSON.stringify({ event_id: "e1" }));
    }
    if (url.endsWith("/call/asr/e1")) {
      return handlers.result ?? new Response('event: complete\ndata: ["ok"]\n\n');
    }
    throw new Error(`unexpected ${url}`);
  });
}

function hangingFetch() {
  return vi.fn(
    (...[, init]: FetchArgs) =>
      new Promise<Response>((_, reject) =>
        init?.signal?.addEventListener("abort", () => reject(init.signal?.reason)),
      ),
  );
}

const call = (
  fetchImpl: (...args: FetchArgs) => Promise<Response>,
  extra: Partial<Parameters<typeof callGradioWithAudio>[0]> = {},
) =>
  callGradioWithAudio({
    baseUrl: BASE,
    endpoint: "asr",
    file: new Blob(["x"], { type: "audio/wav" }),
    fileName: "voice.wav",
    extraData: ["ctx", "auto", false],
    timeoutMs: 1000,
    fetchImpl: fetchImpl as typeof fetch,
    ...extra,
  });

afterEach(() => {
  vi.useRealTimers();
});

describe("parseGradioSse", () => {
  it("解析多個事件", () => {
    expect(
      parseGradioSse('event: heartbeat\ndata: null\n\nevent: complete\ndata: ["你好", null]\n\n'),
    ).toEqual([
      { event: "heartbeat", data: "null" },
      { event: "complete", data: '["你好", null]' },
    ]);
  });
});

describe("callGradioWithAudio", () => {
  it("依序上傳、送出、讀結果", async () => {
    const fetchImpl = routes({});
    await expect(call(fetchImpl)).resolves.toEqual(["ok"]);
    const submitBody = JSON.parse(String(fetchImpl.mock.calls[1][1]?.body));
    expect(submitBody.data[0]).toMatchObject({
      path: "/tmp/a.wav",
      meta: { _type: "gradio.FileData" },
    });
    expect(submitBody.data.slice(1)).toEqual(["ctx", "auto", false]);
  });

  it("HTTP 錯誤（例如防火牆擋下）", async () => {
    const fetchImpl = routes({ upload: new Response("<html>blocked</html>", { status: 403 }) });
    await expect(call(fetchImpl)).rejects.toMatchObject({ kind: "http" });
  });

  it("回應不是 JSON", async () => {
    const fetchImpl = routes({ upload: new Response("<html>challenge</html>") });
    await expect(call(fetchImpl)).rejects.toMatchObject({ kind: "invalid-response" });
  });

  it("SSE 回報錯誤", async () => {
    const fetchImpl = routes({ result: new Response("event: error\ndata: null\n\n") });
    await expect(call(fetchImpl)).rejects.toMatchObject({ kind: "server-error" });
  });

  it("逾時", async () => {
    vi.useFakeTimers();
    const assertion = expect(call(hangingFetch())).rejects.toMatchObject({ kind: "timeout" });
    await vi.advanceTimersByTimeAsync(1000);
    await assertion;
  });

  it("外部取消", async () => {
    const controller = new AbortController();
    const promise = call(hangingFetch(), { signal: controller.signal });
    controller.abort();
    await expect(promise).rejects.toBeInstanceOf(GradioError);
    await expect(promise).rejects.toMatchObject({ kind: "aborted" });
  });
});

describe("audioFileName", () => {
  it("依 MIME 決定副檔名", () => {
    expect(audioFileName(new Blob([], { type: "audio/webm;codecs=opus" }))).toMatch(
      /^voice_\d+\.webm$/,
    );
    expect(audioFileName(new Blob([], { type: "audio/mp4" }))).toMatch(/\.m4a$/);
    expect(audioFileName(new Blob([]))).toMatch(/\.wav$/);
  });
});
