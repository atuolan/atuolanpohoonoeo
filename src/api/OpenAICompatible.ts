/**
 * OpenAI 兼容 API 客戶端
 * 支持 OpenAI、Claude、OpenRouter 等兼容 API
 */

import type {
    ChatSettings,
    GenerationDiagnostics,
    GenerationMessageDiagnostic,
    GenerationResult,
    GenerationStopReason,
    StreamingEvent,
} from "@/types/chat";
import type { APISettings } from "@/types/settings";

/** 預設 Cloudflare Worker 代理地址（僅 NovelAI 使用） */
// const CF_WORKER_BASE = "https://nai-proxy.aguacloud.uk";

/**
 * 「動態」提示詞 identifier 集合（與 PromptBuilder.DYNAMIC_PROMPT_IDENTIFIERS 對齊）。
 * 這些 system 內容每輪都會變動（時間/秒數、天氣、時區本地時間、節日日期），
 * Anthropic 原生緩存（方案B）會把它們排到 cache_control 斷點「之後」、不緩存，
 * 以保證可緩存前綴逐字節穩定，達成 cache_read 命中。
 *
 * 註：此處內聯一份以避免 API 層反向依賴 engine 層造成循環依賴。
 */
const ANTHROPIC_DYNAMIC_IDENTIFIERS: ReadonlySet<string> = new Set([
  "timeInfo",
  "f2fTimeInfo",
  "gcTimeInfo",
  "timeJump",
  "f2fTimeJump",
  "gcTimeJump",
  "weatherInfo",
  "f2fWeatherInfo",
  "gcWeatherInfo",
  "characterWorldContext",
  "f2fCharacterWorldContext",
  "gcCharacterWorldContext",
  "holidayInfo",
  "f2fHolidayInfo",
  "gcHolidayInfo",
]);

/**
 * 判定（可能為複合 "a+b+c" 形式的）identifier 是否屬於動態提示詞。
 * 只要任一段命中動態集合即視為動態。
 */
function isAnthropicDynamicIdentifier(identifier: string | undefined): boolean {
  if (!identifier) return false;
  return identifier
    .split("+")
    .some((p) => ANTHROPIC_DYNAMIC_IDENTIFIERS.has(p.trim()));
}

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
 * Anthropic 緩存控制標記
 * 掛在內容塊上以啟用 Anthropic Prompt Caching（前綴緩存）。
 */
export interface CacheControl {
  type: "ephemeral";
}

/**
 * 文字內容格式
 */
export interface TextContent {
  type: "text";
  text: string;
  /** Anthropic 緩存斷點標記（僅 Claude 原生緩存模式使用，OpenAI 路徑會忽略） */
  cache_control?: CacheControl;
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
  /**
   * 提示詞標識符（來自 PromptBuilder 的 BuiltMessage.identifier）。
   * Anthropic 原生緩存（方案B）用它把 system 內容分類為
   * 「穩定塊（可緩存）」與「動態塊（時間/天氣/時區/節日，不緩存）」。
   */
  identifier?: string;
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

interface BuiltRequest {
  body: Record<string, unknown>;
  diagnostics: GenerationDiagnostics;
}

interface StreamLineResult {
  delta: string | null;
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number } | null;
  rawFinishReason?: string;
  finishReason?: GenerationStopReason;
  promptFeedback?: unknown;
  safetyRatings?: unknown;
  rawResponseMeta?: unknown;
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
  private static readonly AI_PROXY_HOST = "https://tight-sun-f7fa.a23971123.workers.dev";

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
   * Anthropic 原生端點 /v1/messages（Claude 緩存模式專用）
   * 將用戶設定的端點正規化為 .../v1/messages，並走既有代理。
   */
  private getAnthropicEndpoint(): string {
    let endpoint = this.apiSettings.endpoint.trim();

    // 已經是 /v1/messages：直接用
    if (endpoint.endsWith("/v1/messages")) {
      return this.toProxyUrl(endpoint);
    }

    // 去掉 OpenAI 風格的尾巴，再補上 /v1/messages
    endpoint = endpoint
      .replace(/\/chat\/completions\/?$/, "")
      .replace(/\/v1\/?$/, "")
      .replace(/\/+$/, "");

    return this.toProxyUrl(`${endpoint}/v1/messages`);
  }

  /**
   * 是否應該走 Anthropic 原生緩存路徑
   * 條件：用戶開啟 useClaudeNativeCache 開關 且 當前為 Claude 模型。
   */
  private shouldUseAnthropicNative(): boolean {
    return !!this.apiSettings.useClaudeNativeCache && this.isClaudeModel();
  }

  /**
   * 建構請求頭
   */
  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (this.shouldUseAnthropicNative()) {
      // Anthropic 原生：使用 x-api-key + anthropic-version，不用 Authorization
      if (this.apiSettings.apiKey) {
        headers["x-api-key"] = this.apiSettings.apiKey;
      }
      headers["anthropic-version"] = "2023-06-01";
    } else if (this.apiSettings.apiKey) {
      headers["Authorization"] = `Bearer ${this.apiSettings.apiKey}`;
    }

    // 添加自定義頭（用戶自定義優先級最高，可覆蓋上面的預設）
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
   * 檢測當前模型是否為 DeepSeek Reasoner 系列
   * DS reasoner 要求訊息嚴格 user/assistant 交替，不允許連續相同 role
   */
  private isDeepSeekReasonerModel(): boolean {
    const model = this.apiSettings.model.toLowerCase();
    return model.includes("deepseek-reasoner") || model.includes("deepseek-r1");
  }

  /**
   * 強制訊息嚴格交替（user/assistant）
   * 用於 DeepSeek Reasoner 等要求嚴格交替的模型
   *
   * 處理策略：
   * 1. 保留第一條 system 訊息不動
   * 2. 後續的 system 訊息合併到相鄰的 user 訊息中
   * 3. 連續相同 role 的訊息合併為一條
   * 4. 確保最終結果嚴格 user/assistant 交替
   */
  private enforceStrictAlternation(messages: APIMessage[]): APIMessage[] {
    if (messages.length === 0) return [];

    const result: APIMessage[] = [];
    let startIdx = 0;

    // 保留第一條 system 訊息（DS reasoner 允許開頭有一條 system）
    if (messages[0].role === "system") {
      // 合併開頭連續的 system 訊息為一條
      let systemContent = this.getMessageText(messages[0]);
      startIdx = 1;
      while (startIdx < messages.length && messages[startIdx].role === "system") {
        systemContent += "\n\n" + this.getMessageText(messages[startIdx]);
        startIdx++;
      }
      result.push({ role: "system", content: systemContent });
    }

    // 處理剩餘訊息：system → user，然後合併連續相同 role
    const remaining: APIMessage[] = [];
    for (let i = startIdx; i < messages.length; i++) {
      const msg = messages[i];
      // system 訊息轉為 user（DS reasoner 不允許中間出現 system）
      const role: "user" | "assistant" = msg.role === "assistant" ? "assistant" : "user";
      remaining.push({ ...msg, role });
    }

    // 合併連續相同 role 的訊息
    for (const msg of remaining) {
      const last = result[result.length - 1];
      if (last && last.role === msg.role) {
        // 合併到上一條
        last.content = this.mergeMessageContent(last.content, msg.content);
      } else {
        result.push({ ...msg });
      }
    }

    console.debug(
      `[API] enforceStrictAlternation: ${messages.length} → ${result.length} 條訊息`,
    );
    return result;
  }

