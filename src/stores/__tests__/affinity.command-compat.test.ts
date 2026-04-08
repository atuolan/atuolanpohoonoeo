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

describe("affinity store MVU command compatibility", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  function createConfig(): CharacterAffinityConfig {
    return {
      characterId: "jiejie",
      enabled: true,
      statKey: "黎靖青",
      mvuEnabled: true,
      mvuInitialData: {
        黎靖青: {
          标签: ["旧标签"],
          隐藏线索: "保留",
        },
      },
      mvuPromptTemplate: "",
      mvuUpdateInstruction: "",
      postMutationRules: [],
      metrics: [
        {
          id: "mode",
          name: "目前模式",
          path: "黎靖青.目前模式",
          type: "string",
          min: 0,
          max: 100,
          initial: "上司",
          options: ["上司", "恋人"],
          stages: [],
        },
        {
          id: "todo",
          name: "待办事项",
          path: "黎靖青.待办事项",
          type: "string",
          min: 0,
          max: 100,
          initial: "无",
          options: [],
          stages: [],
        },
        {
          id: "intimacy",
          name: "亲密值",
          path: "黎靖青.亲密值",
          type: "number",
          min: 0,
          max: 100,
          initial: 10,
          options: [],
          stages: [],
        },
      ],
      promptTemplate: "",
      updateInstruction: "",
      lastUpdated: 0,
    };
  }

  it("copies source metric value when batchUpdateByPath receives move-style sourceMetric", async () => {
    const store = useAffinityStore();
    await store.initializeFromConfig("chat-move", createConfig());

    store.batchUpdateByPath("chat-move", [
      {
        metric: "黎靖青.待办事项",
        change: 0,
        reason: "MVU JSONPatch",
        isAbsolute: true,
        sourceMetric: "黎靖青.目前模式",
      },
    ]);

    const movedTarget = store.getMetricByPath("chat-move", "黎靖青.待办事项");
    expect(movedTarget?.value).toBe("上司");
    const moveDisplay = store.getMvuDisplayData("chat-move") as Record<string, unknown> | null;
    expect((moveDisplay?.["黎靖青"] as Record<string, unknown> | undefined)?.["待办事项"]).toBe("上司");
  });

  it("applies object-tree remove and insert operations through batchUpdateByPath", async () => {
    const store = useAffinityStore();
    await store.initializeFromConfig("chat-ops", createConfig());

    store.batchUpdateByPath("chat-ops", [
      {
        metric: "黎靖青.隐藏线索",
        change: 0,
        reason: "MVU _.unset",
        operation: "remove",
      },
      {
        metric: "黎靖青.标签",
        change: 0,
        reason: "MVU JSONPatch",
        operation: "insert",
        stringValue: "新标签",
        insertIndex: 1,
      },
    ]);

    const statData = store.getMvuStatData("chat-ops");
    expect(statData?.黎靖青).toEqual({
      标签: ["旧标签", "新标签"],
    });
    expect(store.getMvuDisplayData("chat-ops")?.黎靖青).toEqual({
      标签: ["旧标签", "新标签"],
    });
    const deltaData = store.getMvuDeltaData("chat-ops") as Record<string, unknown> | null;
    expect((deltaData?.["黎靖青"] as Record<string, unknown> | undefined)?.["标签"]).toBe("新标签");
  });

  it("resets delta_data between response batches while keeping current batch values", async () => {
    const store = useAffinityStore();
    await store.initializeFromConfig("chat-delta", createConfig());

    store.batchUpdateByPath("chat-delta", [
      {
        metric: "黎靖青.亲密值",
        change: 2,
        reason: "batch1",
      },
    ]);

    let deltaData = store.getMvuDeltaData("chat-delta") as Record<string, unknown> | null;
    expect((deltaData?.["黎靖青"] as Record<string, unknown> | undefined)?.["亲密值"]).toBe(2);

    store.resetMvuDeltaData("chat-delta");
    store.batchUpdateByPath("chat-delta", [
      {
        metric: "黎靖青.待办事项",
        change: 0,
        reason: "batch2",
        isAbsolute: true,
        absoluteValue: 1,
      },
      {
        metric: "黎靖青.标签",
        change: 0,
        reason: "batch2-insert",
        operation: "insert",
        stringValue: "第二轮",
        insertIndex: 1,
      },
    ]);

    deltaData = store.getMvuDeltaData("chat-delta") as Record<string, unknown> | null;
    const root = deltaData?.["黎靖青"] as Record<string, unknown> | undefined;
    expect(root?.["亲密值"]).toBeUndefined();
    expect(root?.["待办事项"]).toBe("1");
    expect(root?.["标签"]).toBe("第二轮");
  });
});
