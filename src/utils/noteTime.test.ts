import { describe, expect, it } from "vitest";
import { formatNoteTime } from "./noteTime";

// 用本機時間建時間戳，測試不受時區影響
const at = (month: number, day: number, hour: number, minute: number) =>
  new Date(2026, month - 1, day, hour, minute).getTime();

describe("formatNoteTime", () => {
  const now = at(10, 18, 14, 30);

  it("今天", () => {
    expect(formatNoteTime(at(10, 18, 2, 5), now)).toBe("今天 02:05");
  });

  it("昨天", () => {
    expect(formatNoteTime(at(10, 17, 22, 5), now)).toBe("昨天 22:05");
  });

  it("更早寫日期", () => {
    expect(formatNoteTime(at(10, 15, 9, 30), now)).toBe("10/15 09:30");
  });

  it("剛過午夜時，前一晚算昨天", () => {
    expect(formatNoteTime(at(10, 17, 23, 59), at(10, 18, 0, 1))).toBe("昨天 23:59");
  });
});
