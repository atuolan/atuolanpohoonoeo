import { describe, expect, it } from "vitest";
import { createRestoreStats, describeAntiTruncation, summarizeRestoreStats } from "../stats";

describe("stats", () => {
  it("summarizes restore stats into a diagnostics result", () => {
    expect(summarizeRestoreStats(undefined)).toBe("missed");
    expect(summarizeRestoreStats(createRestoreStats())).toBe("missed");
    expect(summarizeRestoreStats({ ...createRestoreStats(), syntheticSeen: true, decodedChars: 3 })).toBe("tool");
    expect(summarizeRestoreStats({ ...createRestoreStats(), syntheticSeen: true, plainWon: true })).toBe("plain-won");
    expect(summarizeRestoreStats({ ...createRestoreStats(), syntheticSeen: true })).toBe("missed");
  });

  it("describes diagnostics for the streaming window", () => {
    expect(describeAntiTruncation({ result: "tool" })).toEqual({ value: "工具通道", warning: false });
    expect(describeAntiTruncation({ result: "plain-won" })).toEqual({ value: "一般正文較長", warning: false });
    expect(describeAntiTruncation({ result: "missed" })).toEqual({ value: "模型沒用工具", warning: true });
    expect(describeAntiTruncation({ result: "missed", fellBack: true })).toEqual({ value: "渠道不支援，已改一般方式", warning: true });
  });
});
