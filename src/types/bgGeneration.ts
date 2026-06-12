import type { APIMessage } from "@/api/OpenAICompatible";
import type { GenerationTaskType } from "@/stores/aiGeneration";

export type BgGenerationTaskStatus = "pending" | "running" | "done" | "error" | "canceled";

export interface StartGenerationRequest {
  deviceId: string;
  chatId: string;
  taskType: GenerationTaskType;
  endpoint: string;
  model: string;
  messages: APIMessage[];
  params?: Record<string, unknown>;
  apiKey?: string;
  lastMessageHash?: string;
  /**
   * 雲端推送用的 userId（與 Web Push 訂閱時相同：優先 Discord、降級裝置指紋）。
   * HF Space 在任務完成時會用此 ID 呼叫 Cloudflare /push/notify，
   * 讓使用者即使關閉瀏覽器也能收到系統推送。
   */
  cloudPushUserId?: string;
  /** 推送通知顯示的角色名稱（HF 端只有生成內容，名稱需由前端帶上） */
  cloudPushCharacterName?: string;
  /** 推送通知關聯的角色 ID（點擊通知時導航用） */
  cloudPushCharacterId?: string;
}

export interface StartGenerationResponse {
  ok: true;
  taskId: string;
  serverTime: number;
}

export interface BgGenerationTaskView {
  taskId: string;
  deviceId?: string;
  chatId: string;
  taskType: GenerationTaskType;
  status: BgGenerationTaskStatus;
  content: string;
  error?: string;
  lastMessageHash?: string;
  createdAt: number;
  updatedAt?: number;
  startedAt?: number;
  finishedAt?: number;
}

export interface BgGenerationTaskListResponse {
  serverTime: number;
  tasks: BgGenerationTaskView[];
}

export interface BgGenerationPendingResponse {
  serverTime: number;
  task: BgGenerationTaskView | null;
}

export interface AbortGenerationTaskResponse {
  ok: true;
  task: BgGenerationTaskView;
}
