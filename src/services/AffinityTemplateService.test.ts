import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/db/database", () => ({
  db: { init: async () => {}, _instance: null, get: async () => undefined, put: async () => {} },
  DB_STORES: { CHAT_AFFINITY_STATES: "s", CHARACTER_AFFECTIONS: "c" },
}));

import { CharacterAffinityConfigSchema, createDefaultState } from "@/schemas/affinity";
import { createStTemplateContext } from "@/services/StTemplateContextService";
import { affinityTemplateService } from "./AffinityTemplateService";

const config = CharacterAffinityConfigSchema.parse({
  characterId: "c1",
  enabled: true,
  metrics: [
    {
      id: "aff",
      name: "好感度",
      initial: 72,
      maxChange: 5,
      description: "被誇獎會增加",
      stages: [
        { name: "普通", minValue: 0 },
        { name: "曖昧", minValue: 70, description: "會吃醋" },
      ],
    },
    { id: "gold", name: "金錢", initial: 5000, bounded: false },
    { id: "mood", name: "心情", type: "string", initial: "平靜", options: ["開心", "平靜"] },
  ],
});

describe("AffinityTemplateService", () => {
  beforeEach(() => setActivePinia(createPinia()));

  it("預設模板：有範圍才印 /最大值，階段帶說明", () => {
    const text = affinityTemplateService.renderAffinityPrompt(
      config,
      createDefaultState("chat", config),
      "悠紀",
    );
    expect(text).toContain("- 好感度：72/100（曖昧：會吃醋）");
    expect(text).toContain("- 金錢：5000\n");
    expect(text).toContain("- 心情：平靜");
  });

  it("自動規則包含說明、範圍、單次上限和可選值", () => {
    const rules = affinityTemplateService.renderUpdateInstruction(config);
    expect(rules).toContain('<affinity-update 好感度="+2" 金錢="-1" 心情="開心" reason="原因"/>');
    expect(rules).toContain("- 好感度：範圍 0～100，每次最多變動 5。被誇獎會增加");
    expect(rules).toContain("- 金錢：沒有上下限");
    expect(rules).toContain("只能是「開心」「平靜」其中之一");
  });

  it("MVU 格式的規則用 _.set", () => {
    const rules = affinityTemplateService.renderUpdateInstruction({ ...config, updateFormat: "mvu" });
    expect(rules).toContain("<UpdateVariable>");
    expect(rules).toContain("_.set('好感度', 72, 74);//原因");
  });

  it("關掉送出時什麼都不送", () => {
    expect(affinityTemplateService.renderUpdateInstruction({ ...config, injectRules: false })).toBe("");
    expect(
      affinityTemplateService.renderAffinityPrompt(
        { ...config, injectStatus: false },
        createDefaultState("chat", config),
      ),
    ).toBe("");
  });

  it("自訂模板優先於 MVU 卡帶的模板（以前改了也沒效果）", () => {
    const text = affinityTemplateService.renderAffinityPrompt(
      { ...config, mvuEnabled: true, mvuPromptTemplate: "卡片模板", promptTemplate: "我的模板" },
      createDefaultState("chat", config),
    );
    expect(text).toBe("我的模板");
  });

  it("世界書 EJS 用 getvar('stat_data.角色名.指標') 讀得到目前值", () => {
    const state = createDefaultState("chat", config);
    state.values.aff = 88;
    const ctx = createStTemplateContext({ affinityConfig: config, affinityState: state, charName: "悠紀" });
    expect(ctx.getvar("stat_data.悠紀.好感度")).toBe(88);
    expect(ctx.getvar("stat_data.好感度")).toBe(88);
    expect((ctx.stat_data.悠紀 as Record<string, unknown>).好感度).toBe(88);
  });
});
