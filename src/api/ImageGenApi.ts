/**
 * 文生圖：依設定的生圖服務分派
 * - novelai：NovelAIImageApi.generateImage（原本的流程）
 * - gpt：OpenAI 圖片（gpt-image-2 等），/images/generations 或 /chat/completions
 * - banana：Google Gemini 圖片（Nano Banana），原生 generateContent 或中轉站 /chat/completions
 * - midjourney / niji：midjourney-proxy 格式（/mj/submit/imagine + 輪詢 /mj/task/{id}/fetch）
 *   官方沒有 API，New API、One API 等中轉站和自架 midjourney-proxy 都用這套
 */
import {
  buildPromptWithTags,
  createDefaultBananaImageSettings,
  createDefaultGptImageSettings,
  createDefaultMidjourneyImageSettings,
  extractImageFromJson,
  fetchThirdPartyModels,
  fetchWithRetry,
  generateImage as generateNovelAIImage,
  imageUrlToBase64,
  normalizeBaseUrl,
  parseApiError,
  startsWithBytes,
  type BananaImageSettings,
  type GptImageSettings,
  type ImageProvider,
  type MidjourneyImageSettings,
  type NovelAIImageResponse,
  type NovelAIImageSettings,
} from './NovelAIImageApi';

export interface ImageGenResponse extends NovelAIImageResponse {
  /** 依圖片內容判斷的 MIME，例如 image/png、image/jpeg */
  mimeType?: string;
}

type TagPrompts = { characterPrompt?: string; userPrompt?: string };

// ── 服務清單與小工具 ─────────────────────────────────────────

export const IMAGE_PROVIDERS: { value: ImageProvider; label: string }[] = [
  { value: 'novelai', label: 'NovelAI' },
  { value: 'gpt', label: 'GPT Image（OpenAI）' },
  { value: 'banana', label: 'Nano Banana（Gemini）' },
  { value: 'midjourney', label: 'Midjourney' },
  { value: 'niji', label: 'Niji・journey' },
];

export const GPT_IMAGE_MODEL_SUGGESTIONS = [
  'gpt-image-2',
  'gpt-image-1.5',
  'gpt-image-1-mini',
  'gpt-image-1',
];

export const BANANA_MODEL_SUGGESTIONS = [
  'gemini-2.5-flash-image',
  'gemini-3.1-flash-image-preview',
  'gemini-3-pro-image-preview',
];

export const MJ_VERSION_OPTIONS = [
  { value: '', label: '不指定（帳號預設）' },
  { value: '7', label: 'V7' },
  { value: '6.1', label: 'V6.1' },
  { value: '6', label: 'V6' },
];

export const NIJI_VERSION_OPTIONS = [
  { value: '7', label: 'Niji 7' },
  { value: '6', label: 'Niji 6' },
  { value: '5', label: 'Niji 5' },
];

export function getImageProvider(settings: NovelAIImageSettings): ImageProvider {
  return settings.provider ?? 'novelai';
}

export function getImageProviderLabel(provider: ImageProvider): string {
  return IMAGE_PROVIDERS.find((p) => p.value === provider)?.label ?? provider;
}

function gptSettings(settings: NovelAIImageSettings): GptImageSettings {
  return { ...createDefaultGptImageSettings(), ...(settings.gpt ?? {}) };
}

function bananaSettings(settings: NovelAIImageSettings): BananaImageSettings {
  return { ...createDefaultBananaImageSettings(), ...(settings.banana ?? {}) };
}

function mjSettings(settings: NovelAIImageSettings): MidjourneyImageSettings {
  return { ...createDefaultMidjourneyImageSettings(), ...(settings.midjourney ?? {}) };
}

/** 目前選的服務用的 API Key */
export function getActiveImageApiKey(settings: NovelAIImageSettings): string {
  switch (getImageProvider(settings)) {
    case 'gpt': return gptSettings(settings).apiKey.trim();
    case 'banana': return bananaSettings(settings).apiKey.trim();
    case 'midjourney':
    case 'niji': return mjSettings(settings).apiKey.trim();
    default: return settings.apiKey?.trim() ?? '';
  }
}

/** 文生圖已啟用且目前的服務有填 Key */
export function isImageGenReady(settings: NovelAIImageSettings): boolean {
  return !!settings.enabled && !!getActiveImageApiKey(settings);
}

