import { describe, expect, it } from "vitest";
import { PromptBuilder } from "@/engine/prompt/PromptBuilder";

function build(extra: Record<string, unknown>) {
  return new PromptBuilder({
    character: { data: { name: "角色", description: "" } },
    messages: [],
    userName: "用戶",
    ...extra,
  } as any) as any;
}

/** 直接呼叫總結條目（buildPromptContent 是 private，測試用 any 取用） */
function summariesBlock(identifier: string, extra: Record<string, unknown>) {
  return build(extra).buildPromptContent(identifier, {}, undefined);
}

describe("總結條目接上記憶互通", () => {
  const summaries = [{ id: "s1", content: "自己的總結", createdAt: 1 }];

  it("接在自己的總結之後", async () => {
    const result = await summariesBlock("summaries", {
      summaries,
      linkedMemories: "[成員的私聊記憶]\n互通內容",
    });
    expect(result.content.indexOf("自己的總結")).toBeLessThan(
      result.content.indexOf("[成員的私聊記憶]"),
    );
    expect(result.content.endsWith("互通內容")).toBe(true);
  });

  it("自己沒有總結時，只有互通記憶也會輸出（三種模式）", async () => {
    for (const id of ["summaries", "f2fSummaries", "gcSummaries"]) {
      const result = await summariesBlock(id, { linkedMemories: "互通內容" });
      expect(result.content).toBe("互通內容");
    }
  });

  it("總結、向量記憶、互通記憶都沒有時不輸出", async () => {
    expect(await summariesBlock("summaries", {})).toBeNull();
  });
});
