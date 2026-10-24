/**
 * NovelAI 圖像生成 API
 * 文檔: https://docs.novelai.net/image/
 */
import JSZip from 'jszip';

// ── 類型定義 ──────────────────────────────────────────────────

export type NovelAIModel =
  | 'nai-diffusion-3'
  | 'nai-diffusion-4-curated-preview'
  | 'nai-diffusion-4-full'
  | 'nai-diffusion-4-5-curated'
  | 'nai-diffusion-4-5-full'
  | 'nai-diffusion-5-full'
  | 'nai-diffusion-5-full-medium'
  | 'nai-diffusion-5-curated';

/** 負面提示詞預設（官方網頁版 params_version 4 送的 ucPresetId） */
export type NovelAIUcPresetId = 'heavy' | 'light' | 'human' | 'furry' | 'none';

/** 品質標籤預設（官方網頁版 params_version 4 送的 qualityPresetId） */
export type NovelAIQualityPreset = 'standard' | 'light' | 'none';

export interface NovelAIImageSettings {
  enabled: boolean;
  apiKey: string;
  model: NovelAIModel;
  width: number;
  height: number;
  steps: number;
  scale: number; // CFG Scale
  sampler: string;
  seed?: number;
  negativePrompt: string;
  // 正面提示詞前綴（固定加在所有生成前面）
  positivePromptPrefix: string;
  // 正面提示詞後綴（固定加在所有生成後面）
  positivePromptSuffix: string;
  // 是否注入當前使用者 tag
  useUserTag?: boolean;
  // 進階參數
  cfgRescale?: number;
  noiseSchedule?: string;
  dynamicThresholding?: boolean; // Decrisper
  varietyBoost?: boolean; // skip_cfg_above_sigma
  /** 品質標籤：加在提示詞最後（官方網頁版在送出前加，伺服器不會自己加） */
  qualityPreset?: NovelAIQualityPreset;
  /** 負面提示詞預設：加在負面提示詞前面（同上，送出前加） */
  ucPresetId?: NovelAIUcPresetId;
  /** @deprecated 舊版欄位，只用來轉換成 qualityPreset */
  qualityToggle?: boolean;
  /** @deprecated 舊版欄位（0=Heavy, 1=Light, 2=Human Focus, 3=None），只用來轉換成 ucPresetId */
  ucPreset?: number;
  /** 啟用代理模式：透過 Cloudflare Worker 轉發請求，大陸用戶免 VPN */
  useProxy?: boolean;
  /** Cloudflare Worker 代理地址，例如 https://nai-proxy.aguacloud.uk */
  proxyBaseUrl?: string;
  /**
   * 內部用：標記「代理預設值=ON 的一次性遷移已套用」
   * 載入時若為 false/undefined，會把 useProxy 強制設成 true 並寫入此旗標。
   * 之後使用者手動關閉就會永久保留，不會被反覆覆寫。
   */
  proxyDefaultEnforcedV1?: boolean;
  /**
   * API 來源：
   * - official：NovelAI 官方（可走代理）
   * - nai-compatible：第三方，NovelAI 原生格式（POST {customBaseUrl}/ai/generate-image）
   * - openai：第三方，OpenAI 圖片格式（POST {customBaseUrl}/images/generations）
   */
  apiSource?: NovelAIApiSource;
  /** 第三方 API 地址，例如 https://example.com/v1 */
  customBaseUrl?: string;
  /** OpenAI 格式用的模型名稱（由第三方決定，自由填寫） */
  openaiModel?: string;
}

export type NovelAIApiSource = 'official' | 'nai-compatible' | 'openai';

export interface NovelAIImageResponse {
  success: boolean;
  imageBase64?: string;
  error?: string;
}

// ── 常數 ──────────────────────────────────────────────────────

/** 舊版的預設負面提示詞；現在改用官方 Heavy 預設，只留著判斷使用者有沒有改過 */
export const DEFAULT_NEGATIVE_PROMPT =
  'lowres, bad anatomy, bad hands, text, error, missing fingers, extra digit, fewer digits, cropped, worst quality, low quality, normal quality, jpeg artifacts, signature, watermark, username, blurry';

// 與 novelai.js 一致的 User-Agent，避免被 API 擋掉
const NAI_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

export const AVAILABLE_SAMPLERS = [
  { value: 'k_euler', label: 'Euler' },
  { value: 'k_euler_ancestral', label: 'Euler Ancestral' },
  { value: 'k_dpmpp_2s_ancestral', label: 'DPM++ 2S Ancestral' },
  { value: 'k_dpmpp_2m_sde', label: 'DPM++ 2M SDE' },
  { value: 'k_dpmpp_2m', label: 'DPM++ 2M' },
  { value: 'k_dpmpp_sde', label: 'DPM++ SDE' },
  { value: 'ddim_v3', label: 'DDIM' },
];

