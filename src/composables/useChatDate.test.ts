import { beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";

const store = new Map<string, any>();
const debit = vi.fn();
const recap = vi.fn();
const memories: any[] = [];
const events: any[] = [];

vi.mock("@/services/dateOuting", () => ({
  loadDateSession: vi.fn(async (chatId: string) => store.get(chatId) ?? null),
  saveDateSession: vi.fn(async (s: any) => {
    store.set(s.chatId, JSON.parse(JSON.stringify(s)));
  }),
  clearDateSession: vi.fn(async (chatId: string) => {
    store.delete(chatId);
  }),
  addDateMemory: vi.fn(async (m: any) => {
    memories.push(m);
  }),
  recordDateImportantEvent: vi.fn(async (...args: any[]) => {
    events.push(args);
  }),
  generateDateRecap: (...args: any[]) => recap(...args),
}));
vi.mock("@/services/charWallet", () => ({ debitCharWallet: (...args: any[]) => debit(...args) }));

import { useChatDate } from "./useChatDate";

function setup(options: { userMoney?: number; advance?: boolean } = {}) {
  const messages = ref<any[]>([]);
  const f2f = ref(false);
  let userMoney = options.userMoney ?? 100000;
  let storyNow = 1_000_000;
  const advanced: number[] = [];
  const returned = vi.fn();
  const ctl = useChatDate({
    messages,
    chatId: () => "chat1",
    characterId: () => "c1",
    names: () => ({ userName: "小明", charName: "阿光" }),
    isGroupChat: () => false,
    chatFaceToFaceMode: f2f,
    saveChatImmediate: async () => {},
    showToast: () => {},
    storyNow: () => storyNow,
    advanceStory: (m) => {
      advanced.push(m);
      storyNow += m * 60_000;
      return options.advance !== false;
    },
    spendUserMoney: async (amount) => {
      if (amount > userMoney) return false;
      userMoney -= amount;
      return true;
    },
    onReturnedOnline: returned,
  });
  return { ctl, messages, f2f, advanced, returned, money: () => userMoney, tick: (m: number) => (storyNow += m * 60_000) };
}

describe("約會流程", () => {
  beforeEach(() => {
    store.clear();
    memories.length = 0;
    events.length = 0;
    debit.mockReset();
    debit.mockResolvedValue({ ok: true, balance: 50000, entryId: "e1" });
    recap.mockReset();
    recap.mockResolvedValue({ recap: "在水母前面牽了手", diary: "今天很開心。" });
  });

  it("使用者約他 → 他答應 → 進面對面 → 他請客 → 結束回線上，留下回憶", async () => {
    const { ctl, messages, f2f, advanced, returned, tick } = setup();
    await ctl.inviteFromUser({ spotId: "aquarium" });
    expect(messages.value[0].dateCard).toMatchObject({ kind: "invite", status: "pending" });
    expect(await ctl.promptNote()).toContain("<date-accept/>");

    await ctl.handleAiReply({ accept: true });
    expect(messages.value[0].dateCard.status).toBe("accepted");
    expect(messages.value[0].content).toContain("答應了");
    expect(f2f.value).toBe(true);
    expect(ctl.isOngoing.value).toBe(true);

    const cost = ctl.session.value!.cost;
    await ctl.handleAiReply({ pay: "char" });
    expect(debit).toHaveBeenCalledWith(expect.objectContaining({ characterId: "c1", kind: "date" }));
    expect(ctl.session.value!.payment!.charPaid + ctl.session.value!.payment!.userPaid).toBe(cost);

    tick(60);
    await ctl.handleAiReply({ end: true });
    expect(f2f.value).toBe(false);
    expect(returned).toHaveBeenCalled();
    expect(advanced[0]).toBe(120);
    expect(ctl.session.value).toBeNull();
    expect(store.has("chat1")).toBe(false);
    const ended = messages.value.find((m) => m.dateCard?.kind === "ended");
    expect(ended.dateCard).toMatchObject({ place: "水族館", recap: "在水母前面牽了手", diary: "今天很開心。" });
    expect(memories).toHaveLength(1);
    expect(events).toHaveLength(1);
  });

  it("他拒絕就只留卡片，不扣錢", async () => {
    const { ctl, messages, f2f } = setup();
    await ctl.inviteFromUser({ spotId: "cafe" });
    await ctl.handleAiReply({ decline: { reason: "要加班" } });
    expect(messages.value[0].dateCard).toMatchObject({ status: "declined", reason: "要加班" });
    expect(f2f.value).toBe(false);
    expect(ctl.session.value).toBeNull();
    expect(debit).not.toHaveBeenCalled();
  });

  it("他約使用者：出現請求卡，使用者答應才開始", async () => {
    const { ctl, messages, f2f } = setup();
    await ctl.handleAiReply({ request: { place: "夜市", reason: "想吃臭豆腐" } });
    const card = messages.value[0];
    expect(card.dateCard).toMatchObject({ kind: "request", place: "夜市", status: "pending" });
    expect(await ctl.promptNote()).toBe("");
    await ctl.acceptRequest(card.id);
    expect(f2f.value).toBe(true);
    expect(ctl.isOngoing.value).toBe(true);
  });

  it("他的帳戶不夠時改由使用者付", async () => {
    debit.mockResolvedValue({ ok: false, balance: 10 });
    const { ctl, money } = setup();
    await ctl.inviteFromUser({ spotId: "cafe" });
    await ctl.handleAiReply({ accept: true });
    const cost = ctl.session.value!.cost;
    await ctl.handleAiReply({ pay: "char" });
    expect(ctl.session.value!.payment).toMatchObject({ payer: "user", userPaid: cost, charPaid: 0 });
    expect(ctl.session.value!.payment!.note).toContain("不夠付");
    expect(money()).toBe(100000 - cost);
  });

  it("沒決定誰付就結束：各付一半", async () => {
    const { ctl } = setup();
    await ctl.inviteFromUser({ spotId: "cafe" });
    await ctl.handleAiReply({ accept: true });
    await ctl.end();
    expect(memories[0].paymentNote).toContain("各付各的");
  });

  it("隨機事件在他回了兩輪後才交給 AI", async () => {
    const { ctl } = setup();
    await ctl.inviteFromUser({ spotId: "cafe" });
    await ctl.handleAiReply({ accept: true });
    ctl.session.value!.event = { id: "rain", text: "突然下起大雨" };
    expect(await ctl.promptNote()).not.toContain("【突發】");
    await ctl.handleAiReply(null);
    await ctl.handleAiReply(null);
    expect(await ctl.promptNote()).toContain("【突發】突然下起大雨");
    expect(ctl.session.value!.eventInjected).toBe(true);
  });

  it("有邀請在等回覆時不能再約，也不接受他的新邀請", async () => {
    const { ctl, messages } = setup();
    await ctl.inviteFromUser({ spotId: "cafe" });
    await ctl.handleAiReply({ request: { place: "海邊" } });
    expect(messages.value).toHaveLength(1);
    ctl.openPicker();
    expect(ctl.showPicker.value).toBe(false);
  });
});
