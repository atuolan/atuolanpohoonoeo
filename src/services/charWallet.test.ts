import { beforeEach, describe, expect, it, vi } from "vitest";

const tables = new Map<string, Map<string, any>>();
const table = (name: string) => {
  if (!tables.has(name)) tables.set(name, new Map());
  return tables.get(name)!;
};

vi.mock("@/db/database", () => ({
  DB_STORES: { CHAR_WALLETS: "charWallets", PEEK_PHONE_DATA: "peekPhoneData" },
  db: {
    init: vi.fn(async () => {}),
    get: vi.fn(async (store: string, key: string) => table(store).get(key)),
    getAll: vi.fn(async (store: string) => [...table(store).values()]),
    put: vi.fn(async (store: string, value: any) => {
      table(store).set(value.characterId ?? value.id, value);
    }),
  },
}));

const generate = vi.fn();
vi.mock("@/api/OpenAICompatible", () => ({
  OpenAICompatibleClient: class {
    generate = generate;
  },
}));
vi.mock("@/stores/characters", () => ({
  useCharactersStore: () => ({
    getCharacterById: (id: string) => (id ? { id, data: { name: "阿光", description: "上班族" } } : null),
  }),
}));
vi.mock("@/stores/settings", () => ({
  useSettingsStore: () => ({
    getAPIForTask: () => ({ api: { apiKey: "k", endpoint: "e", model: "m" }, generation: {} }),
  }),
}));

import {
  creditCharWallet,
  debitCharWallet,
  ensureCharWallet,
  loadCharWallet,
  parseWalletEstimate,
  refineCharWalletEstimate,
  revertCharWalletEntries,
} from "./charWallet";
import { useChatCharWallet, type WalletMessage } from "@/composables/useChatCharWallet";

const DAY1 = new Date("2026-11-01T12:00:00").getTime();
const DAY3 = new Date("2026-11-03T12:00:00").getTime();

/** 等背景估算跑完 */
const flush = () => new Promise((r) => setTimeout(r, 0));

describe("角色帳戶", () => {
  beforeEach(() => {
    tables.clear();
    generate.mockReset();
    generate.mockResolvedValue({ content: "估不出來" });
  });

  it("第一次用到時建立；有偷窺手機的餘額就用那份", async () => {
    table("peekPhoneData").set("c1_chat1", { id: "c1_chat1", characterId: "c1", data: { balance: 88000 }, updatedAt: 5 });
    const wallet = await ensureCharWallet("c1", DAY1);
    expect(wallet.balance).toBe(88000);
    expect(wallet.initializedFrom).toBe("peek");
  });

  it("沒有偷窺手機時先用預設值，背景估算後換成估算存款，期間收支照算", async () => {
    generate.mockResolvedValue({ content: '{"balance": 500000, "monthlyIncome": 90000, "incomeNote": "公司老闆"}' });
    await debitCharWallet({ characterId: "c1", amount: 1000, kind: "to_user", description: "轉帳", storyNowMs: DAY1 });
    await flush();
    await flush();
    const wallet = await loadCharWallet("c1");
    expect(wallet).toMatchObject({ balance: 499000, monthlyIncome: 90000, incomeNote: "公司老闆", initializedFrom: "estimate" });
  });

  it("餘額不夠就不扣", async () => {
    await ensureCharWallet("c1", DAY1);
    const result = await debitCharWallet({ characterId: "c1", amount: 999999, kind: "to_user", description: "轉帳", storyNowMs: DAY1 });
    expect(result.ok).toBe(false);
    expect((await loadCharWallet("c1"))!.balance).toBe(30000);
  });

  it("扣款前先補發收入", async () => {
    await ensureCharWallet("c1", DAY1);
    const result = await debitCharWallet({ characterId: "c1", amount: 100, kind: "to_user", description: "轉帳", storyNowMs: DAY3 });
    expect(result.balance).toBe(30000 + 2000 - 100);
  });

  it("同時寫入不會互相蓋掉", async () => {
    await ensureCharWallet("c1", DAY1);
    await Promise.all([
      creditCharWallet({ characterId: "c1", amount: 100, kind: "from_user", description: "a", storyNowMs: DAY1 }),
      creditCharWallet({ characterId: "c1", amount: 200, kind: "from_user", description: "b", storyNowMs: DAY1 }),
      debitCharWallet({ characterId: "c1", amount: 50, kind: "to_user", description: "c", storyNowMs: DAY1 }),
    ]);
    expect((await loadCharWallet("c1"))!.balance).toBe(30250);
  });

  it("還原某則訊息的收支", async () => {
    await ensureCharWallet("c1", DAY1);
    await creditCharWallet({ characterId: "c1", amount: 500, kind: "from_user", description: "a", storyNowMs: DAY1, messageId: "m1" });
    await revertCharWalletEntries("c1", (e) => e.messageId === "m1");
    expect((await loadCharWallet("c1"))!.balance).toBe(30000);
  });

  it("重新估算會把存款換成估算值", async () => {
    await ensureCharWallet("c1", DAY1);
    await flush();
    generate.mockResolvedValue({ content: '{"balance": 1200, "monthlyIncome": 15000}' });
    const wallet = await refineCharWalletEstimate("c1", { force: true });
    expect(wallet).toMatchObject({ balance: 1200, monthlyIncome: 15000 });
  });

  it("解析估算 JSON，壞掉的不收", () => {
    expect(parseWalletEstimate('好的\n{"balance": 1000, "monthlyIncome": 2000}')).toEqual({ balance: 1000, monthlyIncome: 2000, incomeNote: undefined });
    expect(parseWalletEstimate('{"balance": -1, "monthlyIncome": 2000}')).toBeNull();
    expect(parseWalletEstimate("沒有")).toBeNull();
  });
});

