import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildMidjourneyPrompt,
  extractImageFromChatJson,
  generateAIImage,
  gptImageSize,
  isImageGenReady,
  parseGeminiImageResponse,
} from "./ImageGenApi";
import {
  applySavedNovelAIImageSettings,
  createDefaultNovelAIImageSettings,
  type NovelAIImageSettings,
} from "./NovelAIImageApi";

// 1x1 PNG
const PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==";

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function pngResponse(): Response {
  const bytes = Uint8Array.from(atob(PNG_BASE64), (c) => c.charCodeAt(0));
  return new Response(bytes, { status: 200, headers: { "Content-Type": "image/png" } });
}

function makeSettings(overrides: Partial<NovelAIImageSettings> = {}): NovelAIImageSettings {
  const s = createDefaultNovelAIImageSettings();
  s.enabled = true;
  return { ...s, ...overrides };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("讀取舊設定", () => {
  it("沒有 provider 的舊資料補成 novelai，子設定補齊預設值", () => {
    const target = createDefaultNovelAIImageSettings();
    applySavedNovelAIImageSettings(target, {
      apiKey: "pst-old",
      gpt: { apiKey: "sk-1" } as NovelAIImageSettings["gpt"],
    });
    expect(target.provider).toBe("novelai");
    expect(target.gpt?.apiKey).toBe("sk-1");
    expect(target.gpt?.model).toBe("gpt-image-2");
    expect(target.banana?.model).toBe("gemini-2.5-flash-image");
    expect(target.midjourney?.nijiVersion).toBe("7");
  });

  it("isImageGenReady 看目前服務自己的 Key", () => {
    const s = makeSettings({ provider: "gpt", apiKey: "pst-nai" });
    expect(isImageGenReady(s)).toBe(false);
    s.gpt!.apiKey = "sk-gpt";
    expect(isImageGenReady(s)).toBe(true);
    s.provider = "niji";
    expect(isImageGenReady(s)).toBe(false);
  });
});

describe("GPT Image", () => {
  it("送到 /images/generations，尺寸換成 GPT 支援的、負面接 Avoid", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ data: [{ b64_json: PNG_BASE64 }] }));
    vi.stubGlobal("fetch", fetchMock);
    const s = makeSettings({ provider: "gpt", negativePrompt: "text, watermark" });
    s.gpt = { ...s.gpt!, apiKey: "sk-gpt", baseUrl: "https://api.openai.com/v1/" };

    const result = await generateAIImage("a girl reading in a cafe", s);
    expect(result.success).toBe(true);
    expect(result.imageBase64).toBe(PNG_BASE64);
    expect(result.mimeType).toBe("image/png");

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.openai.com/v1/images/generations");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer sk-gpt");
    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({
      model: "gpt-image-2",
      size: "1024x1536",
      quality: "medium",
      moderation: "low",
      n: 1,
    });
    expect(body.response_format).toBeUndefined();
    expect(body.prompt).toContain("a girl reading in a cafe");
    expect(body.prompt).toContain("Avoid: text, watermark");
  });

  it("尺寸對應", () => {
    expect(gptImageSize("gpt-image-2", 832, 1216)).toBe("1024x1536");
    expect(gptImageSize("gpt-image-2", 1216, 832)).toBe("1536x1024");
    expect(gptImageSize("gpt-image-2", 1024, 1024)).toBe("1024x1024");
    expect(gptImageSize("dall-e-3", 832, 1216)).toBe("1024x1792");
  });

  it("聊天格式從 Markdown 圖片找出 data URL", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        choices: [{ message: { content: `好的！\n![image](data:image/png;base64,${PNG_BASE64})` } }],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const s = makeSettings({ provider: "gpt" });
    s.gpt = { ...s.gpt!, apiKey: "sk", baseUrl: "https://relay.example/v1", model: "gpt-4o-image", requestFormat: "chat" };
    const result = await generateAIImage("cat", s);
    expect(result.success).toBe(true);
    expect(result.imageBase64).toBe(PNG_BASE64);
    const [url] = fetchMock.mock.calls[0] as unknown as [string];
    expect(url).toBe("https://relay.example/v1/chat/completions");
  });
});

