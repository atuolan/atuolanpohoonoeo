import { describe, expect, it } from "vitest";
import {
  applyLedgerEntry,
  applyPeekSpending,
  createCharWallet,
  makeLedgerEntry,
  revertLedgerEntry,
  roughAmountText,
  settleIncome,
  storyDayOf,
  walletPromptLine,
} from "./charWalletLogic";

const day = (s: string, hour = 12) => new Date(`${s}T${String(hour).padStart(2, "0")}:00:00`).getTime();

const wallet = (balance = 10000, monthlyIncome = 30000) =>
  createCharWallet({
    characterId: "c1",
    balance,
    monthlyIncome,
    initializedFrom: "default",
    storyNowMs: day("2026-11-01"),
    realNow: 1,
  });

describe("settleIncome", () => {
  it("過一天發一天的收入", () => {
    const w = settleIncome(wallet(), day("2026-11-02"));
    expect(w.balance).toBe(11000);
    expect(w.lastPaidStoryDay).toBe("2026-11-02");
    expect(w.ledger[0]).toMatchObject({ kind: "income", amount: 1000 });
  });

  it("同一天不重複發", () => {
    const once = settleIncome(wallet(), day("2026-11-02", 9));
    const twice = settleIncome(once, day("2026-11-02", 23));
    expect(twice.balance).toBe(11000);
    expect(twice.ledger).toHaveLength(1);
  });

  it("一次最多補 30 天", () => {
    const w = settleIncome(wallet(0), day("2027-03-01"));
    expect(w.balance).toBe(30000);
    expect(w.ledger[0].description).toBe("收入（30 天）");
  });

  it("劇情時間往回跳不發也不倒扣，日期維持", () => {
    const w = settleIncome(wallet(), day("2026-10-20"));
    expect(w.balance).toBe(10000);
    expect(w.lastPaidStoryDay).toBe("2026-11-01");
  });

  it("跨月份也算對天數", () => {
    const w = createCharWallet({ characterId: "c", balance: 0, monthlyIncome: 3000, initializedFrom: "default", storyNowMs: day("2026-12-30") });
    expect(settleIncome(w, day("2027-01-02")).balance).toBe(300);
  });
});

describe("收支", () => {
  it("記帳改餘額、新的在前、不會變負數", () => {
    let w = wallet(500);
    w = applyLedgerEntry(w, makeLedgerEntry({ amount: -200, kind: "to_user", description: "轉帳", storyNowMs: 0 }));
    w = applyLedgerEntry(w, makeLedgerEntry({ amount: -9999, kind: "to_user", description: "轉帳", storyNowMs: 0 }));
    expect(w.balance).toBe(0);
    expect(w.ledger[0].amount).toBe(-9999);
  });

  it("撤銷一筆會把錢還原", () => {
    const entry = makeLedgerEntry({ amount: -300, kind: "to_user", description: "轉帳", storyNowMs: 0 });
    const w = revertLedgerEntry(applyLedgerEntry(wallet(1000), entry), entry.id);
    expect(w.balance).toBe(1000);
    expect(w.ledger).toHaveLength(0);
  });
});

describe("applyPeekSpending", () => {
  it("只扣支出；同一個劇情日重新生成不再扣", () => {
    const txs = [
      { description: "午餐", amount: -200 },
      { description: "薪水", amount: 50000 },
    ];
    const first = applyPeekSpending(wallet(10000), txs, day("2026-11-02"));
    expect(first.wallet.balance).toBe(9800);
    expect(first.spent).toBe(200);
    const sameDay = applyPeekSpending(first.wallet, [{ description: "晚餐", amount: -500 }], day("2026-11-02", 20));
    expect(sameDay.wallet.balance).toBe(9800);
    const nextDay = applyPeekSpending(first.wallet, [{ description: "晚餐", amount: -500 }], day("2026-11-03"));
    expect(nextDay.wallet.balance).toBe(9300);
  });

  it("一次最多扣到餘額的一半，照比例縮小", () => {
    const txs = [
      { description: "包包", amount: -8000 },
      { description: "鞋子", amount: -2000 },
    ];
    const { wallet: w, spent } = applyPeekSpending(wallet(10000), txs, day("2026-11-02"));
    expect(spent).toBe(5000);
    expect(w.balance).toBe(5000);
  });
});

describe("給 AI 看的文字", () => {
  it("四捨五入成好讀的金額", () => {
    expect(roughAmountText(42_350)).toBe("約 4.2 萬");
    expect(roughAmountText(8_470)).toBe("約 8,500 元");
    expect(roughAmountText(320)).toBe("約 320 元");
    expect(roughAmountText(3_250_000)).toBe("約 325 萬");
    expect(roughAmountText(250_000_000)).toBe("約 2.5 億");
  });

  it("一行就說完餘額和月收入", () => {
    expect(walletPromptLine(wallet(42_000, 60_000), "阿光")).toBe("阿光 帳戶餘額：約 4.2 萬（月收入約 6 萬）");
  });

  it("storyDayOf 用本地日期", () => {
    expect(storyDayOf(day("2026-11-04", 23))).toBe("2026-11-04");
  });
});
