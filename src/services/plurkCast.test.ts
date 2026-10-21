import { describe, expect, it, vi } from "vitest";
import type { QZonePost } from "@/types/qzone";

vi.mock("@/db/database", () => ({ getDatabase: vi.fn() }));
vi.mock("@/stores/characters", () => ({ useCharactersStore: vi.fn() }));
vi.mock("@/stores/qzone", () => ({ useQzoneStore: vi.fn() }));

import { allowsPasserby, effectiveFriendIds, getViewerIds, pickResponders, type CastContext } from "./plurkCast";

function post(extra: Partial<QZonePost> = {}): QZonePost {
  return { id: "p", authorId: "u", type: "shuoshuo", timestamp: 0, comments: [], likes: [], visibility: "public", ...extra };
}
const ctx: CastContext = {
  allCharacterIds: ["a", "b", "c", "d", "e"],
  friendIds: new Set(["a", "b", "c", "d"]),
  mutedIds: new Set(["d"]),
};
const noRandom = () => 0.99; // 洗牌不動順序

describe("effectiveFriendIds", () => {
  it("有好友用好友，沒有退回全部", () => {
    expect(effectiveFriendIds(ctx)).toEqual(["a", "b", "c", "d"]);
    expect(effectiveFriendIds({ ...ctx, friendIds: new Set() })).toEqual(["a", "b", "c", "d", "e"]);
  });
});

describe("getViewerIds", () => {
  it("全員與好友噗：好友看得到", () => {
    expect(getViewerIds(post(), ctx)).toEqual(["a", "b", "c", "d"]);
    expect(getViewerIds(post({ audience: "friends" }), ctx)).toEqual(["a", "b", "c", "d"]);
  });
  it("私噗只有指定的人（即使不是好友）", () => {
    expect(getViewerIds(post({ audience: "private", privateTo: ["b", "e"] }), ctx)).toEqual(["b", "e"]);
  });
  it("舊群組噗用群組成員", () => {
    expect(getViewerIds(post({ visibilityMode: "group-only", groupMemberIds: ["c"] }), ctx)).toEqual(["c"]);
  });
});

describe("allowsPasserby", () => {
  it("只有全員／偷偷說，且沒關掉", () => {
    expect(allowsPasserby(post())).toBe(true);
    expect(allowsPasserby(post({ allowPasserby: false }))).toBe(false);
    expect(allowsPasserby(post({ audience: "friends" }))).toBe(false);
    expect(allowsPasserby(post({ audience: "anon" }))).toBe(true);
  });
});

describe("pickResponders", () => {
  it("不要回應：空", () => {
    expect(pickResponders(post({ replyPolicy: "none" }), ctx)).toEqual([]);
  });
  it("ignorePolicy 時照 AI 挑", () => {
    expect(pickResponders(post({ replyPolicy: "none" }), ctx, { ignorePolicy: true, random: noRandom })).toHaveLength(3);
  });
  it("AI 挑：最多 3 位、排除不出現", () => {
    const ids = pickResponders(post(), ctx, { random: noRandom });
    expect(ids).toHaveLength(3);
    expect(ids).not.toContain("d");
  });
  it("優先角色排第一，即使被設成不出現", () => {
    const ids = pickResponders(post(), ctx, { priorityIds: ["d"], random: noRandom });
    expect(ids[0]).toBe("d");
    expect(ids).toHaveLength(3);
  });
  it("優先角色看不到這則噗就不算", () => {
    const ids = pickResponders(post({ audience: "private", privateTo: ["a"] }), ctx, { priorityIds: ["b"] });
    expect(ids).toEqual(["a"]);
  });
  it("我指定：全部指定且看得到的人，不設上限", () => {
    const p = post({ replyPolicy: "pick", replyPickIds: ["a", "b", "c", "e"] });
    expect(pickResponders(p, ctx)).toEqual(["a", "b", "c"]);
  });
  it("我指定＋優先：優先的排前面", () => {
    const p = post({ replyPolicy: "pick", replyPickIds: ["a", "b"] });
    expect(pickResponders(p, ctx, { priorityIds: ["b"] })).toEqual(["b", "a"]);
  });
  it("max 可調", () => {
    expect(pickResponders(post(), ctx, { max: 1, random: noRandom })).toHaveLength(1);
  });
});

describe("getViewerIds 偷偷說", () => {
  it("偷偷說的本人不在看得到的名單", () => {
    expect(getViewerIds(post({ audience: "anon", anonOf: "b" }), ctx)).toEqual(["a", "c", "d"]);
  });
});
