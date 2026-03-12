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
  | 'nai-diffusion-4-5-full';

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
  qualityToggle?: boolean;
  ucPreset?: number; // 0=Heavy, 1=Light, 2=Human Focus, 3=None
  /** 啟用代理模式：透過 Cloudflare Worker 轉發請求，大陸用戶免 VPN */
  useProxy?: boolean;
  /** Cloudflare Worker 代理地址，例如 https://nai-proxy.aguacloud.uk */
  proxyBaseUrl?: string;
}

export interface NovelAIImageResponse {
  success: boolean;
  imageBase64?: string;
  error?: string;
}

// ── 常數 ──────────────────────────────────────────────────────

export const DEFAULT_NEGATIVE_PROMPT =
  'lowres, bad anatomy, bad hands, text, error, missing fingers, extra digit, fewer digits, cropped, worst quality, low quality, normal quality, jpeg artifacts, signature, watermark, username, blurry';

// 與 novelai.js 一致的 User-Agent，避免被 API 擋掉
const NAI_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

export const AVAILABLE_SAMPLERS = [
  { value: 'k_euler', label: 'Euler' },
  { value: 'k_euler_ancestral', label: 'Euler Ancestral' },
  { value: 'k_dpmpp_2s_ancestral', label: 'DPM++ 2S Ancestral' },
  { value: 'k_dpmpp_2m', label: 'DPM++ 2M' },
  { value: 'k_dpmpp_sde', label: 'DPM++ SDE' },
  { value: 'ddim_v3', label: 'DDIM' },
];

export const AVAILABLE_MODELS: { value: NovelAIModel; label: string }[] = [
  { value: 'nai-diffusion-3', label: 'NAI Diffusion 3' },
  { value: 'nai-diffusion-4-curated-preview', label: 'NAI Diffusion 4 Curated' },
  { value: 'nai-diffusion-4-full', label: 'NAI Diffusion 4 Full' },
  { value: 'nai-diffusion-4-5-curated', label: 'NAI Diffusion 4.5 Curated' },
  { value: 'nai-diffusion-4-5-full', label: 'NAI Diffusion 4.5 Full' },
];

export const NOISE_SCHEDULES = [
  { value: 'karras', label: 'Karras' },
  { value: 'exponential', label: 'Exponential' },
  { value: 'polyexponential', label: 'Polyexponential' },
  { value: 'native', label: 'Native' },
];

export const UC_PRESETS = [
  { value: 0, label: 'Heavy' },
  { value: 1, label: 'Light' },
  { value: 2, label: 'Human Focus' },
  { value: 3, label: '無' },
];

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
    negativePrompt: DEFAULT_NEGATIVE_PROMPT,
    positivePromptPrefix: '',
    positivePromptSuffix: '',
    useUserTag: false,
    cfgRescale: 0,
    noiseSchedule: 'karras',
    dynamicThresholding: false,
    varietyBoost: true,
    qualityToggle: true,
    ucPreset: 3,
    useProxy: true,
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
 * 移植自 novelai.js calculateSkipCfgAboveSigma
 */
