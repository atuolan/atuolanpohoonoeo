import { describe, expect, it } from "vitest";
import { finalizeLiveActivity, summarizeToolResult, upsertLiveActivity } from "./toolActivity";

describe("tool activity helpers", () => {
  it("summarizes results by status", () => {
    expect(summarizeToolResult({ toolCallId: "c1", name: "x", content: "已鎖定小紅書", ok: true })).toEqual({ status: "success", summary: "已鎖定小紅書" });
    expect(summarizeToolResult({ toolCallId: "c1", name: "x", content: "boom", ok: false, error: "連不上伺服器" })).toEqual({ status: "error", summary: "連不上伺服器" });
    expect(summarizeToolResult({ toolCallId: "c1", name: "x", content: "Tool call rejected by user", ok: false, error: "Tool call rejected by user", rejected: true })).toMatchObject({ status: "rejected" });
    expect(summarizeToolResult({ toolCallId: "c1", name: "x", content: "y".repeat(300), ok: true, images: [{ mimeType: "image/png", data: "A" }] })).toEqual({ status: "success", summary: "y".repeat(200), imageCount: 1 });
  });

  it("updates an entry in place or appends a new one", () => {
    const first = upsertLiveActivity([], { id: "c1", toolName: "lock_phone", label: "鎖手機 · lock_phone", status: "running", at: 1 });
    const second = upsertLiveActivity(first, { id: "c1", toolName: "lock_phone", label: "鎖手機 · lock_phone", status: "success", summary: "ok", at: 2 });
    expect(second).toEqual([{ id: "c1", toolName: "lock_phone", label: "鎖手機 · lock_phone", status: "success", summary: "ok", at: 2 }]);
    expect(first[0].status).toBe("running");
    expect(upsertLiveActivity(second, { id: "c2", toolName: "get_weather", label: "查天氣", status: "running", at: 3 })).toHaveLength(2);
  });

  it("marks unfinished tools as cancelled when the turn ends", () => {
    expect(finalizeLiveActivity([
      { id: "c1", toolName: "a", label: "a", status: "running", at: 1 },
      { id: "c2", toolName: "b", label: "b", status: "awaiting_confirmation", at: 1 },
      { id: "c3", toolName: "c", label: "c", status: "success", at: 1 },
    ]).map((entry) => entry.status)).toEqual(["cancelled", "cancelled", "success"]);
  });
});
