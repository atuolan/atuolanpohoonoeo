/**
 * 小屋的錢：用跟商店、遊戲同一個錢包（gameEconomy 的 "global"）。
 * 花錢（換外觀、擺件）記一筆商店支出；賺錢（家事、他留的東西…）記一筆工作收入。
 */
import { useGameEconomyStore } from "@/stores/gameEconomy";
import { todayLedger, type Ledger } from "./houseTodo";
import { WARDROBE_WALLET_ID } from "./wardrobeData";

export async function loadWardrobeBalance(): Promise<number> {
  const store = useGameEconomyStore();
  await store.loadState(WARDROBE_WALLET_ID);
  return store.getBalance(WARDROBE_WALLET_ID);
}

export type PayResult = { ok: true; balance: number } | { ok: false; error: "insufficient_funds" | "failed" };

/** 扣錢並立刻存檔；金額 0 直接成功 */
export async function payCoins(amount: number, description: string, itemId: string): Promise<PayResult> {
  const store = useGameEconomyStore();
  await store.loadState(WARDROBE_WALLET_ID);
  if (amount <= 0) return { ok: true, balance: store.getBalance(WARDROBE_WALLET_ID) };
  const r = store.spendMoney(WARDROBE_WALLET_ID, amount, "shop", description, itemId);
  if (!r.success) return { ok: false, error: r.error === "insufficient_funds" ? "insufficient_funds" : "failed" };
  await store.saveState(WARDROBE_WALLET_ID);
  return { ok: true, balance: store.getBalance(WARDROBE_WALLET_ID) };
}

/** 小屋裡賺到的錢：進同一個錢包並立刻存檔；金額 0 以下不算。回傳新的餘額，失敗回傳 null */
export async function earnCoins(amount: number, description: string, sourceId: string): Promise<number | null> {
  if (!(amount > 0)) return null;
  const store = useGameEconomyStore();
  await store.loadState(WARDROBE_WALLET_ID);
  const r = store.earnMoney(WARDROBE_WALLET_ID, Math.floor(amount), "work", description, sourceId);
  if (!r.success) return null;
  await store.saveState(WARDROBE_WALLET_ID);
  return store.getBalance(WARDROBE_WALLET_ID);
}

/** 今天在小屋賺了多少、花了多少（從錢包紀錄算）。讀不到回傳 null */
export async function loadTodayLedger(now: Date = new Date()): Promise<Ledger | null> {
  try {
    const store = useGameEconomyStore();
    await store.loadState(WARDROBE_WALLET_ID);
    return todayLedger(store.getTransactions(WARDROBE_WALLET_ID), now);
  } catch {
    return null;
  }
}
