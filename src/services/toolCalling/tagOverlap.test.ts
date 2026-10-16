import { describe, expect, it } from "vitest";
import { getToolHandledActions } from "./tagOverlap";
import type { ToolResult } from "./types";

const result = (name: string, extra: Partial<ToolResult> = {}): ToolResult => ({
  toolCallId: `${name}-1`,
  name,
  content: "",
  ok: true,
  ...extra,
});

describe("getToolHandledActions", () => {
  it("沒有用工具時，標籤都照常執行", () => {
    expect(getToolHandledActions(undefined)).toEqual({ scheduleCall: false, calendarEvent: false });
    expect(getToolHandledActions([])).toEqual({ scheduleCall: false, calendarEvent: false });
  });

  it("工具做成了就略過同類標籤", () => {
    expect(getToolHandledActions([result("schedule_call")])).toEqual({ scheduleCall: true, calendarEvent: false });
    expect(getToolHandledActions([result("create_calendar_event")])).toEqual({ scheduleCall: false, calendarEvent: true });
  });

  it("使用者拒絕也算處理過，標籤不能繞過", () => {
    const rejected = result("schedule_call", { ok: false, rejected: true, error: "Tool call rejected by user" });
    expect(getToolHandledActions([rejected]).scheduleCall).toBe(true);
  });

  it("工具失敗、沒做成時，標籤照常執行", () => {
    const failed = result("create_calendar_event", { ok: false, error: "行事曆服務未提供建立功能" });
    expect(getToolHandledActions([failed]).calendarEvent).toBe(false);
  });

  it("其他工具不影響", () => {
    expect(getToolHandledActions([result("get_weather"), result("list_calendar_events")])).toEqual({
      scheduleCall: false,
      calendarEvent: false,
    });
  });

  it("同一輪先失敗、重試成功，仍算做成", () => {
    const results = [result("schedule_call", { ok: false, error: "Invalid tool arguments" }), result("schedule_call")];
    expect(getToolHandledActions(results).scheduleCall).toBe(true);
  });
});
