/**
 * SenseVoice 公開 Demo（ModelScope，不需要 API key）
 * 會用 emoji 標出聲音事件（笑、咳嗽…）與說話情緒；輸出為簡體。
 */
import { audioFileName, callGradioWithAudio } from "./gradio";

export const SENSEVOICE_BASE_URL = "https://iic-sensevoice.ms.show";

export type VoiceEvent = "laugh" | "cough" | "cry" | "applause";
export type VoiceEmotion = "happy" | "sad" | "angry" | "fearful" | "disgusted" | "surprised";

export interface SenseVoiceResult {
  /** 去掉 emoji 後的文字；只剩標點時為空字串 */
  text: string;
  events: VoiceEvent[];
  emotion: VoiceEmotion | null;
}

const EVENT_EMOJI = new Map<string, VoiceEvent>([
  ["😀", "laugh"],
  ["🤧", "cough"], // SenseVoice 的咳嗽與噴嚏都用這個
  ["😭", "cry"],
  ["👏", "applause"],
]);

const EMOTION_EMOJI = new Map<string, VoiceEmotion>([
  ["😊", "happy"],
  ["😔", "sad"],
  ["😡", "angry"],
  ["😰", "fearful"],
  ["🤢", "disgusted"],
  ["😮", "surprised"],
]);

/** 背景音樂不是使用者發出的聲音，不採用 */
const IGNORED_EMOJI = new Set(["🎼"]);

export function parseSenseVoiceOutput(raw: string): SenseVoiceResult {
  const events: VoiceEvent[] = [];
  let emotion: VoiceEmotion | null = null;
  const kept: string[] = [];
  for (const ch of raw) {
    const event = EVENT_EMOJI.get(ch);
    if (event) {
      if (!events.includes(event)) events.push(event);
      continue;
    }
    const mood = EMOTION_EMOJI.get(ch);
    if (mood) {
      if (!emotion) emotion = mood;
      continue;
    }
    if (IGNORED_EMOJI.has(ch)) continue;
    kept.push(ch);
  }
  const text = kept.join("").trim();
  return { text: /[\p{L}\p{N}]/u.test(text) ? text : "", events, emotion };
}

export interface SenseVoiceOptions {
  timeoutMs?: number;
  signal?: AbortSignal;
  fileName?: string;
  fetchImpl?: typeof fetch;
}

export async function transcribeWithSenseVoice(
  audio: Blob,
  options: SenseVoiceOptions = {},
): Promise<SenseVoiceResult> {
  const data = await callGradioWithAudio({
    baseUrl: SENSEVOICE_BASE_URL,
    endpoint: "model_inference",
    file: audio,
    fileName: options.fileName ?? audioFileName(audio),
    extraData: ["auto"],
    timeoutMs: options.timeoutMs ?? 10000,
    signal: options.signal,
    fetchImpl: options.fetchImpl,
  });
  return parseSenseVoiceOutput(typeof data[0] === "string" ? data[0] : "");
}
