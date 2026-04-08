import type { CharacterAffinityConfig } from "@/schemas/affinity";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAffinityStore } from "../affinity";

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
      objectStoreNames: {
        contains: () => true,
      },
    },
  },
}));

describe("affinity store post-mutation rules", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  function createZhuoConfig(): CharacterAffinityConfig {
    return {
      characterId: "zhuo",
      enabled: true,
      statKey: "卓云和",
      mvuEnabled: true,
      mvuInitialData: {},
      mvuPromptTemplate: "",
      mvuUpdateInstruction: "",
      postMutationRules: [
        {
          type: "derive_boolean",
          targetPath: "卓云和个人状态.$爱意值已解锁",
          mode: "all",
          conditions: [
            { path: "卓云和个人状态.好感度", operator: "gte", value: 50 },
            { path: "卓云和个人状态.戒备值", operator: "lte", value: 40 },
          ],
          trueValue: "true",
          falseValue: "false",
          lockOnTrue: true,
        },
        {
          type: "clamp_max_when",
          targetPath: "卓云和个人状态.好感度",
          max: 50,
          mode: "all",
          conditions: [
            { path: "卓云和个人状态.戒备值", operator: "gte", value: 60 },
          ],
        },
      ],
      metrics: [
        {
          id: "favor",
          name: "好感度",
          path: "卓云和个人状态.好感度",
          type: "number",
          min: 0,
          max: 100,
          initial: 55,
          options: [],
          stages: [],
        },
        {
          id: "guard",
          name: "戒备值",
          path: "卓云和个人状态.戒备值",
          type: "number",
          min: 0,
          max: 100,
          initial: 35,
          options: [],
          stages: [],
        },
        {
          id: "loveUnlocked",
          name: "$爱意值已解锁",
          path: "卓云和个人状态.$爱意值已解锁",
          type: "string",
          min: 0,
          max: 100,
          initial: "false",
          options: ["true", "false"],
          stages: [],
        },
      ],
      promptTemplate: "",
      updateInstruction: "",
      lastUpdated: 0,
    };
  }

  it("derives unlock flag during initialization", async () => {
    const store = useAffinityStore();
    const state = await store.initializeFromConfig("chat-1", createZhuoConfig());

    expect(state.values.favor).toBe(55);
    expect(state.values.guard).toBe(35);
    expect(state.values.loveUnlocked).toBe("true");
  });

  it("keeps unlock flag latched after conditions fall back", async () => {
    const store = useAffinityStore();
    await store.initializeFromConfig("chat-2", createZhuoConfig());

    store.setMetricByPath("chat-2", "卓云和个人状态.戒备值", 80, "test");
    store.setMetricByPath("chat-2", "卓云和个人状态.好感度", 10, "test");

    const unlocked = store.getMetricByPath("chat-2", "卓云和个人状态.$爱意值已解锁");
    const favor = store.getMetricByPath("chat-2", "卓云和个人状态.好感度");

    expect(unlocked?.value).toBe("true");
    expect(favor?.value).toBe(10);
  });

  it("clamps favor to 50 when guard is high", async () => {
    const store = useAffinityStore();
    const config = createZhuoConfig();
    config.metrics[0].initial = 40;
    config.metrics[1].initial = 20;

    await store.initializeFromConfig("chat-3", config);
    store.setMetricByPath("chat-3", "卓云和个人状态.好感度", 90, "test");
    store.setMetricByPath("chat-3", "卓云和个人状态.戒备值", 65, "test");

    const favor = store.getMetricByPath("chat-3", "卓云和个人状态.好感度");
    expect(favor?.value).toBe(50);
  });
});
