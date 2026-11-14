import { describe, expect, it } from "vitest";
import { formatCoins, formatCoinsShortfall, wholeCoins } from "./coins";

describe("金幣顯示只顯示整數", () => {
  it("餘額無條件捨去", () => {
    expect(formatCoins(393135.25)).toBe("393,135");
    expect(formatCoins(99.99)).toBe("99");
    expect(wholeCoins(100)).toBe(100);
  });

  it("小數誤差不會少算 1", () => {
    expect(wholeCoins(0.1 + 0.2 + 99.7)).toBe(100);
  });

  it("還差多少無條件進位", () => {
    expect(formatCoinsShortfall(810.75)).toBe("811");
    expect(formatCoinsShortfall(0.25)).toBe("1");
    expect(formatCoinsShortfall(30)).toBe("30");
  });

  it("負數（付款後不夠）也只顯示整數", () => {
    expect(formatCoins(-810.75)).toBe("-811");
  });

  it("壞掉的數字當 0", () => {
    expect(formatCoins(Number.NaN)).toBe("0");
  });
});
