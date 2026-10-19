/**
 * MiniMax 語音合成 (TTS) API
 * 文檔: https://platform.minimaxi.com/document/T2A%20V2
 */

// ── 類型定義 ──────────────────────────────────────────────────

export type MiniMaxPlatform = 'io' | 'cn';

export type MiniMaxModel =
  | 'speech-2.8-hd'
  | 'speech-2.8-turbo'
  | 'speech-2.6-hd'
  | 'speech-2.6-turbo'
  | 'speech-02-hd'
  | 'speech-02-turbo';

export interface TimberWeight {
  /** 音色 voice_id */
  voiceId: string;
  /** 權重 1~100 */
  weight: number;
}

export interface MiniMaxTTSSettings {
  /** API Key */
  apiKey: string;
  /** 平台：io=國際站, cn=中文站 */
  platform: MiniMaxPlatform;
  /** Cloudflare Worker 代理地址（留空直連） */
  proxyUrl: string;
  /** 預設模型 */
  model: MiniMaxModel;
  /** 預設音色 voice_id */
  voiceId: string;
  /** 語速 0.5~2.0 */
  speed: number;
  /** 音量 0.1~10.0 */
  volume: number;
  /** 音調 -12~12 */
  pitch: number;
  /** 語言增強 */
  languageBoost: string;
  /** 輸出格式 */
  format: 'mp3' | 'wav' | 'flac';
  /** 採樣率 */
  sampleRate: number;
  /** 音色混合（送出時是 timbre_weights），啟用後會覆蓋 voiceId */
  timberWeights: TimberWeight[];
  /** 是否啟用音色混合 */
  timberWeightsEnabled: boolean;
}

export interface MiniMaxTTSResponse {
  success: boolean;
  audioUrl?: string;
  audioBase64?: string;
  duration?: number;
  error?: string;
}

// ── 常數 ──────────────────────────────────────────────────────

export const MINIMAX_MODELS: { value: MiniMaxModel; label: string }[] = [
  { value: 'speech-2.8-hd', label: 'speech-2.8-hd（最新HD，支持語氣標籤）' },
  { value: 'speech-2.8-turbo', label: 'speech-2.8-turbo（最新Turbo，支持語氣標籤）' },
  { value: 'speech-2.6-hd', label: 'speech-2.6-hd' },
  { value: 'speech-2.6-turbo', label: 'speech-2.6-turbo（40語種）' },
  { value: 'speech-02-hd', label: 'speech-02-hd' },
  { value: 'speech-02-turbo', label: 'speech-02-turbo' },
];

/** 系統音色中文名稱對照表 */
export const MINIMAX_VOICE_NAMES: Record<string, string> = {
  // ── 男聲 ──
  'male-qn-qingse': '青澀青年',
  'male-qn-jingying': '精英青年',
  'male-qn-badao': '霸道青年',
  'male-qn-daxuesheng': '大學生',
  'male-qn-qingse-jingpin': '青澀青年（精品）',
  // ── 女聲 ──
  'female-shaonv': '少女',
  'female-yujie': '御姐',
  'female-chengshu': '成熟女性',
  'female-tianmei': '甜美女生',
  // ── 其他常見 ──
  'presenter_male': '男主持人',
  'presenter_female': '女主持人',
  'audiobook_male_1': '有聲書男1',
  'audiobook_male_2': '有聲書男2',
  'audiobook_female_1': '有聲書女1',
  'audiobook_female_2': '有聲書女2',
  // 國際站音色
  'Wise_Woman': '智慧女性',
  'Friendly_Person': '友善人物',
  'Inspirational_girl': '勵志少女',
  'Deep_Voice_Man': '低沉男聲',
  'Calm_Woman': '沉穩女性',
  'Casual_Guy': '隨性男生',
  'Lively_Girl': '活潑女生',
  'Patient_Man': '耐心男性',
  'Young_Knight': '少年騎士',
  'Determined_Man': '堅毅男性',
  'Lovely_Girl': '可愛女生',
  'Decent_Boy': '正派男孩',
  'Imposing_Manner': '氣勢男聲',
  'Elegant_Man': '優雅男性',
  'Abbess': '女修道院長',
  'Sweet_Girl_2': '甜美女生2',
  'Exuberant_Girl': '熱情女生',
};

