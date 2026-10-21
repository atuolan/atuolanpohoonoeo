import { describe, expect, it } from "vitest";
import { escapeHtml, plurkPlainText, renderPlurkContent } from "./plurkContent";

const date = new Date(2026, 9, 21);

describe("escapeHtml", () => {
  it("跳脫五個字元", () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe("&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;");
  });
});

describe("renderPlurkContent", () => {
  it("一般文字跳脫、換行變 <br>", () => {
    expect(renderPlurkContent("a<b>\nc", { date })).toBe("a&lt;b&gt;<br>c");
  });
  it("擋掉 script 與 onerror", () => {
    const html = renderPlurkContent(`<img src=x onerror="alert(1)"><script>alert(2)</script>`, { date });
    expect(html).not.toContain("<img");
    expect(html).not.toContain("<script");
    expect(html).toContain("&lt;script&gt;");
  });
  it("<br> 標記保留為換行", () => {
    expect(renderPlurkContent("Good morning!<br>早安！", { date })).toBe("Good morning!<br>早安！");
    expect(renderPlurkContent("a<br/>b", { date })).toBe("a<br>b");
  });
  it("@提及包起來，名字也跳脫", () => {
    expect(renderPlurkContent("嗨 @沈既白 你好", { date })).toBe(
      '嗨 <span class="plurk-mention">@沈既白</span> 你好',
    );
    expect(renderPlurkContent("@<i>", { date })).toBe('<span class="plurk-mention">@&lt;i&gt;</span>');
  });
  it("配圖變拍立得，只取｜前的描述並跳脫", () => {
    const html = renderPlurkContent("看<image>夕陽<b>｜sunset</image>", { date });
    expect(html).toContain('<div class="plurk-polaroid">');
    expect(html).toContain("夕陽&lt;b&gt;");
    expect(html).not.toContain("sunset");
    expect(html).toContain("2026.10.21");
  });
  it("舊格式也變拍立得", () => {
    for (const raw of ["[IMAGE]海[/IMAGE]", '<pic prompt="sea">海</pic>', "<圖片描述>海</圖片描述>"]) {
      expect(renderPlurkContent(raw, { date })).toContain('<div class="plurk-polaroid">');
    }
  });
  it("丟掉 <reactions>", () => {
    expect(renderPlurkContent("嗨<reactions>❤️:3</reactions>", { date })).toBe("嗨");
  });
  it("貼圖：帶網址的直接用、經代理", () => {
    const html = renderPlurkContent("[sticker:開心|https://a.com/x.png]", { date });
    expect(html).toBe(
      '<img src="https://images.weserv.nl/?url=https%3A%2F%2Fa.com%2Fx.png" alt="開心" class="plurk-sticker" loading="lazy">',
    );
  });
  it("貼圖：沒網址時查表", () => {
    const html = renderPlurkContent("[sticker:開心]", { date, resolveSticker: () => "https://b.com/y.gif" });
    expect(html).toContain("https%3A%2F%2Fb.com%2Fy.gif");
  });
  it("貼圖：javascript: 網址不輸出圖片，原文跳脫顯示", () => {
    const html = renderPlurkContent("[sticker:x|javascript:alert(1)]", { date });
    expect(html).not.toContain("<img");
    expect(html).toBe("[sticker:x|javascript:alert(1)]");
  });
  it("空字串", () => expect(renderPlurkContent("", { date })).toBe(""));
});

describe("plurkPlainText", () => {
  it("去標記並截斷", () => {
    expect(plurkPlainText("今天<image>海</image>[sticker:a]真好<br>耶", 100)).toBe("今天[圖][貼圖]真好 耶");
    expect(plurkPlainText("一二三四五六", 3)).toBe("一二三…");
  });
});