export const AVAILABLE_MODELS: { value: NovelAIModel; label: string }[] = [
  { value: 'nai-diffusion-5-full', label: 'NAI Diffusion V5 Full' },
  { value: 'nai-diffusion-5-full-medium', label: 'NAI Diffusion V5 Full（快速）' },
  { value: 'nai-diffusion-5-curated', label: 'NAI Diffusion V5 Curated' },
  { value: 'nai-diffusion-4-5-full', label: 'NAI Diffusion V4.5 Full' },
  { value: 'nai-diffusion-4-5-curated', label: 'NAI Diffusion V4.5 Curated' },
  { value: 'nai-diffusion-4-full', label: 'NAI Diffusion V4 Full' },
  { value: 'nai-diffusion-4-curated-preview', label: 'NAI Diffusion V4 Curated' },
  { value: 'nai-diffusion-3', label: 'NAI Diffusion V3' },
];

export const NOISE_SCHEDULES = [
  { value: 'karras', label: 'Karras' },
  { value: 'exponential', label: 'Exponential' },
  { value: 'polyexponential', label: 'Polyexponential' },
  { value: 'native', label: 'Native' },
];

// ── 各模型的官方預設（對照 novelai.net 網頁版，資料來源 LlmKira/novelai-python） ──

export function isV5Model(model: string): boolean {
  return model.startsWith('nai-diffusion-5');
}

export function isKnownNovelAIModel(model: string): model is NovelAIModel {
  return AVAILABLE_MODELS.some((m) => m.value === model);
}

/** V5 Full 快速版：網頁版固定 14 步、Euler Ancestral、Heavy 負面預設 */
function isV5Medium(model: string): boolean {
  return model === 'nai-diffusion-5-full-medium';
}

/** V4 起不支援 Native 噪聲排程與 Decrisper */
export function isV3Model(model: string): boolean {
  return model === 'nai-diffusion-3';
}

/** V5 沒有 Variety Boost（網頁版 cfgDelay=false） */
export function supportsVarietyBoost(model: string): boolean {
  return !isV5Model(model);
}

const V5_UC_HEAVY =
  'nsfw, lowres, artistic error, film grain, scan artifacts, worst quality, bad quality, jpeg artifacts, very displeasing, chromatic aberration, dithering, halftone, screentone, multiple views, logo, too many watermarks, negative space, blank page';
const FURRY_FOCUS_UC =
  'nsfw, {worst quality}, distracting watermark, unfinished, bad quality, {widescreen}, upscale, {sequence}, {{grandfathered content}}, blurred foreground, chromatic aberration, sketch, everyone, [sketch background], simple, [flat colors], ych (character), outline, multiple scenes, [[horror (theme)]], comic';

/** 每個模型可選的負面預設與文字；順序就是網頁版選單順序 */
const UC_PRESET_TEXTS: Record<NovelAIModel, Partial<Record<NovelAIUcPresetId, string>>> = {
  'nai-diffusion-3': {
    heavy:
      'nsfw, lowres, {bad}, error, fewer, extra, missing, worst quality, jpeg artifacts, bad quality, watermark, unfinished, displeasing, chromatic aberration, signature, extra digits, artistic error, username, scan, [abstract]',
    light: 'nsfw, lowres, jpeg artifacts, worst quality, watermark, blurry, very displeasing',
    human:
      'nsfw, lowres, {bad}, error, fewer, extra, missing, worst quality, jpeg artifacts, bad quality, watermark, unfinished, displeasing, chromatic aberration, signature, extra digits, artistic error, username, scan, [abstract], bad anatomy, bad hands, @_@, mismatched pupils, heart-shaped pupils, glowing eyes',
    // V3 選「無」時網頁版仍會補 lowres（只在使用者負面提示詞是空的時候）
    none: 'lowres',
  },
  'nai-diffusion-4-curated-preview': {
    heavy:
      'blurry, lowres, error, film grain, scan artifacts, worst quality, bad quality, jpeg artifacts, very displeasing, chromatic aberration, logo, dated, signature, multiple views, gigantic breasts',
    light:
      'blurry, lowres, error, worst quality, bad quality, jpeg artifacts, very displeasing, logo, dated, signature',
    none: '',
  },
  'nai-diffusion-4-full': {
    heavy:
      'nsfw, blurry, lowres, error, film grain, scan artifacts, worst quality, bad quality, jpeg artifacts, very displeasing, chromatic aberration, multiple views, logo, too many watermarks, white blank page, blank page',
    light:
      'nsfw, blurry, lowres, error, worst quality, bad quality, jpeg artifacts, very displeasing, white blank page, blank page',
    none: '',
  },
  'nai-diffusion-4-5-curated': {
    heavy:
      'blurry, lowres, upscaled, artistic error, film grain, scan artifacts, worst quality, bad quality, jpeg artifacts, very displeasing, chromatic aberration, halftone, multiple views, logo, too many watermarks, negative space, blank page',
    light:
      'blurry, lowres, upscaled, artistic error, scan artifacts, jpeg artifacts, logo, too many watermarks, negative space, blank page',
    human:
      'blurry, lowres, upscaled, artistic error, film grain, scan artifacts, bad anatomy, bad hands, worst quality, bad quality, jpeg artifacts, very displeasing, chromatic aberration, halftone, multiple views, logo, too many watermarks, @_@, mismatched pupils, glowing eyes, negative space, blank page',
    none: '',
  },
  'nai-diffusion-4-5-full': {
    heavy: V5_UC_HEAVY,
    light:
      'nsfw, lowres, artistic error, scan artifacts, worst quality, bad quality, jpeg artifacts, multiple views, very displeasing, too many watermarks, negative space, blank page',
    furry: FURRY_FOCUS_UC,
    human: `${V5_UC_HEAVY}, @_@, mismatched pupils, glowing eyes, bad anatomy`,
    none: '',
  },
  'nai-diffusion-5-full': {},
  'nai-diffusion-5-full-medium': {},
  'nai-diffusion-5-curated': {},
};
const V5_UC_PRESETS: Partial<Record<NovelAIUcPresetId, string>> = {
  heavy: V5_UC_HEAVY,
  light:
    'nsfw, lowres, bad hands, bad anatomy, artistic error, sepia, white haze, worst quality, very displeasing, jpeg artifacts, 0::ai-generated::',
  furry: FURRY_FOCUS_UC,
  human: `${V5_UC_HEAVY}, @_@, mismatched pupils, glowing eyes, bad anatomy`,
  none: '',
};
UC_PRESET_TEXTS['nai-diffusion-5-full'] = V5_UC_PRESETS;
UC_PRESET_TEXTS['nai-diffusion-5-full-medium'] = V5_UC_PRESETS;
UC_PRESET_TEXTS['nai-diffusion-5-curated'] = V5_UC_PRESETS;

