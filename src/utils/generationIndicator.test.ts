/// <reference types="vitest/globals" />

import { resolveGenerationIndicator, type IndicatorTask } from "@/utils/generationIndicator";

const base = {
  activeTasks: [] as IndicatorTask[],
  coveredChatId: null,
  callTaskId: null,
  overlayOpen: false,
  streamingInProgress: false,
};

describe("resolveGenerationIndicator", () => {
  it("沒有任務也沒在串流就不顯示", () => {
    expect(resolveGenerationIndicator(base).visible).toBe(false);
  });

  it("在這個聊天裡，它自己的回覆不顯示浮動按鈕（含視窗串流）", () => {
    const view = resolveGenerationIndicator({
      ...base,
      activeTasks: [{ chatId: "chatA", taskType: "chat" }],
      coveredChatId: "chatA",
      streamingInProgress: true,
    });
    expect(view.visible).toBe(false);
  });

  it("離開聊天後，回覆中的任務要顯示", () => {
    const view = resolveGenerationIndicator({
      ...base,
      activeTasks: [{ chatId: "chatA", taskType: "chat" }],
    });
    expect(view.visible).toBe(true);
    expect(view.tasks).toHaveLength(1);
  });

  it("在聊天裡，這個聊天的總結、日記和別的聊天的回覆照樣顯示", () => {
    const view = resolveGenerationIndicator({
      ...base,
      activeTasks: [
        { chatId: "chatA", taskType: "chat" },
        { chatId: "chatA", taskType: "summary" },
        { chatId: "chatB", taskType: "chat" },
      ],
      coveredChatId: "chatA",
    });
    expect(view.tasks.map((t) => `${t.chatId}/${t.taskType}`)).toEqual(["chatA/summary", "chatB/chat"]);
  });

  it("通話中的回覆由通話畫面顯示", () => {
    const view = resolveGenerationIndicator({
      ...base,
      activeTasks: [{ chatId: "phone_char1", taskType: "chat" }],
      callTaskId: "phone_char1",
      streamingInProgress: true,
    });
    expect(view.visible).toBe(false);
  });

  it("偷看手機這類不登記任務的串流也要顯示", () => {
    const view = resolveGenerationIndicator({ ...base, streamingInProgress: true });
    expect(view.visible).toBe(true);
    expect(view.tasks).toEqual([]);
  });

  it("通話畫面或串流視窗開著時一律不顯示", () => {
    const view = resolveGenerationIndicator({
      ...base,
      activeTasks: [{ chatId: "chatB", taskType: "diary" }],
      overlayOpen: true,
    });
    expect(view.visible).toBe(false);
  });

  it("串流畫面上已經看得到（閱讀器裡的伴讀）就不浮出來；離開閱讀器才提示", () => {
    expect(resolveGenerationIndicator({ ...base, streamingInProgress: true, streamingCovered: true }).visible).toBe(false);
    expect(resolveGenerationIndicator({ ...base, streamingInProgress: true, streamingCovered: false }).visible).toBe(true);
  });
});
