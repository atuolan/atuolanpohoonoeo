import { describe, expect, it } from "vitest";
import { parseGroupChatResponse } from "./ResponseParser";

describe("parseGroupChatResponse <dice>", () => {
  it("解析骰子標籤，不影響前後訊息", () => {
    const parsed = parseGroupChatResponse(
      `<content>
<msg name="基拉奇">我來聽聽看</msg>
<dice name="基拉奇" reason="聆聽" target="50"/>
<dice name="雪拉比" expr="1d6+1" reason="傷害"/>
<msg name="雪拉比">換我</msg>
</content>`,
    );
    expect(parsed.messages.map((m) => m.senderName)).toEqual(["基拉奇", "基拉奇", "雪拉比", "雪拉比"]);
    expect(parsed.messages[1]).toMatchObject({ isDiceRoll: true, diceReason: "聆聽", diceTarget: "50" });
    expect(parsed.messages[2]).toMatchObject({ isDiceRoll: true, diceExpr: "1d6+1", diceReason: "傷害" });
    expect(parsed.messages[3].content).toBe("換我");
  });
});