const UC_PRESET_LABELS: Record<NovelAIUcPresetId, string> = {
  heavy: 'Heavy',
  light: 'Light',
  human: 'Human Focus',
  furry: 'Furry Focus',
  none: '無',
};

/** 品質標籤（加在提示詞最後）；V5 才有 Light */
const QUALITY_SUFFIXES: Record<NovelAIModel, Partial<Record<NovelAIQualityPreset, string>>> = {
  'nai-diffusion-3': { standard: 'best quality, amazing quality, very aesthetic, absurdres' },
  'nai-diffusion-4-curated-preview': { standard: 'rating:general, amazing quality, very aesthetic, absurdres' },
  'nai-diffusion-4-full': { standard: 'no text, best quality, very aesthetic, absurdres' },
  'nai-diffusion-4-5-curated': { standard: 'location, masterpiece, no text, -0.8::feet::, rating:general' },
  'nai-diffusion-4-5-full': { standard: 'location, very aesthetic, masterpiece, no text' },
  'nai-diffusion-5-full': {},
  'nai-diffusion-5-full-medium': {},
  'nai-diffusion-5-curated': {},
};
const V5_QUALITY: Partial<Record<NovelAIQualityPreset, string>> = {
  standard: 'very aesthetic, masterpiece, no text',
  light: 'very aesthetic, amazing quality, no text',
};
QUALITY_SUFFIXES['nai-diffusion-5-full'] = V5_QUALITY;
QUALITY_SUFFIXES['nai-diffusion-5-full-medium'] = V5_QUALITY;
QUALITY_SUFFIXES['nai-diffusion-5-curated'] = V5_QUALITY;

const QUALITY_LABELS: Record<NovelAIQualityPreset, string> = {
  standard: '標準',
  light: '輕量',
  none: '關閉',
};

export function getUcPresetOptions(model: string): { value: NovelAIUcPresetId; label: string }[] {
  if (!isKnownNovelAIModel(model)) return [];
  return (Object.keys(UC_PRESET_TEXTS[model]) as NovelAIUcPresetId[]).map((id) => ({
    value: id,
    label: UC_PRESET_LABELS[id],
  }));
}

export function getQualityPresetOptions(model: string): { value: NovelAIQualityPreset; label: string }[] {
  if (!isKnownNovelAIModel(model)) return [];
  const ids = [...(Object.keys(QUALITY_SUFFIXES[model]) as NovelAIQualityPreset[]), 'none' as const];
  return ids.map((id) => ({ value: id, label: QUALITY_LABELS[id] }));
}

/** 這個模型實際要用的負面預設：選的不存在時退回 Heavy（快速版固定 Heavy） */
export function resolveUcPresetId(model: NovelAIModel, preset?: NovelAIUcPresetId): NovelAIUcPresetId {
  if (isV5Medium(model)) return 'heavy';
  const available = UC_PRESET_TEXTS[model];
  if (preset && preset in available) return preset;
  return 'heavy';
}

/** 這個模型實際要用的品質標籤：Light 只有 V5，其他模型退回標準 */
export function resolveQualityPreset(model: NovelAIModel, preset?: NovelAIQualityPreset): NovelAIQualityPreset {
  if (!preset || preset === 'none') return preset ?? 'standard';
  return preset in QUALITY_SUFFIXES[model] ? preset : 'standard';
}

/** 照網頁版在提示詞最後補品質標籤；已經有了就不重複加 */
function applyQualityTags(prompt: string, model: NovelAIModel, preset: NovelAIQualityPreset): string {
  const suffix = QUALITY_SUFFIXES[model][preset];
  if (!suffix || prompt.includes(suffix)) return prompt;
  return prompt ? `${prompt}, ${suffix}` : suffix;
}

/**
 * 照網頁版組負面提示詞：預設文字在前、使用者的在後。
 * 提示詞本身要 nsfw 時，預設裡的 nsfw 拿掉（網頁版同樣處理）。
 */
