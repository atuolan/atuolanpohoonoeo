/// <reference types="vitest/globals" />

import { useStreamingWindow } from "@/composables/useStreamingWindow";

/**
 * 串流視窗的狀態是模組級單例，但 aiGeneration store 允許最多 3 個聊天並發生成。
 * 這組測試釘住擁有權隔離：兩輪生成交錯寫入時，各自只能讀回自己的內容，
 * 不會拿到對方的 token（先前的 bug 會讓兩個聊天出現一模一樣的回覆）。
 */
describe("useStreamingWindow 並發擁有權隔離", () => {
  beforeEach(() => {
    useStreamingWindow().reset();
  });

  it("交錯 append 時，後開始的生成獨佔緩衝區，先開始的讀不到內容", () => {
    const win = useStreamingWindow();
    const ownerP2 = "chatP2:turn1";
    const ownerP1 = "chatP1:turn1";

    // P2 先送出並累積了一部分內容
    win.show("model-x", true, ownerP2);
    win.appendToken("P2 的回覆：", ownerP2);
    expect(win.getOwnedContent(ownerP2)).toBe("P2 的回覆：");

    // P2 還在跑（渲染氣泡的 _delay 期間），使用者切到 P1 送出新訊息
    win.show("model-x", true, ownerP1);

    // P2 遲到的 token 必須被丟棄，不能污染 P1 的緩衝區
    win.appendToken("我也去點外賣了", ownerP2);
    win.appendToken("P1 的回覆：去吧去吧", ownerP1);

    expect(win.getOwnedContent(ownerP1)).toBe("P1 的回覆：去吧去吧");
    // P2 已失去擁有權，讀回空字串 → 呼叫端會退回用自己 API 的實際回傳值
    expect(win.getOwnedContent(ownerP2)).toBe("");
    expect(win.isOwnedBy(ownerP2)).toBe(false);
  });

  it("show() 會清空前一輪殘留內容", () => {
    const win = useStreamingWindow();
    win.show("model-x", true, "owner-a");
    win.appendToken("上一輪的殘留文字", "owner-a");

    win.show("model-x", true, "owner-b");
    expect(win.content.value).toBe("");
    expect(win.getOwnedContent("owner-b")).toBe("");
  });

  it("releaseOwnership 後，內容不再被任何 ownerId 認領", () => {
    const win = useStreamingWindow();
    win.show("model-x", true, "owner-a");
    win.appendToken("完成的內容", "owner-a");

    win.releaseOwnership("owner-a");

    // 內容仍在（視窗可能還開著給用戶看），但已無人可認領
    expect(win.content.value).toBe("完成的內容");
    expect(win.getOwnedContent("owner-a")).toBe("");
    expect(win.isOwnedBy("owner-a")).toBe(false);
  });

  it("releaseOwnership 不能替其他生成釋放擁有權", () => {
    const win = useStreamingWindow();
    win.show("model-x", true, "owner-b");
    win.appendToken("B 正在跑", "owner-b");

    // A 早已失去擁有權，它的 finally 不該動到 B 的狀態
    win.releaseOwnership("owner-a");

    expect(win.isOwnedBy("owner-b")).toBe(true);
    expect(win.getOwnedContent("owner-b")).toBe("B 正在跑");
  });

  it("非擁有者無法標記完成 / 寫入錯誤 / 覆寫診斷", () => {
    const win = useStreamingWindow();
    win.show("model-x", true, "owner-b");

    win.setComplete("owner-a");
    win.setError("A 的錯誤", "owner-a");
    win.setUsage(
      { prompt_tokens: 1, completion_tokens: 2, total_tokens: 3 },
      "owner-a",
    );

    expect(win.isComplete.value).toBe(false);
    expect(win.hasError.value).toBe(false);
    expect(win.errorMessage.value).toBeNull();
    expect(win.promptTokens.value).toBe(0);

    // 擁有者本人仍然可以正常寫入
    win.setComplete("owner-b");
    expect(win.isComplete.value).toBe(true);
  });

  it("不傳 ownerId 的舊呼叫端維持原行為（寫入不受限）", () => {
    const win = useStreamingWindow();
    // 小劇場 / 偷看手機 / 通話 / 主動發訊等路徑不帶 ownerId
    win.show("model-x", true);
    win.appendToken("主動發訊的內容");

    expect(win.content.value).toBe("主動發訊的內容");
    expect(win.getOwnedContent()).toBe("主動發訊的內容");
    // 但 ChatScreen 帶 ownerId 的讀取端會失配，不會誤收這段內容
    expect(win.getOwnedContent("chat-owner")).toBe("");
  });

  it("主動發訊接手視窗後，正在生成的聊天讀不到它的內容", () => {
    const win = useStreamingWindow();
    const chatOwner = "chatP1:turn1";

    win.show("model-x", true, chatOwner);
    win.appendToken("P1 正在生成", chatOwner);

    // ProactiveMessageService 在後台對同一個單例 show()（不帶 ownerId）
    win.show("model-x", true);
    win.appendToken("char1 主動發來的訊息");

    // P1 的安全網不能把主動發訊的內容當成自己的回覆
    expect(win.getOwnedContent(chatOwner)).toBe("");
  });

  it("activeOwnerChatId 指向擁有視窗的聊天，供全局停止精準中止", () => {
    const win = useStreamingWindow();

    // chatId 本身含 ":"，確認不是靠字串反解取得
    win.show("model-x", true, "chat:with:colons:turn1", "chat:with:colons");
    expect(win.activeOwnerChatId.value).toBe("chat:with:colons");

    // 另一個聊天接手後，停止只會影響新的擁有者
    win.show("model-x", true, "chatP1:turn1", "chatP1");
    expect(win.activeOwnerChatId.value).toBe("chatP1");

    // 不帶擁有權的舊路徑（小劇場等）→ null，全局停止不動 store 裡的聊天任務
    win.show("model-x", true);
    expect(win.activeOwnerChatId.value).toBeNull();
  });

  it("releaseOwnership 一併清掉 ownerChatId", () => {
    const win = useStreamingWindow();
    win.show("model-x", true, "chatP1:turn1", "chatP1");

    win.releaseOwnership("chatP1:turn1");
    expect(win.activeOwnerChatId.value).toBeNull();
  });
});
