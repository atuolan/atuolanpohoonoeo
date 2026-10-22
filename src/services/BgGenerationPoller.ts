import type { BgGenerationTaskView } from "@/types/bgGeneration";
import type { SelfHostedSyncClient } from "@/services/SelfHostedSyncClient";

export type BgGenerationCompletionHandler = (
  task: BgGenerationTaskView,
) => void | Promise<void>;

export type BgGenerationErrorHandler = (
  task: BgGenerationTaskView,
) => void | Promise<void>;

type ClientFactory = () => SelfHostedSyncClient | Promise<SelfHostedSyncClient>;
/** 包住每次呼叫，access token 過期時刷新後重試（每次重試都要重新建 client 才會拿到新 token） */
type ActionRunner = <T>(action: () => Promise<T>) => Promise<T>;

/** 伺服器重啟、或完成超過保留時間（預設一小時），任務就不在了 */
const TASK_GONE_MESSAGE =
  "HF 後台生成任務已不存在（伺服器可能重啟過，或完成超過一小時沒取回），請重新生成";

interface WatchedTaskRecord {
  taskId: string;
  chatId: string;
  lastMessageHash?: string;
  startedAt: number;
}

const WATCHED_TASKS_STORAGE_KEY = "aguaphone:bg_generation:watched_tasks";
const SEEN_TASKS_STORAGE_KEY = "aguaphone:bg_generation:seen_tasks";
const DEFAULT_POLL_INTERVAL_MS = 2500;
const DEFAULT_SEEN_LIMIT = 300;

function readJson<T>(key: string, fallback: T): T {
  if (typeof localStorage === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore quota/private-mode errors
  }
}

export class BgGenerationPoller {
  private clientFactory: ClientFactory | null = null;
  private runAction: ActionRunner | null = null;
  private readonly watchedTasks = new Map<string, WatchedTaskRecord>();
  private readonly seenTaskIds = new Set<string>();
  private readonly completionHandlers = new Set<BgGenerationCompletionHandler>();
  private readonly errorHandlers = new Set<BgGenerationErrorHandler>();
  private timer: number | null = null;
  private polling = false;
  private listenersStarted = false;
  private readonly pollIntervalMs = DEFAULT_POLL_INTERVAL_MS;

  constructor() {
    for (const task of readJson<WatchedTaskRecord[]>(WATCHED_TASKS_STORAGE_KEY, [])) {
      if (task?.taskId && task?.chatId) {
        this.watchedTasks.set(task.taskId, task);
      }
    }
    for (const taskId of readJson<string[]>(SEEN_TASKS_STORAGE_KEY, [])) {
      if (taskId) this.seenTaskIds.add(taskId);
    }
  }

  configure(clientFactory: ClientFactory, runAction?: ActionRunner): void {
    this.clientFactory = clientFactory;
    this.runAction = runAction ?? null;
    this.startLifecycleListeners();
    if (this.watchedTasks.size > 0) this.start();
  }

  /** 聊天頁打開時註冊；沒有人接的時候不輪詢，任務留著等下次打開聊天頁再寫入 */
  onCompleted(handler: BgGenerationCompletionHandler): () => void {
    this.completionHandlers.add(handler);
    if (this.watchedTasks.size > 0) this.start();
    return () => {
      this.completionHandlers.delete(handler);
      if (this.completionHandlers.size === 0) this.stop();
    };
  }

  onError(handler: BgGenerationErrorHandler): () => void {
    this.errorHandlers.add(handler);
    return () => this.errorHandlers.delete(handler);
  }

  watchTask(task: Pick<WatchedTaskRecord, "taskId" | "chatId" | "lastMessageHash">): void {
    if (!task.taskId || !task.chatId) return;
    this.watchedTasks.set(task.taskId, {
      taskId: task.taskId,
      chatId: task.chatId,
      lastMessageHash: task.lastMessageHash,
      startedAt: Date.now(),
    });
    this.persistWatchedTasks();
    this.start();
    void this.pollOnce();
  }

  unwatchTask(taskId: string): void {
    if (!this.watchedTasks.delete(taskId)) return;
    this.persistWatchedTasks();
    if (this.watchedTasks.size === 0) this.stop();
  }

  isWatchingChat(chatId: string): boolean {
    return Array.from(this.watchedTasks.values()).some((task) => task.chatId === chatId);
  }

  getWatchedTasksForChat(chatId: string): WatchedTaskRecord[] {
    return Array.from(this.watchedTasks.values()).filter((task) => task.chatId === chatId);
  }

  hasSeen(taskId: string): boolean {
    return this.seenTaskIds.has(taskId);
  }

  markSeen(taskId: string): void {
    if (!taskId) return;
    this.seenTaskIds.add(taskId);
    const trimmed = Array.from(this.seenTaskIds).slice(-DEFAULT_SEEN_LIMIT);
    this.seenTaskIds.clear();
    for (const id of trimmed) this.seenTaskIds.add(id);
    writeJson(SEEN_TASKS_STORAGE_KEY, trimmed);
  }

