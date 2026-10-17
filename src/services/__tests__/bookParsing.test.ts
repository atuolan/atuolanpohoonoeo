import { describe, expect, it } from "vitest";
import {
  decodeEntities,
  decodeTextBytes,
  firstHeading,
  htmlToText,
  isChapterHeading,
  joinPdfTextItems,
  parseNavDoc,
  parseNcx,
  parseOpf,
  parseTxtChapters,
  reflowPdfLines,
  resolveEpubPath,
  splitLongChapters,
} from "@/services/bookParsing";

/** 用解碼器反查，造出某編碼的位元組（測試用，只處理雙位元組字） */
function encodeWith(label: string, text: string): Uint8Array {
  const decoder = new TextDecoder(label);
  const table = new Map<string, number[]>();
  for (let lead = 0x81; lead <= 0xfe; lead++) {
    for (let trail = 0x40; trail <= 0xfe; trail++) {
      const ch = decoder.decode(new Uint8Array([lead, trail]));
      if (ch.length === 1 && ch !== "�" && !table.has(ch)) table.set(ch, [lead, trail]);
    }
  }
  const bytes: number[] = [];
  for (const ch of text) {
    const code = ch.charCodeAt(0);
    if (code < 0x80) bytes.push(code);
    else {
      const pair = table.get(ch);
      if (!pair) throw new Error(`${label} 沒有「${ch}」`);
      bytes.push(...pair);
    }
  }
  return new Uint8Array(bytes);
}

describe("decodeTextBytes", () => {
  it("UTF-8 與 BOM", () => {
    const utf8 = new TextEncoder().encode("北冥有魚");
    expect(decodeTextBytes(utf8)).toBe("北冥有魚");
    expect(decodeTextBytes(new Uint8Array([0xef, 0xbb, 0xbf, ...utf8]))).toBe("北冥有魚");
  });

  it("Big5 的繁體 TXT", () => {
    const text = "第一章 開始\n他們說這個人的名字是不會在書上出現的。我們來看看。";
    expect(decodeTextBytes(encodeWith("big5", text))).toBe(text);
  });

  it("GBK 的簡體 TXT", () => {
    const text = "第一章 开始\n他们说这个人的名字是不会在书上出现的。我们来看看。";
    expect(decodeTextBytes(encodeWith("gb18030", text))).toBe(text);
  });
});

describe("TXT 分章", () => {
  it("認得常見章節標題，不把對白當標題", () => {
    expect(isChapterHeading("第一章 北冥有魚")).toBe(true);
    expect(isChapterHeading("第12回：大鬧天宮")).toBe(true);
    expect(isChapterHeading("Chapter 3")).toBe(true);
    expect(isChapterHeading("楔子")).toBe(true);
    expect(isChapterHeading("第三回合開始了，他大聲喊著要大家快點出手！")).toBe(false);
    expect(isChapterHeading("他說了第一章的內容")).toBe(false);
  });

  it("依標題切章，處理 CRLF", () => {
    const chapters = parseTxtChapters("序\r\n第一章 甲\r\n內容一\r\n第二章 乙\r\n內容二");
    expect(chapters.map((c) => c.title)).toEqual(["正文", "第一章 甲", "第二章 乙"]);
    expect(chapters[2].content).toBe("內容二");
  });

  it("超長章節按段落切開", () => {
    const para = "字".repeat(1000);
    const content = Array.from({ length: 70 }, () => para).join("\n");
    const out = splitLongChapters([{ id: "a", title: "全文", content, order: 0 }]);
    expect(out.length).toBeGreaterThan(1);
    expect(out[0].title).toBe(`全文（1/${out.length}）`);
    expect(out.every((c) => c.content.length <= 30000)).toBe(true);
    expect(out.map((c) => c.content).join("").replace(/\n/g, "").length).toBe(70000);
    expect(out.map((c) => c.order)).toEqual(out.map((_, i) => i));
  });
});

