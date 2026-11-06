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
  /** API 位址；被 CORS 擋時改填自己的代理，如 https://xxx.workers.dev/proxy/api.fish.audio */
  baseUrl: string;
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

// ── 工具函數 ──────────────────────────────────────────────────

function getBaseUrl(settings: Pick<FishAudioTTSSettings, 'baseUrl'>): string {
  return (settings.baseUrl?.trim() || FISH_AUDIO_DEFAULT_BASE_URL).replace(/\/+$/, '');
}

function clamp(value: number, min: number, max: number, fallback: number): number {
  return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
}

/** 常見錯誤碼的白話說明 */
const HTTP_HINTS: Record<number, string> = {
  401: 'API Key 不對或沒帶到',
  402: 'Fish Audio 帳戶餘額不足',
  404: '找不到這個音色或模型',
  422: '參數不對，常見原因：reference_id 或模型名稱填錯',
  429: '請求太頻繁，稍等一下再試',
};

async function describeHttpError(resp: Response): Promise<string> {
  let detail = '';
  try {
    const text = await resp.text();
    try {
      const data = JSON.parse(text);
      const msg = data?.message ?? data?.detail ?? data?.error;
      detail = typeof msg === 'string' ? msg : msg ? JSON.stringify(msg) : text;
    } catch {
      detail = text;
    }
  } catch {
    detail = '';
  }
  detail = detail.slice(0, 200);
  const hint = HTTP_HINTS[resp.status];
  if (hint) return detail ? `${hint}（${resp.status}：${detail}）` : `${hint}（${resp.status}）`;
  return detail ? `HTTP ${resp.status}：${detail}` : `HTTP ${resp.status}`;
}

function describeFetchError(error: unknown): string {
  const msg = error instanceof Error ? error.message : '未知錯誤';
  // 瀏覽器被 CORS 擋下時只會看到 Failed to fetch / Load failed
  if (/failed to fetch|load failed|networkerror/i.test(msg)) {
    return `${msg}（連不上 Fish Audio，可能被瀏覽器的跨域限制擋下，可以在「API 位址」改用代理）`;
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
    const resp = await fetch(`${getBaseUrl(settings)}/v1/tts`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${settings.apiKey}`,
        'Content-Type': 'application/json',
        model,
      },
      body: JSON.stringify(body),
      signal: options?.signal,
    });
    if (!resp.ok) {
      return { success: false, error: await describeHttpError(resp) };
    }
    const blob = await resp.blob();
    if (!blob.size) {
      return { success: false, error: 'Fish Audio 回傳了空的音頻' };
    }
    // 有些代理會把 Content-Type 弄丟，補上正確的類型才播得出來
    const typed = blob.type.startsWith('audio/') ? blob : new Blob([blob], { type: MIME[format] });
    return { success: true, audioUrl: await blobToDataUrl(typed) };
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      return { success: false, error: '已取消' };
    }
    return { success: false, error: describeFetchError(error) };
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
    const resp = await fetch(`${getBaseUrl(settings)}/wallet/self/api-credit`, {
      headers: { Authorization: `Bearer ${settings.apiKey}` },
    });
    if (!resp.ok) return { success: false, error: await describeHttpError(resp) };
    const data = await resp.json().catch(() => ({}));
    const credit = data?.credit;
    return {
      success: true,
      credit: credit !== undefined && credit !== null ? String(credit) : undefined,
    };
  } catch (error) {
    return { success: false, error: describeFetchError(error) };
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
    const resp = await fetch(`${getBaseUrl(settings)}/model?${params}`, {
      headers: { Authorization: `Bearer ${settings.apiKey}` },
    });
    if (!resp.ok) return { success: false, voices: [], error: await describeHttpError(resp) };
    const data = await resp.json();
    const items: unknown[] = Array.isArray(data?.items) ? data.items : [];
    const voices = items
      .map((item) => mapVoice(item, !query))
      .filter((v): v is FishAudioVoice => !!v);
    return { success: true, voices };
  } catch (error) {
    return { success: false, voices: [], error: describeFetchError(error) };
  }
}