function getSkipCfgAboveSigma(model: NovelAIModel, width: number, height: number): number | null {
  if (model === 'nai-diffusion-3') return 19;
  if (model.includes('4-5')) return 59.04722600415217;
  // NAI4 curated/full
  const pixels = width * height;
  // 根據解析度調整，與 novelai.js 保持一致
  if (pixels <= 512 * 768) return 19;
  return 19.343056794463642;
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
 * 建立完整的 parameters payload，對齊 novelai.js 的參數結構
 */
function buildParameters(prompt: string, settings: NovelAIImageSettings): object {
  const seed = settings.seed && settings.seed > 0
    ? settings.seed
    : Math.floor(Math.random() * 4294967295);

  const skipCfg = settings.varietyBoost
    ? getSkipCfgAboveSigma(settings.model, settings.width, settings.height)
    : null;

  const isNAI3 = settings.model === 'nai-diffusion-3';
  const isNAI4plus = settings.model.includes('nai-diffusion-4');

  const base = {
    params_version: 3,
    width: settings.width,
    height: settings.height,
    scale: settings.scale,
    sampler: settings.sampler,
    steps: settings.steps,
    seed,
    n_samples: 1,
    ucPreset: settings.ucPreset ?? 3,
    qualityToggle: settings.qualityToggle ?? true,
    dynamic_thresholding: settings.dynamicThresholding ?? false,
    controlnet_strength: 1,
    legacy: false,
    legacy_uc: false,
    add_original_image: true,
    cfg_rescale: settings.cfgRescale ?? 0,
    noise_schedule: settings.noiseSchedule ?? 'karras',
    skip_cfg_above_sigma: skipCfg,
    legacy_v3_extend: false,
    negative_prompt: settings.negativePrompt,
    // Euler Ancestral 修正
    ...(settings.sampler === 'k_euler_ancestral' && {
      deliberate_euler_ancestral_bug: false,
      prefer_brownian: true,
    }),
  };

  if (isNAI3) {
    return {
      ...base,
      sm: true,
      sm_dyn: true,
      reference_image_multiple: [],
      reference_information_extracted_multiple: [],
      reference_strength_multiple: [],
    };
  }

  if (isNAI4plus) {
    // NAI4/4.5 使用 v4_prompt 結構
    return {
      ...base,
      autoSmea: false,
      normalize_reference_strength_multiple: false,
      inpaintImg2ImgStrength: 1,
      reference_image_multiple_cached: [],
      reference_strength_multiple: [],
      use_coords: false,
      characterPrompts: [],
      v4_prompt: {
        caption: { base_caption: prompt, char_captions: [] },
        use_coords: false,
        use_order: true,
      },
      v4_negative_prompt: {
        caption: { base_caption: settings.negativePrompt, char_captions: [] },
        legacy_uc: false,
      },
    };
  }

  return base;
}

/**
 * 使用 JSZip 解壓 NovelAI 回傳的 zip，取得圖片 base64
 */
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
 */
async function parseApiError(response: Response): Promise<string> {
  const text = await response.text().catch(() => '');
  switch (response.status) {
    case 400: {
      try {
        const json = JSON.parse(text);
        return `請求驗證失敗: ${json.message ?? text}`;
      } catch {
        return `請求驗證失敗: ${text}`;
      }
    }
    case 401: return 'API Key 錯誤或無效，請檢查設定';
    case 402: return '需要有效訂閱才能使用此功能';
    case 429: return `請求過於頻繁 (429)，請稍後再試（已自動重試 3 次）`;
    case 500: return '伺服器內部錯誤 (500)，請稍後再試（已自動重試 3 次）';
    case 502: return '伺服器暫時無法連線 (502)，請稍後再試（已自動重試 3 次）';
    case 503: return '服務暫時不可用 (503)\n\n可能原因：\n1. NovelAI 服務器負載過高\n2. 網絡連接不穩定\n3. API Key 使用頻率過高\n\n建議：稍後重試或切換網絡環境（已自動重試 3 次，每次等待 10-30 秒）';
    default:  return `生成失敗: ${response.status} ${response.statusText}`;
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
    const finalPrompt = buildPromptWithTags(
      prompt,
      settings,
      tagPrompts?.characterPrompt,
      tagPrompts?.userPrompt,
    );
    const parameters = buildParameters(finalPrompt, settings);
    const useProxy = settings.useProxy ?? false;

    // iOS Safari 特殊處理：添加 keepalive 和更短的重試次數
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    const maxRetries = isIOS ? 2 : 3; // iOS: 2次重試, 其他: 3次

    const requestUrl = toProxyUrl(
      'https://image.novelai.net/ai/generate-image',
      useProxy,
      settings.proxyBaseUrl,
    );

    // 注意：瀏覽器端 fetch 無法可靠地自訂 'User-Agent'（屬於 forbidden header）。
    // 在部分 iOS WebView 容器中，嘗試設置可能引發不可預期的代理/WAF 行為，導致 5xx（含 503）。
    // 若需要偽裝 UA，應改在 Cloudflare Worker 轉發時注入，而非前端。
    const response = await fetchWithRetry(
      requestUrl,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${settings.apiKey}`,
          'Content-Type': 'application/json',
          Accept: '*/*',
          // 'User-Agent': NAI_USER_AGENT,
          // 診斷用：讓代理端/日誌可識別此客戶端來源
          'X-Aguaphone-Client': 'aguaphone-pwa',
        },
        body: JSON.stringify({
          input: finalPrompt,
          model: settings.model,
          action: 'generate',
          parameters,
        }),
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
    const imageBase64 = await extractImageFromZip(arrayBuffer);

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
