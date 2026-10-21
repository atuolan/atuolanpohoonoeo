import { describe, expect, it } from "vitest";
import type { QZoneComment, QZonePost } from "@/types/qzone";
import { DEFAULT_DIRECTOR_CONFIG, type PlurkDirectorConfig } from "./plurkDirectorConfig";
import { pickPoster, pickReplyTarget, planDirectorEvents, remainingToday } from "./plurkDirectorPlan";

const H = 3600_000;
const now = new Date(2026, 9, 21, 20, 0).getTime();
const cfg = (extra: Partial<PlurkDirectorConfig> = {}): PlurkDirectorConfig => ({
  ...DEFAULT_DIRECTOR_CONFIG, mode: "free", liveliness: 3, lastRunAt: now - 10 * 60_000, ...extra,
});

describe("planDirectorEvents", () => {
  it("關閉時沒有事件", () => expect(planDirectorEvents({ cfg: cfg({ mode: "off" }), now })).toEqual([]));
  it("第一次執行（lastRunAt 0）不補", () => expect(planDirectorEvents({ cfg: cfg({ lastRunAt: 0 }), now })).toEqual([]));
  it("10 分鐘、每小時 1.5 次：期望 0.25，亂數小於 0.25 發生一次、時間是現在", () => {
    expect(planDirectorEvents({ cfg: cfg(), now, random: () => 0.1 })).toEqual([{ kind: "post", at: now }]);
    expect(planDirectorEvents({ cfg: cfg(), now, random: () => 0.3 })).toEqual([]);
  });
  it("一般檢查一次最多 2 個", () => {
    const events = planDirectorEvents({ cfg: cfg({ liveliness: 5, lastRunAt: now - 50 * 60_000 }), now, random: () => 0.1 });
    expect(events).toHaveLength(2);
  });
  it("離開超過 1 小時：補最多 3 個，時間落在離開期間、由舊到新", () => {
    const last = now - 10 * H;
    const events = planDirectorEvents({ cfg: cfg({ lastRunAt: last }), now, random: () => 0.5 });
    expect(events).toHaveLength(3);
    for (const e of events) {
      expect(e.at).toBeGreaterThan(last);
      expect(e.at).toBeLessThanOrEqual(now);
    }
    expect([...events].sort((a, b) => a.at - b.at)).toEqual(events);
  });
  it("受每日上限限制", () => {
    const events = planDirectorEvents({
      cfg: cfg({ lastRunAt: now - 10 * H, dailyCap: 5, todayKey: "2026-10-21", todayCount: 4 }), now, random: () => 0.5,
    });
    expect(events).toHaveLength(1);
  });
  it("亂數 ≥ 0.6 是回應事件", () => {
    expect(planDirectorEvents({ cfg: cfg({ liveliness: 5 }), now, random: () => 0.7 })[0].kind).toBe("reply");
  });
});

describe("remainingToday", () => {
  it("換日歸零", () => {
    expect(remainingToday(cfg({ dailyCap: 10, todayKey: "2026-10-20", todayCount: 9 }), now)).toBe(10);
    expect(remainingToday(cfg({ dailyCap: 10, todayKey: "2026-10-21", todayCount: 9 }), now)).toBe(1);
  });
});

describe("pickPoster", () => {
  const friends = ["a", "b", "c", "d"];
  it("排除不出現、只回應", () => {
    const c = cfg({ roles: { a: "mute", b: "reply" } });
    expect(pickPoster(c, friends, now, () => 0)).toBe("c");
  });
  it("只用名單：只有明確設成常出現的", () => {
    const c = cfg({ mode: "list", roles: { d: "often" } });
    expect(pickPoster(c, friends, now, () => 0)).toBe("d");
  });
  it("照作息：20 點早起型可以、夜貓子可以、凌晨 3 點白天型不行", () => {
    const c = cfg({ routines: { a: "day", b: "night", c: "day", d: "day" } });
    const at3 = new Date(2026, 9, 21, 3, 0).getTime();
    expect(pickPoster(c, friends, at3, () => 0)).toBe("b");
    expect(pickPoster({ ...c, followRoutine: false }, friends, at3, () => 0)).toBe("a");
  });
  it("沒人可選回傳 null", () => expect(pickPoster(cfg({ roles: { a: "mute" } }), ["a"], now)).toBeNull());
});

describe("pickReplyTarget", () => {
  const cm = (id: string, t: number): QZoneComment => ({ id, authorId: "x", username: "x", avatar: "", content: "", timestamp: t, authorType: "ai" });
  const p = (id: string, t: number, extra: Partial<QZonePost> = {}): QZonePost => ({
    id, authorId: "c", type: "shuoshuo", timestamp: t, comments: [], likes: [], visibility: "public", authorType: "ai", ...extra,
  });
  it("24 小時內、回應少於 3、使用者的優先、新的優先", () => {
    const posts = [
      p("old", now - 30 * H),
      p("busy", now - H, { comments: [cm("1", now - 50), cm("2", now - 40), cm("3", now - 30)] }),
      p("char", now - 2 * H),
      p("mine", now - 5 * H, { authorType: "user" }),
      p("theater", now - 60_000, { theaterPostId: "t" }),
    ];
    expect(pickReplyTarget(posts, now)?.id).toBe("mine");
    expect(pickReplyTarget(posts.filter((x) => x.id !== "mine"), now)?.id).toBe("char");
    expect(pickReplyTarget([posts[0]], now)).toBeNull();
  });
});
