import { describe, expect, it } from "vitest";
import { countTurnAiMessages } from "./unreadCount";

describe("countTurnAiMessages", () => {
  it("只算這一輪的角色訊息", () => {
    const messages = [
      { role: "ai", turnId: "t1" },
      { role: "user" },
      { role: "ai", turnId: "t2" },
      { role: "ai", turnId: "t2" },
      { role: "system" },
      { role: "ai", turnId: "t2" },
    ];
    expect(countTurnAiMessages(messages, "t2")).toBe(3);
  });

  it("沒有輪次標記時，從最後往前數到使用者訊息", () => {
    const messages = [{ role: "ai" }, { role: "user" }, { role: "ai" }, { role: "system" }, { role: "ai" }];
    expect(countTurnAiMessages(messages)).toBe(2);
  });

  it("輪次標記找不到訊息時也退回往前數", () => {
    expect(countTurnAiMessages([{ role: "user" }, { role: "ai" }], "missing")).toBe(1);
  });

  it("最後是使用者的訊息就是 0", () => {
    expect(countTurnAiMessages([{ role: "ai" }, { role: "user" }])).toBe(0);
  });
});
