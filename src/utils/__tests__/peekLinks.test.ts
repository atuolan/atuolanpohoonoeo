import { describe, expect, it } from "vitest";
import { buildCaughtNote, peekSecretEventContent, rollInterrupt, rollStealth, stealthDC } from "@/utils/peekLinks";

const found = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ key: `k${i}`, label: `秘密${i}`, detail: i === 0 ? "" : `內容${i}` }));

describe("被他發現的那筆", () => {
  it("沒找到秘密也算被發現", () => {
    expect(buildCaughtNote([], "小栩", "沈既白")).toBe("小栩剛剛偷看了沈既白的手機，被沈既白發現了。");
  });

  it("列出看到的，最多 5 個", () => {
    const note = buildCaughtNote(found(7), "小栩", "沈既白");
    expect(note).toContain("看到了：\n・秘密0\n・秘密1：內容1");
    expect(note).toContain("・秘密4：內容4");
    expect(note).not.toContain("秘密5");
    expect(note).toContain("……還有 2 個");
  });

  it("記進記憶的句子", () => {
    expect(peekSecretEventContent({ key: "k", label: "鎖屏密碼 0912", detail: "第一次見面" }, "小栩", "沈既白")).toBe(
      "小栩偷看沈既白的手機，知道了「鎖屏密碼 0912」：第一次見面",
    );
  });
});

describe("隱匿檢定", () => {
  /** 讓骰子擲出指定點數 */
  const die = (n: number, sides = 20) => () => (n - 1) / sides;

  it("找到越多秘密越難，最高 18", () => {
    expect(stealthDC(0)).toBe(5);
    expect(stealthDC(2)).toBe(9);
    expect(stealthDC(10)).toBe(18);
  });

  it("到難度以上沒被發現；少 1–3 點他起疑；再低被發現", () => {
    // DC 9
    expect(rollStealth(2, die(9)).outcome).toBe("safe");
    expect(rollStealth(2, die(6)).outcome).toBe("suspicious");
    expect(rollStealth(2, die(5)).outcome).toBe("caught");
  });

  it("20 大成功、1 大失敗，不看難度", () => {
    expect(rollStealth(10, die(20))).toEqual({ sides: 20, roll: 20, dc: 18, outcome: "safe", critical: "success" });
    expect(rollStealth(0, die(1))).toEqual({ sides: 20, roll: 1, dc: 5, outcome: "caught", critical: "fail" });
  });

  it("偷看中：d100 擲到 3 以下他回來了", () => {
    expect(rollInterrupt(die(3, 100))).toEqual({ sides: 100, roll: 3, dc: 3, outcome: "caught", interrupted: true });
    expect(rollInterrupt(die(4, 100))).toBeNull();
  });
});
