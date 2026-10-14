/**
 * Gradio 公開 Demo 呼叫工具
 *
 * 流程：上傳音檔 → 送出推理 → 讀 SSE 結果。ModelScope 的 Demo 允許跨網域呼叫，
 * 由玩家的瀏覽器直接連線，不經過我們的伺服器。
 */

export type GradioErrorKind =
  | "http"
  | "invalid-response"
  | "server-error"
  | "timeout"
  | "aborted";

export class GradioError extends Error {
  readonly kind: GradioErrorKind;

  constructor(kind: GradioErrorKind, message: string) {
    super(message);
    this.name = "GradioError";
    this.kind = kind;
  }
}

export interface GradioSseEvent {
  event: string;
  data: string;
}

/** 解析 Gradio 回傳的 SSE 文字 */
export function parseGradioSse(text: string): GradioSseEvent[] {
  const events: GradioSseEvent[] = [];
  let current: { event: string; data: string[] } | null = null;
  const flush = () => {
    if (current) events.push({ event: current.event, data: current.data.join("\n") });
    current = null;
  };
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trimEnd();
    if (line.startsWith("event:")) {
      flush();
      current = { event: line.slice(6).trim(), data: [] };
    } else if (line.startsWith("data:")) {
      if (!current) current = { event: "message", data: [] };
      current.data.push(line.slice(5).trim());
    } else if (line === "") {
      flush();
    }
  }
  flush();
  return events;
}

const MIME_EXT: Array<[RegExp, string]> = [
  [/wav/, "wav"],
  [/webm/, "webm"],
  [/ogg/, "ogg"],
  [/mp4|m4a|aac/, "m4a"],
  [/mpeg|mp3/, "mp3"],
];

/** 依音檔 MIME 產生上傳用的檔名 */
export function audioFileName(blob: Blob, prefix = "voice"): string {
  const type = (blob.type || "").toLowerCase();
  const ext = MIME_EXT.find(([re]) => re.test(type))?.[1] ?? "wav";
  return `${prefix}_${Date.now()}.${ext}`;
}

export interface GradioCallOptions {
  /** 例如 https://qwen-qwen3-asr-demo.ms.show/gradio_api */
  baseUrl: string;
  endpoint: string;
  file: Blob;
  fileName: string;
  /** 音檔之後的其他參數 */
  extraData: unknown[];
  /** 整個流程（三個請求）的總時限 */
  timeoutMs: number;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
}

/** 呼叫第一個參數是音檔的 Gradio 端點，回傳 complete 事件的 data 陣列 */
export async function callGradioWithAudio(options: GradioCallOptions): Promise<unknown[]> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(new GradioError("timeout", "辨識逾時")),
    options.timeoutMs,
  );
  const onOuterAbort = () => controller.abort(new GradioError("aborted", "已取消"));
  if (options.signal?.aborted) onOuterAbort();
  else options.signal?.addEventListener("abort", onOuterAbort, { once: true });

  const mimeType = options.file.type || "audio/wav";
  try {
    const form = new FormData();
    form.append("files", new File([options.file], options.fileName, { type: mimeType }));
    const uploaded = await readJson(
      await fetchImpl(`${options.baseUrl}/upload`, {
        method: "POST",
        body: form,
        signal: controller.signal,
      }),
      "上傳",
    );
    const path = Array.isArray(uploaded) ? uploaded[0] : undefined;
    if (typeof path !== "string") {
      throw new GradioError("invalid-response", "上傳後沒有回傳檔案路徑");
    }

    const submitted = await readJson(
      await fetchImpl(`${options.baseUrl}/call/${options.endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          data: [
            {
              path,
              orig_name: options.fileName,
              size: options.file.size,
              mime_type: mimeType,
              meta: { _type: "gradio.FileData" },
            },
            ...options.extraData,
          ],
        }),
        signal: controller.signal,
      }),
      "送出",
    );
    const eventId = (submitted as { event_id?: unknown } | null)?.event_id;
    if (typeof eventId !== "string") {
      throw new GradioError("invalid-response", "沒有回傳 event_id");
    }

    const resultResp = await fetchImpl(
      `${options.baseUrl}/call/${options.endpoint}/${eventId}`,
      { signal: controller.signal },
    );
    if (!resultResp.ok) {
      throw new GradioError("http", `讀取結果失敗 (${resultResp.status})`);
    }
    const events = parseGradioSse(await resultResp.text());
    const error = events.find((e) => e.event === "error");
    if (error) throw new GradioError("server-error", `服務回報錯誤：${error.data || "未知"}`);
    const complete = [...events].reverse().find((e) => e.event === "complete");
    if (!complete) throw new GradioError("invalid-response", "沒有收到完成事件");
    let data: unknown;
    try {
      data = JSON.parse(complete.data);
    } catch {
      throw new GradioError("invalid-response", "結果不是 JSON");
    }
    if (!Array.isArray(data)) throw new GradioError("invalid-response", "結果格式不符");
    return data;
  } catch (err) {
    if (err instanceof GradioError) throw err;
    if (controller.signal.aborted) {
      const reason: unknown = controller.signal.reason;
      throw reason instanceof GradioError ? reason : new GradioError("aborted", "已取消");
    }
    throw new GradioError(
      "http",
      `連線失敗：${err instanceof Error ? err.message : String(err)}`,
    );
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", onOuterAbort);
  }
}

async function readJson(resp: Response, step: string): Promise<unknown> {
  if (!resp.ok) throw new GradioError("http", `${step}失敗 (${resp.status})`);
  const text = await resp.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new GradioError("invalid-response", `${step}回應不是 JSON`);
  }
}