function buildNegativePrompt(
  model: NovelAIModel,
  presetId: NovelAIUcPresetId,
  userNegative: string,
  prompt: string,
): string {
  let presetText = UC_PRESET_TEXTS[model][presetId] ?? '';
  const userText = userNegative.trim();
  if (presetText === 'lowres' && userText) presetText = '';
  if (/\bnsfw\b/i.test(prompt)) {
    presetText = presetText
      .split(',')
      .map((t) => t.trim())
      .filter((t) => t && t.toLowerCase() !== 'nsfw')
      .join(', ');
  }
  return [presetText, userText].filter(Boolean).join(', ');
}

/**
 * 把存檔／匯入的設定套進 target，並把舊欄位轉成新欄位：
 * qualityToggle → qualityPreset、ucPreset 編號 → ucPresetId。
 * 要看 saved 本身有沒有新欄位，不能看 target（target 已經有新預設值）。
 */
export function applySavedNovelAIImageSettings(
  target: NovelAIImageSettings,
  saved: Partial<NovelAIImageSettings>,
): void {
  Object.assign(target, saved);
  if (!saved.qualityPreset) {
    target.qualityPreset = saved.qualityToggle === false ? 'none' : 'standard';
  }
  if (!saved.ucPresetId) {
    const legacyPreset = saved.ucPreset ?? 3;
    const untouchedDefaults =
      legacyPreset === 3 && (saved.negativePrompt ?? DEFAULT_NEGATIVE_PROMPT) === DEFAULT_NEGATIVE_PROMPT;
    if (untouchedDefaults) {
      // 從沒改過舊預設（「無」＋舊版負面提示詞）：換成官方預設，避免跟 Heavy 重複
      target.ucPresetId = 'heavy';
      target.negativePrompt = '';
    } else {
      const legacy: NovelAIUcPresetId[] = ['heavy', 'light', 'human', 'none'];
      target.ucPresetId = legacy[legacyPreset] ?? 'none';
    }
  }
  if (target.scale > 10) target.scale = 10;
}

export const PRESET_SIZES = [
  { label: '直式 (832×1216)', width: 832, height: 1216 },
  { label: '橫式 (1216×832)', width: 1216, height: 832 },
  { label: '正方形 (1024×1024)', width: 1024, height: 1024 },
  { label: '小直式 (512×768)', width: 512, height: 768 },
  { label: '小橫式 (768×512)', width: 768, height: 512 },
];

// ── 預設設定 ──────────────────────────────────────────────────

export function createDefaultNovelAIImageSettings(): NovelAIImageSettings {
  return {
    enabled: false,
    apiKey: '',
    model: 'nai-diffusion-4-5-curated',
    width: 832,
    height: 1216,
    steps: 28,
    scale: 5,
    sampler: 'k_euler_ancestral',
    // 官方預設：負面用 Heavy 預設，使用者自己的負面提示詞留空
    negativePrompt: '',
    positivePromptPrefix: '',
    positivePromptSuffix: '',
    useUserTag: false,
    cfgRescale: 0,
    noiseSchedule: 'karras',
    dynamicThresholding: false,
    varietyBoost: true,
    qualityPreset: 'standard',
    ucPresetId: 'heavy',
    useProxy: true,
    proxyDefaultEnforcedV1: true,
    apiSource: 'official',
    customBaseUrl: '',
    openaiModel: '',
  };
}

// ── 代理工具 ──────────────────────────────────────────────────

/** 預設 Cloudflare Worker 代理地址（部署後改成你的實際域名） */
const DEFAULT_PROXY_BASE = 'https://nai-proxy.aguacloud.uk';

/**
 * 將 NovelAI URL 轉為代理 URL
 * useProxy=true 時走 Cloudflare Worker，否則直連
 *
 * 例如：
 *   https://image.novelai.net/ai/generate-image
 *   → https://nai-proxy.aguacloud.uk/nai/ai/generate-image
 *
 *   https://api.novelai.net/user/subscription
 *   → https://nai-proxy.aguacloud.uk/nai/user/subscription
 */
function toProxyUrl(url: string, useProxy: boolean, proxyBase?: string): string {
  if (!useProxy) return url;
  try {
    const parsed = new URL(url);
    const base = (proxyBase || DEFAULT_PROXY_BASE).replace(/\/+$/, '');
    return `${base}/nai${parsed.pathname}`;
  } catch {
    return url;
  }
}

// ── 工具函數 ──────────────────────────────────────────────────

/**
 * 根據模型計算 skip_cfg_above_sigma（Variety Boost）
 * 照網頁版：基準值（V3/V4 = 19、V4.5 = 58）依圖片面積相對 832×1216 縮放後無條件進位；V5 不支援
 */
function getSkipCfgAboveSigma(model: NovelAIModel, width: number, height: number): number | null {
  if (!supportsVarietyBoost(model)) return null;
  const base = model.startsWith('nai-diffusion-4-5') ? 58 : 19;
  return Math.ceil(base * Math.sqrt((width * height) / (832 * 1216)));
}

/**
 * 按層級組裝最終 prompt（角色 -> 使用者 -> 全域前綴 -> 主體 -> 全域後綴）
 */
