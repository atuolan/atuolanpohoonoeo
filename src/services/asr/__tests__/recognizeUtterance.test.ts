import { describe, expect, it, vi } from "vitest";
import { GradioError } from "@/services/asr/gradio";
import {
  type EngineOutcome,
  mergeRecognition,
  RecognitionFailedError,
  recognizeUtterance,
} from "@/services/asr/recognizeUtterance";
import type { QwenAsrResult } from "@/services/asr/qwenAsr";
import type { SenseVoiceResult, VoiceEmotion, VoiceEvent } from "@/services/asr/senseVoice";

const fail = { ok: false as const, error: new Error("x") };
const sense = (
  text: string,
  events: VoiceEvent[] = [],
  emotion: VoiceEmotion | null = null,
): EngineOutcome<SenseVoiceResult> => ({ ok: true, value: { text, events, emotion } });
const qwen = (
  text: string,
  language: string | null = "中文 / Chinese",
): EngineOutcome<QwenAsrResult> => ({ ok: true, value: { text, language } });

describe("mergeRecognition", () => {
  it.each([
    ["純聲音：用事件標籤", sense("", ["cough"]), fail, { kind: "result", text: "（咳嗽）", events: ["cough"], emotion: null, convert: false }],
    ["SenseVoice 空白、Qwen 有字", sense(""), qwen("你好"), { kind: "result", text: "你好", events: [], emotion: null, convert: true }],
    ["兩邊都空白", sense(""), qwen(""), { kind: "empty" }],
    ["SenseVoice 空白、Qwen 失敗", sense(""), fail, { kind: "empty" }],
    ["兩邊有字：Qwen 文字＋SenseVoice 事件與情緒", sense("哈哈你好", ["laugh"], "happy"), qwen("哈哈，你好"), { kind: "result", text: "（笑）哈哈，你好", events: ["laugh"], emotion: "happy", convert: true }],
    ["Qwen 失敗：用 SenseVoice 文字", sense("我刚下班", [], "sad"), fail, { kind: "result", text: "我刚下班", events: [], emotion: "sad", convert: true }],
    ["SenseVoice 失敗：用 Qwen 文字", fail, qwen("我刚下班"), { kind: "result", text: "我刚下班", events: [], emotion: null, convert: true }],
    ["SenseVoice 失敗、Qwen 把咳嗽寫成英文", fail, qwen("Cough cough cough.", "英文 / English"), { kind: "result", text: "（咳嗽）", events: ["cough"], emotion: null, convert: false }],
    ["SenseVoice 失敗、Qwen 把笑聲寫成英文", fail, qwen("Ha ha ha ha", "英文 / English"), { kind: "result", text: "（笑）", events: ["laugh"], emotion: null, convert: false }],
    ["兩邊都失敗", fail, fail, { kind: "failed" }],
    ["有咳嗽事件、文字只剩狀聲字：視為純聲音", sense("咳。", ["cough"]), qwen("咳。"), { kind: "result", text: "（咳嗽）", events: ["cough"], emotion: null, convert: false }],
    ["有笑聲事件、文字只剩哈哈：視為純聲音", sense("哈哈哈", ["laugh"], "happy"), qwen("哈哈哈哈"), { kind: "result", text: "（笑）", events: ["laugh"], emotion: null, convert: false }],
    ["有笑聲事件、但有講話：保留文字", sense("哈哈你好", ["laugh"]), qwen("哈哈你好"), { kind: "result", text: "（笑）哈哈你好", events: ["laugh"], emotion: null, convert: true }],
  ] as const)("%s", (_name, s, q, expected) => {
    expect(mergeRecognition(s, q)).toEqual(expected);
  });
});

describe("recognizeUtterance", () => {
  const wav = new Blob(["x"], { type: "audio/wav" });

  it("SenseVoice 判定純聲音時不等 Qwen，並取消它", async () => {
    let qwenSignal: AbortSignal | undefined;
    const engines = {
      sense: vi.fn(async () => ({ text: "", events: ["laugh" as const], emotion: null })),
      qwen: vi.fn((_wav: Blob, options?: { signal?: AbortSignal }) => {
        qwenSignal = options?.signal;
        return new Promise<QwenAsrResult>((_, reject) =>
          options?.signal?.addEventListener("abort", () =>
            reject(new GradioError("aborted", "x")),
          ),
        );
      }),
    };
    await expect(recognizeUtterance(wav, { engines })).resolves.toEqual({
      text: "（笑）",
      events: ["laugh"],
      tone: undefined,
    });
    expect(qwenSignal?.aborted).toBe(true);
  });

  it("有講話時轉繁體並附上語氣", async () => {
    const engines = {
      sense: vi.fn(async () => ({ text: "我刚下班", events: [], emotion: "happy" as const })),
      qwen: vi.fn(async (_wav: Blob, _options?: { context?: string }) => ({
        text: "我刚下班了",
        language: "中文 / Chinese",
      })),
    };
    await expect(recognizeUtterance(wav, { context: "小雪、阿明", engines })).resolves.toEqual({
      text: "我剛下班了",
      events: [],
      tone: "開心",
    });
    expect(engines.qwen.mock.calls[0][1]).toMatchObject({ context: "小雪、阿明" });
  });

  it("空白回傳 null", async () => {
    const engines = {
      sense: vi.fn(async () => ({ text: "", events: [], emotion: null })),
      qwen: vi.fn(async () => ({ text: "", language: null })),
    };
    await expect(recognizeUtterance(wav, { engines })).resolves.toBeNull();
  });

  it("兩條都失敗時重試一次，第二次成功", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const engines = {
      sense: vi
        .fn()
        .mockRejectedValueOnce(new Error("down"))
        .mockResolvedValueOnce({ text: "你好", events: [], emotion: null }),
      qwen: vi
        .fn()
        .mockRejectedValueOnce(new Error("down"))
        .mockResolvedValueOnce({ text: "你好", language: "中文 / Chinese" }),
    };
    await expect(recognizeUtterance(wav, { engines })).resolves.toMatchObject({ text: "你好" });
    expect(engines.sense).toHaveBeenCalledTimes(2);
    expect(engines.qwen).toHaveBeenCalledTimes(2);
  });

  it("重試後仍失敗就丟出 RecognitionFailedError", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const engines = {
      sense: vi.fn().mockRejectedValue(new Error("down")),
      qwen: vi.fn().mockRejectedValue(new Error("down")),
    };
    await expect(recognizeUtterance(wav, { engines })).rejects.toBeInstanceOf(
      RecognitionFailedError,
    );
    expect(engines.sense).toHaveBeenCalledTimes(2);
  });

  it("外部取消時不重試", async () => {
    const controller = new AbortController();
    controller.abort();
    const engines = {
      sense: vi.fn().mockRejectedValue(new GradioError("aborted", "x")),
      qwen: vi.fn().mockRejectedValue(new GradioError("aborted", "x")),
    };
    await expect(
      recognizeUtterance(wav, { engines, signal: controller.signal }),
    ).rejects.toMatchObject({ kind: "aborted" });
    expect(engines.sense).toHaveBeenCalledTimes(1);
  });
});
