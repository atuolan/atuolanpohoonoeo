/**
 * 角色帳戶：讀寫、建立、扣款入帳
 *
 * - 帳戶跟著角色走（charWallets 表，key 是 characterId）
 * - 第一次用到才建立：有偷窺手機的餘額就用那份，沒有先給預設值，背景再請 AI 依角色卡估一次
 * - 每次扣款入帳前先補發收入（依那個聊天的劇情日期）
 * - 同一個角色的寫入排隊做，避免兩邊同時改互相蓋掉
 */
import { OpenAICompatibleClient } from "@/api/OpenAICompatible";
import { db, DB_STORES } from "@/db/database";
import { useCharactersStore } from "@/stores/characters";
import { useSettingsStore } from "@/stores/settings";
import type { Chat } from "@/types/chat";
import type { CharLedgerEntry, CharLedgerKind, CharWallet } from "@/types/charWallet";
import type { PeekPhoneData } from "@/types/peekPhone";
import {
  CHAR_WALLET_DEFAULT_BALANCE,
  CHAR_WALLET_DEFAULT_MONTHLY_INCOME,
  applyLedgerEntry,
  createCharWallet,
  makeLedgerEntry,
  revertLedgerEntry,
  roughAmountText,
  settleIncome,
} from "@/utils/charWalletLogic";
import { computeChatNow } from "@/utils/fakeTime";
import { pickGenerationToggles } from "@/utils/generationToggles";

export const CHAR_WALLET_CHANGED_EVENT = "aguaphone:char-wallet-changed";

export interface CharWalletChangedDetail {
  characterId: string;
  wallet: CharWallet;
}

/** 收入算到哪一天用的劇情時間；輪迴時間會一直回到同幾天，改用現實時間 */
export function storyNowForChat(chat: Partial<Chat> | null | undefined, realNow = Date.now()): number {
  if (!chat || chat.fakeTimeMode === "loop") return realNow;
  return computeChatNow(chat as Chat, new Date(realNow)).getTime();
}

// ===== 排隊寫入 =====

const queues = new Map<string, Promise<unknown>>();

function withWalletLock<T>(characterId: string, task: () => Promise<T>): Promise<T> {
  const prev = queues.get(characterId) ?? Promise.resolve();
  const next = prev.catch(() => undefined).then(task);
  queues.set(characterId, next);
  void next.finally(() => {
    if (queues.get(characterId) === next) queues.delete(characterId);
  });
  return next;
}

// ===== 讀寫 =====

export async function loadCharWallet(characterId: string): Promise<CharWallet | null> {
  if (!characterId) return null;
  await db.init();
  return (await db.get<CharWallet>(DB_STORES.CHAR_WALLETS, characterId)) ?? null;
}

async function saveCharWallet(wallet: CharWallet): Promise<void> {
  await db.put(DB_STORES.CHAR_WALLETS, JSON.parse(JSON.stringify(wallet)));
  try {
    window.dispatchEvent(
      new CustomEvent<CharWalletChangedDetail>(CHAR_WALLET_CHANGED_EVENT, {
        detail: { characterId: wallet.characterId, wallet },
      }),
    );
  } catch {
    // 非瀏覽器環境
  }
}

// ===== 建立 =====

/** 這個角色最近一次偷窺手機寫的餘額 */
async function latestPeekBalance(characterId: string): Promise<number | null> {
  try {
    const records = await db.getAll<{ characterId?: string; data?: PeekPhoneData; updatedAt?: number }>(
      DB_STORES.PEEK_PHONE_DATA,
    );
    const latest = records
      .filter((r) => r.characterId === characterId && typeof r.data?.balance === "number" && r.data.balance > 0)
      .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))[0];
    return latest?.data?.balance ?? null;
  } catch {
    return null;
  }
}

/** 拿到帳戶；沒有就建一個（不等 AI，背景再估） */
async function getOrCreate(characterId: string, storyNowMs: number): Promise<CharWallet> {
  const existing = await loadCharWallet(characterId);
  if (existing) return existing;

  const peekBalance = await latestPeekBalance(characterId);
  const wallet = createCharWallet({
    characterId,
    balance: peekBalance ?? CHAR_WALLET_DEFAULT_BALANCE,
    monthlyIncome: CHAR_WALLET_DEFAULT_MONTHLY_INCOME,
    initializedFrom: peekBalance !== null ? "peek" : "default",
    storyNowMs,
  });
  await saveCharWallet(wallet);
  void refineCharWalletEstimate(characterId).catch((e) =>
    console.warn("[角色帳戶] 背景估算失敗，先用預設值:", e),
  );
  return wallet;
}

/** 確保有帳戶，並補發收入 */
export function ensureCharWallet(characterId: string, storyNowMs: number): Promise<CharWallet> {
  return withWalletLock(characterId, async () => {
    const wallet = await getOrCreate(characterId, storyNowMs);
    const settled = settleIncome(wallet, storyNowMs);
    if (settled !== wallet) await saveCharWallet(settled);
    return settled;
  });
}