  private mergeMessageContent(
    first: MessageContent,
    second: MessageContent,
  ): MessageContent {
    const firstParts = typeof first === "string" ? [{ type: "text" as const, text: first }] : first;
    const secondParts = typeof second === "string" ? [{ type: "text" as const, text: second }] : second;
    const merged = [...firstParts];
    const firstText = typeof first === "string" ? first : this.getMessageText({ role: "user", content: first });
    const secondText = typeof second === "string" ? second : this.getMessageText({ role: "user", content: second });

    if (firstText && secondText) {
      let lastTextIndex = -1;
      for (let i = merged.length - 1; i >= 0; i--) {
        if (merged[i].type === "text") {
          lastTextIndex = i;
          break;
        }
      }
      if (lastTextIndex >= 0 && merged[lastTextIndex].type === "text") {
        merged[lastTextIndex] = {
          type: "text",
          text: `${(merged[lastTextIndex] as TextContent).text}\n\n${secondText}`,
        };
        merged.push(...secondParts.filter((part) => part.type !== "text"));
        return merged;
      }
    }

    return [...merged, ...secondParts];
  }

  /**
   * 從 APIMessage 中提取純文字內容
   */
  private getMessageText(msg: APIMessage): string {
    if (typeof msg.content === "string") return msg.content;
    // 混合內容（圖片+文字）：提取所有文字部分
    return msg.content
      .filter((c): c is TextContent => c.type === "text")
      .map((c) => c.text)
      .join("\n");
  }

  private byteLength(text: string): number {
    return new TextEncoder().encode(text).length;
  }

  private normalizeStopReason(raw: unknown): GenerationStopReason {
    if (raw === undefined || raw === null || raw === "") return "stop";
    const value = String(raw).toLowerCase().replace(/[\s-]+/g, "_");
    if (value === "stop" || value === "end_turn" || value === "finished") return "stop";
    if (value === "length" || value === "max_tokens" || value === "max_output_tokens") return "length";
    if (value.includes("content_filter")) return "content_filter";
    if (value.includes("safety")) return "safety";
    if (value.includes("recitation")) return "recitation";
    if (value.includes("prohibited")) return "prohibited_content";
    if (value.includes("blocklist") || value.includes("blocked")) return "blocklist";
    if (value.includes("error")) return "error";
    return "other";
  }

  private summarizeMessage(
    msg: APIMessage,
    index: number,
  ): GenerationMessageDiagnostic {
    const contentType =
      typeof msg.content === "string"
        ? "text"
        : Array.isArray(msg.content)
          ? "multipart"
          : "unknown";
    return {
      index,
      role: msg.role,
      contentLength: this.getMessageText(msg).length,
      contentType,
    };
  }

  private summarizeResponseMeta(data: any, choice: any, rawFinishReason?: string) {
    return {
      id: data?.id,
      object: data?.object,
      created: data?.created,
      model: data?.model,
      choicesLength: Array.isArray(data?.choices) ? data.choices.length : undefined,
      candidatesLength: Array.isArray(data?.candidates) ? data.candidates.length : undefined,
      rawFinishReason,
      finishReason: this.normalizeStopReason(rawFinishReason),
      choiceKeys: choice && typeof choice === "object" ? Object.keys(choice) : undefined,
      promptFeedback: data?.promptFeedback ?? data?.prompt_feedback,
    };
  }

  private extractResponseDiagnostics(
    data: any,
    choice: any,
    base: GenerationDiagnostics,
    contentLength: number,
  ): GenerationDiagnostics {
    const rawFinishReason =
      choice?.finish_reason ??
      choice?.finishReason ??
      data?.candidates?.[0]?.finishReason ??
      data?.finishReason;
    const normalized = this.normalizeStopReason(rawFinishReason);
    const promptFeedback = data?.promptFeedback ?? data?.prompt_feedback;
    const safetyRatings =
      choice?.safety_ratings ??
      choice?.safetyRatings ??
      data?.candidates?.[0]?.safetyRatings ??
      data?.safetyRatings;
    return {
      ...base,
      rawFinishReason: rawFinishReason !== undefined ? String(rawFinishReason) : undefined,
      finishReason: normalized,
      apiContentLength: contentLength,
      usage: data?.usage
        ? {
            prompt_tokens: data.usage.prompt_tokens ?? 0,
            completion_tokens: data.usage.completion_tokens ?? 0,
            total_tokens: data.usage.total_tokens ?? 0,
          }
        : undefined,
      promptFeedback,
      safetyRatings,
      rawResponseMeta: this.summarizeResponseMeta(data, choice, rawFinishReason),
    };
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
    return this.buildRequest(messages, settings, stream, adjustLastMessageRole).body;
  }

