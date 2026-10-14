/**
 * 一段話的語音辨識：Qwen3-ASR ∥ SenseVoice 並行，合併後轉繁體
 *
 * - 文字以 Qwen 為主（較準、可用 context 提示名字），SenseVoice 補上聲音事件與情緒。
 * - 兩條互為備援；兩條都失敗時一起重試一次。
 * - SenseVoice 判定「只有聲音、沒講話」時直接完成，不等 Qwen。
 */
import { toTraditional } from "@/utils/toTraditional";
import { GradioError } from "./gradio";
import { transcribeWithQwen, type QwenAsrResult } from "./qwenAsr";
import {
  transcribeWithSenseVoice,
  type SenseVoiceResult,
  type VoiceEmotion,
  type VoiceEvent,
} from "./senseVoice";

export const EVENT_LABELS: Record<VoiceEvent, string> = {
  laugh: "笑",
  cough: "咳嗽",
  cry: "哭",
  applause: "鼓掌",
};

export const EMOTION_LABELS: Record<VoiceEmotion, string> = {
  happy: "開心",
  sad: "難過",
  angry: "生氣",
  fearful: "害怕",
  disgusted: "厭惡",
  surprised: "驚訝",
};

export type EngineOutcome<T> = { ok: true; value: T } | { ok: false; error: unknown };

export type MergeOutcome =
  | {
      kind: "result";
      text: string;
      events: VoiceEvent[];
      emotion: VoiceEmotion | null;
      convert: boolean;
    }
  | { kind: "empty" }
  | { kind: "failed" };

export interface RecognitionResult {
  /** 最終文字（含聲音事件標籤，已轉繁） */
  text: string;
  /** 依情緒判斷的語氣（中文），沒有就 undefined */
  tone?: string;
  events: VoiceEvent[];
}

export class RecognitionFailedError extends Error {
  constructor() {
    super("兩個辨識服務都連不上");
    this.name = "RecognitionFailedError";
  }
}

/** Qwen 在 SenseVoice 失敗時，會把咳嗽、笑聲寫成英文狀聲詞 */
const ONOMATOPOEIA: Array<{ re: RegExp; event: VoiceEvent }> = [
  { re: /^(?:\s*cough[\s,.!?]*)+$/i, event: "cough" },
  { re: /^(?:\s*(?:ha|hah|he)[\s,.!?-]*)+$/i, event: "laugh" },
];

export function eventsToLabel(events: readonly VoiceEvent[]): string {
  return events.map((e) => `（${EVENT_LABELS[e]}）`).join("");
}

function isPureSound(result: SenseVoiceResult): boolean {
  return !result.text && result.events.length > 0;
}

export function mergeRecognition(
  sense: EngineOutcome<SenseVoiceResult>,
  qwen: EngineOutcome<QwenAsrResult>,
): MergeOutcome {
  const s = sense.ok ? sense.value : null;
  const q = qwen.ok ? qwen.value : null;
  if (s && isPureSound(s)) {
    return {
      kind: "result",
      text: eventsToLabel(s.events),
      events: s.events,
      emotion: null,
      convert: false,
    };
  }
  if (s) {
    if (s.text) {
      return {
        kind: "result",
        text: eventsToLabel(s.events) + (q?.text || s.text),
        events: s.events,
        emotion: s.emotion,
        convert: true,
      };
    }
    if (q?.text) return { kind: "result", text: q.text, events: [], emotion: null, convert: true };
    return { kind: "empty" };
  }
  if (q) {
    if (!q.text) return { kind: "empty" };
    if (q.language && /english/i.test(q.language)) {
      const hit = ONOMATOPOEIA.find((o) => o.re.test(q.text));
      if (hit) {
        return {
          kind: "result",
          text: eventsToLabel([hit.event]),
          events: [hit.event],
          emotion: null,
          convert: false,
        };
      }
    }
    return { kind: "result", text: q.text, events: [], emotion: null, convert: true };
  }
  return { kind: "failed" };
}

export interface RecognizeOptions {
  /** 給 Qwen 的提示（角色名、使用者名） */
  context?: string;
  timeoutMs?: number;
  signal?: AbortSignal;
  /** 測試用：替換辨識服務 */
  engines?: {
    qwen?: typeof transcribeWithQwen;
    sense?: typeof transcribeWithSenseVoice;
  };
}

/** 辨識一段話；沒有內容回傳 null，兩條都失敗（含重試）丟出 RecognitionFailedError */
export async function recognizeUtterance(
  wav: Blob,
  options: RecognizeOptions = {},
): Promise<RecognitionResult | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const outcome = await recognizeOnce(wav, options);
    if (options.signal?.aborted) throw new GradioError("aborted", "已取消");
    if (outcome.kind === "failed") continue;
    if (outcome.kind === "empty") return null;
    return {
      text: outcome.convert ? await toTraditional(outcome.text) : outcome.text,
      events: outcome.events,
      tone: outcome.emotion ? EMOTION_LABELS[outcome.emotion] : undefined,
    };
  }
  throw new RecognitionFailedError();
}

async function recognizeOnce(wav: Blob, options: RecognizeOptions): Promise<MergeOutcome> {
  const qwenFn = options.engines?.qwen ?? transcribeWithQwen;
  const senseFn = options.engines?.sense ?? transcribeWithSenseVoice;
  const timeoutMs = options.timeoutMs ?? 10000;
  const fileName = `voice_${Date.now()}.wav`;
  const qwenController = new AbortController();
  const abortQwen = () => qwenController.abort();
  if (options.signal?.aborted) abortQwen();
  else options.signal?.addEventListener("abort", abortQwen, { once: true });

  try {
    const qwenPromise = settle(
      qwenFn(wav, {
        context: options.context,
        timeoutMs,
        signal: qwenController.signal,
        fileName,
      }),
      "Qwen",
    );
    const sense = await settle(
      senseFn(wav, { timeoutMs, signal: options.signal, fileName }),
      "SenseVoice",
    );
    if (sense.ok && isPureSound(sense.value)) {
      qwenController.abort();
      return mergeRecognition(sense, { ok: false, error: "skipped" });
    }
    return mergeRecognition(sense, await qwenPromise);
  } finally {
    options.signal?.removeEventListener("abort", abortQwen);
  }
}

function settle<T>(promise: Promise<T>, name: string): Promise<EngineOutcome<T>> {
  return promise.then(
    (value) => ({ ok: true as const, value }),
    (error: unknown) => {
      if (!(error instanceof GradioError && error.kind === "aborted")) {
        console.warn(`[callVoice] ${name} 辨識失敗:`, error);
      }
      return { ok: false as const, error };
    },
  );
}