// ===== AI 估算 =====

export interface CharWalletEstimate {
  balance: number;
  monthlyIncome: number;
  incomeNote?: string;
}

/** 從 AI 回覆裡抓 {"balance":..,"monthlyIncome":..,"incomeNote":".."} */
export function parseWalletEstimate(text: string): CharWalletEstimate | null {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const raw = JSON.parse(match[0]);
    const balance = Number(raw.balance);
    const monthlyIncome = Number(raw.monthlyIncome);
    if (!Number.isFinite(balance) || !Number.isFinite(monthlyIncome)) return null;
    if (balance < 0 || monthlyIncome < 0) return null;
    return {
      balance: Math.round(balance),
      monthlyIncome: Math.round(monthlyIncome),
      incomeNote: typeof raw.incomeNote === "string" ? raw.incomeNote.slice(0, 30) : undefined,
    };
  } catch {
    return null;
  }
}

async function requestWalletEstimate(characterId: string): Promise<CharWalletEstimate | null> {
  const character = useCharactersStore().getCharacterById(characterId);
  if (!character) return null;
  const settingsStore = useSettingsStore();
  const taskConfig = settingsStore.getAPIForTask("importantEvents");
  if (!taskConfig.api?.apiKey && !taskConfig.api?.endpoint) return null;

  const data = character.data ?? ({} as any);
  const name = character.nickname || data.name || "角色";
  const clip = (s: unknown, n: number) => (typeof s === "string" ? s.slice(0, n) : "");
  const profile = [
    `名字：${name}`,
    clip(data.description, 1500) && `設定：${clip(data.description, 1500)}`,
    clip(data.personality, 400) && `個性：${clip(data.personality, 400)}`,
    clip(data.scenario, 400) && `背景：${clip(data.scenario, 400)}`,
  ]
    .filter(Boolean)
    .join("\n");

  const client = new OpenAICompatibleClient(taskConfig.api);
  const result = await client.generate({
    messages: [
      {
        role: "system",
        content:
          "依角色設定估計這個角色現在的存款和月收入（新台幣），要符合他的職業、年紀和家境。只輸出 JSON，不要其他文字：\n" +
          '{"balance": 存款整數, "monthlyIncome": 月收入整數, "incomeNote": "收入來源，10 個字內"}',
      },
      { role: "user", content: profile },
    ],
    settings: {
      maxContextLength: taskConfig.generation.maxContextLength || 200000,
      maxResponseLength: 300,
      temperature: 0.3,
      topP: 0.9,
      frequencyPenalty: 0,
      presencePenalty: 0,
      repetitionPenalty: 1,
      stopSequences: [],
      streaming: false,
      useStreamingWindow: false,
      ...pickGenerationToggles(taskConfig.generation),
    },
    apiSettings: taskConfig.api,
  });
  return parseWalletEstimate(result.content ?? "");
}

/**
 * 用 AI 估算更新帳戶。建立後背景跑一次；使用者按「重新估算」也走這裡（force）。
 * 預設值建立的帳戶：存款換成估算值，期間的收支照算；偷窺手機來的保留餘額只更新月收入。
 */
export async function refineCharWalletEstimate(
  characterId: string,
  options: { force?: boolean } = {},
): Promise<CharWallet | null> {
  const estimate = await requestWalletEstimate(characterId);
  if (!estimate) return null;
  return withWalletLock(characterId, async () => {
    const wallet = await loadCharWallet(characterId);
    if (!wallet) return null;
    if (!options.force && wallet.initializedFrom !== "default" && wallet.initializedFrom !== "peek") {
      return wallet;
    }
    const replaceBalance = options.force || wallet.initializedFrom === "default";
    const ledgerSum = wallet.ledger.reduce((sum, e) => sum + e.amount, 0);
    const next: CharWallet = {
      ...wallet,
      monthlyIncome: estimate.monthlyIncome,
      incomeNote: estimate.incomeNote ?? wallet.incomeNote,
      balance: replaceBalance ? Math.max(0, estimate.balance + (options.force ? 0 : ledgerSum)) : wallet.balance,
      initializedFrom: "estimate",
      updatedAt: Date.now(),
    };
    await saveCharWallet(next);
    return next;
  });
}

// ===== 扣款入帳 =====

export interface CharWalletTxInput {
  characterId: string;
  amount: number;
  kind: CharLedgerKind;
  description: string;
  storyNowMs: number;
  chatId?: string;
  messageId?: string;
}

export interface CharWalletDebitResult {
  ok: boolean;
  /** 扣款後（失敗時是目前）的餘額 */
  balance: number;
  entryId?: string;
}