  async recoverPendingForChat(chatId: string, lastMessageHash?: string): Promise<BgGenerationTaskView | null> {
    const result = await this.callClient((client) =>
      client.findPendingGenerationByChat(chatId, lastMessageHash),
    );
    const task = result.task;
    if (!task || this.seenTaskIds.has(task.taskId)) return null;
    if (["pending", "running", "done", "error"].includes(task.status)) {
      this.watchTask({
        taskId: task.taskId,
        chatId: task.chatId,
        lastMessageHash: task.lastMessageHash,
      });
    }
    return task;
  }

  /** 傳入自己的 deviceId：只接這台裝置開的任務，別台的由它自己接，避免同一則回覆寫兩次 */
  async recoverActiveTasks(deviceId?: string): Promise<void> {
    const result = await this.callClient((client) =>
      client.listGenerationTasks(["pending", "running", "done", "error"]),
    );
    for (const task of result.tasks || []) {
      if (this.seenTaskIds.has(task.taskId)) continue;
      if (deviceId && task.deviceId && task.deviceId !== deviceId) continue;
      this.watchTask({
        taskId: task.taskId,
        chatId: task.chatId,
        lastMessageHash: task.lastMessageHash,
      });
    }
  }

  start(): void {
    if (this.timer !== null || typeof window === "undefined" || this.completionHandlers.size === 0) return;
    this.timer = window.setInterval(() => void this.pollOnce(), this.pollIntervalMs);
  }

  stop(): void {
    if (this.timer === null || typeof window === "undefined") return;
    window.clearInterval(this.timer);
    this.timer = null;
  }

  async pollOnce(): Promise<void> {
    // 沒有聊天頁在接（completionHandlers 空）就不查：查到完成也寫不進聊天，等打開聊天頁再說
    if (this.polling || this.watchedTasks.size === 0 || this.completionHandlers.size === 0) return;
    this.polling = true;
    try {
      const watched = Array.from(this.watchedTasks.values());
      for (const record of watched) {
        if (this.seenTaskIds.has(record.taskId)) {
          this.unwatchTask(record.taskId);
          continue;
        }

        try {
          const task = await this.callClient((client) => client.getGenerationStatus(record.taskId));
          if (task.status === "done") {
            await this.emitCompleted(task);
          } else if (task.status === "error" || task.status === "canceled") {
            await this.emitError(task);
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          if (message.includes("Generation task not found") || message.includes("API error (404)")) {
            console.warn("[BgGenerationPoller] stale generation task removed", {
              taskId: record.taskId,
              chatId: record.chatId,
              error: message,
            });
            // 不默默丟掉：讓聊天頁顯示錯誤，使用者才知道要重新生成
            await this.emitError({
              taskId: record.taskId,
              chatId: record.chatId,
              taskType: "chat",
              status: "error",
              content: "",
              error: TASK_GONE_MESSAGE,
              lastMessageHash: record.lastMessageHash,
              createdAt: record.startedAt,
            });
            continue;
          }
          throw error;
        }
      }
    } catch (error) {
      console.warn("[BgGenerationPoller] polling failed", error);
    } finally {
      this.polling = false;
      if (this.watchedTasks.size === 0) this.stop();
    }
  }

  private async emitCompleted(task: BgGenerationTaskView): Promise<void> {
    // 沒有人接就不要標成已處理，不然結果會被丟掉
    if (this.seenTaskIds.has(task.taskId) || this.completionHandlers.size === 0) return;
    for (const handler of Array.from(this.completionHandlers)) {
      await handler(task);
    }
    this.markSeen(task.taskId);
    this.unwatchTask(task.taskId);
  }

  private async emitError(task: BgGenerationTaskView): Promise<void> {
    if (this.seenTaskIds.has(task.taskId) || this.errorHandlers.size === 0) return;
    for (const handler of Array.from(this.errorHandlers)) {
      await handler(task);
    }
    this.markSeen(task.taskId);
    this.unwatchTask(task.taskId);
  }

  private async getClient(): Promise<SelfHostedSyncClient> {
    if (!this.clientFactory) {
      throw new Error("HF 後台生成尚未設定同步伺服器 client");
    }
    return await this.clientFactory();
  }

  private async callClient<T>(call: (client: SelfHostedSyncClient) => Promise<T>): Promise<T> {
    const action = async () => call(await this.getClient());
    return this.runAction ? this.runAction(action) : action();
  }

  private persistWatchedTasks(): void {
    writeJson(WATCHED_TASKS_STORAGE_KEY, Array.from(this.watchedTasks.values()));
  }

  private startLifecycleListeners(): void {
    if (this.listenersStarted || typeof window === "undefined" || typeof document === "undefined") return;
    this.listenersStarted = true;
    const wake = () => void this.pollOnce();
    window.addEventListener("focus", wake);
    window.addEventListener("pageshow", wake);
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) wake();
    });
  }
}

export const bgGenerationPoller = new BgGenerationPoller();
