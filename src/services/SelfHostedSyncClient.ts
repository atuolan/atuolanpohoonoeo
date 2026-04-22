import type {
  SelfHostedSyncAuthResponse,
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

  async pushItems(
    payload: SelfHostedSyncPushRequest,
  ): Promise<SelfHostedSyncPushResponse> {
    return this.request<SelfHostedSyncPushResponse>("POST", "/sync/push", payload, {
      requireAuth: true,
    });
  }

  async pullItems(since?: number): Promise<SelfHostedSyncPullResponse> {
    const query = typeof since === "number" ? `?since=${encodeURIComponent(String(since))}` : "";
    return this.request<SelfHostedSyncPullResponse>("GET", `/sync/pull${query}`, undefined, {
      requireAuth: true,
    });
  }

  async pushEnvelopes(
    deviceId: string,
    items: SelfHostedSyncEntityEnvelope[],
  ): Promise<SelfHostedSyncPushResponse> {
    return this.pushItems({ deviceId, items });
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    options?: { requireAuth?: boolean },
  ): Promise<T> {
    const headers: Record<string, string> = {};

    if (body !== undefined) {
      headers["Content-Type"] = "application/json";
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
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
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
