import { describe, expect, it } from "vitest";
import { needsParsing, parseAIResponse, parseGreeting } from "../ResponseParser";

describe("ResponseParser - transfer tag compatibility", () => {
  it("treats holiday <transfer amount=\"...\">...</transfer> as a transfer message", () => {
    const response = `<content>
<msg>收到一個挺有個性的紅包。</msg>
<msg>「別人有的東西，你也別想有」——這年頭連節日祝福都這麼誠實了嗎？</msg>
<msg>嘴角微微勾起</msg>
<msg>不過話說回來，今天這日子，我是不是該配合一下氛圍？</msg>
<transfer amount="520">給妳的。不是因為節日，純粹是因為我樂意。</transfer>
</content>`;

    const result = parseAIResponse(response);
    const transfer = result.messages.find((message) => message.isTransfer);

    expect(needsParsing(response)).toBe(true);
    expect(transfer).toBeDefined();
    expect(transfer?.transferType).toBe("pay");
    expect(transfer?.transferAmount).toBe(520);
    expect(transfer?.transferNote).toBe("給妳的。不是因為節日，純粹是因為我樂意。");
    expect(transfer?.content).toBe("");
  });

  it("splits inline <transfer> tags in greeting content", () => {
    const messages = parseGreeting(
      `前文 <transfer amount="88.88">一路發的小紅包</transfer> 後文`,
    );

    expect(messages).toHaveLength(3);
    expect(messages[1].isTransfer).toBe(true);
    expect(messages[1].transferAmount).toBe(88.88);
    expect(messages[1].transferNote).toBe("一路發的小紅包");
  });
});
