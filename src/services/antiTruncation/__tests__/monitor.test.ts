import { describe, expect, it, vi } from "vitest";
import {
  AntiTruncationMonitor,
  MISSED_WARNING,
  PLAIN_WON_WARNING,
  fallbackWarning,
  settleAntiTruncation,
} from "../monitor";
import { createRestoreStats } from "../stats";

describe("AntiTruncationMonitor", () => {
  it("warns exactly on the third miss in a row", () => {
    const monitor = new AntiTruncationMonitor();
    expect(monitor.record("missed")).toBeNull();
    expect(monitor.record("missed")).toBeNull();
    expect(monitor.record("missed")).toBe(MISSED_WARNING);
    expect(monitor.record("missed")).toBeNull();
  });

  it("resets the miss streak when the tool channel is used", () => {
    const monitor = new AntiTruncationMonitor();
    monitor.record("missed");
    monitor.record("missed");
    monitor.record("tool");
    monitor.record("missed");
    expect(monitor.record("missed")).toBeNull();
  });

  it("warns on the third plain win and resets on a tool win", () => {
    const monitor = new AntiTruncationMonitor();
    monitor.record("plain-won");
    monitor.record("plain-won");
    expect(monitor.record("plain-won")).toBe(PLAIN_WON_WARNING);
    monitor.record("tool");
    monitor.record("plain-won");
    expect(monitor.record("plain-won")).toBeNull();
  });

  it("settles a request and forwards warnings", () => {
    const monitor = new AntiTruncationMonitor();
    const onWarning = vi.fn();
    const used = { ...createRestoreStats(), syntheticSeen: true, decodedChars: 2 };
    expect(settleAntiTruncation(used, { onWarning }, monitor)).toEqual({ result: "tool" });
    for (let i = 0; i < 3; i += 1) expect(settleAntiTruncation(undefined, { onWarning }, monitor)).toEqual({ result: "missed" });
    expect(onWarning).toHaveBeenCalledOnce();
    expect(onWarning).toHaveBeenCalledWith(MISSED_WARNING);
  });

  it("formats the fallback warning", () => {
    expect(fallbackWarning(400)).toBe("防截斷請求被渠道拒絕（HTTP 400），這次改用一般方式重送");
  });
});