describe("HTML 轉文字", () => {
  it("去掉 head、style，保留段落", () => {
    const html = `<html><head><title>書名</title><style>p{color:red}</style></head>
      <body><h1>第一章</h1><p>北冥&nbsp;有魚</p><p>其名&#x70BA;鯤&#12290;</p><ruby>鯤<rt>kūn</rt></ruby></body></html>`;
    expect(htmlToText(html)).toBe("第一章\n北冥 有魚\n其名為鯤。\n鯤");
    expect(firstHeading(html)).toBe("第一章");
  });

  it("數字與具名實體", () => {
    expect(decodeEntities("&ldquo;A&rdquo; &amp; &#39;b&#39; &unknown;")).toBe("“A” & 'b' &unknown;");
  });
});

describe("EPUB 結構", () => {
  const opf = `<?xml version="1.0"?>
  <package><metadata>
    <dc:title id="t">莊子 &amp; 我</dc:title><dc:creator opf:role="aut">莊周</dc:creator>
    <meta content="img1" name="cover"/>
  </metadata>
  <manifest>
    <item href="Text/ch%201.xhtml" id="c1" media-type="application/xhtml+xml"/>
    <item media-type="application/xhtml+xml" id="c2" href='Text/ch2.xhtml'/>
    <item id="img1" href="Images/cover.jpg" media-type="image/jpeg"/>
    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
  </manifest>
  <spine toc="ncx"><itemref idref="c1"/><itemref idref="c2" linear="yes"/></spine></package>`;

  it("屬性順序不同也讀得到（Calibre 的 href 在 id 前面）", () => {
    const info = parseOpf(opf);
    expect(info.title).toBe("莊子 & 我");
    expect(info.author).toBe("莊周");
    expect(info.spine).toEqual(["c1", "c2"]);
    expect(info.manifest.c1.href).toBe("Text/ch%201.xhtml");
    expect(info.manifest.c2.href).toBe("Text/ch2.xhtml");
    expect(info.coverHref).toBe("Images/cover.jpg");
    expect(info.ncxId).toBe("ncx");
  });

  it("EPUB3 封面與 nav", () => {
    const info = parseOpf(`<manifest>
      <item id="cv" href="cover.png" media-type="image/png" properties="cover-image"/>
      <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    </manifest><spine/>`);
    expect(info.coverHref).toBe("cover.png");
    expect(info.navHref).toBe("nav.xhtml");
  });

  it("路徑解析", () => {
    expect(resolveEpubPath("OEBPS/", "Text/ch%201.xhtml#p3")).toBe("OEBPS/Text/ch 1.xhtml");
    expect(resolveEpubPath("OEBPS/Text/", "../Images/a.jpg")).toBe("OEBPS/Images/a.jpg");
    expect(resolveEpubPath("", "./ch.xhtml")).toBe("ch.xhtml");
  });

  it("NCX 與 nav 目錄", () => {
    const ncx = `<navMap><navPoint id="n1"><navLabel><text>第一章 鯤鵬</text></navLabel><content src="Text/ch1.xhtml"/>
      <navPoint id="n1a"><navLabel><text>小節</text></navLabel><content src="Text/ch1.xhtml#s2"/></navPoint></navPoint></navMap>`;
    expect(parseNcx(ncx)).toEqual([
      { href: "Text/ch1.xhtml", label: "第一章 鯤鵬" },
      { href: "Text/ch1.xhtml#s2", label: "小節" },
    ]);
    const nav = `<nav epub:type="landmarks"><a href="cover.xhtml">封面</a></nav>
      <nav epub:type="toc"><ol><li><a href="ch1.xhtml">第一章<span> 鯤鵬</span></a></li></ol></nav>`;
    expect(parseNavDoc(nav)).toEqual([{ href: "ch1.xhtml", label: "第一章 鯤鵬" }]);
  });
});

describe("PDF 文字", () => {
  it("中文片段不加空格、英文補空格", () => {
    expect(
      joinPdfTextItems([
        { str: "北冥" },
        { str: "有魚", hasEOL: true },
        { str: "Hello" },
        { str: "world", hasEOL: true },
      ]),
    ).toEqual(["北冥有魚", "Hello world"]);
  });

  it("把硬換行接回段落", () => {
    const full = "字".repeat(30);
    const lines = [full, full, "字".repeat(10) + "。", full, "結尾。"];
    expect(reflowPdfLines(lines)).toEqual([
      full + full + "字".repeat(10) + "。",
      full + "結尾。",
    ]);
  });
});