  private buildRequest(
    messages: APIMessage[],
    settings: ChatSettings,
    stream: boolean,
    adjustLastMessageRole: boolean = false,
  ): BuiltRequest {
    let processedMessages = [...messages];
    const roleAdjustments: NonNullable<GenerationDiagnostics["roleAdjustments"]> = [];

    // 確保 messages 中至少有一條 user 訊息
    // 某些 API（如 Google AI）要求 contents 中必須有 user 訊息
    // 如果全部都是 system role，將最後一條 system 轉為 user
    const hasUserMessage = processedMessages.some((m) => m.role === "user");
    if (!hasUserMessage && processedMessages.length > 0) {
      const lastIdx = processedMessages.length - 1;
      const before = processedMessages[lastIdx].role;
      processedMessages[lastIdx] = {
        ...processedMessages[lastIdx],
        role: "user",
      };
      roleAdjustments.push({
        reason: "ensure-user-message",
        before,
        after: "user",
      });
    }

    // 僅在聊天 API 調用時（adjustLastMessageRole=true）才執行末尾 role 轉換
    // 避免來電決策、主動消息等非聊天場景的格式被破壞
    if (adjustLastMessageRole && processedMessages.length > 0) {
      const lastMsg = processedMessages[processedMessages.length - 1];

      if (this.isGeminiModel() && lastMsg.role !== "assistant") {
        const before = lastMsg.role;
        console.log(
          `[API] Gemini 模型：最後訊息角色 "${lastMsg.role}" → "assistant"`,
        );
        lastMsg.role = "assistant";
        roleAdjustments.push({
          reason: "gemini-last-message-role",
          before,
          after: "assistant",
        });
      } else if (this.isClaudeModel() && lastMsg.role !== "user") {
        const before = lastMsg.role;
        console.log(
          `[API] Claude 模型：最後訊息角色 "${lastMsg.role}" → "user"`,
        );
        lastMsg.role = "user";
        roleAdjustments.push({
          reason: "claude-last-message-role",
          before,
          after: "user",
        });
      }
    }

    // DeepSeek Reasoner 特殊處理：強制訊息嚴格 user/assistant 交替
    // DS reasoner 不允許連續相同 role 或中間出現 system 訊息
    if (this.isDeepSeekReasonerModel()) {
      processedMessages = this.enforceStrictAlternation(processedMessages);
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
      // DeepSeek API 要求 top_p > 0
      body.top_p = settings.topP || Number.EPSILON;
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

    const bodyText = JSON.stringify(body);
    const diagnostics: GenerationDiagnostics = {
      model: this.apiSettings.model,
      stream,
      maxTokens: settings.maxResponseLength,
      requestBodyBytes: this.byteLength(bodyText),
      requestMessageCount: processedMessages.length,
      requestRoles: processedMessages.map((message) => message.role),
      lastMessages: processedMessages
        .slice(-8)
        .map((message, offset) =>
          this.summarizeMessage(
            message,
            processedMessages.length - Math.min(processedMessages.length, 8) + offset,
          ),
        ),
      roleAdjustments,
    };

    return { body, diagnostics };
  }

  /**
   * 取得一個在同一 user/session 內保持穩定的 user_id（Anthropic 路由提示）。
   * 用穩定字串確保連續請求落到同一節點，緩存才讀得到。
   * 優先用 customHeaders 內既有的識別碼，否則用 apiKey 雜湊作為穩定值，最後退回固定字串。
   */
  private getAnthropicUserId(): string {
    const headerId = this.apiSettings.customHeaders?.["x-user-id"];
    if (headerId) return headerId;

    const key = this.apiSettings.apiKey || "";
    if (key) {
      // 簡單穩定雜湊（非加密用途，只為產生穩定路由值）
      let hash = 0;
      for (let i = 0; i < key.length; i++) {
        hash = (hash * 31 + key.charCodeAt(i)) | 0;
      }
      return `aguaphone-${(hash >>> 0).toString(36)}`;
    }
    return "aguaphone-default-user";
  }

  /**
   * 建構 Anthropic 原生 /v1/messages 請求體（Claude 緩存模式）。
   *
   * 與 OpenAI 格式的差異：
   * 1. system 訊息抽成頂層 `system` 陣列（不放進 messages）
   * 2. messages 只保留 user / assistant，並轉成 content block 陣列
   * 3. 在 system 最後一塊與最後一條歷史訊息掛 cache_control: ephemeral 作為緩存斷點
   * 4. 頂層加 metadata.user_id 作為路由提示（緩存命中必要條件）
   *
   * 緩存最低門檻為 2048 tokens；若 system 太短，緩存會被上游靜默忽略（不報錯）。
   */
  private buildAnthropicRequest(
    messages: APIMessage[],
    settings: ChatSettings,
    stream: boolean,
    adjustLastMessageRole: boolean = false,
  ): BuiltRequest {
    const processedMessages = [...messages];
    const roleAdjustments: NonNullable<GenerationDiagnostics["roleAdjustments"]> = [];

    // Claude 要求最後一條訊息為 user（與 OpenAI 路徑一致的調整）
    if (adjustLastMessageRole && processedMessages.length > 0) {
      const lastMsg = processedMessages[processedMessages.length - 1];
      if (lastMsg.role !== "user" && lastMsg.role !== "system") {
        const before = lastMsg.role;
        lastMsg.role = "user";
        roleAdjustments.push({
          reason: "claude-last-message-role",
          before,
          after: "user",
        });
      }
    }

    // 1. 分離 system 與對話訊息。
    //    方案B：依 identifier 把 system 內容再分成「穩定塊」與「動態塊」：
    //      - 穩定塊：角色設定/世界書/規則等每輪不變的內容 → 可緩存
    //      - 動態塊：時間(含秒)/天氣/時區本地時間/節日等每輪變動的內容 → 不緩存
    //    動態塊若混進緩存前綴，會使前綴逐字節不同，導致「只寫入不讀取」。
    const stableSystemTexts: string[] = [];
    const dynamicSystemTexts: string[] = [];
    const convoMessages: APIMessage[] = [];
    for (const msg of processedMessages) {
      if (msg.role === "system") {
        const text = this.getMessageText(msg);
        if (!text.trim()) continue;
        if (isAnthropicDynamicIdentifier(msg.identifier)) {
          dynamicSystemTexts.push(text);
        } else {
          stableSystemTexts.push(text);
        }
      } else {
        convoMessages.push(msg);
      }
    }

    // 2. 建構頂層 system 陣列：
    //    [穩定塊(掛 cache_control 斷點), 動態塊(無斷點、不緩存)]
    //    Anthropic 緩存採前綴比對，斷點之前（=穩定塊）逐字節穩定即可被後續命中；
    //    動態塊排在斷點之後，每輪變動也不影響前綴緩存。
    const systemBlocks: Array<TextContent> = [];
    if (stableSystemTexts.length > 0) {
      systemBlocks.push({
        type: "text",
        text: stableSystemTexts.join("\n\n"),
        cache_control: { type: "ephemeral" },
      });
    }
    if (dynamicSystemTexts.length > 0) {
      // 若沒有任何穩定塊（理論上罕見），動態塊也不掛斷點，避免緩存變動內容。
      systemBlocks.push({
        type: "text",
        text: dynamicSystemTexts.join("\n\n"),
      });
    }

    // 3. 將對話訊息轉為 Anthropic content block 格式
    //    確保至少有一條 user 訊息（Anthropic 要求 messages 非空且首條通常為 user）
    const anthropicMessages = convoMessages.map((msg) => {
      const role: "user" | "assistant" =
        msg.role === "assistant" ? "assistant" : "user";
      const content = this.toAnthropicContent(msg.content);
      return { role, content };
    });

    // 若沒有任何對話訊息，補一條空 user（避免 Anthropic 400）
    if (anthropicMessages.length === 0) {
      anthropicMessages.push({
        role: "user",
        content: [{ type: "text", text: " " }],
      });
    }

    // 4. 掛 cache_control 斷點（前綴緩存核心）
    //    Anthropic 緩存採「前綴比對」：只有斷點「之前」的內容會被寫入並可被後續命中。
    //    多輪累加對話下，每輪都會新增一條 user 訊息，因此需要兩個對話斷點：
    //      - 倒數第二條訊息末尾：上一輪的緩存邊界 → 本輪在此「讀取命中」
    //      - 最後一條訊息末尾：本輪的新邊界 → 寫入，供下一輪命中
    //    （加上 system 末尾共最多 3 個斷點，未超過 Anthropic 上限 4 個）
    const setCacheBreakpointOnLastTextBlock = (
      msg: { content: Array<Record<string, unknown>> } | undefined,
    ): void => {
      if (!msg || !Array.isArray(msg.content) || msg.content.length === 0)
        return;
      for (let i = msg.content.length - 1; i >= 0; i--) {
        const block = msg.content[i];
        if (block.type === "text") {
          block.cache_control = { type: "ephemeral" };
          return;
        }
      }
    };

    const lastIdx = anthropicMessages.length - 1;
    // 倒數第二條（上一輪邊界）→ 本輪讀取命中
    if (lastIdx - 1 >= 0) {
      setCacheBreakpointOnLastTextBlock(anthropicMessages[lastIdx - 1]);
    }
    // 最後一條（本輪邊界）→ 寫入供下一輪命中
    setCacheBreakpointOnLastTextBlock(anthropicMessages[lastIdx]);

    const body: Record<string, unknown> = {
      model: this.apiSettings.model,
      messages: anthropicMessages,
      stream,
      max_tokens: settings.maxResponseLength,
      temperature: settings.temperature,
      metadata: { user_id: this.getAnthropicUserId() },
    };

    if (systemBlocks.length > 0) {
      body.system = systemBlocks;
    }
    if (settings.topP !== 1) {
      body.top_p = settings.topP || Number.EPSILON;
    }
    if (settings.stopSequences && settings.stopSequences.length > 0) {
      body.stop_sequences = settings.stopSequences;
    }

    const bodyText = JSON.stringify(body);

    // 緩存診斷：印出「可緩存前綴指紋」。
    // Anthropic 緩存命中要求斷點之前的內容逐字節相同；若前綴每輪變動（如 system
    // 含動態時間/隨機值），就會「只寫入不讀取」。比對兩輪 log 的 hash 是否相同即可定位。
    try {
      const cacheablePrefixParts: string[] = [];
      for (const sb of systemBlocks) {
        cacheablePrefixParts.push(sb.text || "");
        if (sb.cache_control) break; // 只統計到第一個 system 斷點為止
      }
      // 倒數第二條訊息（讀取命中邊界）之前的所有對話內容
      const readBoundaryIdx = lastIdx - 1;
      for (let i = 0; i <= readBoundaryIdx && i < anthropicMessages.length; i++) {
        const m = anthropicMessages[i];
        for (const blk of m.content) {
          if (blk.type === "text") cacheablePrefixParts.push(String(blk.text ?? ""));
        }
      }
      const prefixStr = cacheablePrefixParts.join("\u0001");
      let h = 0;
      for (let i = 0; i < prefixStr.length; i++) {
        h = (h * 31 + prefixStr.charCodeAt(i)) | 0;
      }
      const prefixHash = (h >>> 0).toString(36);
      console.log(
        `[Anthropic][緩存前綴診斷] hash=${prefixHash} 前綴字元數=${prefixStr.length} ` +
          `system塊數=${systemBlocks.length}(穩定${stableSystemTexts.length}/動態${dynamicSystemTexts.length}) ` +
          `訊息數=${anthropicMessages.length} ` +
          `斷點: 穩定system末尾 + 訊息#${lastIdx - 1}(讀取) + 訊息#${lastIdx}(寫入)。` +
          `動態塊(時間/天氣/時區/節日)已排在斷點之後、不緩存。` +
          `若兩輪 hash 仍不同 → 穩定前綴仍含變動內容，需檢查 identifier 分類。`,
      );
    } catch {
      /* 診斷失敗不影響主流程 */
    }

    const diagnostics: GenerationDiagnostics = {
      model: this.apiSettings.model,
      stream,
      maxTokens: settings.maxResponseLength,
      requestBodyBytes: this.byteLength(bodyText),
      requestMessageCount: anthropicMessages.length,
      requestRoles: anthropicMessages.map((m) => m.role),
      anthropicNative: true,
      roleAdjustments,
    };

    return { body, diagnostics };
  }

  /**
   * 將 OpenAI 風格的 MessageContent 轉為 Anthropic content block 陣列。
   * - 純文字 → [{type:text}]
   * - 圖片 image_url(data uri) → [{type:image, source:{type:base64}}]
   * - 圖片 image_url(http url) → [{type:image, source:{type:url}}]
   * 不支援的型別（如 input_audio）會被忽略。
   */
  private toAnthropicContent(content: MessageContent): Array<Record<string, unknown>> {
    if (typeof content === "string") {
      return [{ type: "text", text: content }];
    }
    const blocks: Array<Record<string, unknown>> = [];
    for (const part of content) {
      if (part.type === "text") {
        blocks.push({ type: "text", text: part.text });
      } else if (part.type === "image_url") {
        const url = part.image_url.url;
        const dataMatch = /^data:([^;]+);base64,(.+)$/.exec(url);
        if (dataMatch) {
          blocks.push({
            type: "image",
            source: {
              type: "base64",
              media_type: dataMatch[1],
              data: dataMatch[2],
            },
          });
        } else {
          blocks.push({
            type: "image",
            source: { type: "url", url },
          });
        }
      }
      // input_audio 等 Anthropic 不支援的型別：略過
    }
    return blocks.length > 0 ? blocks : [{ type: "text", text: " " }];
  }

  /**
   * 從 Anthropic 回應的 usage 物件提取 token 統計（含緩存欄位）。
   */
  private extractAnthropicUsage(usage: any) {
    if (!usage) return undefined;
    const inputTokens = usage.input_tokens ?? 0;
    const cacheCreation = usage.cache_creation_input_tokens ?? 0;
    const cacheRead = usage.cache_read_input_tokens ?? 0;
    const outputTokens = usage.output_tokens ?? 0;
    return {
      prompt_tokens: inputTokens + cacheCreation + cacheRead,
      completion_tokens: outputTokens,
      total_tokens: inputTokens + cacheCreation + cacheRead + outputTokens,
      cache_creation_input_tokens: cacheCreation,
      cache_read_input_tokens: cacheRead,
    };
  }

  /**
   * Anthropic 原生非串流生成（/v1/messages）。
   */
  private async generateAnthropic(
    params: GenerationParams,
  ): Promise<GenerationResult> {
    const startTime = Date.now();
    const { messages, settings, signal, adjustLastMessageRole } = params;
    const request = this.buildAnthropicRequest(
      messages,
      settings,
      false,
      adjustLastMessageRole,
    );

    const response = await fetch(this.getAnthropicEndpoint(), {
      method: "POST",
      headers: this.getHeaders(),
      body: JSON.stringify(request.body),
      signal,
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`API error: ${response.status} - ${error}`);
    }

    const data = await response.json();
    const generationTime = Date.now() - startTime;

    // Anthropic 回應：content 是 block 陣列，文字在 type==="text" 的 block
    const content = Array.isArray(data.content)
      ? data.content
          .filter((b: any) => b.type === "text")
          .map((b: any) => b.text)
          .join("")
      : "";

    const usage = this.extractAnthropicUsage(data.usage);
    const stopReason = this.normalizeStopReason(data.stop_reason);

    if (usage) {
      console.log(
        `[Anthropic] 緩存統計 → 寫入: ${usage.cache_creation_input_tokens}, 讀取: ${usage.cache_read_input_tokens}`,
      );
    }

    return {
      content,
      tokenCount: {
        prompt: usage?.prompt_tokens ?? 0,
        completion: usage?.completion_tokens ?? 0,
        total: usage?.total_tokens ?? 0,
      },
      generationTime,
      stopReason,
      model: data.model ?? this.apiSettings.model,
      finishReason: stopReason,
      rawFinishReason: data.stop_reason ? String(data.stop_reason) : undefined,
      diagnostics: {
        ...request.diagnostics,
        rawFinishReason: data.stop_reason ? String(data.stop_reason) : undefined,
        finishReason: stopReason,
        apiContentLength: content.length,
        usage,
        totalTimeMs: generationTime,
      },
    };
  }

  /**
   * 非流式生成
   */
  async generate(params: GenerationParams): Promise<GenerationResult> {
    // Claude 緩存模式：走 Anthropic 原生路徑
    if (this.shouldUseAnthropicNative()) {
      return this.generateAnthropic(params);
    }

    const startTime = Date.now();
    const { messages, settings, signal, adjustLastMessageRole } = params;
    const request = this.buildRequest(messages, settings, false, adjustLastMessageRole);

    // 非串流路徑沒有 reader 迴圈可以判斷閒置，若上游（或中轉/代理）卡住，
    // fetch 會永遠 pending：手機端會出現「空白氣泡、轉圈、完全沒有錯誤」。
    // 因此這裡用內部 timeout 的 AbortController 與呼叫方傳入的 signal 合併，
    // 超時就主動中止並丟出可見的錯誤。
    const NON_STREAM_TIMEOUT_MS = 90000;
    const timeoutController = new AbortController();
    let timedOut = false;
    const timeoutId = setTimeout(() => {
      timedOut = true;
      timeoutController.abort();
    }, NON_STREAM_TIMEOUT_MS);
    const onExternalAbort = () => timeoutController.abort();
    if (signal) {
      if (signal.aborted) timeoutController.abort();
      else signal.addEventListener("abort", onExternalAbort, { once: true });
    }

    let response: Response;
    try {
      response = await fetch(this.getEndpoint(), {
        method: "POST",
        headers: this.getHeaders(),
        body: JSON.stringify(request.body),
        signal: timeoutController.signal,
      });
    } catch (err: any) {
      clearTimeout(timeoutId);
      if (signal) signal.removeEventListener("abort", onExternalAbort);
      if (timedOut) {
        throw new Error(
          `等待回應超過 ${Math.round(NON_STREAM_TIMEOUT_MS / 1000)} 秒仍無任何數據（非串流模式）。` +
            `可能是上游或中轉/代理卡住、或首個回應過慢。建議改用串流模式、更換線路，或稍後再試。`,
        );
      }
      // 呼叫方主動取消或其他網路錯誤，原樣拋出
      throw err;
    }

    clearTimeout(timeoutId);
    if (signal) signal.removeEventListener("abort", onExternalAbort);

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`API error: ${response.status} - ${error}`);
    }

