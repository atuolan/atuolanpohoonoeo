import { describe, expect, it } from "vitest";
import { describeMessageForPrompt } from "@/utils/promptMessageContent";
import type { PlurkShareSnapshot } from "@/types/chat";

function snapshot(over: Partial<PlurkShareSnapshot> = {}): PlurkShareSnapshot {
  return {
    ref: "abc12",
    postId: "post-1",
    sharedBy: "user",
    authorKind: "char",
    authorName: "小美",
    audience: "friends",
    text: "今天好累",
    imageCount: 0,
    postedAt: new Date(2026, 9, 18, 23, 40).getTime(),
    responseCount: 0,
    recentResponses: [],
    ...over,
  };
}

const NAMES = { userName: "阿明", charName: "小美" };

describe("分享噗文的卡片寫成提示詞", () => {
  it("使用者分享的噗寫成看得懂的說明", () => {
    const text = describeMessageForPrompt(
      { content: "[分享噗文] 小美：今天好累", is_user: true, plurkShare: snapshot() },
      NAMES,
    );
    expect(text).toContain('分享了一則噗浪 ref="');
    expect(text).toContain("今天好累");
    expect(text).not.toContain("[分享噗文] 小美");
  });

  it("偷偷說的作者是自己時會說出來", () => {
    const text = describeMessageForPrompt(
      {
        content: "",
        is_user: true,
        plurkShare: snapshot({ authorKind: "anon", authorName: "偷偷說 aaa11", anonOf: "char-1" }),
      },
      { ...NAMES, charId: "char-1" },
    );
    expect(text).toContain("其實是你發的");
  });

  it("群聊時偷偷說的作者用成員名字", () => {
    const text = describeMessageForPrompt(
      {
        content: "",
        is_user: true,
        plurkShare: snapshot({ authorKind: "anon", authorName: "偷偷說 aaa11", anonOf: "m1" }),
      },
      { ...NAMES, charId: "char-1", groupChat: true, memberNames: { m1: "小明" } },
    );
    expect(text).toContain("小明");
    expect(text).not.toContain("其實是你發的");
  });

  it("角色自己傳噗時以 <share-plurk 開頭", () => {
    const text = describeMessageForPrompt(
      { content: "", plurkShare: snapshot({ sharedBy: "char" }) },
      NAMES,
    );
    expect(text.startsWith("<share-plurk")).toBe(true);
  });

  it("一般訊息原樣回傳", () => {
    const text = describeMessageForPrompt({ content: "早安", is_user: true }, NAMES);
    expect(text).toBe("早安");
  });
});