/** 呼叫端整體逾時：GPT 高畫質要一兩分鐘，MJ 排隊加輪詢可能好幾分鐘 */
export function getImageGenTimeoutMs(settings: NovelAIImageSettings): number {
  const isIOS = typeof navigator !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent);
  switch (getImageProvider(settings)) {
    case 'gpt': return 240_000;
    case 'banana': return 180_000;
    case 'midjourney':
    case 'niji': return MJ_MAX_WAIT_MS + 30_000;
    default: return isIOS ? 45_000 : 60_000;
  }
}

/** 依檔頭判斷圖片 MIME，認不出來當 PNG */
export function detectImageMime(base64: string): string {
  try {
    const head = atob(base64.slice(0, 24));
    const bytes = Uint8Array.from(head, (c) => c.charCodeAt(0));
    if (startsWithBytes(bytes, [0xff, 0xd8, 0xff])) return 'image/jpeg';
    if (startsWithBytes(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWithBytes(bytes, [0x57, 0x45, 0x42, 0x50], 8)) return 'image/webp';
    if (startsWithBytes(bytes, [0x47, 0x49, 0x46, 0x38])) return 'image/gif';
  } catch {
    // 不是合法 base64，交給呼叫端
  }
  return 'image/png';
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

const BANANA_ASPECT_RATIOS = ['1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9'];

/** 從寬高挑最接近的比例 */
function nearestAspectRatio(width: number, height: number, options: string[]): string {
  const target = Math.log(width / height);
  let best = options[0];
  let bestDiff = Infinity;
  for (const opt of options) {
    const [w, h] = opt.split(':').map(Number);
    const diff = Math.abs(Math.log(w / h) - target);
    if (diff < bestDiff) {
      best = opt;
      bestDiff = diff;
    }
  }
  return best;
}

/** GPT 只吃固定尺寸：直式 / 橫式 / 正方形 */
export function gptImageSize(model: string, width: number, height: number): string {
  const ratio = width / height;
  const isDalle3 = model.startsWith('dall-e-3');
  if (ratio < 0.85) return isDalle3 ? '1024x1792' : '1024x1536';
  if (ratio > 1.18) return isDalle3 ? '1792x1024' : '1536x1024';
  return '1024x1024';
}

/** GPT / Gemini 沒有負面提示詞欄位，改用一句話接在提示詞後面 */
function withAvoidClause(prompt: string, negative: string): string {
  const neg = negative.trim();
  return neg ? `${prompt}\n\nAvoid: ${neg}` : prompt;
}

function errorResult(error: string): ImageGenResponse {
  return { success: false, error };
}

function okResult(imageBase64: string): ImageGenResponse {
  return { success: true, imageBase64, mimeType: detectImageMime(imageBase64) };
}

// ── 主要入口 ─────────────────────────────────────────────────

/** 依設定的生圖服務生成一張圖 */
export async function generateAIImage(
  prompt: string,
  settings: NovelAIImageSettings,
  tagPrompts?: TagPrompts,
): Promise<ImageGenResponse> {
  const provider = getImageProvider(settings);
  if (provider === 'novelai') {
    const result = await generateNovelAIImage(prompt, settings, tagPrompts);
    return result.success && result.imageBase64 ? okResult(result.imageBase64) : result;
  }
  if (!settings.enabled) return errorResult('文生圖功能未啟用');
  if (!getActiveImageApiKey(settings)) {
    return errorResult(`請先填寫 ${getImageProviderLabel(provider)} 的 API Key`);
  }

  const fullPrompt = buildPromptWithTags(
    prompt,
    settings,
    tagPrompts?.characterPrompt,
    tagPrompts?.userPrompt,
  );

  try {
    switch (provider) {
      case 'gpt': return await generateGptImage(fullPrompt, settings);
      case 'banana': return await generateBananaImage(fullPrompt, settings);
      case 'midjourney':
      case 'niji': return await generateMidjourneyImage(fullPrompt, settings, provider === 'niji');
    }
  } catch (error) {
    console.error(`[ImageGen:${provider}] 生成錯誤:`, error);
    return errorResult(error instanceof Error ? error.message : '未知錯誤');
  }
  return errorResult('不支援的生圖服務');
}

// ── OpenAI 相容 /chat/completions（GPT 與 Banana 的中轉站共用） ───

async function postChatCompletion(
  baseUrl: string,
  apiKey: string,
  body: Record<string, unknown>,
): Promise<ImageGenResponse> {
  const response = await fetchWithRetry(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ ...body, stream: false }),
  });
  if (!response.ok) return errorResult(await parseApiError(response));
  const json = await response.json();
  const image = await extractImageFromChatJson(json);
  if (image) return okResult(image);
  const text = chatMessageText(json);
  return errorResult(text ? `模型沒有回傳圖片：\n${text.slice(0, 300)}` : '無法解析生成的圖片');
}

