import { beforeEach, describe, expect, it, vi } from "vitest";

const { plan, generation } = vi.hoisted(() => ({
  plan: { tokens: ["甲", "乙"] as string[], waitForAbort: false },
  generation: { streamingEnabled: true, useStreamingWindow: true },
}));

vi.mock("@/stores/settings", () => ({
  useSettingsStore: () => ({
    getAPIForTask: () => ({ api: { endpoint: "http://x", apiKey: "k", model: "m" }, generation: { ...generation } }),
  }),
}));
vi.mock("@/api/OpenAICompatible", () => ({
  OpenAICompatibleClient: class {
    async *generateStream(params: { signal?: AbortSignal }) {
      let text = "";
      for (const token of plan.tokens) {
        text += token;
        yield { type: "token", token };
      }
      // 跟真的 client 一樣：被中止時帶著半截內容正常結束
      if (plan.waitForAbort) {
        await new Promise<void>((resolve) => params.signal?.addEventListener("abort", () => resolve()));
      }
      yield { type: "done", content: text, usage: { prompt_tokens: 10, completion_tokens: 2, total_tokens: 12 } };
    }
  },
}));

import { useStreamingWindow } from "@/composables/useStreamingWindow";
import { AIStoppedError, askAI } from "@/services/BookAIService";

const messages = [
  { role: "system" as const, content: "你是作者" },
  { role: "user" as const, content: "你好" },
];
const flush = () => new Promise((r) => setTimeout(r, 0));

describe("閱讀 App 的 AI 呼叫接上串流視窗", () => {
  beforeEach(() => {
    useStreamingWindow().reset();
    plan.tokens = ["甲", "乙"];
    plan.waitForAbort = false;
    generation.streamingEnabled = true;
    generation.useStreamingWindow = true;
  });

  it("設定開著串流視窗：邊生成邊寫進視窗（縮小開著），完成後放掉擁有權", async () => {
    const win = useStreamingWindow();
    await expect(askAI(messages)).resolves.toBe("甲乙");
    expect(win.content.value).toBe("甲乙");
    expect(win.windowState.value).toBe("minimized");
    expect(win.isComplete.value).toBe(true);
    expect(win.hasError.value).toBe(false);
    expect(win.promptContent.value.map((m) => m.content)).toEqual(["你是作者", "你好"]);
    expect(win.promptTokens.value).toBe(10);
    expect(win.activeOwnerId.value).toBeNull();
  });

  it("按視窗的停止：丟 AIStoppedError，不把半截內容當成回覆", async () => {
    plan.waitForAbort = true;
    const win = useStreamingWindow();
    const pending = askAI(messages);
    await flush();
    expect(win.isStreaming.value).toBe(true);
    win.emit("stop");
    await expect(pending).rejects.toBeInstanceOf(AIStoppedError);
    expect(win.isComplete.value).toBe(true);
    expect(win.hasError.value).toBe(false);
  });

  it("背景跑的不搶別人正在用的視窗，照樣拿到回覆", async () => {
    const win = useStreamingWindow();
    win.show("other", true, "companion:b:1");
    win.appendToken("角色正在說", "companion:b:1");
    await expect(askAI(messages, { background: true })).resolves.toBe("甲乙");
    expect(win.activeOwnerId.value).toBe("companion:b:1");
    expect(win.content.value).toBe("角色正在說");
  });

  it("使用者正開著視窗看，新的一輪保持展開", async () => {
    const win = useStreamingWindow();
    win.show("m", false);
    win.setComplete();
    await askAI(messages);
    expect(win.windowState.value).toBe("visible");
    expect(win.content.value).toBe("甲乙");
  });

  it("設定關掉串流視窗或串流就不開視窗", async () => {
    const win = useStreamingWindow();
    generation.useStreamingWindow = false;
    await expect(askAI(messages)).resolves.toBe("甲乙");
    expect(win.windowState.value).toBe("hidden");

    generation.useStreamingWindow = true;
    generation.streamingEnabled = false;
    await askAI(messages);
    expect(win.windowState.value).toBe("hidden");
  });

  it("出錯時視窗顯示錯誤", async () => {
    plan.tokens = [];
    const win = useStreamingWindow();
    await expect(askAI(messages)).rejects.toThrow("AI 沒有回應");
    expect(win.hasError.value).toBe(true);
    expect(win.errorMessage.value).toBe("AI 沒有回應");
  });
});
