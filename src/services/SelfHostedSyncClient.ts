import type {
  SelfHostedSyncAuthResponse,
  SelfHostedSyncDeviceInfoUpdateRequest,
  SelfHostedSyncDeviceInfoUpdateResponse,
  SelfHostedSyncEntityEnvelope,
  SelfHostedSyncHealthResponse,
  SelfHostedSyncLoginRequest,
  SelfHostedSyncMetaResponse,
  SelfHostedSyncPullResponse,
  SelfHostedSyncPushRequest,
  SelfHostedSyncPushResponse,
  SelfHostedSyncRefreshRequest,
  SelfHostedSyncRegisterRequest,
  SelfHostedSyncStatusResponse,
} from "@/types/selfHostedSync";
import type {
  AbortGenerationTaskResponse,
  BgGenerationPendingResponse,
  BgGenerationTaskListResponse,
  BgGenerationTaskView,
  StartGenerationRequest,
  StartGenerationResponse,
} from "@/types/bgGeneration";
import { recordRuntimeDiagnostic, updateRuntimeSessionStage } from "@/utils/runtimeDiagnostics";

export interface SelfHostedSyncClientOptions {
  serverUrl: string;
  accessToken?: string | null;
}

export class SelfHostedSyncClient {
  private readonly serverUrl: string;
  private accessToken: string | null;

  constructor(options: SelfHostedSyncClientOptions) {
    this.serverUrl = normalizeServerUrl(options.serverUrl);
    this.accessToken = options.accessToken ?? null;
  }

  setAccessToken(token: string | null): void {
    this.accessToken = token;
  }

  getAccessToken(): string | null {
    return this.accessToken;
  }

  async testConnection(): Promise<SelfHostedSyncHealthResponse> {
    return this.request<SelfHostedSyncHealthResponse>("GET", "/health");
  }

  async register(
    payload: SelfHostedSyncRegisterRequest,
  ): Promise<SelfHostedSyncAuthResponse> {
    return this.request<SelfHostedSyncAuthResponse>(
      "POST",
      "/auth/register",
      payload,
    );
  }

  async login(
    payload: SelfHostedSyncLoginRequest,
  ): Promise<SelfHostedSyncAuthResponse> {
    return this.request<SelfHostedSyncAuthResponse>(
      "POST",
      "/auth/login",
      payload,
    );
  }

  async refreshAccessToken(
    payload: SelfHostedSyncRefreshRequest,
  ): Promise<SelfHostedSyncAuthResponse> {
    return this.request<SelfHostedSyncAuthResponse>(
      "POST",
      "/auth/refresh",
      payload,
    );
  }

  async getStatus(): Promise<SelfHostedSyncStatusResponse> {
    return this.request<SelfHostedSyncStatusResponse>("GET", "/sync/status", undefined, {
      requireAuth: true,
    });
  }

  async getMeta(): Promise<SelfHostedSyncMetaResponse> {
    return this.request<SelfHostedSyncMetaResponse>("GET", "/sync/meta", undefined, {
      requireAuth: true,
    });
  }

  async updateDeviceInfo(
    payload: SelfHostedSyncDeviceInfoUpdateRequest,
  ): Promise<SelfHostedSyncDeviceInfoUpdateResponse> {
    return this.request<SelfHostedSyncDeviceInfoUpdateResponse>(
      "POST",
      "/devices/self",
      payload,
      { requireAuth: true },
    );
  }

  async pushItems(
    payload: SelfHostedSyncPushRequest,
  ): Promise<SelfHostedSyncPushResponse> {
    return this.request<SelfHostedSyncPushResponse>("POST", "/sync/push", payload, {
      requireAuth: true,
    });
  }

  async pullItems(since?: number, limit?: number, signal?: AbortSignal): Promise<SelfHostedSyncPullResponse> {
    const params = new URLSearchParams();
    if (typeof since === "number") params.set("since", String(since));
    if (typeof limit === "number") params.set("limit", String(limit));
    const query = params.toString() ? `?${params.toString()}` : "";
    return this.request<SelfHostedSyncPullResponse>("GET", `/sync/pull${query}`, undefined, {
      requireAuth: true,
      signal,
    });
  }