/** 取得音色的顯示名稱（voice_id + 中文） */
export function getVoiceDisplayName(voiceId: string): string {
  const cn = MINIMAX_VOICE_NAMES[voiceId];
  return cn ? `${voiceId}（${cn}）` : voiceId;
}

export const MINIMAX_LANGUAGES = [
  { value: '', label: '無' },
  { value: 'auto', label: '自動判斷（預設）' },
  // ── 常用語言 ──
  { value: 'Chinese', label: '中文（普通話）' },
  { value: 'Chinese,Yue', label: '中文（粵語）' },
  { value: 'English', label: '英語' },
  { value: 'Japanese', label: '日語' },
  { value: 'Korean', label: '韓語' },
  { value: 'French', label: '法語' },
  { value: 'Spanish', label: '西班牙語' },
  { value: 'Arabic', label: '阿拉伯語' },
  { value: 'Russian', label: '俄語' },
  { value: 'Portuguese', label: '葡萄牙語' },
  { value: 'German', label: '德語' },
  { value: 'Turkish', label: '土耳其語' },
  { value: 'Dutch', label: '荷蘭語' },
  { value: 'Ukrainian', label: '烏克蘭語' },
  { value: 'Vietnamese', label: '越南語' },
  { value: 'Indonesian', label: '印尼語' },
  { value: 'Italian', label: '義大利語' },
  { value: 'Thai', label: '泰語' },
  { value: 'Polish', label: '波蘭語' },
  { value: 'Romanian', label: '羅馬尼亞語' },
  { value: 'Greek', label: '希臘語' },
  // ── 其他語言 ──
  { value: 'Czech', label: '捷克語' },
  { value: 'Finnish', label: '芬蘭語' },
  { value: 'Hindi', label: '印地語' },
  { value: 'Bulgarian', label: '保加利亞語' },
  { value: 'Danish', label: '丹麥語' },
  { value: 'Hebrew', label: '希伯來語' },
  { value: 'Malay', label: '馬來語' },
  { value: 'Persian', label: '波斯語' },
  { value: 'Slovak', label: '斯洛伐克語' },
  { value: 'Swedish', label: '瑞典語' },
  { value: 'Croatian', label: '克羅埃西亞語' },
  { value: 'Filipino', label: '菲律賓語' },
  { value: 'Hungarian', label: '匈牙利語' },
  { value: 'Norwegian', label: '挪威語' },
  { value: 'Slovenian', label: '斯洛維尼亞語' },
  { value: 'Catalan', label: '加泰隆尼亞語' },
  { value: 'Nynorsk', label: '新挪威語' },
  { value: 'Tamil', label: '泰米爾語' },
  { value: 'Afrikaans', label: '南非語' },
];

// ── 預設設定 ──────────────────────────────────────────────────

export function createDefaultMiniMaxTTSSettings(): MiniMaxTTSSettings {
  return {
    apiKey: '',
    platform: 'io',
    proxyUrl: 'https://minimax.damoshenworkersdev.workers.dev',
    model: 'speech-2.8-hd',
    voiceId: 'Chinese (Mandarin)_Warm_Bestie',
    speed: 1.0,
    volume: 1.0,
    pitch: 0,
    languageBoost: 'auto',
    format: 'mp3',
    sampleRate: 32000,
    timberWeights: [],
    timberWeightsEnabled: false,
  };
}

// ── 工具函數 ──────────────────────────────────────────────────

const DIRECT_MAP: Record<MiniMaxPlatform, string> = {
  io: 'https://api.minimax.io/v1',
  cn: 'https://api.minimaxi.com/v1',
};

