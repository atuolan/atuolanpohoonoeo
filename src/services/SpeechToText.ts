/**
 * SpeechToText 語音轉文字服務
 *
 * 優先使用瀏覽器 Web Speech API（免費、即時）。
 * 若瀏覽器不支援，則 fallback 到 OpenAI 兼容的 /audio/transcriptions 端點。
 */

// ===== Web Speech API 類型 =====
interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
}

interface SpeechRecognitionResultList {
  length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionResult {
  isFinal: boolean;
  length: number;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
}

interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}

interface SpeechRecognitionConstructor {
  new (): SpeechRecognitionInstance;
}

interface SpeechRecognitionInstance extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: Event & { error: string }) => void) | null;
  onend: (() => void) | null;
}

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

/**
 * 檢查瀏覽器是否支援 Web Speech API
 */
export function isSpeechRecognitionSupported(): boolean {
  return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
}

/**
 * 使用 Web Speech API 從音頻 Blob 轉文字
 * 注意：Web Speech API 需要即時麥克風輸入，無法直接處理 Blob。
 * 因此這裡改用 Whisper API fallback。
 */

/**
 * AI API 代理專用子域名（灰雲 DNS only，繞過 Cloudflare 100s timeout）
 */
const AI_PROXY_HOST = "https://api-203.aguacloud.uk";

/**
 * 將外部 URL 轉為代理路徑（走灰雲子域名 api-203，繞過 Cloudflare timeout）
 */
function toProxyUrl(url: string): string {
  if (typeof window === "undefined") return url;
  try {
    const parsed = new URL(url, window.location.origin);
    if (parsed.origin === window.location.origin) return url;
    const prefix =
      parsed.protocol === "http:" ? "/ai-proxy-http/" : "/ai-proxy/";
    return `${AI_PROXY_HOST}${prefix}${parsed.host}${parsed.pathname}`;
  } catch {
    return url;
  }
}

/**
 * 根據 MIME 類型取得檔案副檔名
 */
function getExtension(mimeType: string): string {
  if (mimeType.includes("wav")) return "wav";
  if (mimeType.includes("mp3") || mimeType.includes("mpeg")) return "mp3";
  if (mimeType.includes("ogg")) return "ogg";
  if (mimeType.includes("webm")) return "webm";
  return "wav";
}

export interface STTOptions {
  /** API 端點（如 https://api.openai.com/v1） */
  endpoint: string;
  /** API Key */
  apiKey: string;
  /** 語言提示（如 'zh'、'ja'、'en'），可選 */
  language?: string;
  /** 使用的模型（預設 whisper-1） */
  model?: string;
}

/**
 * 使用 OpenAI 兼容的 /audio/transcriptions 端點進行語音轉文字
 *
 * @param blob 音頻 Blob
 * @param mimeType 音頻 MIME 類型
 * @param options API 設定
 * @returns 轉錄的文字，失敗時返回空字串
 */
export async function transcribeAudio(
  blob: Blob,
  mimeType: string,
  options: STTOptions,
): Promise<string> {
  try {
    const ext = getExtension(mimeType);
    const file = new File([blob], `audio.${ext}`, { type: mimeType });

    // 構建 /audio/transcriptions 端點
    let endpoint = options.endpoint;
    // 移除尾部的 /chat/completions 或其他路徑
    endpoint = endpoint.replace(/\/chat\/completions\/?$/, "");
    if (!endpoint.endsWith("/")) endpoint += "/";
    // 如果端點不包含 v1，加上
    if (!endpoint.includes("/v1")) {
      endpoint += "v1/";
    }
    endpoint += "audio/transcriptions";

    const formData = new FormData();
    formData.append("file", file);
    formData.append("model", options.model || "whisper-1");
    if (options.language) {
      formData.append("language", options.language);
    }

    const response = await fetch(toProxyUrl(endpoint), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${options.apiKey}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.warn("[STT] API 錯誤:", response.status, errorText);
      return "";
    }

    const data = await response.json();
    return data.text || "";
  } catch (err) {
    console.warn("[STT] 轉文字失敗:", err);
    return "";
  }
}
