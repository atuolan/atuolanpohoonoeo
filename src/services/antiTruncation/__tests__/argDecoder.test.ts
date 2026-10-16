import { describe, expect, it } from "vitest";
import { StreamArgDecoder } from "../argDecoder";

function decode(parts: string[]): string {
  const decoder = new StreamArgDecoder();
  return parts.map((part) => decoder.feed(part)).join("") + decoder.finish();
}

describe("StreamArgDecoder", () => {
  it("decodes a whole argument string at once", () => {
    const text = '第一行\n第二行 "引號" \\ 反斜線';
    expect(decode([JSON.stringify({ content: text })])).toBe(text);
  });

  it("decodes when fed one UTF-16 unit at a time", () => {
    const text = "他說：「好啊」\t😀\\結束";
    expect(decode(JSON.stringify({ content: text }).split(""))).toBe(text);
  });

  it("handles \\u escapes and surrogate pairs split across fragments", () => {
    expect(decode(['{"content":"A\\ud83d', "\\ude00B\\u4e2", 'd"}'])).toBe("A😀B中");
  });

  it("finds content even when it is not the first key", () => {
    expect(decode(['{"note":"x","content":"正文"}'])).toBe("正文");
  });

  it("keeps unescaped quotes that are not the end of the string", () => {
    expect(decode(['{"content":"他說"好"了"}'])).toBe('他說"好"了');
  });

  it("salvages text from a truncated argument string", () => {
    expect(decode(['{"content":"寫到一半'])).toBe("寫到一半");
  });

  it("decides a quote at a fragment boundary by what follows", () => {
    expect(decode(['{"content":"a"', " }"])).toBe("a");
    expect(decode(['{"content":"a"', 'b"}'])).toBe('a"b');
    expect(decode(['{"content":"a"', "  ", "}"])).toBe("a");
    expect(decode(['{"content":"a"', "  ", 'b"}'])).toBe('a"  b');
  });

  it("reports completion", () => {
    const decoder = new StreamArgDecoder();
    decoder.feed('{"content":"x"}');
    expect(decoder.isComplete).toBe(true);
  });
});