function getBaseUrl(settings: MiniMaxTTSSettings): string {
  const proxy = settings.proxyUrl?.trim().replace(/\/+$/, '');
  if (proxy) return `${proxy}/${settings.platform}/v1`;
  return DIRECT_MAP[settings.platform];
}

/** MiniMax 一次最多混合 4 種音色 */
export const MAX_TIMBRE_WEIGHTS = 4;

/** 取出這次要送的混合音色：沒開、沒填 voice_id 的都不算，比重取 1~100 的整數 */
export function getActiveTimbreWeights(
  settings: Pick<MiniMaxTTSSettings, 'timberWeights' | 'timberWeightsEnabled'>,
): { voice_id: string; weight: number }[] {
  if (!settings.timberWeightsEnabled) return [];
  return (settings.timberWeights ?? [])
    .filter((tw) => tw.voiceId?.trim() && tw.weight > 0)
    .slice(0, MAX_TIMBRE_WEIGHTS)
    .map((tw) => ({
      voice_id: tw.voiceId.trim(),
      weight: Math.min(100, Math.max(1, Math.round(tw.weight))),
    }));
}

/** API 接受的 emotion；fluent、whisper 只有 speech-2.6 系列能用 */
const MINIMAX_EMOTIONS = new Set([
  'happy', 'sad', 'angry', 'fearful', 'disgusted', 'surprised', 'calm', 'fluent', 'whisper',
]);

/**
 * 把 AI 標的情緒轉成這個模型收得下的值；auto、neutral、中文描述等一律回傳 undefined，
 * 交給模型自己判斷，避免整句因 invalid params 合成失敗。
 */
export function normalizeMiniMaxEmotion(raw: string | undefined, model: string): string | undefined {
  const v = raw?.trim().toLowerCase();
  if (!v || !MINIMAX_EMOTIONS.has(v)) return undefined;
  if ((v === 'fluent' || v === 'whisper') && !model.startsWith('speech-2.6')) return undefined;
  return v;
}

function clamp(value: number, min: number, max: number, fallback: number): number {
  return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
}

// ── 主要 API 函數 ─────────────────────────────────────────────

/**
 * 語音合成
 */
export async function synthesizeSpeech(
  text: string,
  settings: MiniMaxTTSSettings,
  options?: {
    emotion?: string;
    signal?: AbortSignal;
  },
): Promise<MiniMaxTTSResponse> {
  if (!settings.apiKey) {
    return { success: false, error: '缺少 MiniMax API Key' };
  }
  if (!text.trim()) {
    return { success: false, error: '文本為空' };
  }

  try {
    const baseUrl = getBaseUrl(settings);
    // AI 標的語速可能超出範圍，超出會讓整句失敗，所以夾在 API 允許的範圍內
    const voiceSetting: Record<string, unknown> = {
      voice_id: settings.voiceId,
      speed: Math.round(clamp(settings.speed, 0.5, 2, 1) * 100) / 100,
      vol: clamp(settings.volume, 0.01, 10, 1),
      pitch: Math.round(clamp(settings.pitch, -12, 12, 0)),
    };
    const emotion = normalizeMiniMaxEmotion(options?.emotion, settings.model);
    if (emotion) voiceSetting.emotion = emotion;

    const body: Record<string, unknown> = {
      model: settings.model,
      text,
      stream: false,
      voice_setting: voiceSetting,
      audio_setting: {
        format: settings.format,
        sample_rate: settings.sampleRate,
      },
      output_format: 'url',
    };

    // 音色混合：timbre_weights 放在請求體頂層（不是 voice_setting 裡），
    // 官方文件要求這時 voice_setting.voice_id 留空字串
    const timbreWeights = getActiveTimbreWeights(settings);
    if (timbreWeights.length > 0) {
      body.timbre_weights = timbreWeights;
      voiceSetting.voice_id = '';
    }

    // 只在有值時才傳 language_boost，空字串不傳
    if (settings.languageBoost) {
      body.language_boost = settings.languageBoost;
    }

    const request = async () => {
      const resp = await fetch(`${baseUrl}/t2a_v2`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${settings.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: options?.signal,
      });
      return resp.json();
    };

    let data = await request();
    // 音色或模型不接受這個 emotion 時，拿掉 emotion 重試一次，至少要念得出來
    if (
      voiceSetting.emotion &&
      data.base_resp?.status_code !== 0 &&
      /emotion/i.test(data.base_resp?.status_msg ?? '')
    ) {
      delete voiceSetting.emotion;
      data = await request();
    }

    if (data.base_resp?.status_code === 0 && data.data?.audio) {
      const dur = data.extra_info?.audio_length
        ? data.extra_info.audio_length / 1000
        : undefined;
      return {
        success: true,
        audioUrl: data.data.audio,
        duration: dur,
      };
    }

    return {
      success: false,
      error: data.base_resp?.status_msg || JSON.stringify(data),
    };
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      return { success: false, error: '已取消' };
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : '未知錯誤',
    };
  }
}

