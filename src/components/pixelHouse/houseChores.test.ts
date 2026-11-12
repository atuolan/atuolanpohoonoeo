import { describe, expect, it } from "vitest";
import {
  accrueDirt,
  choreAct,
  choreDirtId,
  choreKey,
  claimMail,
  cleanCoins,
  CHORE_GAP_MS,
  CHORE_WAIT_MS,
  CLEAN_COINS,
  deedsToClaim,
  DIRT,
  DIRT_ART,
  DIRT_FIRST,
  DIRT_INTERVAL_MS,
  mailWaiting,
  MAIL_COINS,
  MAIL_WEEK_COINS,
  parseDirt,
  parseMail,
  pickChore,
  workPay,
  WORK_MAX_COINS,
} from "./houseChores";
import { ROOM_H, ROOM_W, STRIP_ROOMS } from "./houseData";
import { defaultHouseLifeState } from "./houseLife";

const H = DIRT_INTERVAL_MS;
const seq = (...ns: number[]) => {
  let i = 0;
  return () => ns[Math.min(i++, ns.length - 1)];
};

describe("髒污", () => {
  it("每間最多三處、id 不重複、都在房間裡、圖的每一列一樣寬", () => {
    expect(new Set(DIRT.map((d) => d.id)).size).toBe(DIRT.length);
    for (const room of STRIP_ROOMS) expect(DIRT.filter((d) => d.room === room).length).toBeLessThanOrEqual(3);
    for (const d of DIRT) {
      const art = DIRT_ART[d.kind];
      expect(new Set(art.rows.map((r) => r.length)).size, d.kind).toBe(1);
      expect(d.x).toBeGreaterThanOrEqual(0);
      expect(d.x + art.rows[0].length).toBeLessThanOrEqual(ROOM_W);
      expect(d.y + art.rows.length).toBeLessThanOrEqual(ROOM_H);
    }
  });

  it("時間沒到不長；每過一段時間多一處", () => {
    const t0 = 1_000_000_000;
    expect(accrueDirt({}, t0, t0 + H - 1)).toEqual({ dirt: {}, dirtAt: t0 });
    const a = accrueDirt({}, t0, t0 + H + 5, () => 0);
    expect(Object.keys(a.dirt)).toEqual([DIRT[0].id]);
    // 多出來的 5 毫秒留著，下一處不會晚出現
    expect(a.dirtAt).toBe(t0 + H);
    const b = accrueDirt(a.dirt, a.dirtAt, t0 + 3 * H, () => 0);
    expect(Object.keys(b.dirt)).toHaveLength(3);
  });

  it("很久沒開：最多就是全部都髒，不會存著之後一次冒出來", () => {
    const t0 = 1_000_000_000;
    const now = t0 + 500 * H;
    const a = accrueDirt({}, t0, now);
    expect(Object.keys(a.dirt)).toHaveLength(DIRT.length);
    expect(a.dirtAt).toBe(now);
    // 清掉一處：要再等一輪才會再髒
    const { [DIRT[0].id]: _gone, ...rest } = a.dirt;
    expect(Object.keys(accrueDirt(rest, a.dirtAt, now + H - 1).dirt)).toHaveLength(DIRT.length - 1);
    expect(Object.keys(accrueDirt(rest, a.dirtAt, now + H).dirt)).toHaveLength(DIRT.length);
  });

  it("手機時間往回調：不長，從現在重新算", () => {
    expect(accrueDirt({}, 5000, 1000)).toEqual({ dirt: {}, dirtAt: 1000 });
  });

  it("第一次打開就有幾處可以掃", () => {
    const now = new Date(2026, 10, 12, 12);
    const s = defaultHouseLifeState(now);
    expect(Object.keys(accrueDirt(s.dirt, s.dirtAt, now.getTime()).dirt)).toHaveLength(DIRT_FIRST);
  });

  it("存檔裡不認得的髒污丟掉", () => {
    expect(parseDirt({ "k-dishes": 5, 不存在: 5, "l-dust-a": "x" })).toEqual({ "k-dishes": 5 });
    expect(parseDirt([1, 2])).toEqual({});
  });

  it("你點的比他掃的賺得多，都在範圍內", () => {
    expect(cleanCoins("user", () => 0)).toBe(CLEAN_COINS.user[0]);
    expect(cleanCoins("user", () => 0.999999)).toBe(CLEAN_COINS.user[1]);
    expect(cleanCoins("resident", () => 0.999999)).toBe(CLEAN_COINS.resident[1]);
    expect(CLEAN_COINS.resident[1]).toBeLessThanOrEqual(CLEAN_COINS.user[0]);
  });
});

