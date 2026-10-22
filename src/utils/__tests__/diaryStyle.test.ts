import { describe, expect, it } from "vitest";
import {
  DEFAULT_DIARY_BOOK,
  buildDiaryBookPrompt,
  detectChineseScript,
  parseDiaryOutput,
  resolveInk,
  splitDiaryContent,
  stripDiaryMarkup,
  type DiaryBook,
} from "@/utils/diaryStyle";

const book = (patch: Partial<DiaryBook> = {}): DiaryBook => ({ ...DEFAULT_DIARY_BOOK, ...patch });

describe("parseDiaryOutput", () => {
  it("收下正常的頁首標籤", () => {
    const raw = `<diary-page weather="雨" mood="還行" stickers="coffee,cat" />
今天在咖啡店等了她四十分鐘。`;
    const { content, page, book: parsedBook } = parseDiaryOutput(raw);
    expect(page).toEqual({ weather: "雨", mood: "還行", stickers: ["coffee", "cat"] });
    expect(parsedBook).toBeUndefined();
    expect(content).toBe("今天在咖啡店等了她四十分鐘。");
  });

  it("貼紙只留合法代號、去重、最多 2 個", () => {
    const { page } = parseDiaryOutput(`<diary-page stickers="cat,dragon,cat,heart,moon" />`);
    expect(page?.stickers).toEqual(["cat", "heart"]);
  });

  it("沒有頁首標籤就沒有 page", () => {
    const { page } = parseDiaryOutput("<diary-page stickers=\"unicorn\" />");
    expect(page).toEqual({ stickers: [] });
  });

  it("日記本欄位不合法時用預設值", () => {
    const { book: parsedBook } = parseDiaryOutput(
      `<diary-book paper="glitter" hand="cursive" ink="neon" tape="rainbow" cover="別看" />`,
    );
    expect(parsedBook).toEqual({
      paper: "lined",
      hand: "neat",
      ink: "black",
      tape: "none",
      cover: "別看",
    });
  });

  it("白墨水配橫線紙改成黑墨水", () => {
    const { book: parsedBook } = parseDiaryOutput(`<diary-book paper="lined" ink="white" />`);
    expect(parsedBook?.ink).toBe("black");
  });

  it("黑卡紙配藍墨水改成白墨水", () => {
    const { book: parsedBook } = parseDiaryOutput(`<diary-book paper="black" ink="blue" />`);
    expect(parsedBook).toEqual({ paper: "black", hand: "neat", ink: "white", tape: "none", cover: "" });
  });

  it("黑卡紙可以配金墨水", () => {
    const { book: parsedBook } = parseDiaryOutput(`<diary-book paper="black" ink="gold" />`);
    expect(parsedBook?.ink).toBe("gold");
  });

  it("屬性用單引號也收", () => {
    const raw = `<diary-book paper='kraft' hand='scrawl' ink='green' tape='kraft' cover='別看' cover-note='看了也看不懂' cover-sticker='coffee' />
<diary-page weather='雨' stickers='cat' />`;
    const { book: parsedBook, page } = parseDiaryOutput(raw);
    expect(parsedBook).toEqual({
      paper: "kraft",
      hand: "scrawl",
      ink: "green",
      tape: "kraft",
      cover: "別看",
      coverNote: "看了也看不懂",
      coverSticker: "coffee",
    });
    expect(page?.weather).toBe("雨");
    expect(page?.stickers).toEqual(["cat"]);
  });

  it("沒有 cover-note 和不合法的封面貼紙就不放", () => {
    const { book: parsedBook } = parseDiaryOutput(
      `<diary-book paper="grid" hand="round" ink="pencil" tape="mint" cover="" cover-note="  " cover-sticker="dragon" />`,
    );
    expect(parsedBook?.coverNote).toBeUndefined();
    expect(parsedBook?.coverSticker).toBeUndefined();
    expect(parsedBook?.cover).toBe("");
  });

  it("沒有任何標籤時只回內文", () => {
    const { content, page, book: parsedBook } = parseDiaryOutput("  就是一段話  ");
    expect(content).toBe("就是一段話");
    expect(page).toBeUndefined();
    expect(parsedBook).toBeUndefined();
  });

  it("別人家的收尾標籤一起刪掉", () => {
    const raw = `<diary-page weather="晴">
今天很好

</diary-page>`;
    const { content, page } = parseDiaryOutput(raw);
    expect(page).toEqual({ weather: "晴", stickers: [] });
    expect(content).toBe("今天很好");
  });

  it("連續空行縮成一行空行", () => {
    const { content } = parseDiaryOutput("第一段\n\n\n\n第二段");
    expect(content).toBe("第一段\n\n第二段");
  });
});