/**
 * 測試 API Key 是否有效（透過取得音色列表）
 */
export async function testConnection(settings: MiniMaxTTSSettings): Promise<boolean> {
  if (!settings.apiKey) return false;
  try {
    const baseUrl = getBaseUrl(settings);
    const resp = await fetch(`${baseUrl}/get_voice`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${settings.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ voice_type: 'all' }),
    });
    const data = await resp.json();
    return data.base_resp?.status_code === 0;
  } catch {
    return false;
  }
}

/** 音色資訊 */
export interface MiniMaxVoice {
  voice_id: string;
  name: string;
  language?: string;
  gender?: string;
  /** system=系統音色、cloning=複刻音色、generation=文字生成的音色 */
  voice_type?: 'system' | 'cloning' | 'generation';
  /** 複刻／生成音色的建立日期（yyyy-mm-dd） */
  created_time?: string;
}

/**
 * 獲取音色列表
 */
export async function fetchVoiceList(
  settings: MiniMaxTTSSettings,
): Promise<{ success: boolean; voices: MiniMaxVoice[]; error?: string }> {
  if (!settings.apiKey) {
    return { success: false, voices: [], error: '缺少 API Key' };
  }
  try {
    const baseUrl = getBaseUrl(settings);
    const resp = await fetch(`${baseUrl}/get_voice`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${settings.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ voice_type: 'all' }),
    });
    const data = await resp.json();
    if (data.base_resp?.status_code !== 0) {
      return {
        success: false,
        voices: [],
        error: data.base_resp?.status_msg || '請求失敗',
      };
    }
    // 解析音色列表：system_voice + voice_cloning（複刻）+ voice_generation（文字生成）
    const voices: MiniMaxVoice[] = [];
    for (const v of data.system_voice ?? []) {
      voices.push({
        voice_id: v.voice_id,
        name: v.voice_name || v.voice_id,
        voice_type: 'system',
      });
    }
    for (const [key, type] of [
      ['voice_cloning', 'cloning'],
      ['voice_generation', 'generation'],
    ] as const) {
      for (const v of data[key] ?? []) {
        voices.push({
          voice_id: v.voice_id,
          name: v.voice_id,
          voice_type: type,
          created_time: v.created_time,
        });
      }
    }
    return { success: true, voices };
  } catch (error) {
    return {
      success: false,
      voices: [],
      error: error instanceof Error ? error.message : '未知錯誤',
    };
  }
}

// ── 音色複刻 API ──────────────────────────────────────────────

export interface VoiceCloneResult {
  success: boolean;
  voiceId?: string;
  error?: string;
}

/** 複刻音頻限制：mp3／m4a／wav，10 秒～5 分鐘，20 MB 以內 */
export const VOICE_CLONE_LIMITS = {
  minSeconds: 10,
  maxSeconds: 300,
  maxBytes: 20 * 1024 * 1024,
  extensions: ['mp3', 'm4a', 'wav'],
} as const;