    const data = await response.json();
    const generationTime = Date.now() - startTime;

    // 解析回應
    const choice = data.choices?.[0];
    const content = choice?.message?.content ?? "";
    const diagnostics = this.extractResponseDiagnostics(
      data,
      choice,
      request.diagnostics,
      content.length,
    );
    const stopReason = diagnostics.finishReason ?? "stop";

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
      finishReason: stopReason,
      rawFinishReason: diagnostics.rawFinishReason,
      diagnostics,
    };
  }

  /**
   * Anthropic 原生串流生成（/v1/messages SSE）。
   *
   * Anthropic 的 SSE 事件與 OpenAI 完全不同：
   * - message_start：含初始 usage（input/cache tokens）
   * - content_block_delta：data.delta.text 為實際輸出 token
   * - message_delta：含 stop_reason 與 output_tokens
   * - message_stop：結束
   */
  private async *_generateAnthropicStream(
    params: GenerationParams,
  ): AsyncGenerator<StreamingEvent> {
    const { messages, settings, signal, adjustLastMessageRole } = params;
    const request = this.buildAnthropicRequest(
      messages,
      settings,
      true,
      adjustLastMessageRole,
    );

    const response = await fetch(this.getAnthropicEndpoint(), {
      method: "POST",
      headers: {
        ...this.getHeaders(),
        Accept: "text/event-stream",
        "Cache-Control": "no-cache",
      },
      body: JSON.stringify(request.body),
      signal,
    });

    if (!response.ok) {
      const error = await response.text();
      let diagnosis = "";
      if (response.status === 401 || response.status === 403) {
        diagnosis = `\n[診斷] ${response.status} = API Key 無效或上游不支援 Anthropic 原生 /v1/messages。可嘗試關閉「Claude 原生緩存模式」回退 OpenAI 格式。`;
      } else if (response.status === 404) {
        diagnosis = `\n[診斷] 404 = 上游沒有 /v1/messages 端點。此中轉站可能不支援 Anthropic 原生格式，請關閉「Claude 原生緩存模式」。`;
      } else if (response.status === 400) {
        diagnosis = `\n[診斷] 400 = 請求格式不被上游接受，可能不支援 Anthropic 原生格式或緩存欄位。`;
      }
      yield {
        type: "error",
        error: `API error: ${response.status} - ${error.slice(0, 1000)}${diagnosis}`,
      };
      return;
    }

    const reader = response.body?.getReader();
    if (!reader) {
      yield { type: "error", error: "No response body（Anthropic 串流回應體為空）" };
      return;
    }

    const decoder = new TextDecoder();
    let buffer = "";
    let fullContent = "";
    const streamStartTime = Date.now();
    let stopReason: GenerationStopReason = "stop";
    let rawStopReason: string | undefined;
    let inputTokens = 0;
    let cacheCreation = 0;
    let cacheRead = 0;
    let outputTokens = 0;

    const parseEventData = (jsonStr: string): StreamingEvent | null => {
      let evt: any;
      try {
        evt = JSON.parse(jsonStr);
      } catch {
        return null;
      }
      switch (evt.type) {
        case "message_start": {
          const u = evt.message?.usage;
          if (u) {
            inputTokens = u.input_tokens ?? 0;
            cacheCreation = u.cache_creation_input_tokens ?? 0;
            cacheRead = u.cache_read_input_tokens ?? 0;
          }
          return null;
        }
        case "content_block_delta": {
          const text = evt.delta?.text ?? evt.delta?.partial_json ?? "";
          if (text) {
            fullContent += text;
            return { type: "token", token: text };
          }
          return null;
        }
        case "message_delta": {
          if (evt.delta?.stop_reason) {
            rawStopReason = String(evt.delta.stop_reason);
            stopReason = this.normalizeStopReason(evt.delta.stop_reason);
          }
          if (evt.usage?.output_tokens != null) {
            outputTokens = evt.usage.output_tokens;
          }
          return null;
        }
        case "error": {
          const msg =
            evt.error?.message || JSON.stringify(evt.error || evt);
          return { type: "error", error: `[Anthropic 串流錯誤] ${msg}` };
        }
        default:
          return null;
      }
    };

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          const trimmed = line.trim();
          // SSE：只處理 data: 行，event: 行可忽略（type 已在 data 內）
          if (!trimmed.startsWith("data:")) continue;
          const payload = trimmed.slice(5).trim();
          if (!payload || payload === "[DONE]") continue;
          const event = parseEventData(payload);
          if (event) {
            yield event;
            if (event.type === "error") return;
          }
        }
      }

      const usage = {
        prompt_tokens: inputTokens + cacheCreation + cacheRead,
        completion_tokens: outputTokens,
        total_tokens: inputTokens + cacheCreation + cacheRead + outputTokens,
        cache_creation_input_tokens: cacheCreation,
        cache_read_input_tokens: cacheRead,
      };
      console.log(
        `[Anthropic Stream] 緩存統計 → 寫入: ${cacheCreation}, 讀取: ${cacheRead}`,
      );

      yield {
        type: "done",
        content: fullContent,
        usage,
        finishReason: stopReason,
        rawFinishReason: rawStopReason,
        diagnostics: {
          ...request.diagnostics,
          rawFinishReason: rawStopReason,
          finishReason: stopReason,
          apiContentLength: fullContent.length,
          usage,
          totalTimeMs: Date.now() - streamStartTime,
        },
      };
    } catch (e) {
      if ((e as Error).name === "AbortError") {
        yield { type: "done", content: fullContent };
      } else {
        const errMsg = e instanceof Error ? e.message : String(e);
        yield { type: "error", error: errMsg };
      }
    } finally {
      reader.releaseLock();
    }
  }

  /**
   * 流式生成（內部實現）
   */
  private async *_generateStreamInternal(
    params: GenerationParams,
  ): AsyncGenerator<StreamingEvent> {
    // Claude 緩存模式：走 Anthropic 原生串流
    if (this.shouldUseAnthropicNative()) {
      yield* this._generateAnthropicStream(params);
      return;
    }

    const { messages, settings, signal, adjustLastMessageRole } = params;
    const request = this.buildRequest(messages, settings, true, adjustLastMessageRole);

    const response = await fetch(this.getEndpoint(), {
      method: "POST",
      headers: {
        ...this.getHeaders(),
        "Accept": "text/event-stream",
        "Cache-Control": "no-cache",
      },
      body: JSON.stringify(request.body),
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
    let rawFinishReason: string | undefined;
    let finishReason: GenerationStopReason | undefined;
    let promptFeedback: unknown;
    let safetyRatings: unknown;
    let rawResponseMeta: unknown;
    // 記錄非 SSE 格式的行（用於診斷上游回了非串流回應的情況）
    let nonSSELines: string[] = [];
    // 記錄「成功解析成 JSON 的 data: 行，但擷取不到任何內容」的樣本。
    // 用於診斷上游把內容放在我們沒覆蓋到的欄位（例如 reasoning_content、
    // text、output_text 等）導致空回應的情況。
    const emptyDataSamples: string[] = [];
    // 原始串流預覽：無論能否解析，都累積前若干位元組的解碼文字。
    // 這是診斷「手機端空回」的最後手段——當所有結構化擷取都失敗時，
    // 直接把上游真正回傳的位元組攤開，才能看清 gemini 等模型實際回了什麼。
    let rawStreamPreview = "";
    // 兩段式超時：
    // - 首個 chunk 到達前允許較長等待。大型「小劇場」提示詞的首字延遲可能很長，
    //   行動網路上傳大提示詞 + 上游模型推理時間容易超過 30s；若沿用 30s 會在
    //   首字到達前就誤判為截斷並「靜默回空」，這正是手機端空回、電腦端正常的主因。
    // - 開始串流之後，chunk 之間的閒置才用較短的 30s 判定截斷。
    const FIRST_CHUNK_TIMEOUT_MS = 90000;
    const IDLE_TIMEOUT_MS = 30000;
    let idleTimedOut = false;
    // 是否曾收到真正的串流增量（delta.content）。用來避免在「先串流 delta、
    // 最後一個 chunk 又夾帶完整 message.content」的上游行為下重複累加內容。
    let sawStreamingDelta = false;

    const processLine = (line: string): StreamLineResult => {
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
        const choice = json.choices?.[0];
        const lineRawFinishReason =
          choice?.finish_reason ??
          choice?.finishReason ??
          json?.candidates?.[0]?.finishReason ??
          json?.finishReason;
        const linePromptFeedback = json?.promptFeedback ?? json?.prompt_feedback;
        const lineSafetyRatings =
          choice?.safety_ratings ??
          choice?.safetyRatings ??
          json?.candidates?.[0]?.safetyRatings ??
          json?.safetyRatings;
        const lineMeta = this.summarizeResponseMeta(json, choice, lineRawFinishReason);
        // 內容擷取：優先取串流 delta.content；若上游把「完整回應」包成單一 SSE chunk
        // （此時 delta 缺失、內容落在 message.content），或回傳 Gemini 風格的
        // candidates[].content.parts[].text，則退而求其次，避免出現「空回應」。
        const extractLineContent = (): string | null => {
          const deltaContent = choice?.delta?.content;
          if (typeof deltaContent === "string" && deltaContent.length > 0) {
            sawStreamingDelta = true;
            return deltaContent;
          }
          // 已經在串流增量模式下，最後一個 chunk 常會夾帶完整 message.content，
          // 此時不可再退回 message.content / parts，否則會重複累加整段內容。
          if (sawStreamingDelta) {
            return deltaContent ?? null;
          }
          const messageContent = choice?.message?.content;
          if (typeof messageContent === "string" && messageContent.length > 0) {
            return messageContent;
          }
          const geminiParts =
            json?.candidates?.[0]?.content?.parts ??
            choice?.content?.parts;
          if (Array.isArray(geminiParts)) {
            const text = geminiParts
              .map((p: { text?: string }) => (typeof p?.text === "string" ? p.text : ""))
              .join("");
            if (text.length > 0) return text;
          }
          return deltaContent ?? null;
        };
        const baseResult: StreamLineResult = {
          delta: extractLineContent(),
          rawFinishReason:
            lineRawFinishReason !== undefined ? String(lineRawFinishReason) : undefined,
          finishReason:
            lineRawFinishReason !== undefined
              ? this.normalizeStopReason(lineRawFinishReason)
              : undefined,
          promptFeedback: linePromptFeedback,
          safetyRatings: lineSafetyRatings,
          rawResponseMeta: lineMeta,
        };
        // 診斷：成功解析成 JSON，但擷取不到任何文字內容時，記錄樣本結構。
        // 這能揭露上游把內容放在我們沒覆蓋到的欄位（reasoning_content、
        // text、output_text、content 為陣列等）導致空回應的真正原因。
        if (
          !baseResult.delta &&
          !json.error &&
          !json.usage &&
          lineRawFinishReason === undefined &&
          emptyDataSamples.length < 3
        ) {
          try {
            emptyDataSamples.push(JSON.stringify(json).slice(0, 300));
          } catch {
            // ignore
          }
        }
        // 檢查上游是否回了錯誤物件（某些 API 在串流中回 error）
        if (json.error) {
          const errMsg = typeof json.error === 'string' ? json.error : (json.error.message || JSON.stringify(json.error));
          console.error(`[API Stream] 上游串流中回傳錯誤: ${errMsg}`);
          // 把錯誤當作 delta 回傳，讓用戶看到
          return {
            ...baseResult,
            delta: `\n[API 錯誤] ${errMsg}`,
            rawResponseMeta: { ...lineMeta, error: json.error },
          };
        }
        // 捕獲 usage（OpenAI / OpenRouter 等會在最後一個 chunk 或獨立 chunk 中返回）
        if (json.usage) {
          return {
            ...baseResult,
            usage: {
              prompt_tokens: json.usage.prompt_tokens ?? 0,
              completion_tokens: json.usage.completion_tokens ?? 0,
              total_tokens: json.usage.total_tokens ?? 0,
            },
          };
        }
        return baseResult;
      } catch {
        return { delta: null };
      }
    };

    const captureLineDiagnostics = (result: StreamLineResult) => {
      if (result.rawFinishReason !== undefined) rawFinishReason = result.rawFinishReason;
      if (result.finishReason !== undefined) finishReason = result.finishReason;
      if (result.promptFeedback !== undefined) promptFeedback = result.promptFeedback;
      if (result.safetyRatings !== undefined) safetyRatings = result.safetyRatings;
      if (result.rawResponseMeta !== undefined) rawResponseMeta = result.rawResponseMeta;
    };

    try {
      while (true) {
        // 兩段式超時：首個 chunk 到達前用較長的 FIRST_CHUNK_TIMEOUT_MS，
        // 之後 chunk 之間的閒置才用較短的 IDLE_TIMEOUT_MS。
        const currentTimeout =
          chunkCount === 0 ? FIRST_CHUNK_TIMEOUT_MS : IDLE_TIMEOUT_MS;
        let timeoutId: ReturnType<typeof setTimeout> | null = null;
        const readResult = await Promise.race<{ done: boolean; value?: Uint8Array }>([
          reader.read() as Promise<{ done: boolean; value?: Uint8Array }>,
          new Promise<{ done: true; value: undefined }>((resolve) => {
            timeoutId = setTimeout(() => {
              idleTimedOut = true;
              resolve({ done: true, value: undefined });
            }, currentTimeout);
          }),
        ]);
        if (timeoutId !== null) clearTimeout(timeoutId);

        if (idleTimedOut) {
          // 主動取消底層 stream，避免 reader 留著等
          try {
            await reader.cancel();
          } catch {
            // ignore
          }
          break;
        }

        const { done, value } = readResult;
        if (done) break;

        chunkCount++;
        if (chunkCount === 1) firstChunkTime = Date.now() - streamStartTime;
        totalBytes += value?.byteLength ?? 0;
        const decodedChunk = decoder.decode(value, { stream: true });
        buffer += decodedChunk;
        if (rawStreamPreview.length < 800) rawStreamPreview += decodedChunk;
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const result = processLine(line);
          captureLineDiagnostics(result);
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
        captureLineDiagnostics(result);
        if (result.usage) streamUsage = result.usage;
        if (result.delta) {
          fullContent += result.delta;
          yield { type: "token", token: result.delta };
        }
      }

      const totalTime = Date.now() - streamStartTime;
      const buildDoneDiagnostics = (): GenerationDiagnostics => ({
        ...request.diagnostics,
        rawFinishReason,
        finishReason: finishReason ?? "stop",
        apiContentLength: fullContent.length,
        chunkCount,
        totalBytes,
        firstChunkTimeMs: firstChunkTime,
        totalTimeMs: totalTime,
        nonSSELines: nonSSELines.length > 0 ? nonSSELines : undefined,
        usage: streamUsage ?? undefined,
        promptFeedback,
        safetyRatings,
        rawResponseMeta,
      });

      // 超時處理：
      // - 已收到部分內容 → 當作正常 done 拋出（截斷的部分輸出仍勝於丟棄）。
      // - 完全沒有內容 → 必須報錯，不能靜默回空。否則用戶（尤其手機端大提示詞
      //   首字超時）只會看到「空回」卻毫無線索。錯誤訊息要區分是「首字超時」
      //   還是「串流中途閒置超時」。
      if (idleTimedOut) {
        const waited = chunkCount === 0 ? FIRST_CHUNK_TIMEOUT_MS : IDLE_TIMEOUT_MS;
        console.warn(
          `[API Stream] ${waited}ms 內無新 chunk，視為串流截斷`,
          {
            chunkCount,
            totalBytes,
            fullContentLength: fullContent.length,
            totalTime,
          },
        );
        if (fullContent) {
          const diagnostics = buildDoneDiagnostics();
          yield {
            type: "done",
            content: fullContent,
            usage: streamUsage ?? undefined,
            finishReason: diagnostics.finishReason,
            rawFinishReason: diagnostics.rawFinishReason,
            diagnostics,
          };
          return;
        }
        if (chunkCount === 0) {
          yield {
            type: "error",
            error:
              `等待首個回應超過 ${Math.round(FIRST_CHUNK_TIMEOUT_MS / 1000)} 秒仍無任何數據。\n` +
              `大型「小劇場」提示詞在行動網路上常見此情況：上傳大提示詞 + 上游推理時間過長，連線在首字到達前就被判定超時。\n` +
              `可嘗試：改用較快的網路、縮短聊天記錄上下文、或更換回應更快的模型／API。\n` +
              `[診斷] chunks: ${chunkCount} | bytes: ${totalBytes} | 耗時: ${totalTime}ms`,
          };
          return;
        }
        yield {
          type: "error",
          error:
            `串流中途閒置超過 ${Math.round(IDLE_TIMEOUT_MS / 1000)} 秒且未累積任何內容，連線可能已中斷。\n` +
            `[診斷] chunks: ${chunkCount} | bytes: ${totalBytes} | 耗時: ${totalTime}ms`,
        };
        return;
      }

      // 空回應：提供詳細診斷資訊
      if (!fullContent) {
        const diagParts = [
          `[API Stream] 流式回應為空`,
          `chunks: ${chunkCount}`,
          `bytes: ${totalBytes}`,
          `耗時: ${totalTime}ms`,
          `首chunk: ${firstChunkTime}ms`,
        ];
        if (finishReason || rawFinishReason) {
          diagParts.push(`finishReason: ${finishReason ?? "?"}${rawFinishReason ? ` (${rawFinishReason})` : ""}`);
        }
        if (buffer.trim()) diagParts.push(`buffer殘留: "${buffer.slice(0, 200)}"`);
        if (nonSSELines.length > 0) diagParts.push(`非SSE內容: ${JSON.stringify(nonSSELines)}`);
        if (emptyDataSamples.length > 0) diagParts.push(`空內容樣本: ${JSON.stringify(emptyDataSamples)}`);
        // 原始串流預覽永遠附上：當上述結構化擷取全部落空時，這是唯一能看清
        // 上游實際回傳內容（例如 gemini 的 finishReason=STOP 空 parts）的依據。
        if (rawStreamPreview.trim()) {
          diagParts.push(`原始串流: ${JSON.stringify(rawStreamPreview.slice(0, 600))}`);
        }
        const diagMsg = diagParts.join(' | ');
        console.warn(diagMsg);

        // 內容被上游安全過濾擋下：finishReason 會是 content_filter / safety /
        // recitation / prohibited_content / blocklist，但沒有任何文字內容。
        // 這是「小劇場」這類同人/敏感題材最常見的空回原因——必須報錯，
        // 不能靜默回空，否則用戶只會看到「空回」而不知道是被擋了。
        const blockedReasons = [
          "content_filter",
          "safety",
          "recitation",
          "prohibited_content",
          "blocklist",
        ];
        if (finishReason && blockedReasons.includes(finishReason)) {
          yield {
            type: "error",
            error: `內容被上游模型的安全審查擋下（finishReason: ${finishReason}${rawFinishReason ? ` / ${rawFinishReason}` : ""}），未生成任何文字。\n小劇場等較敏感的題材容易觸發此類過濾，可嘗試更換模型／API 或調整提示內容。\n${diagMsg}`,
          };
          return;
        }

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
        } else if (emptyDataSamples.length > 0) {
          // 收到了合法的 SSE JSON，但內容欄位是我們沒覆蓋到的格式。
          // 直接報錯並附上樣本結構，而不是靜默回空，方便定位上游回應格式。
          yield {
            type: "error",
            error: `收到了串流數據但無法擷取文字內容，上游回應格式可能不相容。\n${diagMsg}`,
          };
          return;
        }
        // 收到 chunk、是合法 SSE、且帶有 finishReason，但內容為空（例如 gemini
        // 回 finishReason=STOP 卻沒有任何 parts）。這正是「手機端空回、電腦端正常」
        // 的核心情況：上游模型回報生成結束卻未輸出任何文字，最常見於內容被
        // 靜默安全過濾或提示詞觸發模型拒答。絕不能靜默回空，必須把 finishReason
        // 與原始串流位元組一併報錯，用戶才知道發生了什麼。
        yield {
          type: "error",
          error: `收到串流回應但內容為空（finishReason: ${finishReason ?? "未知"}${rawFinishReason ? ` / ${rawFinishReason}` : ""}）。\n上游模型回報生成結束卻未輸出任何文字，常見於內容被靜默過濾或提示詞觸發模型拒答。\n可嘗試更換模型／API 或調整提示內容。\n${diagMsg}`,
        };
        return;
      }

      const diagnostics = buildDoneDiagnostics();
      yield {
        type: "done",
        content: fullContent,
        usage: streamUsage ?? undefined,
        finishReason: diagnostics.finishReason,
        rawFinishReason: diagnostics.rawFinishReason,
        diagnostics,
      };
    } catch (e) {
      const totalTime = Date.now() - streamStartTime;
      if ((e as Error).name === "AbortError") {
        const diagnostics: GenerationDiagnostics = {
          ...request.diagnostics,
          finishReason: "stop",
          apiContentLength: fullContent.length,
          chunkCount,
          totalBytes,
          firstChunkTimeMs: firstChunkTime,
          totalTimeMs: totalTime,
        };
        yield { type: "done", content: fullContent, diagnostics };
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
