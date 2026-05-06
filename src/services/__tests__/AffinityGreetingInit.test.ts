import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAffinityStore } from "@/stores/affinity";
import {
  applyGreetingInitToAffinity,
  extractGreetingInitUpdates,
  resetAffinityToCharacterDefaults,
} from "../AffinityGreetingInit";
import type { CharacterAffinityConfig } from "@/schemas/affinity";

vi.mock("@/db/database", () => ({
  DB_STORES: {
    CHAT_AFFINITY_STATES: "chatAffinityStates",
    CHARACTER_AFFECTIONS: "characterAffections",
  },
  db: {
    init: vi.fn().mockResolvedValue(undefined),
    get: vi.fn().mockResolvedValue(null),
    put: vi.fn().mockResolvedValue(undefined),
    _instance: {
      objectStoreNames: { contains: () => true },
    },
  },
}));

const SAMPLE_GREETING = `
辦公室訓話場景開始。

<UpdateVariable>
<Analysis>
Initial greeting state. Office scolding scene.
</Analysis>
<JSONPatch>
[
  { "op": "replace", "path": "/黎靖青/冷淡值", "value": 100 },
  { "op": "replace", "path": "/黎靖青/亲密值", "value": 0 },
  { "op": "replace", "path": "/黎靖青/兴奋值", "value": 0 },
  { "op": "replace", "path": "/黎靖青/心情", "value": "不悅、煩躁" }
]
</JSONPatch>
</UpdateVariable>
`;

function makeConfig(): CharacterAffinityConfig {
  return {
    characterId: "lijingqing",
    enabled: true,
    statKey: "黎靖青",
    mvuEnabled: true,
    mvuInitialData: {
      黎靖青: { 冷淡值: 50, 亲密值: 50, 兴奋值: 50, 心情: "平靜" },
    },
    mvuPromptTemplate: "",
    mvuUpdateInstruction: "",
    postMutationRules: [],
    metrics: [
      {
        id: "leng",
        name: "冷淡值",
        path: "黎靖青.冷淡值",
        type: "number",
        min: 0,
        max: 100,
        initial: 50,
        options: [],
        stages: [],
      },
      {
        id: "qin",
        name: "亲密值",
        path: "黎靖青.亲密值",
        type: "number",
        min: 0,
        max: 100,
        initial: 50,
        options: [],
        stages: [],
      },
      {
        id: "xing",
        name: "兴奋值",
        path: "黎靖青.兴奋值",
        type: "number",
        min: 0,
        max: 100,
        initial: 50,
        options: [],
        stages: [],
      },
      {
        id: "mood",
        name: "心情",
        path: "黎靖青.心情",
        type: "string",
        min: 0,
        max: 0,
        initial: "平靜",
        options: [],
        stages: [],
      },
    ],
    promptTemplate: "",
    updateInstruction: "",
    lastUpdated: 0,
  };
}

describe("AffinityGreetingInit", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it("extracts UpdateVariable JSONPatch from a greeting", () => {
    const updates = extractGreetingInitUpdates(SAMPLE_GREETING);
    expect(updates.length).toBe(4);
    // 全為 absolute replace
    expect(updates.every((u) => u.isAbsolute === true)).toBe(true);
  });

  it("returns empty array for greeting without patch", () => {
    expect(extractGreetingInitUpdates("hello world")).toEqual([]);
    expect(extractGreetingInitUpdates("")).toEqual([]);
  });

  it("applies greeting patch to affinity state, overriding character defaults", async () => {
    const store = useAffinityStore();
    const config = makeConfig();
    store.configCache.set(config.characterId, config);

    const count = await applyGreetingInitToAffinity(
      store,
      "chat-greet-1",
      config.characterId,
      SAMPLE_GREETING,
    );
    expect(count).toBe(4);

    const state = store.getState("chat-greet-1");
    expect(state).toBeTruthy();
    // metric.values 應反映 patch 而非 mvuInitialData (50) 或 metric.initial (50)
    expect(state!.values["leng"]).toBe(100);
    expect(state!.values["qin"]).toBe(0);
    expect(state!.values["xing"]).toBe(0);
    expect(state!.values["mood"]).toBe("不悅、煩躁");
  });

  it("resetAffinityToCharacterDefaults uses mvuInitialData over metric.initial", async () => {
    const store = useAffinityStore();
    const config = makeConfig();
    store.configCache.set(config.characterId, config);

    const ok = await resetAffinityToCharacterDefaults(
      store,
      "chat-reset-1",
      config.characterId,
    );
    expect(ok).toBe(true);

    const state = store.getState("chat-reset-1");
    expect(state).toBeTruthy();
    // mvuInitialData 中各為 50；metric.initial 也為 50；mood mvu="平靜"
    expect(state!.values["leng"]).toBe(50);
    expect(state!.values["qin"]).toBe(50);
    expect(state!.values["mood"]).toBe("平靜");
    expect(state!.lastRescannedMessageId).toBeUndefined();
  });

  it("createDefaultState honors mvuInitialData when metric.initial is mismatched", async () => {
    const store = useAffinityStore();
    const config = makeConfig();
    // 將 mvuInitialData 中冷淡值改為 87，metric.initial 仍 50；驗證 87 勝出
    config.mvuInitialData = {
      黎靖青: { 冷淡值: 87, 亲密值: 12, 兴奋值: 30, 心情: "靜謐、平靜" },
    };
    store.configCache.set(config.characterId, config);

    await store.initializeFromConfig("chat-mvu-1", config, { force: true });
    const state = store.getState("chat-mvu-1");
    expect(state!.values["leng"]).toBe(87);
    expect(state!.values["qin"]).toBe(12);
    expect(state!.values["xing"]).toBe(30);
    expect(state!.values["mood"]).toBe("靜謐、平靜");
  });
});