/**
 * 檢查複刻用的 voice_id 是否符合 MiniMax 規則，不合格回傳原因。
 * 規則：8～256 字、英文字母開頭、只能有英文／數字／-／_，不能以 - 或 _ 結尾。
 */
export function validateCloneVoiceId(voiceId: string): string | null {
  const id = voiceId.trim();
  if (id.length < 8) return '至少要 8 個字';
  if (id.length > 256) return '不能超過 256 個字';
  if (!/^[A-Za-z]/.test(id)) return '第一個字要是英文字母';
  if (!/^[A-Za-z0-9_-]+$/.test(id)) return '只能用英文、數字、- 和 _';
  if (/[-_]$/.test(id)) return '最後一個字不能是 - 或 _';
  return null;
}

/** 常見錯誤碼的白話說明 */
const CLONE_ERROR_HINTS: Record<number, string> = {
  1004: 'API Key 不對或沒帶到',
  1043: '音頻內容和驗證文字對不上',
  2013: '參數不對，常見原因：音頻太短或太長、格式不支援、voice_id 已經用過',
  2038: '這個帳號沒有複刻權限（通常要先完成實名認證）',
};

function describeError(data: any, fallback: string): string {
  const code = data?.base_resp?.status_code;
  const msg = data?.base_resp?.status_msg || fallback;
  const hint = typeof code === 'number' ? CLONE_ERROR_HINTS[code] : undefined;
  return hint ? `${hint}（${code}：${msg}）` : msg;
}

/**
 * 音色複刻：先把音頻上傳到 /files/upload（purpose=voice_clone）拿 file_id，
 * 再呼叫 /voice_clone 用 file_id 和自訂 voice_id 複刻。
 *
 * 注意：複刻出來的音色要在 7 天內用一般語音合成（t2a）用過一次才會永久保留，
 * 複刻費用也是在第一次合成時才扣；複刻時順便試聽的不算。
 */
export async function cloneVoice(
  settings: MiniMaxTTSSettings,
  file: File,
  voiceIdName: string,
  options?: {
    signal?: AbortSignal;
  },
): Promise<VoiceCloneResult> {
  if (!settings.apiKey) {
    return { success: false, error: '缺少 MiniMax API Key' };
  }
  if (!file) {
    return { success: false, error: '請選擇音頻檔案' };
  }
  const voiceId = voiceIdName.trim();
  const idError = validateCloneVoiceId(voiceId);
  if (idError) {
    return { success: false, error: `音色名稱${idError}` };
  }

  try {
    const baseUrl = getBaseUrl(settings);

    // 1. 上傳音頻
    const formData = new FormData();
    formData.append('purpose', 'voice_clone');
    formData.append('file', file);
    const uploadResp = await fetch(`${baseUrl}/files/upload`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${settings.apiKey}`,
      },
      body: formData,
      signal: options?.signal,
    });
    // file_id 是 int64，直接 JSON.parse 可能超過 JS 安全整數而失真，所以從原文取數字
    const uploadText = await uploadResp.text();
    const fileId = uploadText.match(/"file_id"\s*:\s*"?(\d+)/)?.[1];
    if (!fileId) {
      let uploadData: unknown;
      try {
        uploadData = JSON.parse(uploadText);
      } catch {
        uploadData = undefined;
      }
      return {
        success: false,
        error: `上傳音頻失敗：${describeError(uploadData, uploadText.slice(0, 200) || `HTTP ${uploadResp.status}`)}`,
      };
    }

    // 2. 複刻（file_id 原樣放進 JSON，不經過 Number 轉換）
    const resp = await fetch(`${baseUrl}/voice_clone`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${settings.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: `{"file_id":${fileId},"voice_id":${JSON.stringify(voiceId)}}`,
      signal: options?.signal,
    });

    const data = await resp.json();

    if (data.base_resp?.status_code === 0) {
      return { success: true, voiceId };
    }

    return {
      success: false,
      error: describeError(data, JSON.stringify(data)),
    };
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      return { success: false, error: '已取消' };
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : '未知錯誤',
    };
  }
}
