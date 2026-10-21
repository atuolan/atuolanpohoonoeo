import { describe, expect, it } from "vitest";
import type { QZoneComment, QZonePost } from "@/types/qzone";
import { findDueComments, getTypingNames } from "./plurkReveal";

function c(id: string, t: number, extra: Partial<QZoneComment> = {}): QZoneComment {
  return { id, authorId: id, username: `名${id}`, avatar: "", content: "", timestamp: t, authorType: "ai", ...extra };
}
function p(id: string, comments: QZoneComment[], extra: Partial<QZonePost> = {}): QZonePost {
  return { id, authorId: "u", type: "shuoshuo", timestamp: 0, comments, likes: [], visibility: "public", authorType: "user", ...extra };
}

describe("findDueComments", () => {
  it("(since, now] 之間到點的 AI 回應，追蹤中、沒消音", () => {
    const posts = [
      p("1", [c("a", 50), c("b", 150), c("u", 60, { authorType: "user" }), c("old", 10)]),
      p("2", [c("m", 70)], { muted: true }),
      p("3", [c("x", 70)], { authorType: "ai" }),
    ];
    expect(findDueComments(posts, 20, 100).map((d) => d.comment.id)).toEqual(["a"]);
  });
});

describe("getTypingNames", () => {
  it("生成中的名字＋3 分鐘內要出現的", () => {
    const posts = [p("1", [c("soon", 100 + 60_000), c("late", 100 + 10 * 60_000), c("done", 50)])];
    expect(getTypingNames(posts, 100, { "2": ["譚尧"] })).toEqual({ "1": ["名soon"], "2": ["譚尧"] });
  });
  it("名字不重複", () => {
    const posts = [p("1", [c("a", 200, { username: "沈" }), c("b", 300, { username: "沈" })])];
    expect(getTypingNames(posts, 100, { "1": ["沈"] })).toEqual({ "1": ["沈"] });
  });
});
