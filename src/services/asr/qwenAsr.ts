/**
 * Qwen3-ASR 公開 Demo（ModelScope，不需要 API key）
 * 文字辨識準確、可用 context 提示專有名詞；輸出為簡體。
 */
import { audioFileName, callGradioWithAudio, GradioError } from "./gradio";

export const QWEN_ASR_BASE_URL = "https://qwen-qwen3-asr-demo.ms.show/gradio_api";

/** Demo 放在「結果欄位」裡的錯誤訊息，不是辨識結果 */
const QWEN_ERROR_TEXTS = ["响应结构不完整"];

export interface QwenAsrResult {
  text: string;
  /** auto 模式下的語種，例如「中文 / Chinese」；其他模式為 null */
  language: string | null;
}

export interface QwenAsrOptions {
  /** 提示詞，例如「角色名、使用者名」 */
  context?: string;
  language?: string;
  timeoutMs?: number;
  signal?: AbortSignal;
  fileName?: string;
  fetchImpl?: typeof fetch;
}

export function isQwenErrorText(text: string): boolean {
  const trimmed = text.trim();
  return QWEN_ERROR_TEXTS.some((e) => trimmed.startsWith(e));
}

export async function transcribeWithQwen(
  audio: Blob,
  options: QwenAsrOptions = {},
): Promise<QwenAsrResult> {
  const language = options.language ?? "auto";
  const data = await callGradioWithAudio({
    baseUrl: QWEN_ASR_BASE_URL,
    endpoint: "asr_inference",
    file: audio,
    fileName: options.fileName ?? audioFileName(audio),
    extraData: [options.context ?? "", language, false],
    timeoutMs: options.timeoutMs ?? 10000,
    signal: options.signal,
    fetchImpl: options.fetchImpl,
  });
  const text = typeof data[0] === "string" ? data[0].trim() : "";
  const detected = typeof data[1] === "string" ? data[1] : null;
  if (isQwenErrorText(text)) throw new GradioError("server-error", `Qwen 回報錯誤：${text}`);
  // auto 模式成功時一定會帶語種；有文字卻沒有語種代表 Demo 內部失敗
  if (language === "auto" && text && detected === null) {
    throw new GradioError("server-error", "Qwen 沒有回傳語種");
  }
  return { text, language: detected };
}
