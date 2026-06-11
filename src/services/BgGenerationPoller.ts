import type { BgGenerationTaskView } from "@/types/bgGeneration";
import type { SelfHostedSyncClient } from "@/services/SelfHostedSyncClient";

export type BgGenerationCompletionHandler = (
  task: BgGenerationTaskView,
) => void | Promise<void>;

export type BgGenerationErrorHandler = (
  task: BgGenerationTaskView,
) => void | Promise<void>;

type ClientFactory = () => SelfHostedSyncClient | Promise<SelfHostedSyncClient>;

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

class BgGenerationPoller {
  private clientFactory: ClientFactory | null = null;
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

  configure(clientFactory: ClientFactory): void {
    this.clientFactory = clientFactory;
    this.startLifecycleListeners();
    if (this.watchedTasks.size > 0) this.start();
  }

  onCompleted(handler: BgGenerationCompletionHandler): () => void {
    this.completionHandlers.add(handler);
    return () => this.completionHandlers.delete(handler);
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
    const client = await this.getClient();
    const result = await client.findPendingGenerationByChat(chatId, lastMessageHash);
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

  async recoverActiveTasks(): Promise<void> {
    const client = await this.getClient();
    const result = await client.listGenerationTasks(["pending", "running", "done", "error"]);
    for (const task of result.tasks || []) {
      if (this.seenTaskIds.has(task.taskId)) continue;
      this.watchTask({
        taskId: task.taskId,
        chatId: task.chatId,
        lastMessageHash: task.lastMessageHash,
      });
    }
  }

  start(): void {
    if (this.timer !== null || typeof window === "undefined") return;
    this.timer = window.setInterval(() => void this.pollOnce(), this.pollIntervalMs);
  }

  stop(): void {
    if (this.timer === null || typeof window === "undefined") return;
    window.clearInterval(this.timer);
    this.timer = null;
  }

  async pollOnce(): Promise<void> {
    if (this.polling || this.watchedTasks.size === 0) return;
    this.polling = true;
    try {
      const client = await this.getClient();
      const watched = Array.from(this.watchedTasks.values());
      for (const record of watched) {
        if (this.seenTaskIds.has(record.taskId)) {
          this.unwatchTask(record.taskId);
          continue;
        }

        try {
          const task = await client.getGenerationStatus(record.taskId);
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
            this.markSeen(record.taskId);
            this.unwatchTask(record.taskId);
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
    if (this.seenTaskIds.has(task.taskId)) return;
    for (const handler of Array.from(this.completionHandlers)) {
      await handler(task);
    }
    this.markSeen(task.taskId);
    this.unwatchTask(task.taskId);
  }

  private async emitError(task: BgGenerationTaskView): Promise<void> {
    if (this.seenTaskIds.has(task.taskId)) return;
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
