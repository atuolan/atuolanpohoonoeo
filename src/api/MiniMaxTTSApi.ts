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
  /** 音色混合（timber_weights），啟用後會覆蓋 voiceId */
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
  { value: '', label: '無（預設）' },
  { value: 'auto', label: '自動判斷' },
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
    languageBoost: '',
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
    const voiceSetting: Record<string, unknown> = {
      voice_id: settings.voiceId,
      speed: settings.speed,
      vol: settings.volume,
      pitch: settings.pitch,
    };
    if (options?.emotion) voiceSetting.emotion = options.emotion;

    // 如果啟用音色混合且有配置，使用 timber_weights 覆蓋 voice_id
    if (
      settings.timberWeightsEnabled &&
      settings.timberWeights?.length > 0
    ) {
      const validWeights = settings.timberWeights.filter(
        (tw) => tw.voiceId.trim() && tw.weight > 0,
      );
      if (validWeights.length > 0) {
        voiceSetting.timber_weights = validWeights.map((tw) => ({
          voice_id: tw.voiceId,
          weight: tw.weight,
        }));
        // timber_weights 模式下不需要 voice_id
        delete voiceSetting.voice_id;
      }
    }

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

    // 只在有值時才傳 language_boost，空字串不傳
    if (settings.languageBoost) {
      body.language_boost = settings.languageBoost;
    }

    const resp = await fetch(`${baseUrl}/t2a_v2`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${settings.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: options?.signal,
    });

    const data = await resp.json();

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
  voice_type?: string;
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
    // 解析音色列表（system_voice + user_voice）
    const voices: MiniMaxVoice[] = [];
    for (const v of data.system_voice ?? []) {
      voices.push({
        voice_id: v.voice_id,
        name: v.name || v.voice_id,
        language: v.language,
        gender: v.gender,
        voice_type: 'system',
      });
    }
    for (const v of data.user_voice ?? []) {
      voices.push({
        voice_id: v.voice_id,
        name: v.name || v.voice_id,
        voice_type: 'user',
      });
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

/**
 * 音色複刻：上傳音頻檔案，取得複刻後的 voice_id
 *
 * MiniMax voice_clone API：
 * - 需要 multipart/form-data
 * - file: 音頻檔案（mp3/wav/flac，建議 10 秒以上）
 * - voice_id: 自訂的音色名稱（英文+數字+底線）
 *
 * 複刻成功後回傳 voice_id，之後可直接用於 TTS 合成
 */
export async function cloneVoice(
  settings: MiniMaxTTSSettings,
  file: File,
  voiceIdName: string,
  options?: {
    /** 是否為即時複刻（instant clone），預設 true */
    instant?: boolean;
    /** 音色描述文字（可選） */
    text?: string;
    signal?: AbortSignal;
  },
): Promise<VoiceCloneResult> {
  if (!settings.apiKey) {
    return { success: false, error: '缺少 MiniMax API Key' };
  }
  if (!file) {
    return { success: false, error: '請選擇音頻檔案' };
  }
  if (!voiceIdName.trim()) {
    return { success: false, error: '請輸入音色名稱' };
  }

  try {
    const baseUrl = getBaseUrl(settings);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('voice_id', voiceIdName.trim());
    if (options?.text) {
      formData.append('text', options.text);
    }

    const resp = await fetch(`${baseUrl}/voice_clone`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${settings.apiKey}`,
      },
      body: formData,
      signal: options?.signal,
    });

    const data = await resp.json();

    if (data.base_resp?.status_code === 0) {
      return {
        success: true,
        voiceId: data.voice_id || voiceIdName.trim(),
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
