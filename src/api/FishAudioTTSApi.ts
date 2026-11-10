/**
 * Fish Audio 語音合成 (TTS) API
 * 文檔: https://docs.fish.audio/api-reference/endpoint/openapi-v1/text-to-speech
 *
 * 跟 MiniMax 不同的地方：
 * - 模型放在 `model` 標頭，不在請求體
 * - 音色用 reference_id（Fish Audio 網站上音色頁網址最後那串 id）
 * - 回傳的是音頻本身，不是網址，所以直接轉成 data URL
 * - 情緒、語氣用寫在文字裡的標記，例如 (happy)、(laughing)、(break)
 */

import { CapacitorHttp } from '@capacitor/core';
import { aiProxyHost, isNativeApp } from '@/native/platform';

// ── 類型定義 ──────────────────────────────────────────────────

export type FishAudioFormat = 'mp3' | 'wav' | 'opus';
export type FishAudioLatency = 'normal' | 'balanced';

export interface FishAudioTTSSettings {
  /** API Key */
  apiKey: string;
  /** 模型（送在 model 標頭），如 s1、speech-1.6 */
  model: string;
  /** 預設音色 reference_id，留空由 Fish Audio 決定 */
  referenceId: string;
  /** API 位址（沒開代理時用），預設 https://api.fish.audio */
  baseUrl: string;
  /** 透過 App 的代理 Worker 連線（連不上、被擋時用） */
  useProxy: boolean;
  /** 輸出格式 */
  format: FishAudioFormat;
  /** normal＝品質優先、balanced＝速度優先 */
  latency: FishAudioLatency;
  /** 把 AI 標的情緒、笑聲、停頓轉成 Fish Audio 的標記；關掉就只念純文字 */
  emotionTags: boolean;
}

export interface FishAudioVoice {
  id: string;
  title: string;
  description?: string;
  languages?: string[];
  coverImage?: string;
  author?: string;
  /** 自己建立的音色 */
  mine?: boolean;
  createdAt?: string;
}

export interface FishAudioTTSResponse {
  success: boolean;
  audioUrl?: string;
  error?: string;
}

// ── 常數 ──────────────────────────────────────────────────────

export const FISH_AUDIO_DEFAULT_BASE_URL = 'https://api.fish.audio';

/** 模型建議清單；模型欄位可以自己輸入，Fish Audio 出新模型時不用等這裡更新 */
export const FISH_AUDIO_MODELS: { value: string; label: string }[] = [
  { value: 's1', label: 's1（支援情緒與語氣標記）' },
  { value: 'speech-1.6', label: 'speech-1.6' },
  { value: 'speech-1.5', label: 'speech-1.5' },
];

export function createDefaultFishAudioSettings(): FishAudioTTSSettings {
  return {
    apiKey: '',
    model: 's1',
    referenceId: '',
    baseUrl: FISH_AUDIO_DEFAULT_BASE_URL,
    useProxy: false,
    format: 'mp3',
    latency: 'normal',
    emotionTags: true,
  };
}

// ── 文字標記轉換 ───────────────────────────────────────────────

/** AI 標的情緒（沿用 MiniMax 的那組）→ Fish Audio 情緒標記 */
const EMOTION_MAP: Record<string, string> = {
  happy: 'happy',
  sad: 'sad',
  angry: 'angry',
  fearful: 'scared',
  disgusted: 'disgusted',
  surprised: 'surprised',
  calm: 'relaxed',
  whisper: 'whispering',
};

/** MiniMax 語氣標籤 → Fish Audio 音效標記；沒有對應的直接拿掉，免得被念出來 */
const TONE_MAP: Record<string, string | null> = {
  laughs: 'laughing',
  chuckle: 'chuckling',
  crying: 'sobbing',
  sighs: 'sighing',
  pant: 'panting',
  groans: 'groaning',
  breath: 'breath',
  inhale: 'breath',
  exhale: 'breath',
  coughs: 'cough',
  'clear-throat': 'cough',
  'lip-smacking': 'lip-smacking',
};

const MINIMAX_TONE_RE =
  /\((laughs|chuckle|coughs|clear-throat|groans|breath|pant|inhale|exhale|gasps|sniffs|sighs|snorts|burps|lip-smacking|humming|hissing|emm|sneezes|whistles|crying|applause)\)/gi;
const PAUSE_RE = /<#([\d.]+)#>/g;

