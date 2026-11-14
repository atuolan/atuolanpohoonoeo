import { beforeEach, describe, expect, it, vi } from "vitest";

const generateMock = vi.fn();
vi.mock("@/api/OpenAICompatible", () => ({
  OpenAICompatibleClient: class {
    generate = generateMock;
  },
}));
vi.mock("@/stores/settings", () => ({
  useSettingsStore: () => ({
    generation: {},
    getAPIForTask: () => ({
      api: { endpoint: "https://example.invalid", apiKey: "k", model: "m" },
      generation: {},
    }),
  }),
}));

import { computeStage } from "@/schemas/affinity";
import {
  buildGeneratorPrompt,
  draftToMetric,
  generateAffinityMetric,
  parseGeneratorReply,
  sanitizeMetricName,
} from "./affinityGenerator";
import {
  evenThresholds,
  insertStageAbove,
  maxChangeForPace,
  metricSummary,
  paceOf,
  reverseStages,
  startStageIndex,
} from "./affinityLadder";

const tsundere = {
  name: "好感度",
  kind: "score",
  description: "被關心時增加；被冒犯時減少",
  stages: [
    { name: "討厭", behavior: "說話帶刺" },
    { name: "冷淡", behavior: "愛理不理" },
    { name: "在意", behavior: "偷偷注意" },
    { name: "喜歡", behavior: "嘴硬心軟" },
  ],
  startStage: 0,
  zeroStage: 1,
};

describe("一句話生成：AI 回答 → 數值設定", () => {
  it("範圍由 app 算：每階寬 20，zeroStage 以下是負的；起點在那一階的中間", () => {
    const draft = parseGeneratorReply(`好的！\n\`\`\`json\n${JSON.stringify(tsundere)}\n\`\`\``)!;
    const metric = draftToMetric(draft);
    expect(metric).toMatchObject({ type: "number", min: -20, max: 60, bounded: true, maxChange: 4 });
    expect(metric.stages.map((s) => [s.name, s.minValue, s.description])).toEqual([
      ["討厭", -20, "說話帶刺"],
      ["冷淡", 0, "愛理不理"],
      ["在意", 20, "偷偷注意"],
      ["喜歡", 40, "嘴硬心軟"],
    ]);
    expect(metric.initial).toBe(-10);
    expect(computeStage(metric.initial as number, metric.stages)).toBe("討厭");
  });

  it("5 階、沒有負的就是 0～100", () => {
    const metric = draftToMetric(
      parseGeneratorReply(
        JSON.stringify({
          name: "依賴",
          stages: ["a", "b", "c", "d", "e"].map((n) => ({ name: n, behavior: "" })),
          startStage: "c",
        }),
      )!,
    );
    expect([metric.min, metric.max]).toEqual([0, 100]);
    expect(metric.stages.map((s) => s.minValue)).toEqual([0, 20, 40, 60, 80]);
    expect(metric.initial).toBe(50);
  });

  it("狀態型：階段名稱就是選項，表現併進說明", () => {
    const metric = draftToMetric(
      parseGeneratorReply(
        JSON.stringify({
          name: "心情",
          kind: "state",
          description: "依這輪的事改變",
          stages: [
            { name: "開心", behavior: "話很多" },
            { name: "鬧彆扭", behavior: "不理人" },
          ],
          startStage: 1,
        }),
      )!,
    );
    expect(metric).toMatchObject({
      type: "string",
      options: ["開心", "鬧彆扭"],
      initial: "鬧彆扭",
      description: "依這輪的事改變。開心：話很多；鬧彆扭：不理人",
      stages: [],
    });
  });

  it("名稱拿掉會弄壞回報標籤的符號，重名加編號", () => {
    expect(sanitizeMetricName('好 感"度=', [])).toBe("好感度");
    expect(sanitizeMetricName("好感度", ["好感度", "好感度2"])).toBe("好感度3");
    expect(sanitizeMetricName("  ", [])).toBe("數值");
  });

  it("看不懂的回答回傳 null；階段太少也算失敗", () => {
    expect(parseGeneratorReply("我不能幫你做這個")).toBeNull();
    expect(parseGeneratorReply(JSON.stringify({ name: "x", stages: [{ name: "a" }] }))).toBeNull();
  });

  it("留空時請 AI 看角色卡；已有的數值會叫它不要重複", () => {
    const prompt = buildGeneratorPrompt({
      request: "",
      character: { name: "悠紀", personality: "傲嬌" },
      existingNames: ["好感度"],
    });
    expect(prompt).toContain("請讀角色資料");
    expect(prompt).toContain("個性：傲嬌");
    expect(prompt).toContain("[已經有的數值] 好感度（使用者想要的如果其實是重做其中一個，就用同樣的名字");
  });
});

describe("generateAffinityMetric", () => {
  beforeEach(() => {
    generateMock.mockReset();
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  it("第一次看不懂會再試一次", async () => {
    generateMock
      .mockResolvedValueOnce({ content: "嗯…" })
      .mockResolvedValueOnce({ content: JSON.stringify(tsundere) });
    const metric = await generateAffinityMetric({ request: "傲嬌", character: {}, existingNames: [] });
    expect(generateMock).toHaveBeenCalledTimes(2);
    expect(metric.stages).toHaveLength(4);
  });

  it("兩次都失敗就丟錯", async () => {
    generateMock.mockResolvedValue({ content: "不要" });
    await expect(
      generateAffinityMetric({ request: "x", character: {}, existingNames: [] }),
    ).rejects.toThrow("做不出來");
  });
});

describe("階段梯子", () => {
  const base = {
    min: 0,
    max: 100,
    bounded: true,
    initial: 30,
    stages: [
      { name: "陌生", minValue: 0, description: "" },
      { name: "熟悉", minValue: 20, description: "" },
      { name: "好感", minValue: 45, description: "" },
    ],
  };

  it("平均分配門檻", () => {
    expect(evenThresholds(-40, 80, 6)).toEqual([-40, -20, 0, 20, 40, 60]);
  });

  it("插一階放在上下兩格的中間，不動其他門檻", () => {
    const next = insertStageAbove(base, 0, { name: "新", description: "" })!;
    expect(next.map((s) => s.minValue)).toEqual([0, 10, 20, 45]);
    // 最上面：取最高階和最大值的中間
    const top = insertStageAbove(base, 2, { name: "頂", description: "" })!;
    expect(top[top.length - 1].minValue).toBe(73);
    // 沒空間
    expect(
      insertStageAbove({ ...base, stages: [{ name: "a", minValue: 0, description: "" }, { name: "b", minValue: 1, description: "" }] }, 0, {
        name: "x",
        description: "",
      }),
    ).toBeNull();
  });

  it("上下顛倒：門檻不動、名稱對調，起點跟著原本那一階", () => {
    const { stages, initial } = reverseStages(base);
    expect(stages.map((s) => [s.name, s.minValue])).toEqual([
      ["好感", 0],
      ["熟悉", 20],
      ["陌生", 45],
    ]);
    expect(startStageIndex({ ...base, stages, initial })).toBe(1);
  });

  it("節奏和摘要", () => {
    const metric = {
      ...base,
      maxChange: 5,
      id: "m",
      name: "好感度",
      path: "",
      type: "number" as const,
      options: [],
      description: "",
    };
    expect(paceOf(metric)).toBe("normal");
    expect(maxChangeForPace(metric, "slow")).toBe(2);
    expect(metricSummary(metric)).toBe("從「熟悉」開始 · 3 個階段");
  });
});
