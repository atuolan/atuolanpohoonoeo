import { describe, expect, it, vi } from "vitest";

vi.mock("@/stores/qzone", () => ({ useQzoneStore: vi.fn() }));
vi.mock("@/services/plurkAI", async () => {
  const actual = await vi.importActual<typeof import("./plurkAI")>("./plurkAI");
  return { ...actual, generatePlurkText: vi.fn(), hasPlurkApi: vi.fn() };
});
vi.mock("@/stores/settings", () => ({ useSettingsStore: vi.fn() }));

const { buildAppealPrompt, parseAppealDecision } = await import("./plurkModeration");

describe("申訴", () => {
  it("提示詞帶原因、申訴內容、嚴格度", () => {
    const prompt = buildAppealPrompt({ reason: "洗版", appeal: "我只是回同一個停車地點", strictnessHint: "阿杏很嚴。" });
    expect(prompt).toContain("「洗版」");
    expect(prompt).toContain("我只是回同一個停車地點");
    expect(prompt).toContain("阿杏很嚴。");
  });
  it("解析結果；格式不對回 null", () => {
    expect(parseAppealDecision('```json\n{"approved": true, "reply": "下次注意"}\n```')).toEqual({ approved: true, reply: "下次注意" });
    expect(parseAppealDecision('{"approved": "yes"}')).toBeNull();
    expect(parseAppealDecision("不給")).toBeNull();
  });
});