/** 舊的 speech-1.x 模型不認得標記，標記會被念出來 */
export function fishModelSupportsMarkers(model: string): boolean {
  return !/^speech-1\./i.test(model.trim());
}

export function normalizeFishEmotion(raw: string | undefined): string | undefined {
  const v = raw?.trim().toLowerCase();
  return v ? EMOTION_MAP[v] : undefined;
}

/**
 * 把聊天裡給 MiniMax 的標記換成 Fish Audio 的：
 * (laughs) → (laughing)、<#0.5#> → (break)、情緒放在句首 (happy)。
 * 不支援標記的模型或關掉標記時，只留純文字。
 */
export function toFishAudioText(
  text: string,
  options: { emotion?: string; markers: boolean },
): string {
  if (!options.markers) {
    return text
      .replace(MINIMAX_TONE_RE, '')
      .replace(PAUSE_RE, '，')
      .replace(/，{2,}/g, '，')
      .trim();
  }
  const body = text
    .replace(MINIMAX_TONE_RE, (_, tag: string) => {
      const mapped = TONE_MAP[tag.toLowerCase()];
      return mapped ? `(${mapped})` : '';
    })
    .replace(PAUSE_RE, (_, sec: string) => (Number(sec) >= 0.8 ? '(long-break)' : '(break)'))
    .trim();
  const emotion = normalizeFishEmotion(options.emotion);
  return emotion ? `(${emotion}) ${body}` : body;
}

// ── 連線 ──────────────────────────────────────────────────────

/** 代理 Worker 上轉發到 Fish Audio 的路徑 */
const PROXY_PATH = '/proxy/api.fish.audio';

/**
 * 實際打的 API 位址：
 * - 開了代理：走 App 自己的代理 Worker（App 用大陸也連得到的自訂網域）
 * - 沒開：用使用者填的位址；貼了完整的 .../v1/tts 也認得
 */
export function getFishAudioBaseUrl(settings: Pick<FishAudioTTSSettings, 'baseUrl' | 'useProxy'>): string {
  if (settings.useProxy) return `${aiProxyHost()}${PROXY_PATH}`;
  return normalizeFishAudioBaseUrl(settings.baseUrl);
}

/** 把使用者貼的位址整理成 API 根位址：去掉結尾斜線和 /v1/tts、/v1 */
export function normalizeFishAudioBaseUrl(raw: string | undefined): string {
  const url = (raw?.trim() || FISH_AUDIO_DEFAULT_BASE_URL)
    .replace(/\/+$/, '')
    .replace(/\/v1(\/tts)?$/i, '');
  return url || FISH_AUDIO_DEFAULT_BASE_URL;
}

/** 測試連線、取音色等小請求的逾時；合成長句要比較久 */
const SHORT_TIMEOUT_MS = 20_000;
const TTS_TIMEOUT_MS = 90_000;

interface FishResponse {
  status: number;
  ok: boolean;
  /** 回應內容：json 模式是解析好的物件，audio 模式是 data URL，失敗時是原文 */
  data: unknown;
  text: string;
}

class FishTimeoutError extends Error {}

function base64ToText(b64: string): string {
  try {
    const bin = atob(b64);
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch {
    return b64;
  }
}

/**
 * 發請求。App 裡走原生連線（沒有瀏覽器的跨域限制），網頁版用 fetch。
 * 都有逾時，連不上時不會一直卡在「測試中」。
 */
async function fishRequest(
  url: string,
  init: {
    method?: 'GET' | 'POST';
    headers: Record<string, string>;
    body?: unknown;
    expect: 'json' | 'audio';
    audioMime?: string;
    timeoutMs: number;
    signal?: AbortSignal;
  },
): Promise<FishResponse> {
  const method = init.method ?? 'GET';

  if (isNativeApp()) {
    const request = CapacitorHttp.request({
      url,
      method,
      headers: init.headers,
      data: init.body,
      responseType: init.expect === 'audio' ? 'blob' : 'text',
      connectTimeout: init.timeoutMs,
      readTimeout: init.timeoutMs,
    });
    const res = await withTimeout(request, init.timeoutMs + 2_000, init.signal);
    const ok = res.status >= 200 && res.status < 300;
    const raw = typeof res.data === 'string' ? res.data : JSON.stringify(res.data ?? '');
    if (init.expect === 'audio') {
      // blob 模式回傳 base64；失敗時裡面是錯誤訊息
      if (!ok) return { status: res.status, ok, data: null, text: base64ToText(raw) };
      return { status: res.status, ok, data: raw ? `data:${init.audioMime};base64,${raw}` : '', text: '' };
    }
    return { status: res.status, ok, data: safeJson(raw), text: raw };
  }

  const controller = new AbortController();
  const onAbort = () => controller.abort();
  init.signal?.addEventListener('abort', onAbort);
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, init.timeoutMs);
  try {
    const resp = await fetch(url, {
      method,
      headers: init.headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: controller.signal,
    });
    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      return { status: resp.status, ok: false, data: safeJson(text), text };
    }
    if (init.expect === 'audio') {
      const blob = await resp.blob();
      // 有些代理會把 Content-Type 弄丟，補上正確的類型才播得出來
      const typed = blob.type.startsWith('audio/') ? blob : new Blob([blob], { type: init.audioMime });
      return { status: resp.status, ok: true, data: blob.size ? await blobToDataUrl(typed) : '', text: '' };
    }
    const text = await resp.text();
    return { status: resp.status, ok: true, data: safeJson(text), text };
  } catch (error) {
    if (timedOut) throw new FishTimeoutError();
    throw error;
  } finally {
    clearTimeout(timer);
    init.signal?.removeEventListener('abort', onAbort);
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number, signal?: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new FishTimeoutError()), ms);
    const onAbort = () => reject(new DOMException('Aborted', 'AbortError'));
    signal?.addEventListener('abort', onAbort, { once: true });
    promise.then(resolve, reject).finally(() => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    });
  });
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

