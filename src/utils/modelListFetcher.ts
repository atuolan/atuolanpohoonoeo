/**
 * 模型列表拉取工具
 * 先打 OpenAI 格式的 `${endpoint}/models`；若回 404，
 * 改打 Gemini 原生的 `/v1beta/models`（部分代理如 smolproxy 的 Google 線路
 * 支援 OpenAI 格式聊天，卻沒有實作 OpenAI 格式的模型列表）
 */

/** 從回應中解析模型 ID（支援 OpenAI `{data:[{id}]}`、純陣列、Gemini `{models:[{name}]}`） */
export function parseModelList(data: unknown): string[] {
  let ids: string[] = [];
  if (Array.isArray(data)) {
    ids = data.map((m: string | { id?: string }) =>
      typeof m === "string" ? m : m?.id || "",
    );
  } else if (data && typeof data === "object") {
    const obj = data as { data?: unknown; models?: unknown };
    if (Array.isArray(obj.data)) {
      ids = obj.data.map((m: { id?: string }) => m?.id || "");
    } else if (Array.isArray(obj.models)) {
      ids = obj.models.map((m: { name?: string; id?: string }) =>
        (m?.name || m?.id || "").replace(/^models\//, ""),
      );
    }
  }
  return [...new Set(ids.filter(Boolean))];
}

/** 由端點推出 Gemini 原生模型列表 URL（去掉結尾的 /v1、/v1beta、/v1beta/openai 等） */
export function getGeminiNativeModelsUrl(endpoint: string): string {
  const base = endpoint
    .trim()
    .replace(/\/+$/, "")
    .replace(/\/openai$/i, "")
    .replace(/\/v1(beta\d*)?$/i, "");
  return `${base}/v1beta/models?pageSize=1000`;
}

/**
 * 拉取模型 ID 列表
 * @param toUrl 將外部 URL 轉為代理 URL 的函式（各面板各自的代理規則）
 * @throws Error(`HTTP ${status}: ${statusText}`) 兩種路徑都失敗時，拋出第一次請求的錯誤
 */
export async function fetchModelIds(
  endpoint: string,
  apiKey: string,
  toUrl: (url: string) => string,
): Promise<string[]> {
  const headers = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
  const base = endpoint.trim().replace(/\/+$/, "");

  const response = await fetch(toUrl(`${base}/models`), {
    method: "GET",
    headers,
  });
  if (response.ok) return parseModelList(await response.json());

  const originalError = new Error(
    `HTTP ${response.status}: ${response.statusText}`,
  );
  if (response.status !== 404) throw originalError;

  try {
    const fallback = await fetch(toUrl(getGeminiNativeModelsUrl(base)), {
      method: "GET",
      headers,
    });
    if (fallback.ok) {
      const ids = parseModelList(await fallback.json());
      if (ids.length > 0) return ids;
    }
  } catch {
    // fallback 失敗時回報原本的錯誤
  }
  throw originalError;
}
