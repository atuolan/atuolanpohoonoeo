import { describe, expect, it } from "vitest";
import { DEFAULT_DOLL_LOOK, describeDollLook, normalizeDollLook, shade } from "../dollWardrobe";

describe("normalizeDollLook", () => {
  it("壞資料補預設", () => {
    expect(normalizeDollLook(undefined)).toEqual(DEFAULT_DOLL_LOOK);
    const look = normalizeDollLook({ hair: "不存在", hairColor: "red", tune: { hairY: 99 } });
    expect(look.hair).toBe(DEFAULT_DOLL_LOOK.hair);
    expect(look.hairColor).toBe(DEFAULT_DOLL_LOOK.hairColor);
    expect(look.tune.hairY).toBe(8);
  });
});

describe("describeDollLook", () => {
  it("連身的上衣不提下身", () => {
    expect(describeDollLook({ ...DEFAULT_DOLL_LOOK, top: "maid", accessory: "catears" })).toBe("娃娃穿著女僕裝，戴著貓耳");
    expect(describeDollLook({ ...DEFAULT_DOLL_LOOK, top: "sailor", bottom: "skirt" })).toBe("娃娃穿著水手服配百褶裙");
    expect(describeDollLook({ ...DEFAULT_DOLL_LOOK, top: "none", bottom: "none" })).toBe("娃娃什麼都沒穿");
  });
});

describe("shade", () => {
  it("變亮、變暗", () => {
    expect(shade("#808080", 0.5)).toBe("#c0c0c0");
    expect(shade("#808080", -0.5)).toBe("#404040");
  });
});
