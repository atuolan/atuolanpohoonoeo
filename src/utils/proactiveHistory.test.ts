import { describe, expect, it } from "vitest";
import { buildUnrepliedProactiveNote, trimUnrepliedProactiveTail } from "./proactiveHistory";

const H = 60 * 60 * 1000;
const u = (id: string, at: number) => ({ id, sender: "user", is_user: true, createdAt: at });
const a = (id: string, at: number) => ({ id, sender: "assistant", is_user: false, createdAt: at });

describe("trimUnrepliedProactiveTail", () => {
  it("沒有連發時照原樣", () => {
    const msgs = [u("u1", 0), a("a1", 1000), a("a2", 1001)];
    const r = trimUnrepliedProactiveTail(msgs);
    expect(r.messages).toEqual(msgs);
    expect(r.unrepliedBatches).toBe(0);
  });

  it("保留回覆那批＋最近兩次主動訊息，中間省略", () => {
    const msgs = [
      u("u1", 0),
      a("reply", 1000),
      a("p1a", 1 * H), a("p1b", 1 * H + 1),
      a("p2", 2 * H),
      a("p3a", 3 * H), a("p3b", 3 * H + 1),
      a("p4", 4 * H),
    ];
    const r = trimUnrepliedProactiveTail(msgs);
    expect(r.messages.map((m) => m.id)).toEqual(["u1", "reply", "p3a", "p3b", "p4"]);
    expect(r.unrepliedBatches).toBe(4);
    expect(r.droppedCount).toBe(3);
    expect(r.lastUserAt).toBe(0);
  });

  it("user 訊息後角色沒馬上回時，第一批也算主動", () => {
    const msgs = [u("u1", 0), a("p1", 1 * H), a("p2", 2 * H)];
    const r = trimUnrepliedProactiveTail(msgs);
    expect(r.unrepliedBatches).toBe(2);
    expect(r.messages.map((m) => m.id)).toEqual(["u1", "p1", "p2"]);
  });

  it("系統訊息不算 user 說話", () => {
    const msgs = [
      u("u1", 0),
      a("reply", 1000),
      { id: "sys", sender: "system", is_user: true, createdAt: 1 * H },
      a("p2", 2 * H),
    ];
    const r = trimUnrepliedProactiveTail(msgs);
    expect(r.lastUserAt).toBe(0);
    expect(r.unrepliedBatches).toBe(2);
  });
});

describe("buildUnrepliedProactiveNote", () => {
  it("沒連發時是空字串", () => {
    expect(buildUnrepliedProactiveNote({ userName: "雪丘", unrepliedBatches: 0 })).toBe("");
  });

  it("寫出次數與多久沒說話", () => {
    const note = buildUnrepliedProactiveNote({
      userName: "雪丘",
      unrepliedBatches: 5,
      droppedCount: 6,
      lastUserAt: 0,
      now: 10 * H,
    });
    expect(note).toContain("10 小時前");
    expect(note).toContain("主動傳了 5 次");
    expect(note).toContain("6 則");
  });
});