/** 扣錢；餘額不夠就不扣，ok = false */
export function debitCharWallet(input: CharWalletTxInput): Promise<CharWalletDebitResult> {
  return withWalletLock(input.characterId, async () => {
    const wallet = settleIncome(await getOrCreate(input.characterId, input.storyNowMs), input.storyNowMs);
    const amount = Math.round(Math.abs(input.amount));
    if (amount > wallet.balance) {
      await saveCharWallet(wallet);
      return { ok: false, balance: wallet.balance };
    }
    const entry = makeLedgerEntry({ ...input, amount: -amount });
    const next = applyLedgerEntry(wallet, entry);
    await saveCharWallet(next);
    return { ok: true, balance: next.balance, entryId: entry.id };
  });
}

/** 入帳 */
export function creditCharWallet(input: CharWalletTxInput): Promise<{ balance: number; entryId: string }> {
  return withWalletLock(input.characterId, async () => {
    const wallet = settleIncome(await getOrCreate(input.characterId, input.storyNowMs), input.storyNowMs);
    const entry = makeLedgerEntry({ ...input, amount: Math.round(Math.abs(input.amount)) });
    const next = applyLedgerEntry(wallet, entry);
    await saveCharWallet(next);
    return { balance: next.balance, entryId: entry.id };
  });
}

/** 還原符合條件的收支（換掉回覆時用） */
export function revertCharWalletEntries(
  characterId: string,
  shouldRevert: (entry: CharLedgerEntry) => boolean,
): Promise<number> {
  return withWalletLock(characterId, async () => {
    let wallet = await loadCharWallet(characterId);
    if (!wallet) return 0;
    const targets = wallet.ledger.filter(shouldRevert);
    for (const entry of targets) wallet = revertLedgerEntry(wallet, entry.id);
    if (targets.length > 0) await saveCharWallet(wallet);
    return targets.length;
  });
}

/** 使用者手動改餘額、月收入 */
export function editCharWallet(
  characterId: string,
  patch: { balance?: number; monthlyIncome?: number; incomeNote?: string },
  storyNowMs: number,
): Promise<CharWallet> {
  return withWalletLock(characterId, async () => {
    let wallet = await getOrCreate(characterId, storyNowMs);
    if (typeof patch.balance === "number" && Number.isFinite(patch.balance)) {
      const diff = Math.round(Math.max(0, patch.balance)) - wallet.balance;
      if (diff !== 0) {
        wallet = applyLedgerEntry(
          wallet,
          makeLedgerEntry({ amount: diff, kind: "manual", description: "手動調整", storyNowMs }),
        );
      }
    }
    wallet = {
      ...wallet,
      monthlyIncome:
        typeof patch.monthlyIncome === "number" && Number.isFinite(patch.monthlyIncome)
          ? Math.max(0, Math.round(patch.monthlyIncome))
          : wallet.monthlyIncome,
      incomeNote: patch.incomeNote !== undefined ? patch.incomeNote.slice(0, 30) : wallet.incomeNote,
      initializedFrom: "manual",
      updatedAt: Date.now(),
    };
    await saveCharWallet(wallet);
    return wallet;
  });
}

/** 套用一個純函式變更（偷窺手機消費等），會先補發收入 */
export function mutateCharWallet(
  characterId: string,
  storyNowMs: number,
  mutate: (wallet: CharWallet) => CharWallet,
): Promise<CharWallet> {
  return withWalletLock(characterId, async () => {
    const wallet = settleIncome(await getOrCreate(characterId, storyNowMs), storyNowMs);
    const next = mutate(wallet);
    await saveCharWallet(next);
    return next;
  });
}

// ===== 給 AI 看的餘額（{{charWallet}} 宏） =====

/**
 * 接在轉帳說明後面的一句話。單人：「（你的帳戶餘額約 4.2 萬，月收入約 6 萬；轉帳不能超過餘額）」；
 * 群聊列出每個成員。讀不到帳戶就回空字串，不影響聊天。
 */
export async function buildCharWalletPromptNote(
  members: Array<{ characterId: string; name: string }>,
  storyNowMs: number,
): Promise<string> {
  const loaded: Array<{ name: string; wallet: CharWallet }> = [];
  for (const member of members) {
    try {
      loaded.push({ name: member.name, wallet: await ensureCharWallet(member.characterId, storyNowMs) });
    } catch (e) {
      console.warn("[角色帳戶] 讀取餘額失敗:", e);
    }
  }
  if (loaded.length === 0) return "";
  if (members.length === 1) {
    const { wallet } = loaded[0];
    const income = wallet.monthlyIncome > 0 ? `，月收入${roughAmountText(wallet.monthlyIncome)}` : "";
    return `（你的帳戶餘額${roughAmountText(wallet.balance)}${income}；轉帳不能超過餘額）`;
  }
  const list = loaded.map(({ name, wallet }) => `${name}${roughAmountText(wallet.balance)}`).join("、");
  return `（各自的帳戶餘額：${list}；轉帳不能超過自己的餘額）`;
}
