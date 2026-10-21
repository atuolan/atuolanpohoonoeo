import { describe, expect, it, vi } from "vitest";

vi.mock("@/stores/qzone", () => ({ useQzoneStore: vi.fn() }));
vi.mock("@/stores/characters", () => ({ useCharactersStore: vi.fn() }));
vi.mock("@/stores/settings", () => ({ useSettingsStore: vi.fn() }));

const { buildImpressionPrompt, parseImpressionTags } = await import("./plurkProfile");

describe("整理印象", () => {
  it("提示詞帶名字、個性、說過的話", () => {
    const prompt = buildImpressionPrompt({ name: "譚尧", personality: "嘴硬", description: "醫生", lines: ["早點睡"] });
    expect(prompt).toContain("「譚尧」");
    expect(prompt).toContain("個性：嘴硬");
    expect(prompt).toContain("- 早點睡");
  });
  it("標籤去重、去 #、太長的丟掉、最多 5 個；沒有就 null", () => {
    expect(parseImpressionTags('{"tags": ["嘴硬", "#夜貓子", "嘴硬", "這個標籤實在是寫得太長了啦啦", 3, "a", "b", "c", "d"]}')).toEqual([
      "嘴硬", "夜貓子", "a", "b", "c",
    ]);
    expect(parseImpressionTags('{"tags": []}')).toBeNull();
    expect(parseImpressionTags("沒有")).toBeNull();
  });
});
