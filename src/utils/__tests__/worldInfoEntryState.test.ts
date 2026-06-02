import { describe, expect, it } from "vitest";

import { isWorldInfoEntryEnabled } from "@/utils/worldInfoEntryState";

describe("isWorldInfoEntryEnabled", () => {
  it("keeps a normal enabled world info entry available", () => {
    expect(
      isWorldInfoEntryEnabled({
        disable: false,
        content: "A 條目內容",
      }),
    ).toBe(true);
  });

  it("filters entries disabled by the internal disable flag", () => {
    expect(
      isWorldInfoEntryEnabled({
        disable: true,
        content: "C【狀態欄】條目內容",
      }),
    ).toBe(false);
  });

  it("filters imported entries disabled by enabled=false", () => {
    expect(
      isWorldInfoEntryEnabled({
        disable: false,
        enabled: false,
        content: "C【狀態欄】條目內容",
      }),
    ).toBe(false);
  });

  it("filters empty entries so generation prompts do not receive blank world info blocks", () => {
    expect(
      isWorldInfoEntryEnabled({
        disable: false,
        content: "   ",
      }),
    ).toBe(false);
  });
});
