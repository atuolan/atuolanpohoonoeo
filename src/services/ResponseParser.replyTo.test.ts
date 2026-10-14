import { describe, expect, it } from "vitest";
import { parseAIResponse, parseGroupChatResponse } from "./ResponseParser";

function groupMessages(content: string) {
  return parseGroupChatResponse(`<think>想一下</think><content>${content}</content>`).messages;
}

describe("群聊引用回覆", () => {
  it("<reply-to> 片段放進 replyToContent，內容只留回覆", () => {
    const [msg] = groupMessages(
      '<msg name="測試小精靈"><reply-to>現在是上午九點</reply-to>等等，這畫風也太猛了吧</msg>',
    );
    expect(msg.isReplyTo).toBe(true);
    expect(msg.replyToContent).toBe("現在是上午九點");
    expect(msg.replyToName).toBeUndefined();
    expect(msg.content).toBe("等等，這畫風也太猛了吧");
  });

  it("<reply-to name> 的名字留給比對用", () => {
    const [msg] = groupMessages(
      '<msg name="測試小精靈"><reply-to name="上帝啊！你的眼，是智慧結晶">現在是上午九點</reply-to>太猛了吧</msg>',
    );
    expect(msg.replyToContent).toBe("現在是上午九點");
    expect(msg.replyToName).toBe("上帝啊！你的眼，是智慧結晶");
    expect(msg.content).toBe("太猛了吧");
  });

  it("模型模仿歷史紀錄寫成 [回覆 名字：「片段」] 也當成引用", () => {
    const [msg] = groupMessages(
      '<msg name="測試小精靈">[回覆 基拉祈和雪拉比：「早安呀使用者」]\n早安早安</msg>',
    );
    expect(msg.isReplyTo).toBe(true);
    expect(msg.replyToContent).toBe("早安呀使用者");
    expect(msg.replyToName).toBe("基拉祈和雪拉比");
    expect(msg.content).toBe("早安早安");
  });

  it("沒有名字的 [回覆：「片段」] 也認得", () => {
    const [msg] = groupMessages('<msg name="測試小精靈">[回覆：「早安呀」]早安早安</msg>');
    expect(msg.replyToContent).toBe("早安呀");
    expect(msg.replyToName).toBeUndefined();
    expect(msg.content).toBe("早安早安");
  });

  it("內容中間出現的「回覆」字樣不會被誤認", () => {
    const [msg] = groupMessages('<msg name="測試小精靈">我等等再[回覆 你：「好」]</msg>');
    expect(msg.isReplyTo).toBeFalsy();
    expect(msg.content).toContain("[回覆 你：「好」]");
  });
});

describe("私聊引用回覆", () => {
  it("<reply-to> 片段放進 replyToContent", () => {
    const parsed = parseAIResponse("<content><msg><reply-to>你今天</reply-to>今天很好呀</msg></content>");
    const msg = parsed.messages.find((m) => m.isReplyTo);
    expect(msg?.replyToContent).toBe("你今天");
    expect(msg?.content).toBe("今天很好呀");
  });
});