function buildPromptWithTags(
  imagePrompt: string,
  settings: NovelAIImageSettings,
  characterPrompt?: string,
  userPrompt?: string,
): string {
  const splitParts = (input?: string): string[] =>
    (input || "")
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);

  const orderedParts = [
    ...splitParts(characterPrompt),
    ...splitParts(userPrompt),
    ...splitParts(settings.positivePromptPrefix),
    ...splitParts(imagePrompt),
    ...splitParts(settings.positivePromptSuffix),
  ];

  // 以不區分大小寫方式去重，保留第一次出現順序
  const deduped: string[] = [];
  const seen = new Set<string>();
  for (const part of orderedParts) {
    const key = part.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(part);
  }

  return deduped.join(", ");
}

/**
 * 建立完整的 parameters payload，對齊 novelai.net 網頁版（params_version 4）。
 * 品質標籤與負面預設由呼叫端先套進 prompt / negativePrompt，這裡只送預設名稱。
 */
function buildParameters(
  prompt: string,
  negativePrompt: string,
  settings: NovelAIImageSettings,
  presets: { ucPresetId: NovelAIUcPresetId; qualityPreset: NovelAIQualityPreset },
): object {
  const model = settings.model;
  const isV3 = isV3Model(model);
  const isV5 = isV5Model(model);
  const isMedium = isV5Medium(model);

  const seed = settings.seed && settings.seed > 0
    ? settings.seed
    : Math.floor(Math.random() * (4294967295 - 7)) + 1;

  // 快速版網頁版固定 14 步、Euler Ancestral
  const sampler = isMedium ? 'k_euler_ancestral' : settings.sampler;
  const steps = isMedium ? 14 : settings.steps;
  // API 的 scale 上限是 10
  const scale = Math.min(Math.max(settings.scale, 0), 10);

  // DDIM 不帶噪聲排程；V4 起沒有 Native，改用 Karras
  let noiseSchedule: string | undefined = settings.noiseSchedule ?? 'karras';
  if (sampler === 'ddim_v3') noiseSchedule = undefined;
  else if (!isV3 && noiseSchedule === 'native') noiseSchedule = 'karras';

  const legacyUc = model === 'nai-diffusion-4-full' || model === 'nai-diffusion-4-curated-preview';

  const base: Record<string, unknown> = {
    params_version: 4,
    width: settings.width,
    height: settings.height,
    scale,
    sampler,
    steps,
    n_samples: 1,
    ucPresetId: presets.ucPresetId,
    qualityPresetId: presets.qualityPreset,
    autoSmea: false,
    // Decrisper 只有 V3 支援
    dynamic_thresholding: isV3 ? settings.dynamicThresholding ?? false : false,
    controlnet_strength: 1,
    legacy: false,
    add_original_image: true,
    cfg_rescale: settings.cfgRescale ?? 0,
    ...(noiseSchedule && { noise_schedule: noiseSchedule }),
    legacy_v3_extend: false,
    skip_cfg_above_sigma: settings.varietyBoost
      ? getSkipCfgAboveSigma(model, settings.width, settings.height)
      : null,
    seed,
    negative_prompt: negativePrompt,
    image_format: 'png',
    // Euler Ancestral 修正
    ...(sampler === 'k_euler_ancestral' && noiseSchedule !== 'native' && {
      deliberate_euler_ancestral_bug: false,
      prefer_brownian: true,
    }),
  };

  if (isV3) {
    return {
      ...base,
      // 網頁版 V3 預設不開 SMEA
      sm: false,
      sm_dyn: false,
      reference_image_multiple: [],
      reference_information_extracted_multiple: [],
      reference_strength_multiple: [],
    };
  }

  // V4 / V4.5 / V5 使用 v4_prompt 結構
  return {
    ...base,
    use_coords: false,
    legacy_uc: legacyUc,
    normalize_reference_strength_multiple: true,
    inpaintImg2ImgStrength: 1,
    characterPrompts: [],
    tag_hint_qt: 1,
    tag_hint_uc_preset: 2,
    ...(isV5 && { straight_alpha: true }),
    v4_prompt: {
      caption: { base_caption: prompt, char_captions: [] },
      use_coords: false,
      use_order: true,
    },
    v4_negative_prompt: {
      caption: { base_caption: negativePrompt, char_captions: [] },
      legacy_uc: legacyUc,
    },
  };
}

/**
 * 使用 JSZip 解壓 NovelAI 回傳的 zip，取得圖片 base64
 */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function startsWithBytes(bytes: Uint8Array, magic: number[], offset = 0): boolean {
  return magic.every((b, i) => bytes[offset + i] === b);
}

/** 直接是圖片檔（PNG / JPEG / WEBP / GIF）就回傳 true */
function isRawImage(bytes: Uint8Array): boolean {
  return (
    startsWithBytes(bytes, [0x89, 0x50, 0x4e, 0x47]) ||
    startsWithBytes(bytes, [0xff, 0xd8, 0xff]) ||
    (startsWithBytes(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWithBytes(bytes, [0x57, 0x45, 0x42, 0x50], 8)) ||
    startsWithBytes(bytes, [0x47, 0x49, 0x46, 0x38])
  );
}

/** 把圖片 URL（http 或 data:）轉成 base64 */
async function imageUrlToBase64(url: string): Promise<string | null> {
  const dataMatch = url.match(/^data:[^;,]*;base64,(.*)$/);
  if (dataMatch) return dataMatch[1];
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return arrayBufferToBase64(await res.arrayBuffer());
  } catch (err) {
    console.error('[NovelAI] 下載圖片網址失敗:', err);
    return null;
  }
}