describe("Nano Banana", () => {
  it("Gemini 原生：generateContent、比例、2.5 不送 imageSize", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        candidates: [{ content: { parts: [{ text: "here" }, { inlineData: { mimeType: "image/png", data: PNG_BASE64 } }] } }],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const s = makeSettings({ provider: "banana" });
    s.banana = { ...s.banana!, apiKey: "AIza-test", baseUrl: "https://generativelanguage.googleapis.com/v1beta" };
    const result = await generateAIImage("1girl, smile", s);
    expect(result.success).toBe(true);

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent",
    );
    expect((init.headers as Record<string, string>)["x-goog-api-key"]).toBe("AIza-test");
    const body = JSON.parse(init.body as string);
    expect(body.generationConfig.responseModalities).toEqual(["TEXT", "IMAGE"]);
    expect(body.generationConfig.imageConfig).toEqual({ aspectRatio: "2:3" });
  });

  it("Pro 模型送 imageSize", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({ candidates: [{ content: { parts: [{ inline_data: { data: PNG_BASE64 } }] } }] }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const s = makeSettings({ provider: "banana", width: 1216, height: 832 });
    s.banana = { ...s.banana!, apiKey: "k", model: "gemini-3-pro-image-preview", imageSize: "2K" };
    const result = await generateAIImage("x", s);
    expect(result.success).toBe(true);
    const body = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(body.generationConfig.imageConfig).toEqual({ aspectRatio: "3:2", imageSize: "2K" });
  });

  it("被擋下時給看得懂的錯誤", () => {
    expect(parseGeminiImageResponse({ promptFeedback: { blockReason: "PROHIBITED_CONTENT" } }).error).toContain(
      "PROHIBITED_CONTENT",
    );
    const r = parseGeminiImageResponse({
      candidates: [{ finishReason: "IMAGE_SAFETY", content: { parts: [] } }],
    });
    expect(r.success).toBe(false);
    expect(r.error).toContain("IMAGE_SAFETY");
  });

  it("OpenRouter 格式 message.images", async () => {
    const img = await extractImageFromChatJson({
      choices: [{ message: { content: "", images: [{ type: "image_url", image_url: { url: `data:image/png;base64,${PNG_BASE64}` } }] } }],
    });
    expect(img).toBe(PNG_BASE64);
  });
});

describe("Midjourney / Niji", () => {
  it("提示詞補 --ar、--niji、--no、速度，使用者寫過的不重複", () => {
    const s = makeSettings({ provider: "niji", width: 832, height: 1216, negativePrompt: "text,\nwatermark" });
    s.midjourney = { ...s.midjourney!, speed: "relax", stylize: 250 };
    expect(buildMidjourneyPrompt("1girl,\nsmile", s, true)).toBe(
      "1girl, smile --ar 13:19 --niji 7 --no text, watermark --s 250 --relax",
    );
    expect(buildMidjourneyPrompt("cat --ar 1:1 --niji 6", s, true)).toBe(
      "cat --ar 1:1 --niji 6 --no text, watermark --s 250 --relax",
    );
    s.midjourney = { ...s.midjourney!, mjVersion: "7", speed: "default", stylize: null };
    s.negativePrompt = "";
    expect(buildMidjourneyPrompt("cat", s, false)).toBe("cat --ar 13:19 --v 7");
  });

  it("提交、輪詢到 SUCCESS 後下載圖片", async () => {
    vi.useFakeTimers();
    const calls: string[] = [];
    let polls = 0;
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push(url);
      if (url.endsWith("/mj/submit/imagine")) {
        expect(JSON.parse(init!.body as string).prompt).toContain("--niji 7");
        return jsonResponse({ code: 1, description: "提交成功", result: "task-1" });
      }
      if (url.endsWith("/mj/task/task-1/fetch")) {
        polls++;
        return jsonResponse(
          polls < 2
            ? { status: "IN_PROGRESS", progress: "40%" }
            : { status: "SUCCESS", imageUrl: "https://cdn.example/grid.png" },
        );
      }
      if (url === "https://cdn.example/grid.png") return pngResponse();
      throw new Error(`unexpected ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const s = makeSettings({ provider: "niji" });
    s.midjourney = { ...s.midjourney!, apiKey: "sk-mj", baseUrl: "https://relay.example/v1" };

    const promise = generateAIImage("1girl", s);
    await vi.runAllTimersAsync();
    const result = await promise;
    expect(result.success).toBe(true);
    // node 測試環境沒有 canvas，切圖失敗就用整張
    expect(result.imageBase64).toBe(PNG_BASE64);
    expect(calls[0]).toBe("https://relay.example/mj/submit/imagine");
    expect(polls).toBe(2);
  });

  it("任務失敗回傳原因", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        url.endsWith("/imagine")
          ? jsonResponse({ code: 1, result: "t2" })
          : jsonResponse({ status: "FAILURE", failReason: "Banned prompt" }),
      ),
    );
    const s = makeSettings({ provider: "midjourney" });
    s.midjourney = { ...s.midjourney!, apiKey: "k", baseUrl: "https://mj.example" };
    const promise = generateAIImage("x", s);
    await vi.runAllTimersAsync();
    const result = await promise;
    expect(result.success).toBe(false);
    expect(result.error).toContain("Banned prompt");
  });

  it("提交被拒（code 24 禁用詞）", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ code: 24, description: "可能包含敏感词" })));
    const s = makeSettings({ provider: "midjourney" });
    s.midjourney = { ...s.midjourney!, apiKey: "k", baseUrl: "https://mj.example" };
    const result = await generateAIImage("x", s);
    expect(result.success).toBe(false);
    expect(result.error).toContain("禁用詞");
  });
});
