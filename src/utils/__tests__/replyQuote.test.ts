import { describe, expect, it } from "vitest";
import { parseGroupChatResponse } from "@/services/ResponseParser";
import { findQuotedMessage, normalizeQuoteText, type QuoteCandidate } from "@/utils/replyQuote";

type Msg = QuoteCandidate & { senderCharacterName?: string };

let seq = 0;
function msg(content: string, extra: Partial<Msg> = {}): Msg {
  seq += 1;
  return { id: `m${seq}`, role: "ai", content, ...extra };
}

const GOD_EYE =
  "現在是上午九點四十五分，地球的每一個角落都已攤開在你的視野之中。無論是早晨通勤電車上的隱秘觸碰，還是拉上窗簾的旅館房間……";

const senderNameOf = (m: Msg) => (m.role === "user" ? "使用者" : m.senderCharacterName);

describe("normalizeQuoteText", () => {
  it("去掉空白、標點、標籤，全形英數轉半形", () => {
    expect(normalizeQuoteText("  收到收到！２２２，<b>訊號</b>滿格～ ")).toBe("收到收到222訊號滿格");
  });

  it("表情包留下含義", () => {
    expect(normalizeQuoteText("[sticker:吃吃瓜]")).toBe("吃吃瓜");
  });
});

describe("findQuotedMessage", () => {
  it("只抄開頭幾個字也能找到原訊息", () => {
    const target = msg(GOD_EYE, { senderCharacterName: "上帝啊！你的眼，是智慧結晶" });
    const history = [msg("收到收到！222！", { senderCharacterName: "測試小精靈" }), target];
    expect(findQuotedMessage("現在是上午九點四十五分", history)).toBe(target);
  });

  it("整句照抄、只差標點或少幾個字也對得上", () => {
    const target = msg(GOD_EYE);
    const history = [target, msg("等等，這位新來的朋友畫風也太猛了吧？！")];
    expect(findQuotedMessage(GOD_EYE.replace(/，/g, ",").replace("……", "..."), history)).toBe(target);
    expect(
      findQuotedMessage("現在是上午九點四十五分，地球每一個角落都攤開在你的視野之中", history),
    ).toBe(target);
  });

  it("多則都有這段字時，選最新的一則", () => {
    const older = msg("早安呀！今天天氣很好");
    const newer = msg("早安呀！要出門了嗎");
    expect(findQuotedMessage("早安呀", [older, newer])).toBe(newer);
  });

  it("有標註名字時，先找那個人說的", () => {
    const fromA = msg("早安呀大家", { senderCharacterName: "阿明" });
    const fromB = msg("早安呀各位", { senderCharacterName: "小花" });
    expect(findQuotedMessage("早安呀", [fromA, fromB], { senderName: "阿明", senderNameOf })).toBe(fromA);
  });

  it("標註的名字對不上任何人時，照樣在全部訊息裡找", () => {
    const target = msg("早安呀大家", { senderCharacterName: "阿明" });
    expect(findQuotedMessage("早安呀", [target], { senderName: "不存在", senderNameOf })).toBe(target);
  });

  it("可以引用使用者的訊息", () => {
    const userMsg = msg("111", { role: "user" });
    expect(findQuotedMessage("111", [userMsg, msg("收到收到！222！")])).toBe(userMsg);
  });

  it("模型把歷史紀錄的 [名字]、[時間] 前綴抄進來也沒關係", () => {
    const target = msg(GOD_EYE);
    expect(findQuotedMessage("[上帝啊！你的眼，是智慧結晶] 現在是上午九點", [target])).toBe(target);
    expect(findQuotedMessage("[10/14 09:45] 現在是上午九點", [target])).toBe(target);
  });

  it("引用表情包和語音", () => {
    const sticker = msg("[sticker:吃吃瓜]");
    const voice = msg("[語音訊息] 我在路上了等我一下");
    expect(findQuotedMessage("[sticker:吃吃瓜]", [sticker, voice])).toBe(sticker);
    expect(findQuotedMessage("我在路上了", [sticker, voice])).toBe(voice);
  });

  it("不會對到系統訊息、群管理、撤回或還在生成的訊息", () => {
    const history = [
      msg("早安呀 系統", { role: "system" }),
      msg("早安呀 管理", { isGroupAction: true }),
      msg("早安呀 撤回", { isCharRecall: true }),
      msg("早安呀 生成中", { isStreaming: true }),
    ];
    expect(findQuotedMessage("早安呀", history)).toBeNull();
  });

  it("對不上就回傳 null，短片段不亂猜", () => {
    const history = [msg("今天要去哪裡玩"), msg(GOD_EYE)];
    expect(findQuotedMessage("完全沒說過的話", history)).toBeNull();
    expect(findQuotedMessage("", history)).toBeNull();
    expect(findQuotedMessage("……", history)).toBeNull();
  });

  it("一兩個字的片段只認開頭", () => {
    const history = [msg("好啊一起去"), msg("我覺得不好")];
    expect(findQuotedMessage("好", history)?.content).toBe("好啊一起去");
  });
});

describe("同一輪回覆裡引用前面的訊息", () => {
  // 群聊一輪輸出，像 ChatScreen 一樣逐則加入，再找每則引用的原訊息
  function replay(raw: string) {
    const added: Msg[] = [msg("111", { role: "user" })];
    const links: Array<{ from: string; to: string | undefined }> = [];
    for (const parsed of parseGroupChatResponse(raw).messages) {
      const current = msg(parsed.content, { senderCharacterName: parsed.senderName });
      if (parsed.replyToContent) {
        const target = findQuotedMessage(parsed.replyToContent, added, {
          senderName: parsed.replyToName,
          senderNameOf,
        });
        links.push({ from: parsed.senderName || "", to: target?.content });
      }
      added.push(current);
    }
    return links;
  }

  it("舊寫法整句照抄", () => {
    const links = replay(`<think>…</think><content>
<msg name="上帝啊！你的眼，是智慧結晶">${GOD_EYE}</msg>
<msg name="測試小精靈"><reply-to>${GOD_EYE}</reply-to>等等，這位新來的朋友畫風也太猛了吧？！</msg>
</content>`);
    expect(links).toEqual([{ from: "測試小精靈", to: GOD_EYE }]);
  });

  it("新寫法只抄開頭幾個字", () => {
    const links = replay(`<think>…</think><content>
<msg name="基拉祈和雪拉比">早安呀使用者！連接成功～</msg>
<msg name="上帝啊！你的眼，是智慧結晶">${GOD_EYE}</msg>
<msg name="測試小精靈"><reply-to>現在是上午九點</reply-to>等等，這畫風也太猛了吧？！</msg>
<msg name="基拉祈和雪拉比"><reply-to>111</reply-to>收到你的測試訊號了</msg>
</content>`);
    expect(links).toEqual([
      { from: "測試小精靈", to: GOD_EYE },
      { from: "基拉祈和雪拉比", to: "111" },
    ]);
  });
});