function chatMessageText(json: any): string {
  const content = json?.choices?.[0]?.message?.content;
  if (typeof content === 'string') return content.trim();
  if (Array.isArray(content)) {
    return content
      .map((part: any) => (typeof part?.text === 'string' ? part.text : ''))
      .join('')
      .trim();
  }
  return '';
}

/** 回覆文字裡的圖片：data URL、Markdown 圖片、或看起來是圖片的網址 */
async function extractImageFromText(text: string): Promise<string | null> {
  const dataUrl = text.match(/data:image\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/=]+/i);
  if (dataUrl) return imageUrlToBase64(dataUrl[0]);
  const markdown = text.match(/!\[[^\]]*\]\((\S+?)\)/);
  if (markdown) return imageUrlToBase64(markdown[1]);
  const bareUrl = text.match(/https?:\/\/\S+?\.(?:png|jpe?g|webp|gif)(?:\?\S*)?(?=[\s)"'\]]|$)/i);
  if (bareUrl) return imageUrlToBase64(bareUrl[0]);
  return null;
}

/**
 * 從 chat completions 回應找圖片：
 * - OpenRouter：message.images[].image_url.url
 * - content 陣列：{ type: 'image_url', image_url: { url } }
 * - content 文字：data URL / Markdown 圖片 / 圖片網址
 * - 有些中轉站直接回 { data: [{ b64_json }] }
 */
export async function extractImageFromChatJson(json: any): Promise<string | null> {
  const message = json?.choices?.[0]?.message;
  const urlOf = (item: any): string | null => {
    if (!item) return null;
    if (typeof item === 'string') return item;
    if (typeof item.image_url === 'string') return item.image_url;
    if (typeof item.image_url?.url === 'string') return item.image_url.url;
    if (typeof item.url === 'string') return item.url;
    if (typeof item.b64_json === 'string') return `data:image/png;base64,${item.b64_json}`;
    return null;
  };

  if (Array.isArray(message?.images)) {
    for (const img of message.images) {
      const url = urlOf(img);
      if (url) return imageUrlToBase64(url);
    }
  }
  const content = message?.content;
  if (Array.isArray(content)) {
    for (const part of content) {
      if (part?.type === 'image_url' || part?.type === 'image' || part?.type === 'output_image') {
        const url = urlOf(part) ?? (typeof part?.data === 'string' ? `data:image/png;base64,${part.data}` : null);
        if (url) return imageUrlToBase64(url);
      }
      if (typeof part?.text === 'string') {
        const found = await extractImageFromText(part.text);
        if (found) return found;
      }
    }
  } else if (typeof content === 'string') {
    const found = await extractImageFromText(content);
    if (found) return found;
  }
  return extractImageFromJson(json);
}

// ── GPT Image ────────────────────────────────────────────────

async function generateGptImage(prompt: string, settings: NovelAIImageSettings): Promise<ImageGenResponse> {
  const gpt = gptSettings(settings);
  const base = normalizeBaseUrl(gpt.baseUrl);
  const model = gpt.model.trim();
  if (!base) return errorResult('請先填寫 GPT 的 API 地址');
  if (!model) return errorResult('請先填寫 GPT 的模型名稱');
  const finalPrompt = withAvoidClause(prompt, settings.negativePrompt || '');
  const size = gptImageSize(model, settings.width, settings.height);

  if (gpt.requestFormat === 'chat') {
    const [w, h] = size.split('x').map(Number);
    const ar = `${w / gcd(w, h)}:${h / gcd(w, h)}`;
    return postChatCompletion(base, gpt.apiKey.trim(), {
      model,
      messages: [{ role: 'user', content: `Generate an image (aspect ratio ${ar}). ${finalPrompt}` }],
    });
  }

  const isGptImage = model.startsWith('gpt-image');
  const isDalle = model.startsWith('dall-e');
  const body: Record<string, unknown> = { model, prompt: finalPrompt, n: 1, size };
  if (!isDalle && gpt.quality !== 'auto') body.quality = gpt.quality;
  // gpt-image 一律回 b64_json，送 response_format 反而會被拒；dall-e 要指定才不是網址
  if (isDalle) body.response_format = 'b64_json';
  // 審查放寬到 low（官方 gpt-image 支援）
  if (isGptImage) body.moderation = 'low';

  const response = await fetchWithRetry(`${base}/images/generations`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${gpt.apiKey.trim()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) return errorResult(await parseApiError(response));
  const image = await extractImageFromJson(await response.json());
  return image ? okResult(image) : errorResult('無法解析生成的圖片');
}

// ── Nano Banana（Gemini） ────────────────────────────────────

/** 使用者可能填到 /v1beta 或 /v1，統一去掉，路徑由這裡補 */
function geminiBase(url: string): string {
  return normalizeBaseUrl(url).replace(/\/(v1beta|v1)$/, '');
}

const GEMINI_BLOCK_NONE = [
  'HARM_CATEGORY_HARASSMENT',
  'HARM_CATEGORY_HATE_SPEECH',
  'HARM_CATEGORY_SEXUALLY_EXPLICIT',
  'HARM_CATEGORY_DANGEROUS_CONTENT',
].map((category) => ({ category, threshold: 'BLOCK_NONE' }));

/** 第一代 gemini-2.5-flash-image 只有 1K，送 imageSize 會報錯 */
function bananaSupportsImageSize(model: string): boolean {
  return !model.includes('2.5');
}

async function generateBananaImage(prompt: string, settings: NovelAIImageSettings): Promise<ImageGenResponse> {
  const banana = bananaSettings(settings);
  const model = banana.model.trim();
  if (!model) return errorResult('請先填寫 Banana 的模型名稱');
  const finalPrompt = withAvoidClause(prompt, settings.negativePrompt || '');
  const aspectRatio = nearestAspectRatio(settings.width, settings.height, BANANA_ASPECT_RATIOS);

  if (banana.apiFormat === 'openai') {
    const base = normalizeBaseUrl(banana.baseUrl);
    if (!base) return errorResult('請先填寫 Banana 的 API 地址');
    return postChatCompletion(base, banana.apiKey.trim(), {
      model,
      messages: [{ role: 'user', content: `Generate an image (aspect ratio ${aspectRatio}). ${finalPrompt}` }],
      // OpenRouter 要這兩個才會出圖；New API 等會忽略
      modalities: ['image', 'text'],
      image_config: { aspect_ratio: aspectRatio },
    });
  }

  const base = geminiBase(banana.baseUrl) || 'https://generativelanguage.googleapis.com';
  const imageConfig: Record<string, string> = { aspectRatio };
  if (bananaSupportsImageSize(model)) imageConfig.imageSize = banana.imageSize;
  const response = await fetchWithRetry(`${base}/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST',
    headers: {
      'x-goog-api-key': banana.apiKey.trim(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: finalPrompt }] }],
      generationConfig: {
        responseModalities: ['TEXT', 'IMAGE'],
        imageConfig,
      },
      safetySettings: GEMINI_BLOCK_NONE,
    }),
  });
  if (!response.ok) return errorResult(await parseApiError(response));
  return parseGeminiImageResponse(await response.json());
}

export function parseGeminiImageResponse(json: any): ImageGenResponse {
  const blockReason = json?.promptFeedback?.blockReason;
  if (blockReason) return errorResult(`提示詞被 Gemini 擋下（${blockReason}），請換個描述再試`);

  const candidate = json?.candidates?.[0];
  const parts: any[] = candidate?.content?.parts ?? [];
  for (const part of parts) {
    const inline = part?.inlineData ?? part?.inline_data;
    if (typeof inline?.data === 'string' && inline.data) return okResult(inline.data);
  }
  const text = parts.map((p) => (typeof p?.text === 'string' ? p.text : '')).join('').trim();
  const finish = candidate?.finishReason;
  if (finish && finish !== 'STOP') {
    return errorResult(`Gemini 沒有生成圖片（${finish}）${text ? `\n${text.slice(0, 300)}` : ''}`);
  }
  return errorResult(text ? `模型沒有回傳圖片：\n${text.slice(0, 300)}` : '無法解析生成的圖片');
}

// ── Midjourney / Niji（midjourney-proxy 格式） ──────────────

const MJ_MAX_WAIT_MS = 9 * 60_000;
const MJ_POLL_INTERVAL_MS = 3_000;

/** 使用者可能填到 /v1 或 /mj，統一去掉 */
function mjBase(url: string): string {
  return normalizeBaseUrl(url).replace(/\/(v1|mj)$/, '');
}

function mjHeaders(apiKey: string): Record<string, string> {
  return {
    // New API / One API 用 Bearer；自架 midjourney-proxy 用 mj-api-secret
    Authorization: `Bearer ${apiKey}`,
    'mj-api-secret': apiKey,
    'Content-Type': 'application/json',
  };
}

/** 組 MJ 提示詞：去掉換行，補上比例、版本、負面、速度等參數（使用者自己寫了就不重複加） */
export function buildMidjourneyPrompt(
  prompt: string,
  settings: NovelAIImageSettings,
  isNiji: boolean,
): string {
  const mj = mjSettings(settings);
  let text = prompt.replace(/\s*\n+\s*/g, ' ').replace(/\s{2,}/g, ' ').trim();
  const has = (flag: string) => new RegExp(`(^|\\s)--${flag}(\\s|$)`).test(text);
  const params: string[] = [];

  if (!has('ar') && !has('aspect')) {
    const d = gcd(settings.width, settings.height) || 1;
    params.push(`--ar ${settings.width / d}:${settings.height / d}`);
  }
  if (isNiji) {
    if (!has('niji')) params.push(`--niji ${mj.nijiVersion || '7'}`);
  } else if (mj.mjVersion && !has('v') && !has('version') && !has('niji')) {
    params.push(`--v ${mj.mjVersion}`);
  }
  const negative = (settings.negativePrompt || '').replace(/\s*\n+\s*/g, ' ').trim();
  if (negative && !has('no')) params.push(`--no ${negative}`);
  if (mj.stylize != null && !Number.isNaN(Number(mj.stylize)) && !has('s') && !has('stylize')) {
    params.push(`--s ${Number(mj.stylize)}`);
  }
  if (mj.speed !== 'default' && !has('fast') && !has('relax') && !has('turbo')) {
    params.push(`--${mj.speed}`);
  }
  if (params.length) text = `${text} ${params.join(' ')}`;
  return text;
}

interface MjSubmitResult {
  code?: number;
  description?: string;
  result?: string | number;
}

interface MjTask {
  id?: string;
  status?: string;
  progress?: string;
  imageUrl?: string;
  imageUrls?: (string | { url?: string })[];
  failReason?: string;
  buttons?: { customId?: string; label?: string }[];
}

async function mjSubmit(base: string, apiKey: string, path: string, body: unknown): Promise<string> {
  const response = await fetchWithRetry(`${base}${path}`, {
    method: 'POST',
    headers: mjHeaders(apiKey),
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(await parseApiError(response));
  const json = (await response.json()) as MjSubmitResult;
  // 1 = 提交成功、22 = 排隊中、21 = 任務已存在：都有任務 ID 可以輪詢
  const okCodes = [1, 21, 22];
  if (json.result != null && json.result !== '' && (json.code == null || okCodes.includes(json.code))) {
    return String(json.result);
  }
  if (json.code === 24) throw new Error(`提示詞含有 Midjourney 禁用詞，請換個描述\n${json.description ?? ''}`.trim());
  throw new Error(`Midjourney 提交失敗${json.code != null ? `（code ${json.code}）` : ''}：${json.description || '未知原因'}`);
}

async function mjWaitForTask(base: string, apiKey: string, taskId: string, deadline: number): Promise<MjTask> {
  // 剛提交不會馬上好，先等一下再問
  await sleep(MJ_POLL_INTERVAL_MS);
  while (Date.now() < deadline) {
    const response = await fetch(`${base}/mj/task/${encodeURIComponent(taskId)}/fetch`, {
      headers: mjHeaders(apiKey),
    }).catch(() => null);
    if (response?.ok) {
      const task = (await response.json()) as MjTask;
      const status = (task.status || '').toUpperCase();
      if (status === 'SUCCESS') return task;
      if (status === 'FAILURE' || status === 'CANCEL') {
        throw new Error(`Midjourney 生成失敗：${task.failReason || status}`);
      }
    } else if (response && response.status !== 429 && response.status < 500) {
      throw new Error(await parseApiError(response));
    }
    await sleep(MJ_POLL_INTERVAL_MS);
  }
  throw new Error('Midjourney 等太久還沒出圖（可能在 relax 排隊），請稍後再試');
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** 把四宮格切出左上那張；環境不支援就回傳 null，由呼叫端用整張 */
async function cropTopLeftQuadrant(base64: string): Promise<string | null> {
  if (typeof document === 'undefined' || typeof Image === 'undefined') return null;
  try {
    const img = new Image();
    img.src = `data:${detectImageMime(base64)};base64,${base64}`;
    await img.decode();
    const w = Math.floor(img.naturalWidth / 2);
    const h = Math.floor(img.naturalHeight / 2);
    if (!w || !h) return null;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, w, h, 0, 0, w, h);
    const dataUrl = canvas.toDataURL('image/png');
    return dataUrl.slice(dataUrl.indexOf(',') + 1);
  } catch (err) {
    console.warn('[ImageGen:mj] 切四宮格失敗，改用整張:', err);
    return null;
  }
}

async function downloadMjImage(url: string): Promise<string> {
  const image = await imageUrlToBase64(url);
  if (!image) throw new Error(`圖片已生成，但下載失敗（可能是網址跨域被擋）：\n${url}`);
  return image;
}

async function generateMidjourneyImage(
  prompt: string,
  settings: NovelAIImageSettings,
  isNiji: boolean,
): Promise<ImageGenResponse> {
  const mj = mjSettings(settings);
  const base = mjBase(mj.baseUrl);
  if (!base) return errorResult('請先填寫 Midjourney 的 API 地址');
  const apiKey = mj.apiKey.trim();
  const deadline = Date.now() + MJ_MAX_WAIT_MS;

  const taskId = await mjSubmit(base, apiKey, '/mj/submit/imagine', {
    prompt: buildMidjourneyPrompt(prompt, settings, isNiji),
    base64Array: [],
  });
  const task = await mjWaitForTask(base, apiKey, taskId, deadline);

  if (mj.resultMode === 'upscale') {
    const u1 = task.buttons?.find(
      (b) => b.label === 'U1' || (b.customId ?? '').includes('upsample::1'),
    );
    if (u1?.customId) {
      const upscaleId = await mjSubmit(base, apiKey, '/mj/submit/action', {
        customId: u1.customId,
        taskId,
      });
      const upscaled = await mjWaitForTask(base, apiKey, upscaleId, deadline);
      if (upscaled.imageUrl) return okResult(await downloadMjImage(upscaled.imageUrl));
    }
    // 沒有 U1 按鈕（中轉站不支援）就退回切圖
  }

  if (mj.resultMode !== 'grid') {
    // 新版 midjourney-proxy 會直接給四張單圖
    const first = task.imageUrls?.[0];
    const firstUrl = typeof first === 'string' ? first : first?.url;
    if (firstUrl) return okResult(await downloadMjImage(firstUrl));
  }

  if (!task.imageUrl) return errorResult('Midjourney 任務完成，但沒有圖片網址');
  const grid = await downloadMjImage(task.imageUrl);
  if (mj.resultMode === 'grid') return okResult(grid);
  return okResult((await cropTopLeftQuadrant(grid)) ?? grid);
}

// ── 取得模型清單（設定畫面用） ───────────────────────────────

/** GPT / Banana 取得模型清單，也順便確認地址與 Key */
export async function fetchImageProviderModels(settings: NovelAIImageSettings): Promise<string[]> {
  const provider = getImageProvider(settings);
  if (provider === 'gpt') {
    const gpt = gptSettings(settings);
    const models = await fetchThirdPartyModels(gpt.baseUrl, gpt.apiKey.trim());
    const imageModels = models.filter((m) => /image|dall-e/i.test(m));
    return imageModels.length ? imageModels : models;
  }
  if (provider === 'banana') {
    const banana = bananaSettings(settings);
    if (banana.apiFormat === 'openai') {
      const models = await fetchThirdPartyModels(banana.baseUrl, banana.apiKey.trim());
      const imageModels = models.filter((m) => /image|banana/i.test(m));
      return imageModels.length ? imageModels : models;
    }
    const key = banana.apiKey.trim();
    if (!key) throw new Error('請先填寫 API Key');
    const base = geminiBase(banana.baseUrl) || 'https://generativelanguage.googleapis.com';
    const response = await fetch(`${base}/v1beta/models?pageSize=1000`, {
      headers: { 'x-goog-api-key': key },
    });
    if (!response.ok) throw new Error(await parseApiError(response));
    const json = await response.json();
    const names: string[] = (Array.isArray(json?.models) ? json.models : [])
      .map((m: { name?: string }) => (m?.name ?? '').replace(/^models\//, ''))
      .filter(Boolean);
    return names.filter((n) => n.includes('image'));
  }
  return [];
}

export type { ImageProvider };
