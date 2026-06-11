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