describe("使用者轉給角色", () => {
  beforeEach(() => tables.clear());

  const wallet = () =>
    useChatCharWallet({
      chatId: () => "chat1",
      characterIdOf: () => "c1",
      storyNow: () => DAY1,
      userTransferTargetId: () => "c1",
    });

  it("收下的入帳一次，退回後還原", async () => {
    const ctl = wallet();
    const msg: WalletMessage = { id: "t1", role: "user", isTransfer: true, transferType: "pay", transferAmount: 520, transferStatus: "received" };
    await ctl.syncUserTransfers([msg]);
    await ctl.syncUserTransfers([msg]);
    expect((await loadCharWallet("c1"))!.balance).toBe(30520);

    msg.transferStatus = "sent";
    expect(await ctl.syncUserTransfers([msg])).toBe(true);
    expect((await loadCharWallet("c1"))!.balance).toBe(30000);
    expect(msg.charWalletEntryId).toBeUndefined();
  });

  it("角色付錢對不到角色卡時照舊直接成功", async () => {
    const ctl = useChatCharWallet({
      chatId: () => "chat1",
      characterIdOf: () => null,
      storyNow: () => DAY1,
      userTransferTargetId: () => null,
    });
    const result = await ctl.chargeCharacter({ id: "m", role: "ai" }, 999999, "to_user", "轉帳");
    expect(result.ok).toBe(true);
  });
});

describe("給 AI 看的餘額", () => {
  beforeEach(() => tables.clear());

  it("單人寫你的餘額和月收入，群聊列出每個人", async () => {
    const { buildCharWalletPromptNote } = await import("./charWallet");
    expect(await buildCharWalletPromptNote([{ characterId: "c1", name: "阿光" }], DAY1)).toBe(
      "（你的帳戶餘額約 3 萬，月收入約 3 萬；轉帳不能超過餘額）",
    );
    expect(
      await buildCharWalletPromptNote(
        [
          { characterId: "c1", name: "阿光" },
          { characterId: "c2", name: "小美" },
        ],
        DAY1,
      ),
    ).toBe("（各自的帳戶餘額：阿光約 3 萬、小美約 3 萬；轉帳不能超過自己的餘額）");
    expect(await buildCharWalletPromptNote([], DAY1)).toBe("");
  });
});
