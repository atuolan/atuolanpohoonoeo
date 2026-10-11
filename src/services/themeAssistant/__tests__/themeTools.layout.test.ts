import { describe, expect, it, vi } from "vitest";
import { executeToolCall, type ToolContext } from "../themeTools";

// 只用到 canvas 的 widgets 與兩個 setter，其餘 store 不參與
function makeCtx(widgets: { id: string; type: string; data?: Record<string, unknown> }[]) {
  const canvas = {
    widgets,
    updateWidgetData: vi.fn(),
    updateWidgetCustomStyle: vi.fn(),
  };
  return { ctx: { canvas, theme: {} } as unknown as ToolContext, canvas };
}

describe("設定組件佈局", () => {
  it("音樂播放器的版型寫進 customStyle.layout", () => {
    const { ctx, canvas } = makeCtx([{ id: "m1", type: "music" }]);
    const r = executeToolCall("設定組件佈局", { widgetId: "m1", layout: "ticket" }, ctx);
    expect(r.ok).toBe(true);
    expect(canvas.updateWidgetCustomStyle).toHaveBeenCalledWith("m1", { layout: "ticket" });
  });

  it("最近聊天的版型寫進 data.layout", () => {
    const { ctx, canvas } = makeCtx([{ id: "c1", type: "recent-chat" }]);
    const r = executeToolCall("設定組件佈局", { widgetId: "c1", layout: "msn" }, ctx);
    expect(r.ok).toBe(true);
    expect(canvas.updateWidgetData).toHaveBeenCalledWith("c1", { layout: "msn" });
    expect(canvas.updateWidgetCustomStyle).not.toHaveBeenCalled();
  });

  it("組件不支援的版型會失敗並列出可用選項", () => {
    const { ctx, canvas } = makeCtx([{ id: "t1", type: "todo" }]);
    const r = executeToolCall("設定組件佈局", { widgetId: "t1", layout: "ticket" }, ctx);
    expect(r.ok).toBe(false);
    expect(r.error).toContain("可用");
    expect(canvas.updateWidgetCustomStyle).not.toHaveBeenCalled();
  });

  it("拍立得可以用自己專屬的版型", () => {
    const { ctx, canvas } = makeCtx([{ id: "p1", type: "polaroid" }]);
    const r = executeToolCall("設定組件佈局", { widgetId: "p1", layout: "gilded" }, ctx);
    expect(r.ok).toBe(true);
    expect(canvas.updateWidgetCustomStyle).toHaveBeenCalledWith("p1", { layout: "gilded" });
  });

  it("App 圖標選 default 會清掉主題版型", () => {
    const { ctx, canvas } = makeCtx([{ id: "a1", type: "fluid-button" }]);
    const r = executeToolCall("設定組件佈局", { widgetId: "a1", layout: "default" }, ctx);
    expect(r.ok).toBe(true);
    expect(canvas.updateWidgetCustomStyle).toHaveBeenCalledWith("a1", { layout: undefined });
  });

  it("時鐘導向「設定時鐘樣式」", () => {
    const { ctx } = makeCtx([{ id: "k1", type: "clock" }]);
    const r = executeToolCall("設定組件佈局", { widgetId: "k1", layout: "sketch" }, ctx);
    expect(r.ok).toBe(false);
    expect(r.error).toContain("設定時鐘樣式");
  });
});

describe("設定時鐘樣式", () => {
  it("接受新的主題時鐘樣式", () => {
    const { ctx, canvas } = makeCtx([{ id: "k1", type: "clock" }]);
    const r = executeToolCall("設定時鐘樣式", { widgetId: "k1", clockStyle: "mp3" }, ctx);
    expect(r.ok).toBe(true);
    expect(canvas.updateWidgetData).toHaveBeenCalledWith("k1", { clockStyle: "mp3" });
  });
});
