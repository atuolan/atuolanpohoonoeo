import { describe, expect, it } from "vitest";
import {
  buildEventScanText,
  eventTriggerKeywords,
  isPinnedGiftName,
  selectImportantEventsForPrompt,
} from "./importantEventSelection";

const ev = (id: string, content: string, extra: Record<string, unknown> = {}) => ({
  id,
  content,
  priority: 2,
  timestamp: 0,
  ...extra,
});

describe("selectImportantEventsForPrompt", () => {
  const events = [
    ev("ring", "小明 送了「戒指」給 阿光", { priority: 1, timestamp: 1 }),
    ev("cat", "阿光 說他小時候養過一隻叫「麻糬」的貓", { timestamp: 2 }),
    ev("movie", "答應週末一起去看「沙丘」", { timestamp: 3, vectorKeywords: ["電影", "沙丘"] }),
  ];

  it("沒聊到的只送常駐", () => {
    const picked = selectImportantEventsForPrompt(events, { scanText: "今天好累喔" });
    expect(picked.map((e) => e.id)).toEqual(["ring"]);
  });

  it("聊到關鍵詞才送", () => {
    const picked = selectImportantEventsForPrompt(events, { scanText: "麻糬最近還好嗎" });
    expect(picked.map((e) => e.id)).toEqual(["ring", "cat"]);
  });

  it("使用者編的關鍵詞也算", () => {
    const picked = selectImportantEventsForPrompt(events, { scanText: "晚上要不要看電影" });
    expect(picked.map((e) => e.id)).toContain("movie");
  });

  it("向量記憶找到的也送", () => {
    const picked = selectImportantEventsForPrompt(events, { scanText: "嗯", vectorHitIds: ["cat"] });
    expect(picked.map((e) => e.id)).toEqual(["ring", "cat"]);
  });

  it("全部送的模式照舊依優先級取前幾條", () => {
    const picked = selectImportantEventsForPrompt(events, { mode: "all", limit: 2 });
    expect(picked.map((e) => e.id)).toEqual(["ring", "movie"]);
  });

  it("聊到才送的有上限，中越多關鍵詞的優先", () => {
    const many = [
      ev("a", "一起吃「拉麵」", { timestamp: 5 }),
      ev("b", "一起吃「拉麵」還去看「煙火」", { timestamp: 1 }),
    ];
    const picked = selectImportantEventsForPrompt(many, { scanText: "拉麵和煙火", maxTriggered: 1 });
    expect(picked.map((e) => e.id)).toEqual(["b"]);
  });

  it("名字不當關鍵詞", () => {
    const named = [ev("n", "和「阿光」吵架", { vectorKeywords: ["阿光"] })];
    expect(selectImportantEventsForPrompt(named, { scanText: "阿光你好", excludeNames: ["阿光"] })).toEqual([]);
  });

  it("沒有對話文字時只送常駐", () => {
    expect(selectImportantEventsForPrompt(events).map((e) => e.id)).toEqual(["ring"]);
  });
});

describe("eventTriggerKeywords", () => {
  it("抓出引號裡的名稱", () => {
    expect(eventTriggerKeywords({ content: "送了「手工餅乾」給他" })).toContain("手工餅乾");
  });
});

describe("buildEventScanText", () => {
  it("只看最後幾則", () => {
    const msgs = [{ content: "一" }, { content: "二" }, { content: "三" }];
    expect(buildEventScanText(msgs, 2)).toBe("二\n三");
  });
});

describe("isPinnedGiftName", () => {
  it("戒指類的禮物常駐", () => {
    expect(isPinnedGiftName("鑽石戒指")).toBe(true);
    expect(isPinnedGiftName("巧克力")).toBe(false);
  });
});
