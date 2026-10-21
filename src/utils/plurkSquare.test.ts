import { describe, expect, it } from "vitest";
import type { QZoneComment, QZonePost, QZoneSettings } from "@/types/qzone";
import { anonHandle, anonQuotaLeft, hasFreshReplies, hotScore, isRiverPost, isSquarePost, squareFeed } from "./plurkSquare";

const H = 3600_000;
const now = new Date(2026, 9, 21, 20, 0).getTime();
const c = (id: string, t: number, extra: Partial<QZoneComment> = {}): QZoneComment => ({
  id, authorId: "x", username: "x", avatar: "", content: "", timestamp: t, authorType: "ai", ...extra,
});
const p = (id: string, t: number, extra: Partial<QZonePost> = {}): QZonePost => ({
  id, authorId: "c", type: "shuoshuo", timestamp: t, comments: [], likes: [], visibility: "public", authorType: "ai", content: id, ...extra,
});

describe("isSquarePost / isRiverPost", () => {
  it("全員、偷偷說上廣場；好友、私噗、小劇場、轉噗不上", () => {
    expect(isSquarePost(p("a", now))).toBe(true);
    expect(isSquarePost(p("b", now, { audience: "anon" }))).toBe(true);
    expect(isSquarePost(p("c", now, { audience: "friends" }))).toBe(false);
    expect(isSquarePost(p("d", now, { visibilityMode: "group-only" }))).toBe(false);
    expect(isSquarePost(p("e", now, { theaterPostId: "t" }))).toBe(false);
    expect(isSquarePost(p("f", now, { type: "repost" }))).toBe(false);
  });
  it("路人噗要加好友才進河道；路人和角色的偷偷說不進", () => {
    const npc = p("n", now, { npc: { id: "npc-1", name: "小魚", color: "#000" }, onSquare: true });
    expect(isRiverPost(npc, new Set())).toBe(false);
    expect(isRiverPost(npc, new Set(["npc-1"]))).toBe(true);
    expect(isRiverPost(p("x", now, { audience: "anon", anonOf: "c1" }), new Set())).toBe(false);
    expect(isRiverPost(p("y", now, { audience: "anon", onSquare: true }), new Set())).toBe(false);
    expect(isRiverPost(p("u", now, { audience: "anon", authorType: "user" }), new Set())).toBe(true);
  });
});

describe("squareFeed", () => {
  const removed = { action: "delete" as const, reason: "r", by: "阿杏", at: 0 };
  const posts = [
    p("old-hot", now - 80 * H, { crowdLikes: 999 }),
    p("busy", now - 5 * H, { comments: [c("1", now - H), c("2", now - H), c("gone", now - H, { moderation: removed })] }),
    p("liked", now - 2 * H, { crowdLikes: 3, qualifier: "問" }),
    p("anon", now - H, { audience: "anon", qualifier: "asks" }),
    p("future", now + H),
    p("friends", now, { audience: "friends" }),
  ];
  it("熱門：3 天內、回應×2＋喜歡，被刪的回應不算", () => {
    expect(hotScore(posts[1], now)).toBe(4);
    expect(squareFeed(posts, { tab: "hot", now }).map((x) => x.id)).toEqual(["busy", "liked", "anon"]);
  });
  it("偷偷說、最新、發語詞篩選（英文會正規化）", () => {
    expect(squareFeed(posts, { tab: "anon", now }).map((x) => x.id)).toEqual(["anon"]);
    expect(squareFeed(posts, { tab: "new", now }).map((x) => x.id)).toEqual(["anon", "liked", "busy", "old-hot"]);
    expect(squareFeed(posts, { tab: "new", now, qualifier: "問" }).map((x) => x.id)).toEqual(["anon", "liked"]);
  });
  it("搜尋不比對偷偷說的作者名", () => {
    const list = [p("a", now, { audience: "anon", username: "譚尧", content: "嗨" }), p("b", now, { username: "譚尧", content: "嗨" })];
    expect(squareFeed(list, { tab: "new", now, query: "譚" }).map((x) => x.id)).toEqual(["b"]);
  });
});

describe("anonHandle", () => {
  it("同一則同一人固定、四位數、不同人不同", () => {
    const a = anonHandle("post1", "me");
    expect(a).toMatch(/^#\d{4}$/);
    expect(anonHandle("post1", "me")).toBe(a);
    expect(anonHandle("post1", "c1")).not.toBe(a);
  });
});

describe("anonQuotaLeft / hasFreshReplies", () => {
  const s: QZoneSettings = { nickname: "", avatar: "", background: "" };
  it("換日重算", () => {
    expect(anonQuotaLeft(s, now)).toBe(5);
    expect(anonQuotaLeft({ ...s, anonQuota: { day: "2026-10-21", count: 4 } }, now)).toBe(1);
    expect(anonQuotaLeft({ ...s, anonQuota: { day: "2026-10-20", count: 5 } }, now)).toBe(5);
  });
  it("30 分鐘內有回應", () => {
    expect(hasFreshReplies(p("a", 0, { comments: [c("1", now - 10 * 60_000)] }), now)).toBe(true);
    expect(hasFreshReplies(p("a", 0, { comments: [c("1", now - H)] }), now)).toBe(false);
  });
});
