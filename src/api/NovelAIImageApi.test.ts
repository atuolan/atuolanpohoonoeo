import { afterEach, describe, expect, it, vi } from "vitest";
import {
  applySavedNovelAIImageSettings,
  createDefaultNovelAIImageSettings,
  DEFAULT_NEGATIVE_PROMPT,
  generateImage,
  getQualityPresetOptions,
  getUcPresetOptions,
  type NovelAIImageSettings,
} from "./NovelAIImageApi";

// 1x1 PNG
const PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==";

function pngResponse(): Response {
  const bytes = Uint8Array.from(atob(PNG_BASE64), (c) => c.charCodeAt(0));
  return new Response(bytes, { status: 200, headers: { "Content-Type": "image/png" } });
}

function makeSettings(overrides: Partial<NovelAIImageSettings> = {}): NovelAIImageSettings {
  return {
    ...createDefaultNovelAIImageSettings(),
    enabled: true,
    apiKey: "pst-test",
    useProxy: false,
    seed: 123,
    ...overrides,
  };
}

/** 送出一次生成，回傳實際打出去的網址、headers 與解析後的請求 JSON */
async function captureRequest(settings: NovelAIImageSettings, prompt = "1girl, smile") {
  const fetchMock = vi.fn(async () => pngResponse());
  vi.stubGlobal("fetch", fetchMock);
  const result = await generateImage(prompt, settings);
  expect(result.success).toBe(true);
  const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
  let json: Record<string, any>;
  if (init.body instanceof FormData) {
    const part = init.body.get("request") as Blob;
    json = JSON.parse(await part.text());
  } else {
    json = JSON.parse(init.body as string);
  }
  return { url, init, json };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("官方 NovelAI 請求（params_version 4）", () => {
  it("V5 用 multipart、補品質標籤與 Heavy 負面預設、沒有 Variety Boost", async () => {
    const { url, init, json } = await captureRequest(
      makeSettings({ model: "nai-diffusion-5-full", varietyBoost: true }),
    );
    expect(url).toBe("https://image.novelai.net/ai/generate-image");
    expect(init.body).toBeInstanceOf(FormData);
    expect((init.headers as Record<string, string>)["Content-Type"]).toBeUndefined();

    expect(json.model).toBe("nai-diffusion-5-full");
    expect(json.input).toBe("1girl, smile, very aesthetic, masterpiece, no text");
    const p = json.parameters;
    expect(p.params_version).toBe(4);
    expect(p.ucPresetId).toBe("heavy");
    expect(p.qualityPresetId).toBe("standard");
    expect(p).not.toHaveProperty("ucPreset");
    expect(p).not.toHaveProperty("qualityToggle");
    expect(p.negative_prompt.startsWith("nsfw, lowres, artistic error")).toBe(true);
    expect(p.v4_negative_prompt.caption.base_caption).toBe(p.negative_prompt);
    expect(p.v4_prompt.caption.base_caption).toBe(json.input);
    expect(p.skip_cfg_above_sigma).toBeNull();
    expect(p.straight_alpha).toBe(true);
    expect(p.image_format).toBe("png");
  });

  it("V5 快速版固定 14 步、Euler Ancestral、Heavy", async () => {
    const { json } = await captureRequest(
      makeSettings({
        model: "nai-diffusion-5-full-medium",
        steps: 40,
        sampler: "k_dpmpp_2m",
        ucPresetId: "light",
      }),
    );
    expect(json.parameters.steps).toBe(14);
    expect(json.parameters.sampler).toBe("k_euler_ancestral");
    expect(json.parameters.ucPresetId).toBe("heavy");
  });

  it("V4.5 的 Variety Boost 照面積換算（832×1216 = 58，1024×1024 = 60）", async () => {
    const portrait = await captureRequest(
      makeSettings({ model: "nai-diffusion-4-5-full", width: 832, height: 1216 }),
    );
    expect(portrait.json.parameters.skip_cfg_above_sigma).toBe(58);
    const square = await captureRequest(
      makeSettings({ model: "nai-diffusion-4-5-full", width: 1024, height: 1024 }),
    );
    expect(square.json.parameters.skip_cfg_above_sigma).toBe(60);
  });

  it("負面預設在前、使用者負面在後；提示詞要 nsfw 時拿掉預設裡的 nsfw", async () => {
    const { json } = await captureRequest(
      makeSettings({ model: "nai-diffusion-4-5-full", negativePrompt: "extra arms" }),
      "1girl, nsfw",
    );
    const neg: string = json.parameters.negative_prompt;
    expect(neg.startsWith("lowres, artistic error")).toBe(true);
    expect(neg.endsWith(", extra arms")).toBe(true);
    expect(neg.split(", ")).not.toContain("nsfw");
  });

  it("品質標籤關閉、負面預設選「無」時不加任何東西", async () => {
    const { json } = await captureRequest(
      makeSettings({
        model: "nai-diffusion-4-5-curated",
        qualityPreset: "none",
        ucPresetId: "none",
        negativePrompt: "bad hands",
      }),
    );
    expect(json.input).toBe("1girl, smile");
    expect(json.parameters.negative_prompt).toBe("bad hands");
  });

  it("V4 起把 Native 噪聲排程換成 Karras，Scale 上限 10", async () => {
    const { json } = await captureRequest(
      makeSettings({ model: "nai-diffusion-4-full", noiseSchedule: "native", scale: 15 }),
    );
    expect(json.parameters.noise_schedule).toBe("karras");
    expect(json.parameters.scale).toBe(10);
    expect(json.parameters.legacy_uc).toBe(true);
  });

  it("DDIM 不帶噪聲排程", async () => {
    const { json } = await captureRequest(
      makeSettings({ model: "nai-diffusion-3", sampler: "ddim_v3" }),
    );
    expect(json.parameters).not.toHaveProperty("noise_schedule");
  });
});

describe("第三方 API", () => {
  it("NovelAI 格式送 JSON（中轉站多半只解析 JSON）", async () => {
    const { url, init, json } = await captureRequest(
      makeSettings({
        apiSource: "nai-compatible",
        customBaseUrl: "https://relay.example.com/",
        model: "nai-diffusion-4-5-full",
      }),
    );
    expect(url).toBe("https://relay.example.com/ai/generate-image");
    expect(typeof init.body).toBe("string");
    expect(json.parameters.params_version).toBe(4);
  });

  it("OpenAI 格式：模型名稱是 NAI 模型才套官方預設", async () => {
    const known = await captureRequest(
      makeSettings({
        apiSource: "openai",
        customBaseUrl: "https://relay.example.com/v1",
        openaiModel: "nai-diffusion-4-5-full",
      }),
    );
    expect(known.url).toBe("https://relay.example.com/v1/images/generations");
    expect(known.json.prompt).toBe("1girl, smile, location, very aesthetic, masterpiece, no text");
    expect(known.json.negative_prompt.startsWith("nsfw, lowres")).toBe(true);

    const other = await captureRequest(
      makeSettings({
        apiSource: "openai",
        customBaseUrl: "https://relay.example.com/v1",
        openaiModel: "some-other-model",
        negativePrompt: "blurry",
      }),
    );
    expect(other.json.prompt).toBe("1girl, smile");
    expect(other.json.negative_prompt).toBe("blurry");
  });
});

describe("舊設定轉換", () => {
  it("舊存檔沒有新欄位時，從 ucPreset／qualityToggle 轉過來", () => {
    const target = createDefaultNovelAIImageSettings();
    applySavedNovelAIImageSettings(target, {
      ucPreset: 3,
      qualityToggle: true,
      scale: 12,
      negativePrompt: "bad hands",
    });
    expect(target.ucPresetId).toBe("none");
    expect(target.qualityPreset).toBe("standard");
    expect(target.scale).toBe(10);

    const target2 = createDefaultNovelAIImageSettings();
    applySavedNovelAIImageSettings(target2, { ucPreset: 1, qualityToggle: false });
    expect(target2.ucPresetId).toBe("light");
    expect(target2.qualityPreset).toBe("none");
  });

  it("從沒改過舊預設（無＋舊負面提示詞）就換成官方 Heavy、負面清空", () => {
    const target = createDefaultNovelAIImageSettings();
    applySavedNovelAIImageSettings(target, {
      ucPreset: 3,
      negativePrompt: DEFAULT_NEGATIVE_PROMPT,
    });
    expect(target.ucPresetId).toBe("heavy");
    expect(target.negativePrompt).toBe("");

    const customized = createDefaultNovelAIImageSettings();
    applySavedNovelAIImageSettings(customized, { ucPreset: 3, negativePrompt: "extra arms" });
    expect(customized.ucPresetId).toBe("none");
    expect(customized.negativePrompt).toBe("extra arms");
  });

  it("已經有新欄位就照存的用", () => {
    const target = createDefaultNovelAIImageSettings();
    applySavedNovelAIImageSettings(target, { ucPresetId: "human", qualityPreset: "light", ucPreset: 0 });
    expect(target.ucPresetId).toBe("human");
    expect(target.qualityPreset).toBe("light");
  });
});

describe("選單選項", () => {
  it("各模型的負面預設與品質標籤選項", () => {
    expect(getUcPresetOptions("nai-diffusion-5-full").map((o) => o.value)).toEqual([
      "heavy",
      "light",
      "furry",
      "human",
      "none",
    ]);
    expect(getUcPresetOptions("nai-diffusion-4-full").map((o) => o.value)).toEqual([
      "heavy",
      "light",
      "none",
    ]);
    expect(getQualityPresetOptions("nai-diffusion-5-curated").map((o) => o.value)).toEqual([
      "standard",
      "light",
      "none",
    ]);
    expect(getQualityPresetOptions("nai-diffusion-4-5-full").map((o) => o.value)).toEqual([
      "standard",
      "none",
    ]);
    expect(getUcPresetOptions("some-other-model")).toEqual([]);
  });
});
