import { describe, expect, it } from "vitest";
import { needsParsing, parseAIResponse, stripStateThinking } from "./ResponseParser";

describe("<|state|> 隱藏思考", () => {
  it("移除 <|state|> 區塊並保留正文", () => {
    const raw = "<content><|state|>\n推演中\n</|state|>\n她抬起頭。</content>";
    const parsed = parseAIResponse(raw);
    expect(parsed.thinking).toBe("推演中");
    expect(parsed.messages.map((m) => m.content).join("")).toContain("她抬起頭。");
    expect(parsed.rawOutput).not.toContain("state");
    expect(parsed.rawOutput).not.toContain("推演中");
  });

  it("思考區塊之後的 ˇ想法ˇ 解析為角色想法", () => {
    const raw = "<content><|state|>\n推演\n</|state|>\n她抬起頭。\nˇ(其實很高興)ˇ</content>";
    const parsed = parseAIResponse(raw);
    const joined = parsed.messages.map((m) => m.content).join("");
    expect(joined).toContain("她抬起頭。");
    expect(joined).not.toContain("ˇ");
    expect(parsed.messages.some((m) => m.thought?.includes("其實很高興"))).toBe(true);
  });

  it("串流中尚未閉合時隱藏開頭標籤之後的內容", () => {
    expect(stripStateThinking("<content><|state|>\n推演", true)).toBe("<content>");
    expect(stripStateThinking("<content><|state|>\n推演")).toContain("推演");
  });

  it("<|state|> 標籤會觸發解析，正文裡的 state 單字不會", () => {
    expect(needsParsing("<|state|>\n推演\n</|state|>\n她抬起頭。")).toBe(true);
    expect(needsParsing("the state of things")).toBe(false);
  });

  it("不再處理舊的 <|Rabbit_Thinking|> 標籤", () => {
    const raw = "<|Rabbit_Thinking|>\n推演\n</|Rabbit_Thinking|>\n她抬起頭。";
    expect(stripStateThinking(raw)).toBe(raw);
  });
});
