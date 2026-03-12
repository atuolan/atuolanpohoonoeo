/**
 * OpenAI 兼容 API 客戶端
 * 支持 OpenAI、Claude、OpenRouter 等兼容 API
 */

import type {
    ChatSettings,
    GenerationResult,
    StreamingEvent,
} from "@/types/chat";
import type { APISettings } from "@/types/settings";

/** 預設 Cloudflare Worker 代理地址（僅 NovelAI 使用） */
// const CF_WORKER_BASE = "https://nai-proxy.aguacloud.uk";

/**
 * 圖片內容格式（用於 Vision API）
 */
export interface ImageContent {
  type: "image_url";
  image_url: {
    url: string; // 可以是 URL 或 data:image/xxx;base64,xxx 格式
    detail?: "auto" | "low" | "high";
  };
}

/**
 * 文字內容格式
 */
export interface TextContent {
  type: "text";
  text: string;
}

/**
 * 原生音頻內容格式（用於 OpenAI GPT-4o-audio 等原生支援音頻的模型）
 */
export interface InputAudioContent {
  type: "input_audio";
  input_audio: {
    data: string; // base64 編碼的音頻數據
    format: string; // 音頻格式，如 'wav', 'mp3', 'webm'
  };
}

/**
 * 消息內容（可以是純文字或混合內容）
 */
export type MessageContent =
  | string
  | Array<TextContent | ImageContent | InputAudioContent>;

/**
 * API 消息格式
 */
export interface APIMessage {
  role: "system" | "user" | "assistant";
  content: MessageContent;
  name?: string;
}

/**
 * 創建帶圖片的用戶消息
 */
export function createImageMessage(
  text: string,
  imageBase64: string,
  mimeType: string = "image/jpeg",
  detail: "auto" | "low" | "high" = "auto",
): APIMessage {
  const content: Array<TextContent | ImageContent> = [];

  // 添加文字內容
  if (text.trim()) {
    content.push({ type: "text", text });
  }

  // 添加圖片內容
  content.push({
    type: "image_url",
    image_url: {
      url: `data:${mimeType};base64,${imageBase64}`,
      detail,
    },
  });

  return {
    role: "user",
    content,
  };
}

/**
 * 創建帶圖片 URL 的用戶消息
 */
export function createImageUrlMessage(
  text: string,
  imageUrl: string,
  detail: "auto" | "low" | "high" = "auto",
): APIMessage {
  const content: Array<TextContent | ImageContent> = [];

  if (text.trim()) {
    content.push({ type: "text", text });
  }

  content.push({
    type: "image_url",
    image_url: {
      url: imageUrl,
      detail,
    },
  });

  return {
    role: "user",
    content,
  };
}

/**
 * 創建帶音頻的用戶消息（image_url 兼容模式）
 * 將音頻 data URI 包裝為 type: "image_url"，通用兼容所有 OpenAI 兼容 API
 */
export function createAudioMessage(
  text: string,
  audioDataUri: string,
): APIMessage {
  const content: Array<TextContent | ImageContent> = [];

  if (text.trim()) {
    content.push({ type: "text", text });
  }

  content.push({
    type: "image_url",
    image_url: {
      url: audioDataUri,
    },
  });

  return {
    role: "user",
    content,
  };
}

/**
 * 創建帶音頻的用戶消息（input_audio 原生模式）
 * 使用 type: "input_audio"，僅適用於 OpenAI GPT-4o-audio 等原生支援音頻的模型
 */
export function createAudioMessageNative(
  text: string,
  audioBase64: string,
  format: string,
): APIMessage {
  const content: Array<TextContent | InputAudioContent> = [];

  if (text.trim()) {
    content.push({ type: "text", text } as TextContent);
  }

  content.push({
    type: "input_audio",
    input_audio: {
      data: audioBase64,
      format,
    },
  });

  return {
    role: "user",
    content,
  };
}

/**
 * API 請求參數
 */
export interface GenerationParams {
  messages: APIMessage[];
  settings: ChatSettings;
  apiSettings: APISettings;
  signal?: AbortSignal;
  /** 是否對最後一條訊息執行模型特定的 role 轉換（Gemini→assistant / Claude→user）。
   *  僅聊天 API 調用應設為 true，其他場景（來電決策、主動消息等）預設 false 不轉換。 */
  adjustLastMessageRole?: boolean;
}

/**
 * OpenAI 兼容 API 客戶端
 */
