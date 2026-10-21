import { describe, expect, it } from "vitest";
import type { QZonePost } from "@/types/qzone";
import { audienceLabel, getAudience, getLikeTotal, getPrivateTo, getTheaterPostId } from "./plurkPost";

function post(extra: Partial<QZonePost> = {}): QZonePost {
  return { id: "p", authorId: "a", type: "shuoshuo", timestamp: 0, comments: [], likes: [], visibility: "public", ...extra };
}
const names: Record<string, string> = { c1: "譚尧", c2: "沈既白", c3: "林栩" };
const nameOf = (id: string) => names[id] ?? "?";

describe("getAudience", () => {
  it("有新欄位就用新欄位", () => expect(getAudience(post({ audience: "friends" }))).toBe("friends"));
  it("舊群組噗算私噗", () => expect(getAudience(post({ visibilityMode: "group-only" }))).toBe("private"));
  it("其他算全員", () => expect(getAudience(post())).toBe("all"));
});

describe("getPrivateTo", () => {
  it("新欄位優先，舊群組成員退回", () => {
    expect(getPrivateTo(post({ privateTo: ["c1"], groupMemberIds: ["c2"] }))).toEqual(["c1"]);
    expect(getPrivateTo(post({ groupMemberIds: ["c2"] }))).toEqual(["c2"]);
    expect(getPrivateTo(post())).toEqual([]);
  });
});

describe("getTheaterPostId", () => {
  it("新欄位與舊表情 key 都認", () => {
    expect(getTheaterPostId(post({ theaterPostId: "t1" }))).toBe("t1");
    expect(getTheaterPostId(post({ emoticons: { "theater:t2": 1 } }))).toBe("t2");
    expect(getTheaterPostId(post({ emoticons: { "❤️": 3 } }))).toBeUndefined();
  });
});

describe("getLikeTotal", () => {
  it("likeCount 加舊表情數，不算小劇場 key", () => {
    expect(getLikeTotal(post({ likeCount: 2, emoticons: { "❤️": 3, "😂": 1, "theater:t": 1 } }))).toBe(6);
    expect(getLikeTotal(post())).toBe(0);
  });
});

describe("audienceLabel", () => {
  it("四種", () => {
    expect(audienceLabel(post(), nameOf)).toBe("全員");
    expect(audienceLabel(post({ audience: "friends" }), nameOf)).toBe("好友可見");
    expect(audienceLabel(post({ audience: "anon" }), nameOf)).toBe("偷偷說");
    expect(audienceLabel(post({ audience: "private", privateTo: ["c1", "c2"] }), nameOf)).toBe("私噗給 譚尧、沈既白");
    expect(audienceLabel(post({ audience: "private", privateTo: ["c1", "c2", "c3"] }), nameOf)).toBe(
      "私噗給 譚尧、沈既白 等 3 人",
    );
  });
  it("舊群組噗顯示群組名", () => {
    expect(
      audienceLabel(post({ visibilityMode: "group-only", groupName: "家人", groupMemberIds: ["c1"] }), nameOf),
    ).toBe("家人");
  });
});
