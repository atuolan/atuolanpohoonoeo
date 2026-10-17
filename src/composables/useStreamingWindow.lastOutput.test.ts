/// <reference types="vitest/globals" />

import { useStreamingWindow } from "@/composables/useStreamingWindow";

/**
 * 「查看上次輸出」：聊天回覆結束時留一份完整的視窗內容（含調試資訊），
 * 之後就算視窗被關掉、或被總結／日記接手，也還能打開這個聊天上一則回覆的內容。
 */
describe("useStreamingWindow 聊天上次輸出", () => {
  beforeEach(() => {
    const win = useStreamingWindow();
    win.reset();
    win.clearLastChatOutputs();
  });

  function finishChatReply(chatId: string, owner: string, text: string) {
    const win = useStreamingWindow();
    win.show("model-x", true, owner, chatId);
    win.setPromptContent([{ role: "system", content: "提示詞", name: "主提示" }], owner);
    win.appendToken(text, owner);
    win.setUsage({ prompt_tokens: 120, completion_tokens: 30, total_tokens: 150 }, owner);
    win.setDiagnostics({ finishReason: "stop" } as never, owner);
    win.setComplete(owner);
    win.releaseOwnership(owner);
  }

  it("沒有回覆過的聊天是 none", () => {
    expect(useStreamingWindow().getLastOutputState("chatA")).toBe("none");
  });

  it("這個聊天正在用視窗生成時是 live，打開的是正在寫的視窗", () => {
    const win = useStreamingWindow();
    win.show("model-x", true, "chatA:t1", "chatA");
    win.appendToken("寫到一半", "chatA:t1");

    expect(win.getLastOutputState("chatA")).toBe("live");
    expect(win.openLastChatOutput("chatA")).toBe(true);
    expect(win.isVisible.value).toBe(true);
    expect(win.content.value).toBe("寫到一半");
  });

  it("回覆結束後留下快照；關掉視窗（reset）也還打得開，調試資訊都在", () => {
    const win = useStreamingWindow();
    finishChatReply("chatA", "chatA:t1", "上一則回覆");
    win.hide();
    win.reset();

    expect(win.getLastOutputState("chatA")).toBe("snapshot");
    expect(win.openLastChatOutput("chatA")).toBe(true);
    expect(win.isVisible.value).toBe(true);
    expect(win.content.value).toBe("上一則回覆");
    expect(win.promptTokens.value).toBe(120);
    expect(win.completionTokens.value).toBe(30);
    expect(win.promptContent.value).toHaveLength(1);
    expect(win.diagnostics.value).toEqual({ finishReason: "stop" });
    expect(win.metadata.value?.model).toBe("model-x");
    expect(win.isComplete.value).toBe(true);
    expect(win.isStreaming.value).toBe(false);
    // 快照沒有擁有者，任何生成都認領不到這份內容
    expect(win.activeOwnerId.value).toBeNull();
  });

  it("錯誤也會留下來", () => {
    const win = useStreamingWindow();
    win.show("model-x", true, "chatA:t1", "chatA");
    win.setError("上游回了空回應", "chatA:t1");
    win.releaseOwnership("chatA:t1");
    win.reset();

    win.openLastChatOutput("chatA");
    expect(win.hasError.value).toBe(true);
    expect(win.errorMessage.value).toBe("上游回了空回應");
  });

  it("總結接手視窗後，這個聊天打開的還是自己的回覆", () => {
    const win = useStreamingWindow();
    finishChatReply("chatA", "chatA:t1", "聊天回覆");

    // 自動總結不帶擁有權，直接接手視窗
    win.show("model-x");
    win.appendToken("總結內容");
    win.setComplete();

    expect(win.getLastOutputState("chatA")).toBe("snapshot");
    win.openLastChatOutput("chatA");
    expect(win.content.value).toBe("聊天回覆");
  });

  it("別的任務正在用視窗串流時是 busy，打不開也不會蓋掉對方的內容", () => {
    const win = useStreamingWindow();
    finishChatReply("chatA", "chatA:t1", "聊天回覆");
    win.show("model-x");
    win.appendToken("總結寫到一半");

    expect(win.getLastOutputState("chatA")).toBe("busy");
    expect(win.openLastChatOutput("chatA")).toBe(false);
    expect(win.content.value).toBe("總結寫到一半");
  });

  it("各聊天分開存，新的回覆蓋掉同一個聊天的舊快照", () => {
    const win = useStreamingWindow();
    finishChatReply("chatA", "chatA:t1", "A 第一則");
    finishChatReply("chatB", "chatB:t1", "B 第一則");
    finishChatReply("chatA", "chatA:t2", "A 第二則");

    win.openLastChatOutput("chatB");
    expect(win.content.value).toBe("B 第一則");
    win.openLastChatOutput("chatA");
    expect(win.content.value).toBe("A 第二則");
  });

  it("不帶 chatId 的生成不會存快照", () => {
    const win = useStreamingWindow();
    win.show("model-x", true, "owner-x");
    win.appendToken("沒有聊天", "owner-x");
    win.releaseOwnership("owner-x");
    win.reset();

    expect(win.getLastOutputState("owner-x")).toBe("none");
  });

  it("擁有權被接手的那一輪不會存（內容不屬於它）", () => {
    const win = useStreamingWindow();
    win.show("model-x", true, "chatA:t1", "chatA");
    win.show("model-x", true, "chatB:t1", "chatB");
    win.appendToken("B 的內容", "chatB:t1");

    win.releaseOwnership("chatA:t1");
    win.setComplete("chatB:t1");
    expect(win.getLastOutputState("chatA")).toBe("none");
  });
});
