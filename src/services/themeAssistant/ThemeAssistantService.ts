/**
 * 對話式 AI 美化助手——服務層
 *
 * 職責：
 *  1. 從 store 取出現況，組裝系統提示（buildToolPrompt）
 *  2. 呼叫使用者設定的 API（無原生 function calling，使用自訂協議）
 *  3. 解析 AI 回覆中的 ```tool_calls``` JSON 區塊
 *  4. 逐一驗證 + 派發到既有 setter（executeToolCall）
 *  5. 回傳「自然語言說明 + 每個工具的執行結果」供 UI 顯示
 *
 * AI 永遠只輸出「工具名 + 參數」，本服務不讓 AI 直接寫 CSS 選擇器或改檔案。
 */
import {
  getAPIClient,
  type APIMessage,
  type TextContent,
  type ImageContent,
} from "@/api/OpenAICompatible";
import { pickGenerationToggles } from "@/utils/generationToggles";
import { useSettingsStore } from "@/stores/settings";
import { useThemeStore } from "@/stores/theme";
import { useCanvasStore } from "@/stores/canvas";
import type { ToolContext, ToolExecResult } from "./themeTools";
import { executeToolCall, getTool } from "./themeTools";
import { buildToolPrompt, snapshotFromContext } from "./buildToolPrompt";

/** 對話歷史中的一則訊息 */
export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

/** 從 AI 回覆解析出的單一工具呼叫 */
export interface ParsedToolCall {
  tool: string;
  args: Record<string, unknown>;
}

/** 執行過程中的進度事件（供 UI 即時顯示「還在調用什麼」） */
export interface ProgressEvent {
  /** 第幾輪（0 起算） */
  round: number;
  /** 目前階段 */
  phase: "requesting" | "executing" | "querying";
  /** 本階段涉及的工具名（executing / querying 時有值） */
  toolNames?: string[];
}

/** 一次完整請求的結果 */
export interface AssistantResult {
  /** AI 的自然語言說明（已移除 tool_calls 區塊） */
  message: string;
  /** AI 原始回覆（除錯用） */
  raw: string;
  /** 解析到的工具呼叫 */
  toolCalls: ParsedToolCall[];
  /** 每個工具的執行結果 */
  execResults: ToolExecResult[];
  /** 是否有任何工具成功套用 */
  applied: boolean;
  /** AI 呼叫「詢問使用者」時的待答提問（有值代表本輪暫停、等使用者點選） */
  pendingAsk?: { question: string; options: string[] };
  /** 流程層級錯誤（API 失敗 / 無法解析等） */
  error?: string;
}

const TASK_TYPE = "themeAssistant";

// ===== tool_calls 區塊解析 =====

const TOOL_CALLS_BLOCK = /```tool_calls\s*([\s\S]*?)```/i;

/** 從 AI 回覆抓出 tool_calls JSON 區塊並解析；找不到則回傳空陣列 */
export function parseToolCalls(raw: string): ParsedToolCall[] {
  const match = raw.match(TOOL_CALLS_BLOCK);
  if (!match) return [];
  const jsonText = match[1].trim();
  if (!jsonText) return [];

  let data: unknown;
  try {
    data = JSON.parse(jsonText);
  } catch {
    // 容錯：嘗試擷取第一個 [ 到最後一個 ] 之間的內容
    const start = jsonText.indexOf("[");
    const end = jsonText.lastIndexOf("]");
    if (start === -1 || end === -1 || end <= start) return [];
    try {
      data = JSON.parse(jsonText.slice(start, end + 1));
    } catch {
      return [];
    }
  }

  if (!Array.isArray(data)) return [];

  const calls: ParsedToolCall[] = [];
  for (const item of data) {
    if (!item || typeof item !== "object") continue;
    const obj = item as Record<string, unknown>;
    const tool = obj.tool;
    if (typeof tool !== "string" || !tool) continue;
    const args =
      obj.args && typeof obj.args === "object" && !Array.isArray(obj.args)
        ? (obj.args as Record<string, unknown>)
        : {};
    calls.push({ tool, args });
  }
  return calls;
}

/** 移除 tool_calls 區塊，留下純說明文字 */
function stripToolCalls(raw: string): string {
  return raw.replace(TOOL_CALLS_BLOCK, "").trim();
}

