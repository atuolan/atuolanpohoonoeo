import { describe, expect, it } from "vitest";
import { parseAIResponse, parseGroupChatResponse } from "@/services/ResponseParser";
import { hasTTSTags, parseTTSSegments } from "@/utils/ttsTagCleaner";

// 照線上／群聊語音規則裡的示例寫，解析後要念得出來，而且不念心聲
const LINE = "算了(sighs)……<#0.8#>你早點睡吧[emotion=sad;speed=0.9] ˇ其實還想再聊一下ˇ";

function expectSpeakable(content: string) {
  expect(content).not.toContain("其實還想再聊一下");
  expect(hasTTSTags(content)).toBe(true);
  const segments = parseTTSSegments(content);
  expect(segments).toHaveLength(1);
  expect(segments[0]).toMatchObject({ emotion: "sad", speed: 0.9, text: "算了(sighs)……<#0.8#>你早點睡吧" });
}

describe("線上與群聊語音規則的寫法解析得出語音", () => {
  it("線上訊息", () => {
    const [msg] = parseAIResponse(`<content>\n<msg>${LINE}</msg>\n</content>`).messages;
    expectSpeakable(msg.content);
  });

  it("面對面引號格式也讀得到情緒和語速", () => {
    expect(parseTTSSegments("她笑了。「好啊[emotion=happy]」他說：「嗯[emotion=calm;speed=0.8]」")).toMatchObject([
      { emotion: "happy", speed: 1, text: "好啊" },
      { emotion: "calm", speed: 0.8, text: "嗯" },
    ]);
  });

  it("群聊訊息", () => {
    const [msg] = parseGroupChatResponse(`<content>\n<msg name="阿明">${LINE}</msg>\n</content>`).messages;
    expect(msg.senderName).toBe("阿明");
    expectSpeakable(msg.content);
  });
});
