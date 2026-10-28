import { describe, expect, it } from "vitest";
import {
  checkOutcome,
  diceCommandFromTag,
  formatDiceRoll,
  parseDiceCommand,
  rollExpression,
  runDiceCommand,
} from "../diceRoller";

/** 依序回傳指定點數的假亂數（sides 面骰要擲出 n，就給 (n-1)/sides） */
function fixedRng(values: Array<[number, number]>): () => number {
  let i = 0;
  return () => {
    const [n, sides] = values[i++];
    return (n - 1) / sides;
  };
}

describe("parseDiceCommand", () => {
  it("不是指令就回傳 null", () => {
    expect(parseDiceCommand("你好")).toBeNull();
    expect(parseDiceCommand(".rest")).toBeNull();
    expect(parseDiceCommand(".rabbit")).toBeNull();
    expect(parseDiceCommand("r 2d6")).toBeNull();
  });

  it(".r 沒帶算式就是 1D100，後面的字是原因", () => {
    expect(parseDiceCommand(".r")).toEqual({ kind: "roll", expr: "d", reason: undefined });
    expect(parseDiceCommand(".r 攻擊")).toEqual({ kind: "roll", expr: "d", reason: "攻擊" });
  });

  it("算式和原因分開，全形句點也可以", () => {
    expect(parseDiceCommand(".r 2d6 + 3 攻擊")).toEqual({ kind: "roll", expr: "2d6+3", reason: "攻擊" });
    expect(parseDiceCommand("。r3d6")).toEqual({ kind: "roll", expr: "3d6", reason: undefined });
    expect(parseDiceCommand("．R 1D20")).toEqual({ kind: "roll", expr: "1D20", reason: undefined });
  });

  it(".rd 是預設骰，.rd20 是 d20", () => {
    expect(parseDiceCommand(".rd")).toEqual({ kind: "roll", expr: "d", reason: undefined });
    expect(parseDiceCommand(".rd20 先攻")).toEqual({ kind: "roll", expr: "d20", reason: "先攻" });
  });

  it(".ra / .rc 技能檢定抓技能名和數值", () => {
    expect(parseDiceCommand(".ra 偵查 60")).toEqual({ kind: "check", reason: "偵查", target: 60 });
    expect(parseDiceCommand("。rc聆聽50")).toEqual({ kind: "check", reason: "聆聽", target: 50 });
    expect(parseDiceCommand(".ra 幸運")).toEqual({ kind: "check", reason: "幸運", target: undefined });
  });

  it(".help", () => {
    expect(parseDiceCommand(".help")).toEqual({ kind: "help" });
  });
});

describe("rollExpression", () => {
  it("多顆骰子加常數", () => {
    const r = rollExpression("2d6+3", fixedRng([[3, 6], [5, 6]]));
    expect(r).toEqual({ expr: "2D6+3", detail: "[3,5]+3", total: 11 });
  });

  it("一顆骰子不寫明細", () => {
    expect(rollExpression("d", fixedRng([[37, 100]]))).toEqual({ expr: "D100", detail: "", total: 37 });
  });

  it("減號", () => {
    expect(rollExpression("1d20-2", fixedRng([[10, 20]]))).toEqual({ expr: "D20-2", detail: "10-2", total: 8 });
  });

  it("骰子太多或面數不合法回傳 null", () => {
    expect(rollExpression("101d6")).toBeNull();
    expect(rollExpression("1d0")).toBeNull();
    expect(rollExpression("1d1001")).toBeNull();
    expect(rollExpression("abc")).toBeNull();
  });
});

describe("checkOutcome", () => {
  it("CoC 7 版成功等級", () => {
    expect(checkOutcome(1, 60)).toBe("critical");
    expect(checkOutcome(100, 60)).toBe("fumble");
    expect(checkOutcome(97, 40)).toBe("fumble");
    expect(checkOutcome(97, 60)).toBe("failure");
    expect(checkOutcome(12, 60)).toBe("extreme");
    expect(checkOutcome(30, 60)).toBe("hard");
    expect(checkOutcome(60, 60)).toBe("success");
    expect(checkOutcome(61, 60)).toBe("failure");
  });
});

describe("runDiceCommand + formatDiceRoll", () => {
  it("技能檢定", () => {
    const data = runDiceCommand({ kind: "check", reason: "偵查", target: 60 }, "小明", fixedRng([[37, 100]]))!;
    expect(data.outcome).toBe("success");
    expect(formatDiceRoll(data)).toBe("🎲 小明 進行偵查檢定：D100=37/60 成功");
  });

  it("沒有數值的檢定只顯示點數", () => {
    const data = runDiceCommand({ kind: "check", reason: "幸運" }, "小明", fixedRng([[37, 100]]))!;
    expect(formatDiceRoll(data)).toBe("🎲 小明 擲骰（幸運）：D100=37");
  });

  it("一般擲骰", () => {
    const data = runDiceCommand({ kind: "roll", expr: "2d6+3", reason: "攻擊" }, "小明", fixedRng([[3, 6], [5, 6]]))!;
    expect(formatDiceRoll(data)).toBe("🎲 小明 擲骰（攻擊）：2D6+3=[3,5]+3=11");
  });

  it("算式不合法回傳 null", () => {
    expect(runDiceCommand({ kind: "roll", expr: "999d6" }, "小明")).toBeNull();
  });
});

describe("diceCommandFromTag", () => {
  it("有 target 是檢定，沒有就照 expr", () => {
    expect(diceCommandFromTag({ reason: "聆聽", target: "50" })).toEqual({ kind: "check", reason: "聆聽", target: 50 });
    expect(diceCommandFromTag({ expr: "1d6", reason: "傷害" })).toEqual({ kind: "roll", expr: "1d6", reason: "傷害" });
    expect(diceCommandFromTag({})).toEqual({ kind: "roll", expr: "d", reason: undefined });
  });
});
