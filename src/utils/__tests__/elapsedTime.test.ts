import { describe, expect, it } from "vitest";
import { formatCharStatusForPrompt, formatGap } from "../elapsedTime";

const MIN = 60 * 1000;

describe("formatGap", () => {
  it("一分鐘內", () => {
    expect(formatGap(30 * 1000)).toBe("不到 1 分鐘");
    expect(formatGap(-5 * MIN)).toBe("不到 1 分鐘");
  });

  it("一小時內只寫分鐘", () => {
    expect(formatGap(45 * MIN)).toBe("45 分鐘");
  });

  it("一小時以上帶分鐘，整點不帶", () => {
    expect(formatGap(110 * MIN)).toBe("1 小時 50 分鐘");
    expect(formatGap(120 * MIN)).toBe("2 小時");
  });

  it("一天以上帶小時", () => {
    expect(formatGap(26 * 60 * MIN)).toBe("1 天 2 小時");
    expect(formatGap(48 * 60 * MIN)).toBe("2 天");
  });
});

describe("formatCharStatusForPrompt", () => {
  it("沒有狀態", () => {
    expect(formatCharStatusForPrompt(undefined, undefined)).toBe("還沒設定");
    expect(formatCharStatusForPrompt("", 0)).toBe("還沒設定");
  });

  it("沒有時間就只給文字", () => {
    expect(formatCharStatusForPrompt("在洗澡", undefined)).toBe("在洗澡");
  });

  it("帶上設定了多久", () => {
    const now = 1_000_000_000_000;
    expect(formatCharStatusForPrompt("在洗澡", now - 70 * MIN, now)).toBe(
      "在洗澡（1 小時 10 分鐘前設定）",
    );
  });
});
