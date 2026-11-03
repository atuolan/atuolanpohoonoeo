import { describe, expect, it } from "vitest";
import { appButtonTarget } from "./appButtonTarget";

describe("appButtonTarget", () => {
  it("中文標籤對到 App id，紅點才查得到", () => {
    expect(appButtonTarget("訊息")).toBe("message");
    expect(appButtonTarget("空間")).toBe("space");
    expect(appButtonTarget("偷窺TA")).toBe("peek-phone");
  });

  it("沒對照的標籤原樣傳回", () => {
    expect(appButtonTarget("天氣")).toBe("天氣");
  });
});
