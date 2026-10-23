import { beforeAll, describe, expect, it } from "vitest";
import { needsParsing, parseAIResponse } from "./ResponseParser";
import { registerPlurkShareCandidates } from "@/utils/plurkShare";
import type { PlurkShareSnapshot } from "@/types/chat";

function snapshot(overrides: Partial<PlurkShareSnapshot> = {}): PlurkShareSnapshot {
  return {
    ref: "k9x2m",
    postId: "post-k9x2m",
    sharedBy: "user",
    authorKind: "char",
    authorName: "小明",
    audience: "friends",
    text: "今天",
    imageCount: 0,
    postedAt: 1700000000000,
    responseCount: 0,
    recentResponses: [],
    ...overrides,
  };
}

beforeAll(() => {
  registerPlurkShareCandidates([snapshot()]);
});

describe("噗浪留言標籤", () => {
  it("解析 <plurk-comment> 且不留在氣泡裡", () => {
    const parsed = parseAIResponse(
      '<content><msg>好啊</msg><plurk-comment ref="ab12c" qualifier="覺得">笑死</plurk-comment></content>',
    );
    expect(parsed.plurkComment).toEqual({
      ref: "ab12c",
      qualifier: "覺得",
      content: "笑死",
    });
    for (const msg of parsed.messages) {
      expect(msg.content).not.toContain("plurk-comment");
    }
    expect(parsed.hasPlurkPost).not.toBe(true);
  });

  it("沒寫 ref 時 ref 是 undefined", () => {
    const parsed = parseAIResponse(
      "<content><msg>好啊</msg><plurk-comment>笑死</plurk-comment></content>",
    );
    expect(parsed.plurkComment?.ref).toBeUndefined();
    expect(parsed.plurkComment?.content).toBe("笑死");
  });

  it("需要解析", () => {
    expect(needsParsing('<plurk-comment>x</plurk-comment>')).toBe(true);
  });
});

describe("傳噗卡片標籤", () => {
  it("查得到候選噗時做成卡片訊息", () => {
    const parsed = parseAIResponse(
      '<content><msg>你看這個</msg><msg><share-plurk ref="k9x2m"/></msg></content>',
    );
    const card = parsed.messages.find((m) => m.plurkShare);
    expect(card?.plurkShare?.ref).toBe("k9x2m");
    expect(card?.plurkShare?.sharedBy).toBe("char");
    expect(card?.content.startsWith("[分享噗文]")).toBe(true);
    expect(parsed.messages.some((m) => m.content === "你看這個")).toBe(true);
  });

  it("ref 大寫或帶 # 也查得到", () => {
    const parsed = parseAIResponse(
      '<content><msg><share-plurk ref="#K9X2M"/></msg></content>',
    );
    expect(parsed.messages.some((m) => m.plurkShare?.ref === "k9x2m")).toBe(true);
  });

  it("沒登記的 ref 不產生訊息也不留下標籤", () => {
    const parsed = parseAIResponse(
      '<content><msg><share-plurk ref="nope1"/></msg></content>',
    );
    expect(parsed.messages.some((m) => m.plurkShare)).toBe(false);
    for (const msg of parsed.messages) {
      expect(msg.content).not.toContain("share-plurk");
    }
  });

  it("同一則 msg 裡的文字與卡片會拆開", () => {
    const parsed = parseAIResponse(
      '<content><msg>哈哈<share-plurk ref="k9x2m"/></msg></content>',
    );
    expect(parsed.messages.some((m) => m.content === "哈哈")).toBe(true);
    expect(parsed.messages.some((m) => m.plurkShare?.ref === "k9x2m")).toBe(true);
  });

  it("需要解析", () => {
    expect(needsParsing('<share-plurk ref="a"/>')).toBe(true);
  });
});

describe("角色照抄的分享註記", () => {
  it("[分享噗文：…] 不會留在訊息裡", () => {
    const parsed = parseAIResponse(
      '<content><msg>好笑[分享噗文：小明「今天」]</msg></content>',
    );
    expect(parsed.messages.map((m) => m.content)).toEqual(["好笑"]);
  });
});