  async pushEnvelopes(
    deviceId: string,
    items: SelfHostedSyncEntityEnvelope[],
  ): Promise<SelfHostedSyncPushResponse> {
    return this.pushItems({ deviceId, items });
  }

  async startRemoteGeneration(
    payload: StartGenerationRequest,
  ): Promise<StartGenerationResponse> {
    return this.request<StartGenerationResponse>("POST", "/generate", payload, {
      requireAuth: true,
    });
  }

  async getGenerationStatus(taskId: string): Promise<BgGenerationTaskView> {
    return this.request<BgGenerationTaskView>(
      "GET",
      `/generate/${encodeURIComponent(taskId)}`,
      undefined,
      { requireAuth: true },
    );
  }

  async listGenerationTasks(statuses?: string[]): Promise<BgGenerationTaskListResponse> {
    const params = new URLSearchParams();
    if (statuses?.length) params.set("status", statuses.join(","));
    const query = params.toString() ? `?${params.toString()}` : "";
    return this.request<BgGenerationTaskListResponse>(
      "GET",
      `/generate${query}`,
      undefined,
      { requireAuth: true },
    );
  }

  async findPendingGenerationByChat(
    chatId: string,
    lastMessageHash?: string,
  ): Promise<BgGenerationPendingResponse> {
    const params = new URLSearchParams({ chatId });
    if (lastMessageHash) params.set("lastMessageHash", lastMessageHash);
    return this.request<BgGenerationPendingResponse>(
      "GET",
      `/generate/pending?${params.toString()}`,
      undefined,
      { requireAuth: true },
    );
  }

  async abortGenerationTask(taskId: string): Promise<AbortGenerationTaskResponse> {
    return this.request<AbortGenerationTaskResponse>(
      "POST",
      `/generate/${encodeURIComponent(taskId)}/abort`,
      {},
      { requireAuth: true },
    );
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    options?: { requireAuth?: boolean; signal?: AbortSignal },
  ): Promise<T> {
    const headers: Record<string, string> = {};

    if (body !== undefined) {
      headers["Content-Type"] = "application/json";
    }

    if (this.serverUrl.includes("ngrok")) {
      headers["ngrok-skip-browser-warning"] = "true";
    }

    if (options?.requireAuth) {
      if (!this.accessToken) {
        throw new Error("Self-hosted sync access token is missing");
      }
      headers.Authorization = `Bearer ${this.accessToken}`;
    }

    const response = await fetch(`${this.serverUrl}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: options?.signal,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      if (
        response.status === 511 ||
        errorText.includes("Tunnel website ahead") ||
        errorText.includes("localtunnel") ||
        (errorText.includes("<html") && errorText.includes("tunnel"))
      ) {
        throw new Error(
          `無法連線：偵測到 localtunnel (loca.lt) 攔截頁面（HTTP ${response.status}）。` +
          `請先在瀏覽器中開啟隧道 URL，輸入頁面上顯示的 IP 位址通過驗證。`,
        );
      }
      throw new Error(
        `Self-hosted sync API error (${response.status}): ${errorText}`,
      );
    }

    if (response.status === 204) {
      return undefined as T;
    }

    const contentLength = response.headers.get("content-length");
    const contentLengthBytes = contentLength ? parseInt(contentLength, 10) : null;
    updateRuntimeSessionStage("selfHostedSync:http response parsing", {
      path,
      status: response.status,
      contentLengthBytes,
    });
    if (contentLengthBytes !== null && contentLengthBytes > 4 * 1024 * 1024) {
      recordRuntimeDiagnostic("event", "selfHostedSync.largePayload", "Pull response payload is very large", {
        path,
        contentLengthBytes,
        contentLengthMB: (contentLengthBytes / 1024 / 1024).toFixed(2),
      });
    }

    return response.json() as Promise<T>;
  }
}

function normalizeServerUrl(serverUrl: string): string {
  const trimmed = serverUrl.trim();
  if (!trimmed) {
    throw new Error("Self-hosted sync server URL is required");
  }
  return trimmed.replace(/\/+$/, "");
}