/**
 * 從 JSON 回應找圖片：
 * OpenAI 格式 { data: [{ b64_json | url }] }，也容忍 { images: [...] }、{ image: ... }
 */
async function extractImageFromJson(json: unknown): Promise<string | null> {
  if (!json || typeof json !== 'object') return null;
  const obj = json as Record<string, unknown>;
  const candidates: unknown[] = [];
  if (Array.isArray(obj.data)) candidates.push(obj.data[0]);
  if (Array.isArray(obj.images)) candidates.push(obj.images[0]);
  candidates.push(obj.image, obj.b64_json, obj.url);

  for (const item of candidates) {
    if (!item) continue;
    if (typeof item === 'string') {
      if (/^(https?:|data:)/.test(item)) return imageUrlToBase64(item);
      return item;
    }
    if (typeof item === 'object') {
      const entry = item as Record<string, unknown>;
      if (typeof entry.b64_json === 'string' && entry.b64_json) return entry.b64_json;
      if (typeof entry.url === 'string' && entry.url) return imageUrlToBase64(entry.url);
    }
  }
  return null;
}

/** 依回應內容判斷是 ZIP、圖片檔還是 JSON，取出 base64 圖片 */
async function extractImageFromResponse(arrayBuffer: ArrayBuffer): Promise<string | null> {
  const bytes = new Uint8Array(arrayBuffer);
  if (startsWithBytes(bytes, [0x50, 0x4b])) return extractImageFromZip(arrayBuffer);
  if (isRawImage(bytes)) return arrayBufferToBase64(arrayBuffer);
  try {
    const text = new TextDecoder().decode(bytes);
    return await extractImageFromJson(JSON.parse(text));
  } catch {
    console.error('[NovelAI] 無法辨識的回應格式');
    return null;
  }
}

/** 第三方地址去掉結尾斜線 */
function normalizeBaseUrl(url?: string): string {
  return (url || '').trim().replace(/\/+$/, '');
}

async function extractImageFromZip(arrayBuffer: ArrayBuffer): Promise<string | null> {
  try {
    const zip = await JSZip.loadAsync(arrayBuffer);
    const files = Object.values(zip.files).filter((f) => !f.dir);
    if (files.length === 0) {
      console.error('[NovelAI] ZIP 內沒有檔案');
      return null;
    }
    return await files[0].async('base64');
  } catch (err) {
    console.error('[NovelAI] 解壓失敗:', err);
    return null;
  }
}

/**
 * 帶重試的 fetch，處理 429 / 5xx
 * 移植自 novelai.js 的重試邏輯
 * 增強版：更多重試次數和更智能的等待策略
 * iOS Safari 優化：更短的等待時間
 */
async function fetchWithRetry(
  url: string,
  init: RequestInit,
  maxRetries = 3, // 從 1 增加到 3
): Promise<Response> {
  let lastResponse: Response | null = null;
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, init);

      if (response.ok) return response;

      lastResponse = response;

      // 429 Rate Limit
      if (response.status === 429) {
        const retryAfter = response.headers.get('retry-after');
        // iOS: 使用更短的等待時間
        const baseWait = isIOS ? 8000 : 10000;
        const waitMs = retryAfter ? Number(retryAfter) * 1000 : baseWait * (attempt + 1);
        console.warn(`[NovelAI] 429 Rate Limit，${waitMs / 1000}s 後重試 (${attempt + 1}/${maxRetries})...`);
        if (attempt < maxRetries) {
          await new Promise((r) => setTimeout(r, waitMs));
          continue;
        }
      }

      // 503 Service Unavailable（特別處理，使用更長的等待時間）
      if (response.status === 503) {
        // iOS: 使用更短的等待時間 (8s, 16s) vs Android (10s, 20s, 30s)
        const baseWait = isIOS ? 8000 : 10000;
        const waitMs = baseWait * (attempt + 1);
        console.warn(`[NovelAI] 503 服務不可用，${waitMs / 1000}s 後重試 (${attempt + 1}/${maxRetries})...`);
        if (attempt < maxRetries) {
          await new Promise((r) => setTimeout(r, waitMs));
          continue;
        }
      }

      // 其他 5xx Server Error
      if (response.status >= 500 && attempt < maxRetries) {
        // iOS: 使用更短的等待時間
        const baseWait = isIOS ? 4000 : 5000;
        const waitMs = baseWait * (attempt + 1);
        console.warn(`[NovelAI] ${response.status} 伺服器錯誤，${waitMs / 1000}s 後重試 (${attempt + 1}/${maxRetries})...`);
        await new Promise((r) => setTimeout(r, waitMs));
        continue;
      }

      return response;
    } catch (networkErr) {
      if (attempt < maxRetries) {
        // iOS: 使用更短的等待時間
        const baseWait = isIOS ? 1500 : 2000;
        const waitMs = baseWait * (attempt + 1);
        console.warn(`[NovelAI] 網路錯誤，${waitMs / 1000}s 後重試 (${attempt + 1}/${maxRetries})...`, networkErr);
        await new Promise((r) => setTimeout(r, waitMs));
        continue;
      }
      throw networkErr;
    }
  }

  return lastResponse!;
}

