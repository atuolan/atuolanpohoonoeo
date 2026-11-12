import { describe, expect, it } from "vitest";
import { clockWentBack, countDaily, dailyLeft, dayKey, defaultHouseLifeState, parseHouseLifeState, payCapped, rollDay, type HouseLifeState } from "./houseLife";

const at = (d: number, h = 12, min = 0) => new Date(2026, 10, d, h, min, 0);
const mk = (patch: Partial<HouseLifeState>): HouseLifeState => ({ ...defaultHouseLifeState(at(12)), ...patch });

describe("小屋生活存檔", () => {
  it("日期用當地時間", () => {
    expect(dayKey(new Date(2026, 0, 5, 23, 59))).toBe("2026-01-05");
    expect(dayKey(new Date(2026, 0, 6, 0, 0))).toBe("2026-01-06");
  });

  it("讀不到、格式不對的用預設值", () => {
    const now = at(12);
    expect(parseHouseLifeState(null, now)).toEqual(defaultHouseLifeState(now));
    expect(parseHouseLifeState("壞掉", now)).toEqual(defaultHouseLifeState(now));
    const s = parseHouseLifeState({ day: "不是日期", daily: { pat: 3.7, bad: "x", neg: -1, nan: NaN }, lastSeenAt: "x" }, now);
    expect(s.day).toBe("2026-11-12");
    expect(s.daily).toEqual({ pat: 3 });
    expect(s.lastSeenAt).toBe(now.getTime());
  });

  it("換日清掉每日次數，同一天不動", () => {
    const s = mk({ day: "2026-11-12", daily: { pat: 5 }, lastSeenAt: at(12).getTime() });
    expect(rollDay(s, at(12, 23, 59))).toBe(s);
    expect(rollDay(s, at(13, 0, 1))).toEqual({ ...s, day: "2026-11-13", daily: {} });
  });

  it("很久沒開：直接跳到今天", () => {
    const s = mk({ day: "2026-11-01", daily: { pat: 5 }, lastSeenAt: at(1).getTime() });
    expect(rollDay(s, at(20)).day).toBe("2026-11-20");
  });

  it("每日上限：到了就不能再做", () => {
    let s = defaultHouseLifeState(at(12));
    for (let i = 0; i < 3; i++) {
      const next = countDaily(s, "gift", 3, at(12, 12, i + 1));
      expect(next).not.toBeNull();
      s = next!;
    }
    expect(dailyLeft(s, "gift", 3)).toBe(0);
    expect(countDaily(s, "gift", 3, at(12, 13))).toBeNull();
    // 別的事不受影響
    expect(countDaily(s, "pat", 3, at(12, 13))).not.toBeNull();
    // 隔天又可以
    expect(countDaily(s, "gift", 3, at(13, 9))?.daily).toEqual({ gift: 1 });
  });

  it("一次做好幾次：剩的不夠就整個不算", () => {
    const s = mk({ day: "2026-11-12", daily: { clean: 380 }, lastSeenAt: at(12).getTime() });
    expect(countDaily(s, "clean", 400, at(12, 13), 30)).toBeNull();
    expect(countDaily(s, "clean", 400, at(12, 13), 20)?.daily.clean).toBe(400);
  });

  it("手機時間往回調：不換日、不能做", () => {
    const s = { day: "2026-11-12", daily: { gift: 3 }, lastSeenAt: at(12, 20).getTime(), gifts: [] };
    expect(clockWentBack(s, at(11, 9))).toBe(true);
    expect(rollDay(s, at(11, 9))).toBe(s);
    expect(countDaily(s, "gift", 3, at(11, 9))).toBeNull();
    // 差不到一分鐘不算往回調
    expect(clockWentBack(s, new Date(at(12, 20).getTime() - 30_000))).toBe(false);
  });

  it("有上限的錢：剩多少發多少，領完是 0", () => {
    const s = mk({ day: "2026-11-12", daily: { cleanCoins: 390 }, lastSeenAt: at(12).getTime() });
    const a = payCapped(s, "cleanCoins", 400, 25, at(12, 13));
    expect(a.paid).toBe(10);
    expect(a.state.daily.cleanCoins).toBe(400);
    expect(payCapped(a.state, "cleanCoins", 400, 25, at(12, 14)).paid).toBe(0);
    // 隔天重新算
    expect(payCapped(a.state, "cleanCoins", 400, 25, at(13, 9)).paid).toBe(25);
    // 時間往回調不發
    expect(payCapped(a.state, "cleanCoins", 400, 25, at(11, 9)).paid).toBe(0);
  });

  it("第一次打開：髒污從幾個小時前算起（一打開就有得掃）", () => {
    const s = defaultHouseLifeState(at(12));
    expect(s.dirt).toEqual({});
    expect(s.dirtAt).toBeLessThan(at(12).getTime());
  });
});
