import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";

vi.mock("@/db/database", () => ({
  db: {
    init: async () => {},
    _instance: null,
    get: async () => undefined,
    put: async () => {},
  },
  DB_STORES: { CHAT_AFFINITY_STATES: "chatAffinityStates", CHARACTER_AFFECTIONS: "characterAffections" },
}));

import { useChatAffinity } from "@/composables/useChatAffinity";
import {
  type CharacterAffinityConfig,
  CharacterAffinityConfigSchema,
  createDefaultState,
} from "@/schemas/affinity";
import { parseAffinityUpdateTags } from "@/services/ResponseParser";
import { useAffinityStore } from "./affinity";

const CHAT = "chat1";

function makeConfig(overrides: Partial<CharacterAffinityConfig> = {}): CharacterAffinityConfig {
  return CharacterAffinityConfigSchema.parse({
    characterId: "char1",
    enabled: true,
    metrics: [{ id: "aff", name: "好感度", min: 0, max: 100, initial: 50 }],
    ...overrides,
  });
}

function setup(config = makeConfig()) {
  const store = useAffinityStore();
  store.configCache.set(config.characterId, config);
  store.affinityStates.set(CHAT, createDefaultState(CHAT, config));
  const messages = ref<any[]>([]);
  const affinity = useChatAffinity({ currentChatId: ref(CHAT), messages });
  affinity._affinityConfig.value = config;

  const value = (id = "aff") => store.getState(CHAT)!.values[id];
  /** 模擬一則 AI 回覆：放進訊息列表後套用它的更新 */
  const reply = (id: string, content: string) => {
    messages.value.push({ id, role: "ai", content, timestamp: Date.now() });
    const updates = parseAffinityUpdateTags(content);
    if (updates.length) affinity._handleAffinityUpdates(updates, id);
  };
  const user = (id: string) => messages.value.push({ id, role: "user", content: "嗨", timestamp: Date.now() });
  const remove = (...ids: string[]) => {
    messages.value = messages.value.filter((m) => !ids.includes(m.id));
    affinity.resyncAffinityToMessages(ids);
  };
  return { store, messages, affinity, value, reply, user, remove };
}

describe("好感度跟著訊息走（樓層狀態）", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  it("重抽不會一直疊加", () => {
    const t = setup();
    t.user("u1");
    t.reply("a1", `<affinity-update 好感度="+5"/>`);
    expect(t.value()).toBe(55);

    // 重抽：舊回覆被拿掉，新回覆一樣 +5
    t.remove("a1");
    expect(t.value()).toBe(50);
    t.reply("a2", `<affinity-update 好感度="+5"/>`);
    expect(t.value()).toBe(55);
  });

  it("就算漏了對齊，套用新回覆前也會先回到上一則的數值", () => {
    const t = setup();
    t.user("u1");
    t.reply("a1", `<affinity-update 好感度="+5"/>`);
    // 直接把訊息拿掉、沒呼叫 resync
    t.messages.value = t.messages.value.filter((m) => m.id !== "a1");
    t.reply("a2", `<affinity-update 好感度="+5"/>`);
    expect(t.value()).toBe(55);
  });

  it("換回之前的回覆，數值和近期變化都換回來", () => {
    const t = setup();
    t.user("u1");
    t.reply("a1", `<affinity-update 好感度="+5" reason="甲"/>`);
    t.remove("a1");
    t.reply("a2", `<affinity-update 好感度="+10" reason="乙"/>`);
    expect(t.value()).toBe(60);

    // 換回 a1
    t.messages.value = t.messages.value.filter((m) => m.id !== "a2");
    t.messages.value.push({ id: "a1", role: "ai", content: "…", timestamp: 1 });
    t.affinity.resyncAffinityToMessages(["a2"]);
    expect(t.value()).toBe(55);
    expect(t.store.getState(CHAT)!.history.map((h) => h.reason)).toEqual(["甲"]);
  });

  it("刪掉中間的訊息，後面還在的訊息造成的變化不會不見", () => {
    const t = setup();
    t.user("u1");
    t.reply("a1", `<affinity-update 好感度="+5"/>`);
    t.user("u2");
    t.reply("a2", `<affinity-update 好感度="+3"/>`);
    expect(t.value()).toBe(58);

    t.remove("u1", "a1");
    expect(t.value()).toBe(58);
    t.remove("a2");
    expect(t.value()).toBe(50);
  });

  it("手動調整會記在目前那一則，重新對齊不會被蓋掉", () => {
    const t = setup();
    t.user("u1");
    t.reply("a1", `<affinity-update 好感度="+5"/>`);
    t.store.updateMetric(CHAT, "aff", 2, "手動調整");
    t.affinity.resyncAffinityToMessages();
    expect(t.value()).toBe(57);

    // 下一則回覆從手動調整後的數值開始算
    t.user("u2");
    t.reply("a2", `<affinity-update 好感度="+1"/>`);
    expect(t.value()).toBe(58);
  });

  it("面板的重新掃描不會把同一則再加一次", () => {
    const t = setup();
    t.user("u1");
    t.reply("a1", `<affinity-update 好感度="+5"/>`);
    t.affinity.rescanAffinityFromMessages({ force: true });
    t.affinity.rescanAffinityFromMessages({ force: true });
    expect(t.value()).toBe(55);
  });

  it("舊聊天（沒有樓層記錄）第一次套用時，用當下數值當起點", () => {
    const t = setup();
    // 模擬舊資料：數值已經累積到 70，沒有任何樓層
    t.store.getState(CHAT)!.values.aff = 70;
    t.messages.value.push({ id: "old", role: "ai", content: "…", timestamp: 1 });
    t.user("u1");
    t.reply("a1", `<affinity-update 好感度="+5"/>`);
    expect(t.value()).toBe(75);
    t.remove("a1");
    expect(t.value()).toBe(70);
  });

  it("開分支繼承的是分支點那一則的數值", async () => {
    const t = setup();
    t.user("u1");
    t.reply("a1", `<affinity-update 好感度="+5"/>`);
    t.user("u2");
    t.reply("a2", `<affinity-update 好感度="+3"/>`);

    const idMap = new Map([
      ["u1", "n-u1"],
      ["a1", "n-a1"],
    ]);
    await t.store.cloneStateForBranch(CHAT, "branch", {
      idMap,
      branchMessageIds: ["n-u1", "n-a1"],
    });
    expect(t.store.getState("branch")!.values.aff).toBe(55);
    expect(t.value()).toBe(58);
  });
});