// ── 工具函數 ──────────────────────────────────────────────────

function clamp(value: number, min: number, max: number, fallback: number): number {
  return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
}

/** 常見錯誤碼的白話說明 */
const HTTP_HINTS: Record<number, string> = {
  401: 'API Key 不對或沒帶到',
  402: 'Fish Audio 帳戶餘額不足',
  403: '被拒絕存取，可能是 API Key 沒有權限，或代理不允許這個來源',
  404: '找不到這個網址、音色或模型，檢查「API 位址」是不是只填到 https://api.fish.audio',
  422: '參數不對，常見原因：reference_id 或模型名稱填錯',
  429: '請求太頻繁，稍等一下再試',
};

function describeHttpError(res: FishResponse): string {
  const data = res.data as any;
  const msg = data?.message ?? data?.detail ?? data?.error;
  let detail = typeof msg === 'string' ? msg : msg ? JSON.stringify(msg) : res.text;
  detail = (detail || '').slice(0, 200);
  const hint = HTTP_HINTS[res.status];
  if (hint) return detail ? `${hint}（${res.status}：${detail}）` : `${hint}（${res.status}）`;
  return detail ? `HTTP ${res.status}：${detail}` : `HTTP ${res.status}`;
}

function describeFetchError(error: unknown, settings: Pick<FishAudioTTSSettings, 'useProxy'>): string {
  const fix = settings.useProxy ? '檢查代理 Worker 是否正常' : '可以打開「透過代理連線」再試';
  if (error instanceof FishTimeoutError) {
    return `連線逾時，一直等不到 Fish Audio 回應（網路不通或被擋），${fix}`;
  }
  const msg = error instanceof Error ? error.message : String(error ?? '未知錯誤');
  // 瀏覽器被 CORS 擋下或網路不通時只會看到 Failed to fetch / Load failed
  if (/failed to fetch|load failed|networkerror|network|timed? ?out|unable to resolve|connect/i.test(msg)) {
    return `連不上 Fish Audio（${msg}），${fix}`;
  }
  return msg;
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  // 分段轉字串，避免長音頻一次展開參數太多
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return `data:${blob.type || 'application/octet-stream'};base64,${btoa(binary)}`;
}

const MIME: Record<FishAudioFormat, string> = {
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  opus: 'audio/ogg',
};

// ── 主要 API 函數 ─────────────────────────────────────────────

/**
 * 語音合成，回傳 data URL（Fish Audio 直接回傳音頻內容）
 */
