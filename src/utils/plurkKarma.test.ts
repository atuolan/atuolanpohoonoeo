import { describe, expect, it } from "vitest";
import type { QZoneComment, QZonePost } from "@/types/qzone";
import {
  acquaintanceCount,
  activityTimes,
  averageReplyMinutes,
  characterOwner,
  computeKarma,
  hourHistogram,
  interactionCount,
  peakLabel,
  peakStart,
  USER_OWNER,
} from "./plurkKarma";

const DAY = 86_400_000;
const now = new Date(2026, 9, 21, 20, 0).getTime();
const c = (authorId: string, t: number, extra: Partial<QZoneComment> = {}): QZoneComment => ({
  id: `${authorId}-${t}`, authorId, username: authorId, avatar: "", content: "", timestamp: t, authorType: authorId === "me" ? "user" : "ai", ...extra,
});
const p = (authorId: string, t: number, comments: QZoneComment[] = [], extra: Partial<QZonePost> = {}): QZonePost => ({
  id: `${authorId}-${t}`, authorId, type: "shuoshuo", timestamp: t, comments, likes: [], visibility: "public", authorType: authorId === "me" ? "user" : "ai", ...extra,
});

describe("computeKarma", () => {
  it("50 起：每則噗 0.8、收到的回應 0.3、喜歡 0.1；自己的回應不算", () => {
    const posts = [p("a", now - DAY, [c("b", now - 1000), c("a", now - 900)], { likeCount: 2 })];
    expect(computeKarma(posts, characterOwner("a"), now)).toBe(51.3);
  });
  it("30 天前的不算加分；超過 7 天沒發噗每天扣 1.5；限制 0–100", () => {
    expect(computeKarma([p("a", now - 40 * DAY)], characterOwner("a"), now)).toBe(50 - 33 * 1.5);
    expect(computeKarma([p("a", now - 200 * DAY)], characterOwner("a"), now)).toBe(0);
    const many = Array.from({ length: 80 }, (_, i) => p("me", now - i * 1000, [], { crowdLikes: 10 }));
    expect(computeKarma(many, USER_OWNER, now)).toBe(100);
  });
  it("沒發過噗就是 50", () => expect(computeKarma([], USER_OWNER, now)).toBe(50));
});

describe("出沒時段", () => {
  it("長條、最常在的連續 3 小時（可跨午夜）", () => {
    const at = (h: number) => new Date(2026, 9, 20, h, 10).getTime();
    const posts = [p("a", at(23), [c("a", at(0)), c("a", at(1))]), p("x", at(12), [c("a", at(15))])];
    const times = activityTimes(posts, characterOwner("a"), now);
    const hours = hourHistogram(times);
    expect(hours[23] + hours[0] + hours[1]).toBe(3);
    expect(peakStart(hours)).toBe(23);
    expect(peakLabel(23)).toBe("晚上 23–2 點");
    expect(peakLabel(0)).toBe("凌晨 0–3 點");
    expect(peakStart(new Array(24).fill(0))).toBeNull();
  });
});

describe("他和你", () => {
  const posts = [
    p("me", now - 60 * 60_000, [c("a", now - 56 * 60_000), c("a", now - 30 * 60_000), c("b", now - 50 * 60_000)]),
    p("me", now - 30 * 60_000, [c("a", now - 20 * 60_000)]),
    p("a", now - 10 * 60_000, [c("me", now - 5 * 60_000), c("b", now - 4 * 60_000), c("passerby-1", now - 3 * 60_000)]),
    p("b", now - 10 * 60_000, [c("a", now - 2 * 60_000)]),
  ];
  it("平均回覆：每則噗他的第一則", () => expect(averageReplyMinutes(posts, "a", now)).toBe(7));
  it("沒回過就是 null", () => expect(averageReplyMinutes(posts, "z", now)).toBeNull());
  it("互動：他回你的噗＋你回他的噗", () => expect(interactionCount(posts, "a", now)).toBe(4));
  it("互動過的人：使用者、b；路人不算", () => expect(acquaintanceCount(posts, "a", now)).toBe(2));
});