/**
 * 解析 API 錯誤，回傳友善訊息
 *
 * 503 來源分辨：
 *  - SW 合成 503（body 為純文字 "Network error"）：通常代表跨域請求在
 *    Service Worker 層被攔截後 fetch reject，真實原因可能是 CORS preflight
 *    被擋、網路斷線、或 PWA 背景凍結。
 *  - Cloudflare Worker 回 503（body 為 JSON、含 upstream_status）：
 *    代表 Worker 代理到 NovelAI 時多次拿到 503，多半是 NAI 負載過高。
 *  - NovelAI 上游 503（其他）：直接顯示原文。
 */
/** 從錯誤回應取出伺服器給的訊息（NovelAI 是 { message }，OpenAI／New API 是 { error: { message } }） */
function extractErrorDetail(text: string): string {
  try {
    const json = JSON.parse(text);
    if (typeof json?.message === 'string') return json.message;
    if (typeof json?.error === 'string') return json.error;
    if (typeof json?.error?.message === 'string') return json.error.message;
  } catch {
    // 非 JSON
  }
  return text.trim().slice(0, 300);
}

async function parseApiError(response: Response): Promise<string> {
  const text = await response.text().catch(() => '');
  const detail = extractErrorDetail(text);
  switch (response.status) {
    case 400: return `請求驗證失敗: ${detail}`;
    case 401: return `API Key 錯誤或無效，請檢查設定${detail ? `\n${detail}` : ''}`;
    case 404: return `找不到 API 路徑 (404)，請確認 API 地址與格式是否選對${detail ? `\n${detail}` : ''}`;
    case 402: return '需要有效訂閱才能使用此功能';
    case 429: return `請求過於頻繁 (429)，請稍後再試（已自動重試 3 次）`;
    case 500: return '伺服器內部錯誤 (500)，請稍後再試（已自動重試 3 次）';
    case 502: return '伺服器暫時無法連線 (502)，請稍後再試（已自動重試 3 次）';
    case 503: {
      // SW 合成 503（公開字樣："Network error"），代表根本沒發出去
      if (text.trim() === 'Network error') {
        return '網路請求未送達 (SW-503)\n\n可能原因：\n1. CORS preflight 被代理端拒絕\n2. PWA 在背景被凍結 / 網路中斷\n3. 代理網址無法解析\n\n建議：切換網絡環境重試，或暫時關閉「使用代理」改為直連測試';
      }
      // Cloudflare Worker 診斷 JSON
      try {
        const json = JSON.parse(text);
        if (json && typeof json === 'object' && 'upstream_status' in json) {
          const msg = json.message || json.error || '服務暫時不可用';
          return `NovelAI 上游 503\n${msg}\n建議：${json.suggestion || '稍後重試或切換網絡環境'}`;
        }
      } catch {
        // 非 JSON，走預設
      }
      // 第三方中轉站（New API 等）會在 error.message 說明原因，例如沒有可用渠道
      if (text.trim().startsWith('{') && detail) {
        return `服務暫時不可用 (503)\n${detail}`;
      }
      return '服務暫時不可用 (503)\n\n可能原因：\n1. NovelAI 服務器負載過高\n2. 網絡連接不穩定\n3. API Key 使用頻率過高\n\n建議：稍後重試或切換網絡環境（已自動重試 3 次，每次等待 10-30 秒）';
    }
    default:  return `生成失敗: ${response.status} ${response.statusText}${detail ? `\n${detail}` : ''}`;
  }
}

// ── 主要 API 函數 ─────────────────────────────────────────────

/**
 * 生成圖像
 */
