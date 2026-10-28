import { describe, expect, it } from "vitest";
import { parseGiftDiaryOutput } from "../giftDiaryFormat";

describe("parseGiftDiaryOutput", () => {
  it("讀出日記與摘要，去掉思考", () => {
    const raw = "<think>想一下</think>\n<diary>今天一個人看月光石。</diary>\n<summary>他一個人看月光石</summary>";
    expect(parseGiftDiaryOutput(raw, "diary")).toEqual({ diary: "今天一個人看月光石。", summary: "他一個人看月光石" });
  });

  it("沒寫標籤時整段當內容", () => {
    expect(parseGiftDiaryOutput("那天明明是你先睡著的", "margin")).toEqual({ margin: "那天明明是你先睡著的" });
  });

  it("空的回 {}", () => {
    expect(parseGiftDiaryOutput("  ", "diary")).toEqual({});
  });
});
