import { describe, expect, it } from "vitest";
import {
  needsParsing,
  parseAIResponse,
  parseGroupChatResponse,
  stripBeforeThinkClose,
  stripStateThinking,
  stripThinkBlocks,
} from "@/services/ResponseParser";
import {
  BUILTIN_CLEANUP_ITEMS,
  CLEANUP_CONTROL_BLOCKS,
  CLEANUP_INNER_VOICE,
  CLEANUP_LEAK_LINES,
  CLEANUP_STATUS_NOTES,
  withReplyShield,
} from "./builtinCleanup";

const group = (raw: string, disabledRegexIds?: string[]) =>
  parseGroupChatResponse(raw, { disabledRegexIds }).messages.map((m) => m.content);

describe("提到標籤不等於標籤", () => {
  it("反引號裡的 </thinking> 不會刪掉前面的訊息", () => {
    expect(
      group('<content><msg name="A">第一則</msg><msg name="B">提到 `</thinking>` 標籤，後半段</msg></content>'),
    ).toEqual(["第一則", "提到 `</thinking>` 標籤，後半段"]);
  });

  it("沒有反引號的 </thinking> 在內文裡也不會刪掉前面", () => {
    expect(
      group('<content><msg name="A">第一則</msg><msg name="B">提到 </thinking> 標籤</msg></content>'),
    ).toEqual(["第一則", "提到 </thinking> 標籤"]);
  });

  it("反引號裡的 <msg>、</msg>、<content> 都留著", () => {
    expect(
      group('<content><msg name="A">外層 `<msg>` 開始、`</msg>` 結束，放在 `<content>` 和 `</content>`，後半段</msg></content>'),
    ).toEqual(["外層 `<msg>` 開始、`</msg>` 結束，放在 `<content>` 和 `</content>`，後半段"]);
  });

  it("單人回覆提到 </thinking>、<content> 也保留", () => {
    const parsed = parseAIResponse("<content>放在 `<content>` 和 `</thinking>` 裡面，後半段</content>");
    expect(parsed.messages.map((m) => m.content).join("")).toBe(
      "放在 `<content>` 和 `</thinking>` 裡面，後半段",
    );
  });

  it("結果裡不留下處理用的字元", () => {
    const parsed = parseGroupChatResponse('<content><msg name="A">`<msg>` 和 `[time: x]`</msg></content>');
    expect(JSON.stringify(parsed)).not.toMatch(/[-]/);
  });

  it("落單的反引號不會把兩則訊息黏在一起", () => {
    expect(
      group('<content><msg name="A">一個 ` 符號</msg><msg name="B">又一個 ` 符號</msg></content>'),
    ).toEqual(["一個 ` 符號", "又一個 ` 符號"]);
  });

  it("程式碼區塊裡的內容不受影響", () => {
    expect(group('<content><msg name="A">```html\n<b>x</b>\n```</msg></content>')[0]).toContain("<b>x</b>");
  });
});

describe("真的思考照樣藏起來", () => {
  it("群聊：<thinking> 區塊", () => {
    expect(group('<thinking>想想</thinking><content><msg name="A">回覆</msg></content>')).toEqual(["回覆"]);
  });

  it("群聊：只有結尾標籤的思考", () => {
    expect(group('想想</thinking><content><msg name="A">回覆</msg></content>')).toEqual(["回覆"]);
  });

  it("群聊：思考裡寫了 <msg> 範例", () => {
    expect(
      group('<thinking>寫 <msg name="A">草稿</msg></thinking><content><msg name="A">回覆</msg></content>'),
    ).toEqual(["回覆"]);
  });

  it("<|state|> 串流到一半也藏", () => {
    expect(stripStateThinking("她抬頭<|state|>\n推演", true)).toBe("她抬頭");
    expect(stripStateThinking("<|state|>推演</|state|>她抬頭", true)).toBe("她抬頭");
  });

  it("開頭沒收尾的 <thinking> 串流中也藏", () => {
    expect(stripThinkBlocks("<thinking>想到一半")).toBe("");
    expect(stripThinkBlocks("<content><thinking>想到一半")).toBe("<content>");
  });

  it("結尾標籤在內文前才算思考", () => {
    expect(stripBeforeThinkClose("想想</thinking>回覆")).toBe("回覆");
    expect(stripBeforeThinkClose('<msg name="A">提到 </thinking> 標籤</msg>')).toContain("提到");
  });
});

describe("含 state 的尖括號不再誤判", () => {
  it.each([
    "如果 x < 3 且 state > 2，這句後面的內容",
    '<div data-state="open">卡片</div>後面的內容',
    "狀態欄 <state> 後面的內容",
    "<statement> 後面的內容",
  ])("%s", (text) => {
    expect(stripStateThinking(text, true)).toBe(text);
  });

  it("needsParsing 也一樣", () => {
    expect(needsParsing("如果 x < 3 且 state > 2")).toBe(false);
    expect(needsParsing("<|state|>推演</|state|>")).toBe(true);
  });
});

describe("內文中間提到的 <thinking> 不會吃到結尾", () => {
  it("非開頭的未閉合標籤", () => {
    expect(stripThinkBlocks("給了 <thinking> 空間，後半段")).toBe("給了 <thinking> 空間，後半段");
  });
});

describe("內建清理開關", () => {
  it("開關清單的 id 不重複", () => {
    const ids = BUILTIN_CLEANUP_ITEMS.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("預設照舊清理", () => {
    const parsed = parseAIResponse("<content>[time: 12:00]她抬頭。ˇ其實很高興ˇ</content>");
    expect(parsed.messages[0].content).toBe("她抬頭。");
    expect(parsed.messages[0].thought).toBe("其實很高興");
  });

  it("關掉時間與狀態標記", () => {
    const parsed = parseAIResponse("<content>[time: 12:00]她抬頭。[轉帳狀態：已收]</content>", {
      disabledRegexIds: [CLEANUP_STATUS_NOTES],
    });
    expect(parsed.messages[0].content).toBe("[time: 12:00]她抬頭。[轉帳狀態：已收]");
  });

  it("關掉心聲：留在訊息裡", () => {
    const parsed = parseAIResponse("<content>她抬頭。ˇ其實很高興ˇ</content>", {
      disabledRegexIds: [CLEANUP_INNER_VOICE],
    });
    expect(parsed.messages[0].content).toBe("她抬頭。ˇ其實很高興ˇ");
    expect(parsed.messages[0].thought).toBeFalsy();
  });

  it("關掉思考外漏行", () => {
    const off = parseAIResponse("Scene 1.2 — 開場\n她抬頭。", { disabledRegexIds: [CLEANUP_LEAK_LINES] });
    expect(off.messages.map((m) => m.content).join("")).toContain("Scene 1.2 — 開場");
    expect(parseAIResponse("Scene 1.2 — 開場\n她抬頭。").messages.map((m) => m.content).join("")).not.toContain("Scene");
  });

  it("關掉控制區塊：氣泡顯示成文字", () => {
    const clean = (t: string) => t.replace(/<update>[\s\S]*?<\/update>/gi, "");
    expect(withReplyShield("a<update>x</update>b", [], clean)).toBe("ab");
    expect(
      withReplyShield("a<update>x</update>b", [CLEANUP_CONTROL_BLOCKS], clean, { escapeKept: true }),
    ).toBe("a&lt;update>x&lt;/update>b");
  });
});
