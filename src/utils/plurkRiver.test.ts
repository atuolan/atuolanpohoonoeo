import { describe, expect, it } from "vitest";
import type { QZoneComment, QZonePost } from "@/types/qzone";
import {
  buildNoticeList,
  countUnreadPosts,
  filterRiverPosts,
  isPostFollowed,
  layoutRiverTimeline,
  unreadComments,
  visibleComments,
} from "./plurkRiver";

const H = 3600_000;
function c(id: string, t: number, extra: Partial<QZoneComment> = {}): QZoneComment {
  return { id, authorId: "x", username: "沈既白", avatar: "", content: `回應${id}`, timestamp: t, authorType: "ai", ...extra };
}
function p(id: string, t: number, extra: Partial<QZonePost> = {}): QZonePost {
  return { id, authorId: "u", type: "shuoshuo", timestamp: t, comments: [], likes: [], visibility: "public", authorType: "user", content: `噗${id}`, ...extra };
}

describe("visibleComments", () => {
  it("只要時間到的，舊到新", () => {
    const post = p("1", 0, { comments: [c("b", 30), c("a", 10), c("future", 100)] });
    expect(visibleComments(post, 50).map((x) => x.id)).toEqual(["a", "b"]);
  });
});

describe("filterRiverPosts", () => {
  const posts = [
    p("mine", 5),
    p("char", 4, { authorType: "ai", authorId: "c1", username: "譚尧" }),
    p("priv", 3, { audience: "private", privateTo: ["c1"] }),
    p("anon", 2, { audience: "anon" }),
    p("theater", 1, { authorType: "ai", authorId: "theater-blogger", theaterPostId: "t" }),
  ];
  it("全部", () => expect(filterRiverPosts(posts, "all")).toHaveLength(5));
  it("好友：角色發的、不含偷偷說與小劇場", () => expect(filterRiverPosts(posts, "friends").map((x) => x.id)).toEqual(["char"]));
  it("私噗", () => expect(filterRiverPosts(posts, "private").map((x) => x.id)).toEqual(["priv"]));
  it("偷偷說", () => expect(filterRiverPosts(posts, "anon").map((x) => x.id)).toEqual(["anon"]));
  it("我的：使用者發的", () => expect(filterRiverPosts(posts, "mine").map((x) => x.id)).toEqual(["mine", "priv", "anon"]));
  it("搜尋：內容、名字、發語詞，不分大小寫", () => {
    expect(filterRiverPosts(posts, "all", "譚").map((x) => x.id)).toEqual(["char"]);
    expect(filterRiverPosts(posts, "all", "  噗MINE ").map((x) => x.id)).toEqual(["mine"]);
  });
});

describe("isPostFollowed", () => {
  it("自己發的或自己回應過的", () => {
    expect(isPostFollowed(p("1", 0))).toBe(true);
    expect(isPostFollowed(p("2", 0, { authorType: "ai" }))).toBe(false);
    expect(isPostFollowed(p("3", 0, { authorType: "ai", comments: [c("u", 1, { authorType: "user" })] }))).toBe(true);
  });
});

describe("unreadComments", () => {
  const post = p("1", 0, { seenAt: 20, comments: [c("old", 10), c("new", 30), c("mine", 40, { authorType: "user" }), c("later", 999)] });
  it("比 seenAt 新、不是自己的、時間到了", () => {
    expect(unreadComments(post, 100).map((x) => x.id)).toEqual(["new"]);
  });
  it("unreadSince 比 seenAt 晚時用 unreadSince", () => {
    expect(unreadComments(post, 100, 35)).toEqual([]);
  });
  it("消音或沒追蹤：沒有未讀", () => {
    expect(unreadComments({ ...post, muted: true }, 100)).toEqual([]);
    expect(unreadComments({ ...post, authorType: "ai", comments: [c("x", 30)] }, 100)).toEqual([]);
  });
  it("countUnreadPosts 算有未讀的噗數", () => {
    expect(countUnreadPosts([post, p("2", 0, { comments: [c("y", 5)] })], 100)).toBe(2);
  });
});

describe("buildNoticeList", () => {
  it("追蹤中的噗、別人的回應，新到舊，標未讀，純文字", () => {
    const posts = [
      p("1", 0, { seenAt: 15, comments: [c("a", 10), c("b", 20, { content: "嗨<image>海</image>" })] }),
      p("2", 0, { authorType: "ai", comments: [c("z", 50)] }),
    ];
    const list = buildNoticeList(posts, 100);
    expect(list.map((n) => [n.commentId, n.unread])).toEqual([["b", true], ["a", false]]);
    expect(list[0].text).toBe("嗨[圖]");
    expect(list[0].postId).toBe("1");
  });
  it("limit", () => {
    const post = p("1", 0, { comments: [c("a", 1), c("b", 2), c("c", 3)] });
    expect(buildNoticeList([post], 100, undefined, 2).map((n) => n.commentId)).toEqual(["c", "b"]);
  });
});

describe("layoutRiverTimeline", () => {
  const now = new Date(2026, 9, 21, 20, 0);
  const today = new Date(2026, 9, 21, 19, 2).getTime();
  const today2 = new Date(2026, 9, 21, 18, 40).getTime();
  const yesterday = new Date(2026, 9, 20, 23, 40).getTime();
  const older = new Date(2026, 9, 18, 9, 5).getTime();
  const posts = [p("a", today), p("b", today2), p("c", yesterday), p("d", older)];
  const layout = layoutRiverTimeline(posts, now, { start: 40, gap: 118, dividerGap: 30 });
  it("由左到右越舊，上下交錯，時間標籤", () => {
    expect(layout.bubbles.map((b) => [b.postId, b.lane, b.timeLabel])).toEqual([
      ["a", 0, "19:02"],
      ["b", 1, "18:40"],
      ["c", 0, "23:40"],
      ["d", 1, "09:05"],
    ]);
  });
  it("跨日插分隔：昨天、M/D", () => {
    expect(layout.dividers).toEqual([
      { x: 276, label: "昨天" },
      { x: 424, label: "10/18" },
    ]);
    expect(layout.bubbles.map((b) => b.x)).toEqual([40, 158, 306, 454]);
  });
  it("寬度＝最後一顆的 x＋240", () => expect(layout.width).toBe(694));
  it("limit 預設 20", () => {
    const many = Array.from({ length: 25 }, (_, i) => p(String(i), today - i * 60_000));
    expect(layoutRiverTimeline(many, now).bubbles).toHaveLength(20);
  });
  it("沒有噗", () => expect(layoutRiverTimeline([], now)).toEqual({ bubbles: [], dividers: [], width: 0 }));
});