describe("他自己打掃", () => {
  const dirt = { "k-dishes": 1, "l-dust-a": 1 };
  const base = { night: false, openMs: CHORE_WAIT_MS, sinceLastMs: CHORE_GAP_MS, room: "living" as const, current: null };

  it("打掃的動作：站在髒污旁邊、有字", () => {
    const act = choreAct(choreKey("k-dishes"))!;
    expect(act).toMatchObject({ room: "kitchen", anchor: "faucet", label: "洗碗中" });
    expect(choreDirtId(choreKey("k-dishes"))).toBe("k-dishes");
    expect(choreDirtId("tv")).toBeNull();
    expect(choreAct("tv")).toBeUndefined();
    expect(choreAct(choreKey("不存在"))).toBeUndefined();
  });

  it("晚上不掃、剛打開不掃、沒髒污不掃、機率沒中不掃", () => {
    expect(pickChore(dirt, { ...base, night: true }, () => 0)).toBeNull();
    expect(pickChore(dirt, { ...base, openMs: CHORE_WAIT_MS - 1 }, () => 0)).toBeNull();
    expect(pickChore({}, base, () => 0)).toBeNull();
    expect(pickChore(dirt, base, () => 0.9)).toBeNull();
  });

  it("掃完一處要隔四小時才會再掃", () => {
    expect(CHORE_GAP_MS).toBe(4 * 60 * 60 * 1000);
    expect(pickChore(dirt, { ...base, sinceLastMs: CHORE_GAP_MS - 1 }, () => 0)).toBeNull();
    expect(pickChore(dirt, { ...base, sinceLastMs: CHORE_GAP_MS }, () => 0)).not.toBeNull();
    // 還沒掃過（或時間被往回調）：可以掃
    expect(pickChore(dirt, { ...base, sinceLastMs: Infinity }, () => 0)).not.toBeNull();
  });

  it("同一間的優先；不會連續掃同一處", () => {
    expect(pickChore(dirt, base, seq(0, 0, 0))).toBe(choreKey("l-dust-a"));
    expect(pickChore(dirt, { ...base, current: choreKey("l-dust-a") }, seq(0, 0, 0))).toBe(choreKey("k-dishes"));
    expect(pickChore({ "l-dust-a": 1 }, { ...base, current: choreKey("l-dust-a") }, () => 0)).toBeNull();
  });
});

describe("信箱每天一封信", () => {
  const day = (d: number, h = 9) => new Date(2026, 10, d, h);

  it("第一次領、同一天不能領兩次", () => {
    const a = claimMail({ last: "", streak: 0 }, day(12))!;
    expect(a).toEqual({ mail: { last: "2026-11-12", streak: 1 }, coins: MAIL_COINS });
    expect(mailWaiting(a.mail, day(12, 23))).toBe(false);
    expect(claimMail(a.mail, day(12, 23))).toBeNull();
    expect(mailWaiting(a.mail, day(13, 0))).toBe(true);
  });

  it("連續七天那封比較多，斷了從頭算", () => {
    let mail = { last: "", streak: 0 };
    const coins: number[] = [];
    for (let d = 1; d <= 8; d++) {
      const r = claimMail(mail, day(d))!;
      mail = r.mail;
      coins.push(r.coins);
    }
    expect(coins).toEqual([50, 50, 50, 50, 50, 50, MAIL_WEEK_COINS, 50]);
    expect(mail.streak).toBe(8);
    // 隔一天沒領
    expect(claimMail(mail, day(10))!.mail.streak).toBe(1);
  });

  it("跨月也算連續", () => {
    const r = claimMail({ last: "2026-10-31", streak: 3 }, new Date(2026, 10, 1, 8))!;
    expect(r.mail.streak).toBe(4);
  });

  it("存檔壞掉用預設值", () => {
    expect(parseMail(null)).toEqual({ last: "", streak: 0 });
    expect(parseMail({ last: "亂寫", streak: 9 })).toEqual({ last: "", streak: 0 });
    expect(parseMail({ last: "2026-11-12", streak: -3 })).toEqual({ last: "2026-11-12", streak: 1 });
  });
});

describe("他忙完帶錢回來", () => {
  const now = 10 * 3_600_000;
  const away = (hours: number, patch = {}) => ({ id: "a1", startedAt: now - hours * 3_600_000 - 60_000, endedAt: now - 60_000, kind: "busy", ...patch });

  it("照時間算，有上限", () => {
    expect(workPay(away(2), "", now)).toBe(60);
    expect(workPay(away(0.5), "", now)).toBe(15);
    expect(workPay(away(20), "", now)).toBe(WORK_MAX_COINS);
  });

  it("還沒回來、發過了、睡覺、太短、太久以前的都不發", () => {
    expect(workPay(undefined, "", now)).toBe(0);
    expect(workPay(away(2, { endedAt: undefined }), "", now)).toBe(0);
    expect(workPay(away(2), "a1", now)).toBe(0);
    expect(workPay(away(2, { kind: "sleep" }), "", now)).toBe(0);
    expect(workPay(away(0.1), "", now)).toBe(0);
    expect(workPay(away(2), "", now + 25 * 3_600_000)).toBe(0);
  });

  it("舊資料沒有種類的當作暫離，照發", () => {
    expect(workPay(away(1, { kind: undefined }), "", now)).toBe(30);
  });
});

describe("番茄鐘、健身的獎勵", () => {
  const now = new Date(2026, 10, 12, 15);
  it("今天做了、還沒領的才有", () => {
    expect(deedsToClaim({ pomodoro: "2026-11-12", fitness: "2026-11-11" }, {}, now)).toEqual(["pomodoro"]);
    expect(deedsToClaim({ pomodoro: "2026-11-12" }, { "deed:pomodoro": 1 }, now)).toEqual([]);
    expect(deedsToClaim({}, {}, now)).toEqual([]);
  });
});
