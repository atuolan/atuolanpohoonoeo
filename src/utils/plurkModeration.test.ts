import { describe, expect, it } from "vitest";
import type { PlurkBan, QZoneComment, QZonePost } from "@/types/qzone";
import {
  appealStage,
  banRemaining,
  buildPeekPlurkNotes,
  clampBanDays,
  countDuplicateReplies,
  groupLikeNotices,
  isBanActive,
  makeAppeal,
  spamVerdict,
  withNotice,
} from "./plurkModeration";

const H = 3600_000;
const now = new Date(2026, 9, 21, 20, 0).getTime();
const mine = (content: string, t: number): QZoneComment => ({
  id: `c${t}`, authorId: "p1", username: "me", avatar: "", content, timestamp: t, authorType: "user",
});
const p = (id: string, comments: QZoneComment[] = [], extra: Partial<QZonePost> = {}): QZonePost => ({
  id, authorId: "npc-1", type: "shuoshuo", timestamp: now - 2 * H, comments, likes: [], visibility: "public", authorType: "ai", ...extra,
});

describe("洗版", () => {
  const posts = [
    p("a", [mine("後門 巷子可以停", now - H)]),
    p("b", [mine("後門巷子可以停", now - 2 * H)]),
    p("old", [mine("後門巷子可以停", now - 30 * H)]),
    p("friends", [mine("後門巷子可以停", now - H)], { audience: "friends" }),
    p("myown", [mine("後門巷子可以停", now - H)], { authorType: "user", authorId: "p1" }),
    p("here", [mine("後門巷子可以停", now)]),
  ];
  it("只算 24 小時內、別人的廣場噗、去空白後相同，不算這一則", () => {
    expect(countDuplicateReplies(posts, "here", "後門巷子 可以停", now)).toBe(2);
    expect(countDuplicateReplies(posts, "here", "好", now)).toBe(0);
  });
  it("普通第 3 篇、嚴格第 2 篇；寬鬆不管", () => {
    expect(spamVerdict("mid", 1)).toEqual({ fold: false, banDays: 0 });
    expect(spamVerdict("mid", 2)).toEqual({ fold: true, banDays: 1 });
    expect(spamVerdict("hard", 1)).toEqual({ fold: true, banDays: 3 });
    expect(spamVerdict("loose", 9)).toEqual({ fold: false, banDays: 0 });
  });
  it("AI 判的天數依嚴格度限制", () => {
    expect(clampBanDays("loose", 3)).toBe(0);
    expect(clampBanDays("mid", 3)).toBe(1);
    expect(clampBanDays("hard", 2.6)).toBe(3);
    expect(clampBanDays("hard", -1)).toBe(0);
  });
});

describe("禁言與申訴", () => {
  const ban: PlurkBan = { reason: "洗版", by: "阿杏", at: now - H, until: now + 2 * 24 * H + 20 * H + 60_000 };
  it("剩餘時間（不足一小時進位）", () => expect(banRemaining(ban, now)).toEqual({ days: 2, hours: 21 }));
  it("到期或申訴通過就解除", () => {
    expect(isBanActive(ban, now)).toBe(true);
    expect(isBanActive(ban, ban.until)).toBe(false);
    expect(isBanActive({ ...ban, appeal: { ...makeAppeal("x", now), status: "approved" } }, now)).toBe(false);
    expect(isBanActive(undefined, now)).toBe(false);
  });
  it("申訴 1–6 小時後出結果、進度三段", () => {
    const appeal = makeAppeal("不是洗版", now, () => 0.5);
    expect(appeal.decideAt - now).toBe(3.5 * H);
    expect(appealStage(appeal, now + 60_000)).toBe(0);
    expect(appealStage(appeal, now + H)).toBe(1);
    expect(appealStage({ ...appeal, status: "denied" }, now)).toBe(2);
  });
});

describe("通知", () => {
  it("系統通知新的在前、最多 50 則", () => {
    const list = Array.from({ length: 50 }, (_, i) => ({ id: `${i}`, kind: "fold" as const, title: "", text: "", at: i }));
    const next = withNotice(list, { id: "new", kind: "ban", title: "", text: "", at: 99 });
    expect(next).toHaveLength(50);
    expect(next[0].id).toBe("new");
  });
  it("讚：使用者的噗、每則一列、人不重複、新的在前", () => {
    const posts = [
      p("x", [], { authorType: "user", likeEvents: [{ by: "a", at: now - 3 * H }, { by: "b", at: now - H }, { by: "a", at: now - 2 * H }] }),
      p("y", [], { authorType: "user", likeEvents: [{ by: "c", at: now - 30 * 60_000 }, { by: "d", at: now + H }] }),
      p("z", [], { likeEvents: [{ by: "a", at: now }] }),
    ];
    expect(groupLikeNotices(posts, now)).toEqual([
      { postId: "y", likerIds: ["c"], at: now - 30 * 60_000 },
      { postId: "x", likerIds: ["b", "a"], at: now - H },
    ]);
  });
});

describe("buildPeekPlurkNotes", () => {
  it("禁言中的原因、最近 3 則偷偷說；都沒有回 undefined", () => {
    const anon = (id: string, t: number) => p(id, [], { anonOf: "c1", audience: "anon", timestamp: t, content: `心事${id}` });
    const posts = [anon("1", now - 4 * H), anon("2", now - 3 * H), anon("3", now - 2 * H), anon("4", now - H), anon("future", now + H)];
    const notes = buildPeekPlurkNotes(posts, [{ characterId: "c1", reason: "吵架", at: now - H, until: now + 5 * H }], "c1", now);
    expect(notes?.ban?.reason).toBe("吵架");
    expect(notes?.anonPosts).toEqual(["心事4", "心事3", "心事2"]);
    expect(buildPeekPlurkNotes(posts, [], "c2", now)).toBeUndefined();
    expect(buildPeekPlurkNotes([], [{ characterId: "c1", reason: "r", at: 0, until: now - 1 }], "c1", now)).toBeUndefined();
  });
});
