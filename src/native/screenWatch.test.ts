import { describe, expect, it, vi } from "vitest";
import { OpenAICompatibleClient, type APIMessage } from "@/api/OpenAICompatible";
import {
  SCREEN_WATCH_CONTEXT_PLACEHOLDER,
  SCREEN_WATCH_IMAGE_PLACEHOLDER,
  attachScreenImage,
  buildScreenWatchInstruction,
} from "./screenWatch";

vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: () => false, getPlatform: () => "web", isPluginAvailable: () => false },
  registerPlugin: () => ({}),
}));

const settings = {
  maxContextLength: 4096,
  maxResponseLength: 256,
  temperature: 0.8,
  topP: 1,
  topK: 0,
  frequencyPenalty: 0,
  presencePenalty: 0,
  repetitionPenalty: 1,
  stopSequences: [],
  streaming: false,
  useStreamingWindow: false,
};

const api = (overrides: Record<string, unknown> = {}) =>
  ({
    provider: "openai" as const,
    endpoint: "https://example.test/v1/chat/completions",
    apiKey: "KEY",
    model: "fixture-model",
    directConnect: true,
    ...overrides,
  }) as any;

/** 擴充元件做的事：把佔位字串換掉 */
function fillLikeExtension(body: string, image: string, context: string): unknown {
  return JSON.parse(
    body
      .replace(SCREEN_WATCH_CONTEXT_PLACEHOLDER, JSON.stringify(context).slice(1, -1))
      .replace(SCREEN_WATCH_IMAGE_PLACEHOLDER, image),
  );
}

describe("看螢幕：附上截圖", () => {
  it("把截圖附在看螢幕的指示那一則，不動其他訊息", () => {
    const messages: APIMessage[] = [
      { role: "system", content: "人設" },
      { role: "assistant", content: "之前的聊天" },
      { role: "user", content: buildScreenWatchInstruction() },
    ];
    const result = attachScreenImage(messages);

    expect(result.slice(0, 2)).toEqual(messages.slice(0, 2));
    expect(result[2].role).toBe("user");
    expect(result[2].content).toEqual([
      { type: "text", text: buildScreenWatchInstruction() },
      {
        type: "image_url",
        image_url: { url: `data:image/jpeg;base64,${SCREEN_WATCH_IMAGE_PLACEHOLDER}`, detail: "low" },
      },
    ]);
    // 原本的陣列不變
    expect(typeof messages[2].content).toBe("string");
  });

  it("提示詞模板沒帶到指示時，在最後補一則", () => {
    const result = attachScreenImage([{ role: "system", content: "人設" }]);
    expect(result).toHaveLength(2);
    const last = result[1];
    expect(last.role).toBe("user");
    expect(JSON.stringify(last.content)).toContain(SCREEN_WATCH_IMAGE_PLACEHOLDER);
    expect(JSON.stringify(last.content)).toContain(SCREEN_WATCH_CONTEXT_PLACEHOLDER);
  });
});

describe("看螢幕：組好但不送出的請求", () => {
  const messages = attachScreenImage([
    { role: "system", content: "人設" },
    { role: "user", content: buildScreenWatchInstruction() },
  ]);

  it("OpenAI 相容：網址、headers 跟一般聊天一樣，填入截圖後是合法 JSON", () => {
    const request = new OpenAICompatibleClient(api()).buildPendingRequest({
      messages,
      settings,
      adjustLastMessageRole: false,
    });
    expect(request.format).toBe("openai");
    expect(request.url).toBe("https://example.test/v1/chat/completions");
    expect(request.headers.Authorization).toBe("Bearer KEY");
    expect(request.body).toContain(SCREEN_WATCH_IMAGE_PLACEHOLDER);
    expect(request.body).toContain(SCREEN_WATCH_CONTEXT_PLACEHOLDER);

    const filled = fillLikeExtension(request.body, "QUJD", '現在是 21:00，你剛剛說過：「哈哈"好笑"」') as any;
    expect(filled.stream).toBeFalsy();
    const last = filled.messages[filled.messages.length - 1];
    expect(last.role).toBe("user");
    expect(last.content[1].image_url.url).toBe("data:image/jpeg;base64,QUJD");
    expect(last.content[0].text).toContain('你剛剛說過：「哈哈"好笑"」');
  });

  it("Claude 快取模式（Anthropic 原生）：圖片換成 base64 區塊，佔位字串還在", () => {
    const request = new OpenAICompatibleClient(
      api({ provider: "claude", model: "claude-test", useClaudeNativeCache: true, endpoint: "https://example.test/v1" }),
    ).buildPendingRequest({ messages, settings, adjustLastMessageRole: false });
    expect(request.format).toBe("anthropic");
    expect(request.url).toBe("https://example.test/v1/messages");
    expect(request.headers["x-api-key"]).toBe("KEY");

    const filled = fillLikeExtension(request.body, "QUJD", "現在是 21:00") as any;
    const last = filled.messages[filled.messages.length - 1];
    const image = last.content.find((block: any) => block.type === "image");
    expect(image.source).toEqual({ type: "base64", media_type: "image/jpeg", data: "QUJD" });
  });
});