export class OpenAICompatibleClient {
  private apiSettings: APISettings;

  constructor(apiSettings: APISettings) {
    this.apiSettings = apiSettings;
  }

  /**
   * 更新 API 設定
   */
  updateSettings(settings: Partial<APISettings>): void {
    this.apiSettings = { ...this.apiSettings, ...settings };
  }

  /**
   * AI API 代理專用子域名（灰雲 DNS only，繞過 Cloudflare 100s timeout）
   */
  private static readonly AI_PROXY_HOST = "https://api-203.aguacloud.uk";

  /**
   * 將外部 API URL 轉為代理路徑（解決 CORS 問題）
   * 走灰雲子域名 api-203.aguacloud.uk（繞過 Cloudflare 100s timeout 限制）
   * 若啟用直連模式則跳過代理，直接從瀏覽器發出請求
   */
  private toProxyUrl(url: string): string {
    // 直連模式：不走代理，直接請求外部 API
    if (this.apiSettings.directConnect) return url;

    // 只在瀏覽器環境且是外部 URL 時才代理
    if (typeof window === "undefined") return url;

    try {
      const parsed = new URL(url, window.location.origin);
      // 如果是同源請求或相對路徑，不需要代理
      if (parsed.origin === window.location.origin) {
        // 安全檢查：如果同源 URL 包含 /ai-proxy/，代表用戶可能把 endpoint 設成了主域名的代理路徑
        // 這會走 Cloudflare 橙雲，有 100s timeout 限制，需要重導到灰雲子域名
        if (parsed.pathname.startsWith('/ai-proxy')) {
          console.warn(`[API] 偵測到 AI 請求走主域名代理路徑，重導到灰雲子域名: ${url}`);
          return `${OpenAICompatibleClient.AI_PROXY_HOST}${parsed.pathname}`;
        }
        return url;
      }

      // 走灰雲子域名，繞過 Cloudflare timeout
      const prefix =
        parsed.protocol === "http:" ? "/ai-proxy-http/" : "/ai-proxy/";
      return `${OpenAICompatibleClient.AI_PROXY_HOST}${prefix}${parsed.host}${parsed.pathname}`;
    } catch {
      return url;
    }
  }

  /**
   * 獲取完整端點 URL
   */
  private getEndpoint(): string {
    let endpoint = this.apiSettings.endpoint;

    // 確保有 /chat/completions 路徑
    if (!endpoint.endsWith("/chat/completions")) {
      if (!endpoint.endsWith("/")) {
        endpoint += "/";
      }
      // 處理不同的 API 格式
      if (endpoint.includes("/v1/")) {
        endpoint = endpoint.replace(/\/v1\/$/, "/v1/chat/completions");
      } else if (endpoint.endsWith("/")) {
        endpoint += "v1/chat/completions";
      }
    }

    return this.toProxyUrl(endpoint);
  }

  /**
   * 建構請求頭
   */
  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (this.apiSettings.apiKey) {
      headers["Authorization"] = `Bearer ${this.apiSettings.apiKey}`;
    }

    // 添加自定義頭
    if (this.apiSettings.customHeaders) {
      Object.assign(headers, this.apiSettings.customHeaders);
    }

