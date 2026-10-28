import { describe, expect, it } from "vitest";
import {
  addDollTouch,
  describeDollTouches,
  dollPromptNote,
  dollRoundOf,
  DOLL_ROUND_WINDOW_MS,
  strengthOf,
  zonesFor,
} from "../empathyDoll";

describe("strengthOf", () => {
  it("點一下輕、按住中、按久重", () => {
    expect(strengthOf(100)).toBe("light");
    expect(strengthOf(1000)).toBe("medium");
    expect(strengthOf(3000)).toBe("strong");
  });
});

describe("addDollTouch / describeDollTouches", () => {
  it("同動作同部位合併，按住時間累加、強度取最強", () => {
    let list = addDollTouch([], { action: "pinch", zone: "cheek", holdMs: 100 });
    list = addDollTouch(list, { action: "pinch", zone: "cheek", holdMs: 200 });
    list = addDollTouch(list, { action: "stroke", zone: "waist", holdMs: 3000 });
    list = addDollTouch(list, { action: "stroke", zone: "waist", holdMs: 3200 });
    list = addDollTouch(list, { action: "hug", zone: "whole", holdMs: 1200 });
    expect(describeDollTouches(list)).toBe("捏臉頰 ×2、摸腰 ×2 6 秒（重）、抱住娃娃 1 秒（中）");
  });
});

describe("zonesFor", () => {
  it("沒開親密時只有一般部位", () => {
    expect(zonesFor(false).some((z) => z.intimate)).toBe(false);
    expect(zonesFor(true).some((z) => z.id === "groin")).toBe(true);
    expect(zonesFor(false).map((z) => z.id)).toEqual(["head", "ear", "cheek", "hand", "belly", "foot"]);
    expect(zonesFor(true).map((z) => z.id)).toContain("nipple");
  });
});

describe("dollRoundOf / dollPromptNote", () => {
  it("只算 30 分鐘內的娃娃訊息", () => {
    const now = 10 * DOLL_ROUND_WINDOW_MS;
    const msgs = [
      { isDollTouch: true, timestamp: now - DOLL_ROUND_WINDOW_MS - 1 },
      { isDollTouch: true, timestamp: now - 60_000 },
      { timestamp: now },
    ];
    expect(dollRoundOf(msgs, now)).toBe(2);
    const names = { userName: "小雨", charName: "言澈" };
    expect(dollPromptNote(names, 1)).not.toContain("第");
    expect(dollPromptNote(names, 3)).toContain("言澈 的身體同時感覺得到；這是 30 分鐘內第 3 次");
    expect(dollPromptNote(names, 1, "娃娃穿著女僕裝")).toBe(
      "（娃娃穿著女僕裝；小雨 對共感娃娃做了這些，言澈 的身體同時感覺得到）",
    );
  });
});
