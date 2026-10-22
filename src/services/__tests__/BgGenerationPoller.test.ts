import { describe, expect, it, vi } from "vitest";
import { BgGenerationPoller } from "@/services/BgGenerationPoller";
import type { SelfHostedSyncClient } from "@/services/SelfHostedSyncClient";
import type { BgGenerationTaskView } from "@/types/bgGeneration";

function doneTask(taskId: string, chatId: string, deviceId = "dev-a"): BgGenerationTaskView {
  return {
    taskId,
    deviceId,
    chatId,
    taskType: "chat",
    status: "done",
    content: "角色的回覆",
    createdAt: 1,
  };
}

function fakeClient(overrides: Partial<Record<keyof SelfHostedSyncClient, unknown>>) {
  return overrides as unknown as SelfHostedSyncClient;
}

describe("HF 後台生成輪詢", () => {
  it("沒有聊天頁在接時，完成的任務不會被丟掉，打開聊天頁再寫入", async () => {
    const getGenerationStatus = vi.fn(async (taskId: string) => doneTask(taskId, "chat-1"));
    const poller = new BgGenerationPoller();
    poller.configure(() => fakeClient({ getGenerationStatus }));

    poller.watchTask({ taskId: "task-1", chatId: "chat-1" });
    await poller.pollOnce();

    expect(poller.hasSeen("task-1")).toBe(false);
    expect(poller.isWatchingChat("chat-1")).toBe(true);

    const landed = vi.fn();
    poller.onCompleted(landed);
    poller.onError(vi.fn());
    await poller.pollOnce();

    expect(landed).toHaveBeenCalledWith(expect.objectContaining({ taskId: "task-1" }));
    expect(poller.hasSeen("task-1")).toBe(true);
    expect(poller.isWatchingChat("chat-1")).toBe(false);
  });

  it("任務在伺服器上不見了（404），會告訴使用者，不默默丟掉", async () => {
    const getGenerationStatus = vi.fn(async () => {
      throw new Error('Self-hosted sync API error (404): {"error":"Generation task not found"}');
    });
    const poller = new BgGenerationPoller();
    poller.configure(() => fakeClient({ getGenerationStatus }));
    const failed = vi.fn();
    poller.onCompleted(vi.fn());
    poller.onError(failed);

    // watchTask 會馬上查一次
    poller.watchTask({ taskId: "task-gone", chatId: "chat-1" });
    await vi.waitFor(() => expect(failed).toHaveBeenCalled());

    expect(failed).toHaveBeenCalledWith(
      expect.objectContaining({ taskId: "task-gone", chatId: "chat-1", status: "error" }),
    );
    expect(failed.mock.calls[0][0].error).toContain("重新生成");
    expect(poller.hasSeen("task-gone")).toBe(true);
  });

  it("access token 過期時，經 runAction 刷新後用新的 client 重試", async () => {
    let refreshed = false;
    const createClient = vi.fn(() => {
      const tokenValid = refreshed;
      return fakeClient({
        getGenerationStatus: async (taskId: string) => {
          if (!tokenValid) {
            throw new Error('Self-hosted sync API error (401): {"error":"Invalid access token signature"}');
          }
          return doneTask(taskId, "chat-1");
        },
      });
    });
    const runAction = async <T>(action: () => Promise<T>): Promise<T> => {
      try {
        return await action();
      } catch {
        refreshed = true;
        return action();
      }
    };
    const poller = new BgGenerationPoller();
    poller.configure(createClient, runAction);
    const landed = vi.fn();
    poller.onCompleted(landed);
    poller.onError(vi.fn());

    poller.watchTask({ taskId: "task-1", chatId: "chat-1" });
    await vi.waitFor(() => expect(landed).toHaveBeenCalled());

    expect(landed).toHaveBeenCalledTimes(1);
    expect(createClient).toHaveBeenCalledTimes(2);
  });

  it("只接自己這台裝置開的任務，別台的不重複寫入", async () => {
    const listGenerationTasks = vi.fn(async () => ({
      serverTime: 1,
      tasks: [doneTask("mine", "chat-1", "dev-a"), doneTask("other", "chat-2", "dev-b")],
    }));
    const poller = new BgGenerationPoller();
    const getGenerationStatus = vi.fn(async (taskId: string) => ({
      ...doneTask(taskId, "chat-1"),
      status: "running" as const,
    }));
    poller.configure(() => fakeClient({ listGenerationTasks, getGenerationStatus }));

    await poller.recoverActiveTasks("dev-a");

    expect(poller.isWatchingChat("chat-1")).toBe(true);
    expect(poller.isWatchingChat("chat-2")).toBe(false);
  });
});