export async function generateImage(
  prompt: string,
  settings: NovelAIImageSettings,
  tagPrompts?: {
    characterPrompt?: string;
    userPrompt?: string;
  },
): Promise<NovelAIImageResponse> {
  if (!settings.enabled || !settings.apiKey) {
    return { success: false, error: '文生圖功能未啟用或缺少 API Key' };
  }

  try {
    const basePrompt = buildPromptWithTags(
      prompt,
      settings,
      tagPrompts?.characterPrompt,
      tagPrompts?.userPrompt,
    );
    const apiSource = settings.apiSource ?? 'official';
    const openaiModel = settings.openaiModel?.trim() ?? '';

    // 品質標籤與負面預設照網頁版在送出前套上；OpenAI 格式只有模型名稱是 NAI 模型才套
    const presetModel = apiSource === 'openai'
      ? (isKnownNovelAIModel(openaiModel) ? openaiModel : null)
      : (isKnownNovelAIModel(settings.model) ? settings.model : null);
    const ucPresetId = presetModel ? resolveUcPresetId(presetModel, settings.ucPresetId) : 'none';
    const qualityPreset = presetModel ? resolveQualityPreset(presetModel, settings.qualityPreset) : 'none';
    const finalPrompt = presetModel
      ? applyQualityTags(basePrompt, presetModel, qualityPreset)
      : basePrompt;
    const negativePrompt = presetModel
      ? buildNegativePrompt(presetModel, ucPresetId, settings.negativePrompt || '', basePrompt)
      : (settings.negativePrompt || '');
    const customBase = normalizeBaseUrl(settings.customBaseUrl);
    if (apiSource !== 'official' && !customBase) {
      return { success: false, error: '使用第三方 API 時請先填寫 API 地址' };
    }
    if (apiSource === 'openai' && !settings.openaiModel?.trim()) {
      return { success: false, error: '使用 OpenAI 格式時請先填寫模型名稱' };
    }
    // 第三方一律直連，不走我們的 NovelAI 代理
    const useProxy = apiSource === 'official' && (settings.useProxy ?? false);

    // iOS Safari 特殊處理：添加 keepalive 和更短的重試次數
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    const maxRetries = isIOS ? 2 : 3; // iOS: 2次重試, 其他: 3次

    let requestUrl: string;
    let requestBody: string | FormData;
    if (apiSource === 'openai') {
      requestUrl = `${customBase}/images/generations`;
      requestBody = JSON.stringify({
        model: openaiModel,
        prompt: finalPrompt,
        negative_prompt: negativePrompt,
        n: 1,
        size: `${settings.width}x${settings.height}`,
      });
    } else {
      requestUrl = apiSource === 'nai-compatible'
        ? `${customBase}/ai/generate-image`
        : toProxyUrl('https://image.novelai.net/ai/generate-image', useProxy, settings.proxyBaseUrl);
      const requestJson = JSON.stringify({
        input: finalPrompt,
        model: settings.model,
        action: 'generate',
        parameters: buildParameters(finalPrompt, negativePrompt, settings, { ucPresetId, qualityPreset }),
      });
      if (apiSource === 'official') {
        // 官方網頁版 params_version 4 用 multipart/form-data，JSON 放在名為 request 的欄位
        const form = new FormData();
        form.append('request', new Blob([requestJson], { type: 'application/json' }), 'blob');
        requestBody = form;
      } else {
        // 第三方中轉站多半只解析 JSON
        requestBody = requestJson;
      }
    }
    const isMultipart = requestBody instanceof FormData;

    // 注意：瀏覽器端 fetch 無法可靠地自訂 'User-Agent'（屬於 forbidden header）。
    // 在部分 iOS WebView 容器中，嘗試設置可能引發不可預期的代理/WAF 行為，導致 5xx（含 503）。
    // 若需要偽裝 UA，應改在 Cloudflare Worker 轉發時注入，而非前端。
    const response = await fetchWithRetry(
      requestUrl,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${settings.apiKey}`,
          // multipart 的 Content-Type（含 boundary）交給瀏覽器自己帶
          ...(!isMultipart && { 'Content-Type': 'application/json' }),
          Accept: '*/*',
          // 'User-Agent': NAI_USER_AGENT,
          // 診斷用：讓代理端/日誌可識別此客戶端來源
          'X-Aguaphone-Client': 'aguaphone-pwa',
        },
        body: requestBody,
        // iOS Safari/WebView: 使用 keepalive 防止連接被提前關閉
        ...(isIOS && { keepalive: true }),
      },
      maxRetries,
    );

    if (!response.ok) {
      const errorMsg = await parseApiError(response);

      // 補充診斷資訊：用來判斷 503 來源是 NovelAI 還是 Cloudflare/Worker
      // 這些 header 多半不含敏感資訊，可協助你定位：
      // - server / cf-ray / cf-cache-status / via
      const diagHeaders = {
        server: response.headers.get('server'),
        'cf-ray': response.headers.get('cf-ray'),
        'cf-cache-status': response.headers.get('cf-cache-status'),
        via: response.headers.get('via'),
      };

      console.error('[NovelAI] 生成失敗:', {
        status: response.status,
        errorMsg,
        requestUrl,
        useProxy,
        diagHeaders,
      });

      return {
        success: false,
        error:
          response.status === 503
            ? `${errorMsg}\n\n[診斷] url=${requestUrl}\n[診斷] headers=${JSON.stringify(diagHeaders)}`
            : errorMsg,
      };
    }

    const arrayBuffer = await response.arrayBuffer();
    const imageBase64 = await extractImageFromResponse(arrayBuffer);

    if (!imageBase64) {
      return { success: false, error: '無法解析生成的圖片' };
    }

    return { success: true, imageBase64 };
  } catch (error) {
    console.error('[NovelAI] 生成錯誤:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : '未知錯誤',
    };
  }
}

/**
 * 測試 API Key 是否有效
 */
export async function testApiKey(apiKey: string, useProxy = false, proxyBaseUrl?: string): Promise<boolean> {
  try {
    const response = await fetch(toProxyUrl('https://api.novelai.net/user/subscription', useProxy, proxyBaseUrl), {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'User-Agent': NAI_USER_AGENT,
      },
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * 第三方（OpenAI 格式）取得模型清單：GET {baseUrl}/models
 * 同時可用來確認地址與 Key 是否正確
 */
export async function fetchThirdPartyModels(baseUrl: string, apiKey: string): Promise<string[]> {
  const base = normalizeBaseUrl(baseUrl);
  if (!base) throw new Error('請先填寫 API 地址');
  if (!apiKey) throw new Error('請先填寫 API Key');
  const response = await fetch(`${base}/models`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!response.ok) throw new Error(await parseApiError(response));
  const json = await response.json();
  const list: unknown[] = Array.isArray(json?.data) ? json.data : [];
  return list
    .map((m) => (typeof m === 'string' ? m : (m as { id?: unknown })?.id))
    .filter((id): id is string => typeof id === 'string' && id.length > 0);
}