/**
 * 串流過程用的即時去塊：
 *  - 完整的 ```tool_calls ... ``` 區塊直接移除
 *  - 尚未收到結尾 ``` 的「未閉合」tool_calls 開頭，也一併截掉，
 *    避免使用者在串流中途看到半截 JSON。
 */
function stripToolCallsStreaming(raw: string): string {
  let text = raw.replace(TOOL_CALLS_BLOCK, "");
  const openIdx = text.search(/```tool_calls/i);
  if (openIdx !== -1) {
    text = text.slice(0, openIdx);
  }
  return text.trim();
}

/**
 * 組出「文字 + 參考圖」的多模態使用者訊息（Vision）。
 * images 的 base64 不含 `data:` 前綴，這裡補上 data URI。
 */
function buildImageUserMessage(
  userMessage: string,
  images: { base64: string; mimeType: string }[],
): APIMessage {
  const content: Array<TextContent | ImageContent> = [];
  if (userMessage.trim()) {
    content.push({ type: "text", text: userMessage });
  }
  for (const img of images) {
    content.push({
      type: "image_url",
      image_url: {
        url: `data:${img.mimeType};base64,${img.base64}`,
        detail: "auto",
      },
    });
  }
  return { role: "user", content };
}

// ===== 主流程 =====

/** 執行選項 */
export interface RunOptions {
  /** 聯網搜尋：開啟後在 model 後綴加 :online（OpenRouter 聯網外掛） */
  online?: boolean;
  /**
   * 是否為「循序漸進」模式（預設 true）。
   * true：一次只套用一個動作工具，改完停下讓使用者確認；
   * false：一次到位，勘查後同一次執行內把需求做完。
   */
  stepByStep?: boolean;
  /** 使用者這一輪附上的參考圖（base64 data，不含 data: 前綴）與其 MIME 型別 */
  images?: { base64: string; mimeType: string }[];
  /** 進度回報：每次階段變化時呼叫，供 UI 即時顯示「還在調用什麼」 */
  onProgress?: (event: ProgressEvent) => void;
  /**
   * 截圖自檢：AI 呼叫「截圖自檢」工具時，由 UI 層擷取首頁實際畫面，
   * 回傳 { base64, mimeType }（base64 不含 data: 前綴）供以 vision 圖片回餵給 AI。
   * 未提供此回呼時，截圖工具會退化成告知 AI「目前環境無法截圖」。
   */
  captureScreenshot?: () => Promise<{ base64: string; mimeType: string } | null>;
  /**
   * 串流回呼：AI 每吐出一段文字就呼叫一次，帶「已累積、且已去除 tool_calls 區塊」的顯示文字。
   * round 為目前第幾輪（0 起算），供 UI 判斷是否為新一段訊息。
   */
  onToken?: (visibleText: string, round: number) => void;
}

/**
 * 送出一則使用者訊息，取得 AI 的調整方案並套用。
 * @param userMessage  使用者這一輪輸入
 * @param history      先前的對話（不含本輪），用於多輪上下文
 * @param options      聯網 / 圖片等執行選項
 */
export async function runThemeAssistant(
  userMessage: string,
  history: ChatTurn[] = [],
  options: RunOptions = {},
): Promise<AssistantResult> {
  const empty: AssistantResult = {
    message: "",
    raw: "",
    toolCalls: [],
    execResults: [],
    applied: false,
  };

  const settingsStore = useSettingsStore();
  const themeStore = useThemeStore();
  const canvasStore = useCanvasStore();

  const ctx: ToolContext = { theme: themeStore, canvas: canvasStore };

  // 取得 API 設定
  const taskConfig = settingsStore.getAPIForTask(TASK_TYPE);
  if (!taskConfig.api.apiKey) {
    return { ...empty, error: "尚未設定 API Key，請先到設定填好 API。" };
  }

  // 組裝系統提示
  // 預設走「循序漸進」模式：一次只改一項、每步停下確認。
  const stepByStep = options.stepByStep !== false;
  const systemPrompt = buildToolPrompt(snapshotFromContext(ctx), { stepByStep });

  // 本輪使用者訊息：若附了參考圖，組成 vision 多模態 content；否則純文字
  const userTurn: APIMessage =
    options.images && options.images.length > 0
      ? buildImageUserMessage(userMessage, options.images)
      : { role: "user", content: userMessage };

  const messages: APIMessage[] = [
    { role: "system", content: systemPrompt },
    ...history.map((t) => ({ role: t.role, content: t.content }) as APIMessage),
    userTurn,
  ];

  const apiSettings = { ...taskConfig.api };
  // 聯網搜尋：OpenRouter 用 model 後綴 :online 啟用網路外掛。
  // 已帶 :online 則不重複加。
  if (options.online && apiSettings.model && !apiSettings.model.endsWith(":online")) {
    apiSettings.model = `${apiSettings.model}:online`;
  }
  // 美化助手常需輸出大段 CSS，全域的小 maxTokens（預設僅 2048）會把回覆
  // 從中途硬切（例如 box-shadow: 0 8px 30px rgba( 就斷掉）。
  // 這裡「不設任何人工上限」：送 0 當作 sentinel，API 層會據此
  //   - OpenAI 相容端點：直接不帶 max_tokens，交由模型用自身輸出上限
  //   - Anthropic：max_tokens 為必填，改用該模型的實際輸出上限
  const generationSettings = {
    maxContextLength: taskConfig.generation.maxContextLength,
    maxResponseLength: 0,
    temperature: taskConfig.generation.temperature,
    topP: taskConfig.generation.topP,
    frequencyPenalty: taskConfig.generation.frequencyPenalty,
    presencePenalty: taskConfig.generation.presencePenalty,
    repetitionPenalty: 1,
    stopSequences: [],
    streaming: false,
    useStreamingWindow: false,
    ...pickGenerationToggles(taskConfig.generation),
  };

  // ===== Agentic 多輪迴圈 =====
  // AI 可先用「查詢型」工具（檢視組件 / 列出畫布組件）取得更多資訊，
  // 我們把查詢結果餵回去，讓它判斷後再決定怎麼修改；
  // 動作型工具一旦出現就視為「給出方案」，本輪結束。
  // 設上限避免無限查詢。
  const MAX_ROUNDS = 4;

  const allToolCalls: ParsedToolCall[] = [];
  const allExecResults: ToolExecResult[] = [];
  const messageParts: string[] = [];
  let lastRaw = "";

  const client = getAPIClient(apiSettings);

  for (let round = 0; round < MAX_ROUNDS; round++) {
    options.onProgress?.({ round, phase: "requesting" });
    let raw = "";
    try {
      const controller = new AbortController();
      // 串流生成：邊收邊回呼，讓 UI 逐字顯示（去除 tool_calls 區塊後的可見文字）
      let streamed = "";
      let streamErr: string | undefined;
      for await (const ev of client.generateStream({
        messages,
        settings: { ...generationSettings, streaming: true },
        apiSettings,
        signal: controller.signal,
      })) {
        if (ev.type === "token") {
          streamed += ev.token ?? "";
          options.onToken?.(stripToolCallsStreaming(streamed), round);
        } else if (ev.type === "done") {
          if (ev.content) streamed = ev.content;
        } else if (ev.type === "error") {
          streamErr = ev.error ?? "串流發生錯誤";
        }
      }
      if (streamErr && !streamed) throw new Error(streamErr);
      raw = streamed;
      // 串流結束後，補一次「本輪最終可見文字」給 UI，確保與最終解析一致
      options.onToken?.(stripToolCallsStreaming(raw), round);
    } catch (e) {
      // 已經有套用結果時，回傳部分成果並附錯誤；否則整體失敗
      if (allExecResults.length > 0) {
        return {
          message: messageParts.join("\n\n") || "（已處理）",
          raw: lastRaw,
          toolCalls: allToolCalls,
          execResults: allExecResults,
          applied: allExecResults.some((r) => r.ok && !r.isQuery),
          error: e instanceof Error ? e.message : String(e),
        };
      }
      return { ...empty, error: e instanceof Error ? e.message : String(e) };
    }

    lastRaw = raw;
    const toolCalls = parseToolCalls(raw);
    const text = stripToolCalls(raw);
    if (text) messageParts.push(text);

    // 進度回報：本輪要執行哪些工具
    if (toolCalls.length > 0) {
      const askOrQuery = toolCalls.some((c) => {
        const t = getTool(c.tool);
        return t?.query || t?.ask;
      });
      options.onProgress?.({
        round,
        phase: askOrQuery ? "querying" : "executing",
        toolNames: toolCalls.map((c) => c.tool),
      });
    }

    // 逐一派發本輪工具
    // 循序漸進模式：查詢／詢問型工具照常執行，但「動作型」工具本輪只允許執行第一個，
    // 其餘動作工具略過不套用——避免 AI 一次丟一堆修改把畫面改得亂七八糟。
    const roundResults: ToolExecResult[] = [];
    let actionAppliedThisRound = false;
    for (const call of toolCalls) {
      const tool = getTool(call.tool);
      // 截圖自檢與查詢 / 詢問一樣是唯讀，不算「動作」，
      // 否則在循序漸進模式會被誤判成本輪的那一個動作、把真正的修改擋掉。
      const isActionTool =
        !!tool && !tool.query && !tool.ask && !tool.screenshot;

      if (stepByStep && isActionTool && actionAppliedThisRound) {
        // 已套用過一個動作，剩下的動作工具跳過（不列入 allToolCalls / allExecResults，
        // 讓後續流程仍偵測得到本輪「有停下的動作」，交由 UI 引導使用者確認下一步）
        continue;
      }

      allToolCalls.push(call);
      const r = executeToolCall(call.tool, call.args, ctx);
      roundResults.push(r);
      allExecResults.push(r);

      if (stepByStep && isActionTool && r.ok) {
        actionAppliedThisRound = true;
      }
    }

    // 詢問型工具：AI 需要使用者做關鍵抉擇 → 暫停本輪，把問題帶回 UI
    const askResult = roundResults.find((r) => r.isAsk && r.ok);
    if (askResult) {
      return {
        message: messageParts.join("\n\n") || "",
        raw: lastRaw,
        toolCalls: allToolCalls,
        execResults: allExecResults,
        applied: allExecResults.some((r) => r.ok && !r.isQuery && !r.isAsk),
        pendingAsk: {
          question: askResult.askQuestion ?? "",
          options: askResult.askOptions ?? [],
        },
      };
    }

    // 截圖自檢：AI 想親眼確認上一步是否生效 → 擷取首頁畫面，以 vision 圖片回餵。
    // 唯讀操作，即使本輪同時套用了動作也照樣接續（讓 AI「改完→看圖→判斷」一氣呵成）。
    const screenshotResult = roundResults.find((r) => r.isScreenshot && r.ok);
    if (screenshotResult && round < MAX_ROUNDS - 1) {
      let shot: { base64: string; mimeType: string } | null = null;
      try {
        shot = options.captureScreenshot
          ? await options.captureScreenshot()
          : null;
      } catch {
        shot = null;
      }

      messages.push({ role: "assistant", content: raw });
      if (shot) {
        messages.push(
          buildImageUserMessage(
            "這是你要求的首頁實際畫面截圖（已套用目前所有全域自訂CSS與各組件樣式）。" +
              "請親眼檢查上一步修改是否真的生效、有沒有跑版；" +
              "若已達成目標就用 tool_calls 收尾（或直接說明完成），" +
              "若沒生效或不如預期，請繼續用 tool_calls 補救。",
            [shot],
          ),
        );
      } else {
        messages.push({
          role: "user",
          content:
            "（目前環境無法提供截圖，請改依你對已套用變更的理解繼續判斷；" +
            "必要時可用「檢視組件」查詢目前已套用的自訂 CSS 來確認。）",
        });
      }
      continue;
    }

    const queryResults = roundResults.filter((r) => r.isQuery);
    const hasAction = roundResults.some(
      (r) => !r.isQuery && !r.isAsk && !r.isScreenshot,
    );

    // 只有查詢、沒有動作 → 把查詢結果餵回，請 AI 繼續（同一次執行內自動接續套用）
    if (queryResults.length > 0 && !hasAction && round < MAX_ROUNDS - 1) {
      // 把這一輪 AI 的原始回覆（含 tool_calls）放進對話，維持上下文
      messages.push({ role: "assistant", content: raw });
      messages.push({
        role: "user",
        content: buildQueryFeedback(queryResults),
      });
      continue;
    }

    // 有動作工具，或沒有任何工具，或到達上限 → 結束
    break;
  }

  const applied = allExecResults.some((r) => r.ok && !r.isQuery && !r.isAsk);

  return {
    message: messageParts.join("\n\n") || "（已處理）",
    raw: lastRaw,
    toolCalls: allToolCalls,
    execResults: allExecResults,
    applied,
  };
}

/** 把查詢型工具的回傳組成餵回給 AI 的訊息 */
function buildQueryFeedback(queryResults: ToolExecResult[]): string {
  const blocks = queryResults.map((r) => {
    if (r.error) {
      return `【${r.tool}】查詢失敗：${r.error}`;
    }
    return `【${r.tool}】查詢結果：\n${r.info ?? "（無內容）"}`;
  });
  return [
    "以下是你剛才查詢到的資訊：",
    "",
    ...blocks,
    "",
    "請根據以上資訊，繼續用 tool_calls 給出實際的修改方案；若還需要更多資訊，可再查詢。",
  ].join("\n");
}

// ===== 還原（undo）支援 =====

/** 套用前的外觀快照，供「還原這次修改」使用 */
export interface ThemeSnapshot {
  currentPreset: string;
  currentSkin: string;
  currentThemePack: string;
  nightMode: boolean;
  customColors: Record<string, string>;
  avatarStyle: unknown;
  bubbleStyle: unknown;
  wallpaperStyle: unknown;
  customCSS: string;
  globalFont: unknown;
  widgets: { id: string; customCSS: string; clockStyle?: string }[];
}

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** 擷取目前完整外觀狀態（theme + 各組件 customCSS / clockStyle） */
export function captureSnapshot(): ThemeSnapshot {
  const theme = useThemeStore();
  const canvas = useCanvasStore();
  return {
    currentPreset: theme.currentPreset,
    currentSkin: theme.currentSkin,
    currentThemePack: theme.currentThemePack,
    nightMode: theme.nightMode,
    customColors: deepClone(theme.customColors as Record<string, string>),
    avatarStyle: deepClone(theme.avatarStyle),
    bubbleStyle: deepClone(theme.bubbleStyle),
    wallpaperStyle: deepClone(theme.wallpaperStyle),
    customCSS: theme.customCSS,
    globalFont: deepClone(theme.globalFont),
    widgets: canvas.widgets.map((w) => ({
      id: w.id,
      customCSS: (w.data?.customCSS as string) ?? "",
      clockStyle: w.data?.clockStyle as string | undefined,
    })),
  };
}

/** 把外觀還原成先前的快照 */
export function restoreSnapshot(snap: ThemeSnapshot): void {
  const theme = useThemeStore();
  const canvas = useCanvasStore();

  // 先用 setter 還原預設 / 皮膚 / 夜晚模式（會觸發 applyTheme）
  theme.setPreset(snap.currentPreset);
  theme.setSkin(snap.currentSkin);
  theme.setNightMode(snap.nightMode);

  // 直接還原其餘自訂狀態（Pinia setup store 屬性可寫且具響應性）
  theme.customColors = deepClone(snap.customColors);
  theme.avatarStyle = deepClone(snap.avatarStyle) as typeof theme.avatarStyle;
  theme.bubbleStyle = deepClone(snap.bubbleStyle) as typeof theme.bubbleStyle;
  theme.wallpaperStyle = deepClone(
    snap.wallpaperStyle,
  ) as typeof theme.wallpaperStyle;
  theme.currentThemePack = snap.currentThemePack;
  theme.applyTheme();

  theme.updateCustomCSS(snap.customCSS);
  theme.updateGlobalFont(snap.globalFont as Parameters<typeof theme.updateGlobalFont>[0]);

  // 還原各組件的 customCSS / clockStyle
  for (const w of snap.widgets) {
    const data: Record<string, unknown> = { customCSS: w.customCSS };
    if (w.clockStyle !== undefined) data.clockStyle = w.clockStyle;
    canvas.updateWidgetData(w.id, data);
  }
}