describe("指標設定", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  it("單次最大變化會限制 AI，但不限制開場白", () => {
    const t = setup(
      makeConfig({
        metrics: [{ id: "aff", name: "好感度", min: 0, max: 100, initial: 50, maxChange: 3 }] as never,
      }),
    );
    t.reply("g", `<UpdateVariable>_.set('好感度', 50, 80);</UpdateVariable>`);
    expect(t.value()).toBe(80);
    t.user("u1");
    t.reply("a1", `<affinity-update 好感度="+10"/>`);
    expect(t.value()).toBe(83);
    t.user("u2");
    t.reply("a2", `<UpdateVariable>_.set('好感度', 83, 20);</UpdateVariable>`);
    expect(t.value()).toBe(80);
  });

  it("不限範圍的指標不會被夾到 100", () => {
    const t = setup(
      makeConfig({
        metrics: [{ id: "gold", name: "金錢", initial: 5000, bounded: false }] as never,
      }),
    );
    expect(t.value("gold")).toBe(5000);
    t.user("u1");
    t.reply("a1", `<UpdateVariable>_.add('金錢', 120);</UpdateVariable>`);
    expect(t.value("gold")).toBe(5120);
  });

  it("[值, 說明] 格式只改值、說明留著", () => {
    const t = setup(
      makeConfig({
        mvuEnabled: true,
        mvuInitialData: { 悠纪: { 好感度: [50, "0~100，被誇獎會增加"], 背包: [] } },
        metrics: [{ id: "aff", name: "好感度", path: "悠纪.好感度", min: 0, max: 100, initial: 50 }] as never,
      }),
    );
    t.user("u1");
    t.reply(
      "a1",
      `<UpdateVariable>
_.set('悠纪.好感度', 50, 62);//被誇獎
_.insert('悠纪.背包', '地圖');
_.set('悠纪.已告白', true);
</UpdateVariable>`,
    );
    const stat = t.store.getMvuStatData(CHAT)!;
    expect(t.value()).toBe(62);
    expect(stat.悠纪).toEqual({
      好感度: [62, "0~100，被誇獎會增加"],
      背包: ["地圖"],
      已告白: true,
    });
  });

  it("MVU 卡：display_data 寫成「舊->新 (原因)」，$meta 擋住不該新增的東西", () => {
    const t = setup(
      makeConfig({
        mvuEnabled: true,
        mvuInitialData: {
          $meta: { extensible: false },
          悠纪: { 好感度: [50, "0~100"], 背包: ["$__META_EXTENSIBLE__$"], 技能: ["劍術"] },
        },
        metrics: [{ id: "aff", name: "好感度", path: "悠纪.好感度", min: 0, max: 100, initial: 50 }] as never,
      }),
    );
    // $meta 不會出現在 stat_data
    expect(t.store.getMvuStatData(CHAT)).toEqual({
      悠纪: { 好感度: [50, "0~100"], 背包: [], 技能: ["劍術"] },
    });
    t.user("u1");
    t.reply(
      "a1",
      `<UpdateVariable>
_.set('悠纪.好感度', 50, 55);//被誇獎
_.insert('悠纪.背包', '地圖');
_.insert('悠纪.技能', '魔法');
_.set('世界.天氣', '晴');
</UpdateVariable>`,
    );
    const stat = t.store.getMvuStatData(CHAT)!;
    expect(stat).toEqual({ 悠纪: { 好感度: [55, "0~100"], 背包: ["地圖"], 技能: ["劍術"] } });
    expect(t.store.getMvuDisplayData(CHAT)!.悠纪).toMatchObject({ 好感度: "50->55 (被誇獎)" });
    expect(t.store.getMvuDeltaData(CHAT)).toMatchObject({ 悠纪: { 好感度: "50->55 (被誇獎)" } });

    // 換回上一則時 display_data 也跟著回去
    t.remove("a1");
    expect(t.store.getMvuDisplayData(CHAT)!.悠纪).toMatchObject({ 好感度: [50, "0~100"] });
  });
});
