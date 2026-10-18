import { describe, expect, it } from "vitest";
import { buildCaughtNote, peekSecretEventContent, rollStealth, stealthDC } from "@/utils/peekLinks";

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
  /** 讓 d20 擲出指定點數 */
  const die = (n: number) => () => (n - 1) / 20;

  it("找到越多、翻越多越難，最高 18", () => {
    expect(stealthDC(0, 1)).toBe(7);
    expect(stealthDC(2, 4)).toBe(14);
    expect(stealthDC(10, 9)).toBe(18);
  });

  it("到難度以上沒被發現；少 1–3 點他起疑；再低被發現", () => {
    // DC 12
    expect(rollStealth(2, 2, die(12)).outcome).toBe("safe");
    expect(rollStealth(2, 2, die(9)).outcome).toBe("suspicious");
    expect(rollStealth(2, 2, die(8)).outcome).toBe("caught");
  });

  it("20 大成功、1 大失敗，不看難度", () => {
    expect(rollStealth(10, 10, die(20))).toEqual({ roll: 20, dc: 18, outcome: "safe", critical: "success" });
    expect(rollStealth(0, 0, die(1))).toEqual({ roll: 1, dc: 6, outcome: "caught", critical: "fail" });
  });
});
