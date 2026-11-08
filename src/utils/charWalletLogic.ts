/**
 * 角色帳戶的計算（純函式，不碰資料庫）
 */
import type { CharLedgerEntry, CharLedgerKind, CharWallet } from "@/types/charWallet";

/** 收支最多留幾筆 */
export const CHAR_LEDGER_MAX = 100;
/** 收入一次最多補幾天 */
export const CHAR_INCOME_MAX_CATCHUP_DAYS = 30;
/** 估不出來時的預設存款、月收入 */
export const CHAR_WALLET_DEFAULT_BALANCE = 30000;
export const CHAR_WALLET_DEFAULT_MONTHLY_INCOME = 30000;

/** 劇情日期 YYYY-MM-DD（本地時區） */
export function storyDayOf(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** 兩個劇情日期差幾天（b - a） */
export function daysBetween(a: string, b: string): number {
  const toUtc = (s: string) => {
    const [y, m, d] = s.split("-").map(Number);
    return Date.UTC(y, (m || 1) - 1, d || 1);
  };
  return Math.round((toUtc(b) - toUtc(a)) / 86_400_000);
}

export function dailyIncomeOf(monthlyIncome: number): number {
  return Math.max(0, Math.round(monthlyIncome / 30));
}

export function newLedgerId(): string {
  return `cle_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function createCharWallet(options: {
  characterId: string;
  balance: number;
  monthlyIncome: number;
  incomeNote?: string;
  initializedFrom: CharWallet["initializedFrom"];
  storyNowMs: number;
  realNow?: number;
}): CharWallet {
  return {
    characterId: options.characterId,
    balance: Math.max(0, Math.round(options.balance)),
    monthlyIncome: Math.max(0, Math.round(options.monthlyIncome)),
    incomeNote: options.incomeNote,
    lastPaidStoryDay: storyDayOf(options.storyNowMs),
    ledger: [],
    initializedFrom: options.initializedFrom,
    updatedAt: options.realNow ?? Date.now(),
  };
}

/** 記一筆收支：改餘額、加進紀錄（新的在前，最多 CHAR_LEDGER_MAX 筆） */
export function applyLedgerEntry(wallet: CharWallet, entry: CharLedgerEntry): CharWallet {
  return {
    ...wallet,
    balance: Math.max(0, Math.round(wallet.balance + entry.amount)),
    ledger: [entry, ...wallet.ledger].slice(0, CHAR_LEDGER_MAX),
    updatedAt: entry.realTime,
  };
}

export function makeLedgerEntry(options: {
  amount: number;
  kind: CharLedgerKind;
  description: string;
  storyNowMs: number;
  realNow?: number;
  chatId?: string;
  messageId?: string;
}): CharLedgerEntry {
  return {
    id: newLedgerId(),
    amount: Math.round(options.amount),
    kind: options.kind,
    description: options.description,
    storyTime: options.storyNowMs,
    realTime: options.realNow ?? Date.now(),
    chatId: options.chatId,
    messageId: options.messageId,
  };
}

/**
 * 補發收入：劇情日期比上次入帳晚幾天就發幾天（最多 30 天），一天一筆合成一筆紀錄。
 * 劇情時間往回跳時不發也不倒扣，上次入帳日期維持不變。
 */
export function settleIncome(
  wallet: CharWallet,
  storyNowMs: number,
  realNow: number = Date.now(),
): CharWallet {
  const today = storyDayOf(storyNowMs);
  const days = daysBetween(wallet.lastPaidStoryDay, today);
  if (days <= 0) return wallet;
  const paidDays = Math.min(days, CHAR_INCOME_MAX_CATCHUP_DAYS);
  const amount = dailyIncomeOf(wallet.monthlyIncome) * paidDays;
  const advanced = { ...wallet, lastPaidStoryDay: today };
  if (amount <= 0) return advanced;
  return applyLedgerEntry(
    advanced,
    makeLedgerEntry({
      amount,
      kind: "income",
      description: paidDays === 1 ? "收入" : `收入（${paidDays} 天）`,
      storyNowMs,
      realNow,
    }),
  );
}

/** 撤銷某筆收支（換掉回覆時用）：反向調整餘額、從紀錄移除 */
export function revertLedgerEntry(wallet: CharWallet, entryId: string, realNow = Date.now()): CharWallet {
  const entry = wallet.ledger.find((e) => e.id === entryId);
  if (!entry) return wallet;
  return {
    ...wallet,
    balance: Math.max(0, Math.round(wallet.balance - entry.amount)),
    ledger: wallet.ledger.filter((e) => e.id !== entryId),
    updatedAt: realNow,
  };
}

/** 「約 4.2 萬」「約 8,500 元」：給 AI 看，不寫精確數字 */
export function roughAmountText(amount: number): string {
  const n = Math.max(0, Math.round(amount));
  if (n >= 100_000_000) return `約 ${trimDecimal(n / 100_000_000)} 億`;
  if (n >= 10_000) return `約 ${trimDecimal(n / 10_000)} 萬`;
  if (n >= 1_000) return `約 ${(Math.round(n / 100) * 100).toLocaleString("en-US")} 元`;
  return `約 ${n} 元`;
}

function trimDecimal(value: number): string {
  const rounded = value >= 100 ? Math.round(value) : Math.round(value * 10) / 10;
  return String(rounded);
}

/** 每輪給 AI 的一行 */
export function walletPromptLine(wallet: CharWallet, charName: string): string {
  const income = wallet.monthlyIncome > 0 ? `（月收入${roughAmountText(wallet.monthlyIncome)}）` : "";
  return `${charName} 帳戶餘額：${roughAmountText(wallet.balance)}${income}`;
}

export interface PeekSpendingResult {
  wallet: CharWallet;
  /** 實際扣掉的金額（正數） */
  spent: number;
}

/**
 * 偷窺手機裡 AI 寫的消費：一個劇情日只扣一次（同一天重新生成不再扣）；
 * 支出加總最多扣到目前餘額的一半，超過就照比例縮小。
 * AI 寫的入帳不算數（收入由帳戶自己發）。
 */
export function applyPeekSpending(
  wallet: CharWallet,
  transactions: Array<{ description: string; amount: number }>,
  storyNowMs: number,
  realNow: number = Date.now(),
): PeekSpendingResult {
  const today = storyDayOf(storyNowMs);
  if (wallet.lastPeekSpendDay === today) return { wallet, spent: 0 };

  const outgoing = transactions.filter((t) => Number.isFinite(t?.amount) && t.amount < 0);
  const totalOut = outgoing.reduce((sum, t) => sum - t.amount, 0);
  const cap = Math.floor(wallet.balance / 2);
  const scale = totalOut > cap && totalOut > 0 ? cap / totalOut : 1;

  let next: CharWallet = { ...wallet, lastPeekSpendDay: today };
  let spent = 0;
  for (const t of outgoing) {
    const amount = Math.round(-t.amount * scale);
    if (amount <= 0) continue;
    spent += amount;
    next = applyLedgerEntry(
      next,
      makeLedgerEntry({ amount: -amount, kind: "daily", description: t.description || "消費", storyNowMs, realNow }),
    );
  }
  return { wallet: next, spent };
}
