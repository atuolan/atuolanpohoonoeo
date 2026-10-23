import { describe, expect, it } from "vitest";
import { parseAIResponse, parseStoryStamp } from "./ResponseParser";

const at = (y: number, mo: number, d: number, h: number, mi = 0) =>
  new Date(y, mo - 1, d, h, mi).getTime();
const NOW = at(2026, 10, 23, 13, 35);

describe("parseStoryStamp", () => {
  it("完整日期時間", () => {
    expect(parseStoryStamp("<!--t:2026-10-23 15:35-->兩個小時後", NOW)).toBe(at(2026, 10, 23, 15, 35));
    expect(parseStoryStamp("<!--t:2026-10-23T15:35-->", NOW)).toBe(at(2026, 10, 23, 15, 35));
    expect(parseStoryStamp("<!--t:2026/10/24 8:05-->", NOW)).toBe(at(2026, 10, 24, 8, 5));
  });

  it("只寫 HH:mm：同一天，等於目前也可以", () => {
    expect(parseStoryStamp("<!--t:15:35-->", NOW)).toBe(at(2026, 10, 23, 15, 35));
    expect(parseStoryStamp("<!--t:13:35-->", NOW)).toBe(NOW);
  });

  it("只寫 HH:mm 且早不到 6 小時：當作寫錯", () => {
    expect(parseStoryStamp("<!--t:13:30-->", NOW)).toBeNull();
    expect(parseStoryStamp("<!--t:08:00-->", NOW)).toBeNull();
  });

  it("只寫 HH:mm 且早 6 小時以上：當作隔天", () => {
    const late = at(2026, 10, 23, 23, 0);
    expect(parseStoryStamp("<!--t:08:00-->", late)).toBe(at(2026, 10, 24, 8, 0));
  });

  it("有日期但比目前早、或晚一年以上：不採用", () => {
    expect(parseStoryStamp("<!--t:2026-10-23 13:00-->", NOW)).toBeNull();
    expect(parseStoryStamp("<!--t:2028-10-23 13:00-->", NOW)).toBeNull();
  });

  it("空的、格式錯、不存在的日期：當作沒寫", () => {
    expect(parseStoryStamp("<!--t:-->兩個小時後", NOW)).toBeNull();
    expect(parseStoryStamp("<!--t:下午三點-->", NOW)).toBeNull();
    expect(parseStoryStamp("<!--t:2026-02-30 10:00-->", NOW)).toBeNull();
    expect(parseStoryStamp("沒有時間戳記", NOW)).toBeNull();
  });

  it("跳過空的和格式錯的，取第一個格式正確的", () => {
    expect(
      parseStoryStamp("<!--t:--><!--t:abc--><!--t:15:00--><!--t:16:00-->", NOW),
    ).toBe(at(2026, 10, 23, 15, 0));
  });

  it("思考區塊裡的不算", () => {
    expect(
      parseStoryStamp("<thinking>寫 <!--t:20:00--></thinking><!--t:14:00-->正文", NOW),
    ).toBe(at(2026, 10, 23, 14, 0));
    expect(parseStoryStamp("預填的思考 <!--t:20:00--></thinking>正文", NOW)).toBeNull();
  });
});

describe("parseAIResponse 拿掉時間戳記", () => {
  it("正文裡的 <!--t:...--> 不會留在訊息裡", () => {
    const parsed = parseAIResponse(
      "<content><!--t:2026-10-23 15:35-->兩個小時後——\n他醒了。</content>",
    );
    const text = parsed.messages.map((m) => m.content).join("\n");
    expect(text).not.toContain("<!--");
    expect(text).toContain("兩個小時後");
  });

  it("空的 <!--t:--> 也拿掉", () => {
    const parsed = parseAIResponse("<content><!--t:-->你好</content>");
    const text = parsed.messages.map((m) => m.content).join("\n");
    expect(text).not.toContain("<!--");
    expect(text).toContain("你好");
  });
});