    return headers;
  }

  /**
   * 檢測當前模型是否為 Claude 系列
   * 透過 provider 和模型名稱雙重判斷
   */
  private isClaudeModel(): boolean {
    const model = this.apiSettings.model.toLowerCase();
    if (this.apiSettings.provider === "claude") return true;
    return model.includes("claude");
  }

  private isGeminiModel(): boolean {
    const model = this.apiSettings.model.toLowerCase();
    if (this.apiSettings.provider === "gemini") return true;
    return model.includes("gemini");
  }

  /**
   * 建構請求體
   */
  private buildRequestBody(
    messages: APIMessage[],
    settings: ChatSettings,
    stream: boolean,
    adjustLastMessageRole: boolean = false,
  ): Record<string, unknown> {
    let processedMessages = [...messages];

    // 確保 messages 中至少有一條 user 訊息
    // 某些 API（如 Google AI）要求 contents 中必須有 user 訊息
    // 如果全部都是 system role，將最後一條 system 轉為 user
    const hasUserMessage = processedMessages.some((m) => m.role === "user");
    if (!hasUserMessage && processedMessages.length > 0) {
      const lastIdx = processedMessages.length - 1;
      processedMessages[lastIdx] = {
        ...processedMessages[lastIdx],
        role: "user",
      };
    }

    // 僅在聊天 API 調用時（adjustLastMessageRole=true）才執行末尾 role 轉換
    // 避免來電決策、主動消息等非聊天場景的格式被破壞
    if (adjustLastMessageRole && processedMessages.length > 0) {
      const lastMsg = processedMessages[processedMessages.length - 1];

      if (this.isGeminiModel() && lastMsg.role !== "assistant") {
        console.log(
          `[API] Gemini 模型：最後訊息角色 "${lastMsg.role}" → "assistant"`,
        );
        lastMsg.role = "assistant";
      } else if (this.isClaudeModel() && lastMsg.role !== "user") {
        console.log(
          `[API] Claude 模型：最後訊息角色 "${lastMsg.role}" → "user"`,
        );
        lastMsg.role = "user";
      }
    }

    const body: Record<string, unknown> = {
      model: this.apiSettings.model,
      messages: processedMessages,
      stream,
      max_tokens: settings.maxResponseLength,
      temperature: settings.temperature,
    };

    // 可選參數
    if (settings.topP !== 1) {
      body.top_p = settings.topP;
    }
    if (settings.frequencyPenalty !== 0) {
      body.frequency_penalty = settings.frequencyPenalty;
    }
    if (settings.presencePenalty !== 0) {
      body.presence_penalty = settings.presencePenalty;
    }
    if (settings.stopSequences && settings.stopSequences.length > 0) {
      body.stop = settings.stopSequences;
    }

    return body;
  }

  /**
   * 非流式生成
   */
  async generate(params: GenerationParams): Promise<GenerationResult> {
    const startTime = Date.now();
    const { messages, settings, signal, adjustLastMessageRole } = params;

    const response = await fetch(this.getEndpoint(), {
      method: "POST",
      headers: this.getHeaders(),
      body: JSON.stringify(this.buildRequestBody(messages, settings, false, adjustLastMessageRole)),
      signal,
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`API error: ${response.status} - ${error}`);
    }

    const data = await response.json();
    const generationTime = Date.now() - startTime;

    // 解析回應
    const choice = data.choices?.[0];
    const content = choice?.message?.content ?? "";
    const stopReason = choice?.finish_reason === "length" ? "length" : "stop";

    return {
      content,
      tokenCount: {
        prompt: data.usage?.prompt_tokens ?? 0,
        completion: data.usage?.completion_tokens ?? 0,
        total: data.usage?.total_tokens ?? 0,
      },
      generationTime,
      stopReason,
      model: data.model ?? this.apiSettings.model,
    };
  }

  /**
   * 流式生成（內部實現）
   */
  private async *_generateStreamInternal(
    params: GenerationParams,
  ): AsyncGenerator<StreamingEvent> {
    const { messages, settings, signal, adjustLastMessageRole } = params;

    const response = await fetch(this.getEndpoint(), {
      method: "POST",
      headers: {
        ...this.getHeaders(),
        "Accept": "text/event-stream",
        "Cache-Control": "no-cache",
      },
      body: JSON.stringify(this.buildRequestBody(messages, settings, true, adjustLastMessageRole)),
      signal,
    });

    if (!response.ok) {
      const error = await response.text();
      // 針對常見 HTTP 狀態碼提供更明確的中文診斷
      let diagnosis = '';
      if (response.status === 524) {
        diagnosis = '\n[診斷] 524 = Cloudflare 超時。請求可能走了橙雲域名而非灰雲 api-203。請清除瀏覽器快取後重試。';
      } else if (response.status === 502) {
        diagnosis = '\n[診斷] 502 = 代理層無法連接上游 AI API。可能是上游地址錯誤或服務器網路異常。';
      } else if (response.status === 503) {
        diagnosis = '\n[診斷] 503 = 上游 AI 服務暫時不可用，請稍後重試。';
      } else if (response.status === 429) {
        diagnosis = '\n[診斷] 429 = API 請求頻率過高或額度用盡，請檢查 API Key 餘額。';
      } else if (response.status === 401 || response.status === 403) {
        diagnosis = `\n[診斷] ${response.status} = API Key 無效或無權限，請檢查 API Key 設定。`;
      }
      yield {
        type: "error",
        error: `API error: ${response.status} - ${error.slice(0, 1000)}${diagnosis}`,
      };
      return;
    }

    // 檢查回應格式：某些 API 錯誤會回 JSON/HTML 而非 SSE 串流
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('text/html')) {
      const htmlBody = await response.text();
      yield {
        type: "error",
        error: `非預期的回應格式 (${contentType})，可能是代理層錯誤頁面: ${htmlBody.slice(0, 500)}`,
      };
      return;
    }

    const reader = response.body?.getReader();
    if (!reader) {
      yield { type: "error", error: "No response body（回應體為空，可能是網路中斷）" };
      return;
    }

    const decoder = new TextDecoder();
    let buffer = "";
    let fullContent = "";
    let chunkCount = 0;
    let totalBytes = 0;
    let firstChunkTime = 0;
    const streamStartTime = Date.now();
    let streamUsage: { prompt_tokens: number; completion_tokens: number; total_tokens: number } | null = null;
    // 記錄非 SSE 格式的行（用於診斷上游回了非串流回應的情況）
    let nonSSELines: string[] = [];

    const processLine = (line: string): { delta: string | null; usage?: typeof streamUsage } => {
      const trimmed = line.trim();
      if (!trimmed || trimmed === "data: [DONE]") return { delta: null };
      if (!trimmed.startsWith("data: ")) {
        // 記錄非 SSE 格式的行，幫助診斷
        if (trimmed.length > 0 && nonSSELines.length < 5) {
          nonSSELines.push(trimmed.slice(0, 200));
        }
        return { delta: null };
      }
      try {
        const json = JSON.parse(trimmed.slice(6));
        // 檢查上游是否回了錯誤物件（某些 API 在串流中回 error）
        if (json.error) {
          const errMsg = typeof json.error === 'string' ? json.error : (json.error.message || JSON.stringify(json.error));
          console.error(`[API Stream] 上游串流中回傳錯誤: ${errMsg}`);
          // 把錯誤當作 delta 回傳，讓用戶看到
          return { delta: `\n[API 錯誤] ${errMsg}` };
        }
        // 捕獲 usage（OpenAI / OpenRouter 等會在最後一個 chunk 或獨立 chunk 中返回）
        if (json.usage) {
          return {
            delta: json.choices?.[0]?.delta?.content ?? null,
            usage: {
              prompt_tokens: json.usage.prompt_tokens ?? 0,
              completion_tokens: json.usage.completion_tokens ?? 0,
              total_tokens: json.usage.total_tokens ?? 0,
            },
          };
        }
        return { delta: json.choices?.[0]?.delta?.content ?? null };
      } catch {
        return { delta: null };
      }
    };

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        chunkCount++;
        if (chunkCount === 1) firstChunkTime = Date.now() - streamStartTime;
        totalBytes += value?.byteLength ?? 0;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const result = processLine(line);
          if (result.usage) streamUsage = result.usage;
          if (result.delta) {
            fullContent += result.delta;
            yield { type: "token", token: result.delta };
          }
        }
      }

      // 處理 buffer 中殘留的最後一行（移動端瀏覽器常見）
      if (buffer.trim()) {
        const result = processLine(buffer);
        if (result.usage) streamUsage = result.usage;
        if (result.delta) {
          fullContent += result.delta;
          yield { type: "token", token: result.delta };
        }
      }

      const totalTime = Date.now() - streamStartTime;

      // 空回應：提供詳細診斷資訊
      if (!fullContent) {
        const diagParts = [
          `[API Stream] 流式回應為空`,
          `chunks: ${chunkCount}`,
          `bytes: ${totalBytes}`,
          `耗時: ${totalTime}ms`,
          `首chunk: ${firstChunkTime}ms`,
        ];
        if (buffer.trim()) diagParts.push(`buffer殘留: "${buffer.slice(0, 200)}"`);
        if (nonSSELines.length > 0) diagParts.push(`非SSE內容: ${JSON.stringify(nonSSELines)}`);
        const diagMsg = diagParts.join(' | ');
        console.warn(diagMsg);

        // 根據情況給用戶更有用的錯誤提示
        if (chunkCount === 0) {
          yield {
            type: "error",
            error: `連接已建立但未收到任何數據（可能是代理超時或上游無回應）。\n${diagMsg}`,
          };
          return;
        } else if (nonSSELines.length > 0 && totalBytes > 0) {
          yield {
            type: "error",
            error: `收到了數據但非串流格式，上游可能回傳了錯誤頁面: ${nonSSELines[0]}\n${diagMsg}`,
          };
          return;
        }
      }

      yield { type: "done", content: fullContent, usage: streamUsage ?? undefined };
    } catch (e) {
      const totalTime = Date.now() - streamStartTime;
      if ((e as Error).name === "AbortError") {
        yield { type: "done", content: fullContent };
      } else {
        const errMsg = e instanceof Error ? e.message : String(e);
        // 網路錯誤附加診斷
        let diagnosis = '';
        if (errMsg.includes('NetworkError') || errMsg.includes('Failed to fetch') || errMsg.includes('network')) {
          diagnosis = `\n[診斷] 網路中斷（已收到 ${chunkCount} chunks / ${totalBytes} bytes / ${totalTime}ms）。`;
          if (chunkCount > 0) {
            diagnosis += ' 串流中途斷開，可能是代理層超時或用戶網路不穩。';
          } else {
            diagnosis += ' 完全無法連接代理服務器，請檢查網路。';
          }
        }
        yield { type: "error", error: `${errMsg}${diagnosis}` };
      }
    } finally {
      reader.releaseLock();
    }
  }

  /**
   * 流式生成（帶 NetworkError 自動重試）
   */
  async *generateStream(
    params: GenerationParams,
  ): AsyncGenerator<StreamingEvent> {
    let hasYieldedTokens = false;

    try {
      for await (const event of this._generateStreamInternal(params)) {
        if (event.type === "token") hasYieldedTokens = true;
        yield event;
        // 如果已經收到 done 或 error，直接結束
        if (event.type === "done" || event.type === "error") return;
      }
    } catch (e) {
      if ((e as Error).name === "AbortError" || params.signal?.aborted) {
        yield { type: "done", content: "" };
        return;
      }

      const errMsg = e instanceof Error ? e.message : String(e);
      const isNetworkError =
        errMsg.includes("NetworkError") ||
        errMsg.includes("Failed to fetch") ||
        errMsg.includes("network") ||
        errMsg.includes("ERR_CONNECTION");

      // 只在尚未收到任何 token 且是 NetworkError 時重試一次
      if (isNetworkError && !hasYieldedTokens && !params.signal?.aborted) {
        console.warn(`[API Stream] NetworkError detected, retrying once... (${errMsg})`);
        try {
          for await (const event of this._generateStreamInternal(params)) {
            yield event;
            if (event.type === "done" || event.type === "error") return;
          }
        } catch (retryErr) {
          if ((retryErr as Error).name === "AbortError" || params.signal?.aborted) {
            yield { type: "done", content: "" };
          } else {
            yield {
              type: "error",
              error: retryErr instanceof Error ? retryErr.message : String(retryErr),
            };
          }
        }
      } else {
        yield { type: "error", error: errMsg };
      }
    }
  }

  /**
   * 測試連接
   */
  async testConnection(): Promise<{
    success: boolean;
    message: string;
    response?: string;
  }> {
    try {
      const result = await this.generate({
        messages: [{ role: "user", content: "Hi" }],
        settings: {
          maxContextLength: 1024,
          maxResponseLength: 50,
          temperature: 0.7,
          topP: 1,
          topK: 0,
          frequencyPenalty: 0,
          presencePenalty: 0,
          repetitionPenalty: 1,
          stopSequences: [],
          streaming: false,
          useStreamingWindow: false,
        },
        apiSettings: this.apiSettings,
      });

      if (result.content) {
        return {
          success: true,
          message: "連接成功",
          response: result.content.slice(0, 100), // 限制長度
        };
      } else {
        return {
          success: false,
          message: "API 返回空內容",
        };
      }
    } catch (e) {
      const errorStr = e instanceof Error ? e.message : String(e);
      return {
        success: false,
        message: errorStr,
      };
    }
  }
}

// 全局單例
let apiClient: OpenAICompatibleClient | null = null;

/**
 * 獲取 API 客戶端實例
 */
export function getAPIClient(settings?: APISettings): OpenAICompatibleClient {
  if (!apiClient && settings) {
    apiClient = new OpenAICompatibleClient(settings);
  }
  if (!apiClient) {
    // 使用默認設定
    apiClient = new OpenAICompatibleClient({
      provider: "openai",
      endpoint: "https://api.openai.com/v1",
      apiKey: "",
      model: "gpt-4o-mini",
    });
  }
  return apiClient;
}

/**
 * 更新 API 客戶端設定
 */
export function updateAPIClient(settings: APISettings): void {
  if (apiClient) {
    apiClient.updateSettings(settings);
  } else {
    apiClient = new OpenAICompatibleClient(settings);
  }
}
