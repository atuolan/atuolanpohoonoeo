import { describe, expect, it } from "vitest";
import { parseNumberInput } from "../numberInput";

const opts = { count: 3, max: 78 };

describe("parseNumberInput", () => {
  it.each(["1,5,7", "1 5 7", "1，5、7", " 1 , 5 ,7 "])("解析 %s", (s) => {
    expect(parseNumberInput(s, opts)).toEqual({ ok: true, numbers: [1, 5, 7] });
  });

  it("支援範圍", () => {
    expect(parseNumberInput("1-3", opts)).toEqual({ ok: true, numbers: [1, 2, 3] });
    expect(parseNumberInput("4~6", opts)).toEqual({ ok: true, numbers: [4, 5, 6] });
  });

  it("空白", () => {
    expect(parseNumberInput("  ", opts)).toEqual({
      ok: false,
      error: "請輸入 3 個數字（例如：1,5,7）",
    });
  });

  it("看不懂的內容", () => {
    expect(parseNumberInput("1,a,3", opts)).toEqual({
      ok: false,
      error: "看不懂「a」，請用數字、逗號或空白分隔",
    });
  });

  it("超出範圍", () => {
    expect(parseNumberInput("0,5,80", opts)).toEqual({
      ok: false,
      error: "數字必須在 1～78 之間：0、80",
    });
  });

  it("重複", () => {
    expect(parseNumberInput("5,5,7", opts)).toEqual({ ok: false, error: "數字重複了：5" });
  });

  it("數量不符", () => {
    expect(parseNumberInput("1,2", opts)).toEqual({
      ok: false,
      error: "這個牌陣需要 3 個數字，你輸入了 2 個",
    });
  });
});