describe("resolveInk", () => {
  it("回傳墨水色碼，白墨水配一般紙退回黑", () => {
    expect(resolveInk(book({ paper: "lined", ink: "white" }))).toBe("#1d2126");
    expect(resolveInk(book({ paper: "black", ink: "gold" }))).toBe("#d8b45a");
  });
});

describe("stripDiaryMarkup", () => {
  it("拿掉劃掉、螢光、頁邊記號", () => {
    const raw = "今天~~下次不等了~~很==在意==。<margin>貓挺可愛的</margin>";
    expect(stripDiaryMarkup(raw)).toBe("今天下次不等了很在意。（貓挺可愛的）");
  });

  it("殘留的 diary 標籤也拿掉", () => {
    expect(stripDiaryMarkup(`<diary-page weather="雨" />今天`)).toBe("今天");
  });
});

describe("splitDiaryContent", () => {
  it("劃掉、螢光切成不同段落", () => {
    const [para] = splitDiaryContent("今天 ~~不想說~~ 但還是說了==很在意==");
    expect(para.segments).toEqual([
      { kind: "text", text: "今天 " },
      { kind: "strike", text: "不想說" },
      { kind: "text", text: " 但還是說了" },
      { kind: "mark", text: "很在意" },
    ]);
    expect(para.margins).toEqual([]);
  });

  it("頁邊小字抽到 margins", () => {
    const [, para] = splitDiaryContent("正文\n<margin>貓挺可愛的</margin>");
    expect(para.segments).toEqual([]);
    expect(para.margins).toEqual(["貓挺可愛的"]);
  });

  it("沒閉合的記號當普通文字", () => {
    const [para] = splitDiaryContent("~~沒閉合的一段");
    expect(para.segments).toEqual([{ kind: "text", text: "~~沒閉合的一段" }]);
  });

  it("空行丟掉", () => {
    expect(splitDiaryContent("一\n\n二\n   \n")).toHaveLength(2);
  });
});

describe("detectChineseScript", () => {
  it("繁體段落回 hant", () => {
    expect(detectChineseScript("我們這說時來對會為過還沒樣麼書長東車門")).toBe("hant");
  });

  it("簡體段落回 hans", () => {
    expect(detectChineseScript("我们这说时来对会为过还没样么书长东车门")).toBe("hans");
  });
});

describe("buildDiaryBookPrompt", () => {
  it("有日記本時只提醒不要再寫標籤", () => {
    const prompt = buildDiaryBookPrompt(book({ paper: "kraft", hand: "scrawl", ink: "green" }));
    expect(prompt).toBe("你的日記本已經挑好了：牛皮紙、潦草字跡、墨綠墨水。不要再寫 <diary-book> 標籤。");
  });

  it("沒日記本時給第一次挑日記本的規則", () => {
    const prompt = buildDiaryBookPrompt(null);
    expect(prompt).toContain("這是第一篇日記");
    expect(prompt).toContain('<diary-book paper="紙張"');
    expect(prompt).toContain("{{char}}");
    expect(prompt).not.toContain("已經挑好了");
  });
});