export async function synthesizeFishAudio(
  text: string,
  settings: FishAudioTTSSettings,
  options?: {
    /** 這次要用的音色，沒給就用 settings.referenceId */
    referenceId?: string;
    /** 語速 0.5~2.0 */
    speed?: number;
    emotion?: string;
    signal?: AbortSignal;
  },
): Promise<FishAudioTTSResponse> {
  if (!settings.apiKey) {
    return { success: false, error: '缺少 Fish Audio API Key' };
  }
  const model = settings.model?.trim() || 's1';
  const markers = settings.emotionTags !== false && fishModelSupportsMarkers(model);
  const ttsText = toFishAudioText(text, { emotion: options?.emotion, markers });
  if (!ttsText.replace(/\([a-z -]+\)/gi, '').trim()) {
    return { success: false, error: '文本為空' };
  }

  const format: FishAudioFormat = settings.format || 'mp3';
  const body: Record<string, unknown> = {
    text: ttsText,
    format,
    latency: settings.latency || 'normal',
    normalize: true,
    prosody: {
      speed: Math.round(clamp(options?.speed ?? 1, 0.5, 2, 1) * 100) / 100,
      volume: 0,
    },
  };
  if (format === 'mp3') body.mp3_bitrate = 128;
  const referenceId = (options?.referenceId ?? settings.referenceId)?.trim();
  if (referenceId) body.reference_id = referenceId;

  try {
    const res = await fishRequest(`${getFishAudioBaseUrl(settings)}/v1/tts`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${settings.apiKey}`,
        'Content-Type': 'application/json',
        model,
      },
      body,
      expect: 'audio',
      audioMime: MIME[format],
      timeoutMs: TTS_TIMEOUT_MS,
      signal: options?.signal,
    });
    if (!res.ok) return { success: false, error: describeHttpError(res) };
    if (!res.data) return { success: false, error: 'Fish Audio 回傳了空的音頻' };
    return { success: true, audioUrl: res.data as string };
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      return { success: false, error: '已取消' };
    }
    return { success: false, error: describeFetchError(error, settings) };
  }
}

/**
 * 測試 API Key：查 API 餘額，順便回傳餘額給畫面顯示
 */
export async function testFishAudioConnection(
  settings: FishAudioTTSSettings,
): Promise<{ success: boolean; credit?: string; error?: string }> {
  if (!settings.apiKey) return { success: false, error: '缺少 API Key' };
  try {
    const res = await fishRequest(`${getFishAudioBaseUrl(settings)}/wallet/self/api-credit`, {
      headers: { Authorization: `Bearer ${settings.apiKey}` },
      expect: 'json',
      timeoutMs: SHORT_TIMEOUT_MS,
    });
    if (!res.ok) return { success: false, error: describeHttpError(res) };
    const credit = (res.data as any)?.credit;
    return {
      success: true,
      credit: credit !== undefined && credit !== null ? String(credit) : undefined,
    };
  } catch (error) {
    return { success: false, error: describeFetchError(error, settings) };
  }
}

function mapVoice(item: any, mine: boolean): FishAudioVoice | null {
  const id = item?._id ?? item?.id;
  if (typeof id !== 'string' || !id) return null;
  return {
    id,
    title: item.title || id,
    description: item.description || undefined,
    languages: Array.isArray(item.languages) ? item.languages : undefined,
    coverImage: item.cover_image || undefined,
    author: item.author?.nickname || undefined,
    mine,
    createdAt: typeof item.created_at === 'string' ? item.created_at.slice(0, 10) : undefined,
  };
}

/**
 * 取得音色：不給 query 時列出自己建立的音色；給 query 時搜尋公開音色庫
 */
export async function fetchFishAudioVoices(
  settings: FishAudioTTSSettings,
  options?: { query?: string; pageSize?: number },
): Promise<{ success: boolean; voices: FishAudioVoice[]; error?: string }> {
  if (!settings.apiKey) return { success: false, voices: [], error: '缺少 API Key' };
  const query = options?.query?.trim();
  const params = new URLSearchParams({
    page_size: String(options?.pageSize ?? (query ? 20 : 100)),
    page_number: '1',
  });
  if (query) {
    params.set('title', query);
    params.set('sort_by', 'task_count');
  } else {
    params.set('self', 'true');
  }
  try {
    const res = await fishRequest(`${getFishAudioBaseUrl(settings)}/model?${params}`, {
      headers: { Authorization: `Bearer ${settings.apiKey}` },
      expect: 'json',
      timeoutMs: SHORT_TIMEOUT_MS,
    });
    if (!res.ok) return { success: false, voices: [], error: describeHttpError(res) };
    const items: unknown[] = Array.isArray((res.data as any)?.items) ? (res.data as any).items : [];
    const voices = items
      .map((item) => mapVoice(item, !query))
      .filter((v): v is FishAudioVoice => !!v);
    return { success: true, voices };
  } catch (error) {
    return { success: false, voices: [], error: describeFetchError(error, settings) };
  }
}
