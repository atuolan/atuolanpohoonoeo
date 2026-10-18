import { describe, expect, it } from "vitest";
import { PromptBuilder } from "@/engine/prompt/PromptBuilder";
import { createDefaultPromptManagerConfig } from "@/types/promptManager";

async function buildTexts(extra: Record<string, unknown>): Promise<string[]> {
  const result = await new PromptBuilder({
    character: { id: "char-1", data: { name: "沈既白", description: "" } },
    lorebooks: [],
    messages: [],
    settings: { maxContextLength: 100000, maxResponseLength: 1000 },
    userName: "小栩",
    promptManagerConfig: createDefaultPromptManagerConfig(),
    ...extra,
  } as any).build();
  return result.messages.map((m: { content: unknown }) =>
    typeof m.content === "string" ? m.content : "",
  );
}

const list = "還沒做完的待辦：\n- 買草莓蛋糕";

describe("角色待辦與行程條目", () => {
  it("單人線上聊天帶清單和標籤用法", async () => {
    const block = (await buildTexts({ charPlanner: list })).find((c) => c.includes("<char_planner>"));
    expect(block).toContain(list);
    expect(block).not.toContain("{{charPlanner}}");
    expect(block).toContain('<char-todo add="內容"');
    expect(block).toContain('<char-plan date="YYYY-MM-DD"');
    expect(block).toContain("沈既白");
    expect(block).toContain("小栩");
  });

  it("聊天頁沒給清單（群聊、通話）時整個條目不輸出", async () => {
    expect((await buildTexts({})).some((c) => c.includes("<char_planner>"))).toBe(false);
  });

  it("面對面、群聊不輸出", async () => {
    const f2f = await buildTexts({
      charPlanner: list,
      faceToFaceMode: true,
      promptManagerConfig: { ...createDefaultPromptManagerConfig(), faceToFacePromptOrder: undefined },
    });
    expect(f2f.some((c) => c.includes("<char_planner>"))).toBe(false);
    const gc = await buildTexts({ charPlanner: list, groupChatMode: true });
    expect(gc.some((c) => c.includes("<char_planner>"))).toBe(false);
  });
});
