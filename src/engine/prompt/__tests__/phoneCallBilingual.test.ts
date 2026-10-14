import { describe, expect, it } from "vitest";
import { PromptBuilder } from "@/engine/prompt/PromptBuilder";
import { createDefaultPromptManagerConfig } from "@/types/promptManager";

function makeBuilder(extra: Record<string, unknown>) {
  return new PromptBuilder({
    character: { id: "char-1", data: { name: "小雪", description: "" } },
    lorebooks: [],
    messages: [
      {
        id: "m1",
        sender: "user",
        name: "User",
        content: "在嗎",
        is_user: true,
        status: "sent",
        createdAt: 1,
        updatedAt: 1,
      },
    ],
    settings: { maxContextLength: 100000, maxResponseLength: 1000 },
    userName: "用戶",
    promptManagerConfig: createDefaultPromptManagerConfig(),
    phoneCallMode: true,
    enableRealTimeAwareness: false,
    ...extra,
  } as any) as any;
}

const orderIds = (extra: Record<string, unknown>): string[] =>
  makeBuilder(extra)
    .getEffectivePromptOrder()
    .map((e: { identifier: string }) => e.identifier);

async function render(builder: any, id: string): Promise<string> {
  const out = await builder.buildPromptContent(id, {}, builder.getPromptDefinition(id));
  return (Array.isArray(out) ? out[0] : out).content;
}

describe("電話雙語字幕提示詞", () => {
  it("只在開啟時注入，位置在聊天紀錄之前", () => {
    const ids = orderIds({ callBilingual: true });
    expect(ids).toContain("phoneCallBilingual");
    expect(ids.indexOf("phoneCallBilingual")).toBeLessThan(ids.indexOf("chatHistory"));
    expect(orderIds({})).not.toContain("phoneCallBilingual");
  });

  it("規則條目會替換角色名", async () => {
    const content = await render(makeBuilder({ callBilingual: true }), "phoneCallBilingual");
    expect(content).toContain("小雪 實際說出口的原文");
    expect(content).toContain('"lang": "Japanese"');
  });

  it("確認指令只在雙語時多一行提醒", async () => {
    expect(await render(makeBuilder({ callBilingual: true }), "phoneCallConfirmLastOutput")).toContain(
      "雙語通話：text 只放 小雪 說出口的原文",
    );
    expect(await render(makeBuilder({}), "phoneCallConfirmLastOutput")).not.toContain("雙語通話");
  });

  it("來電觸發也帶提醒", async () => {
    const content = await render(
      makeBuilder({ callBilingual: true, incomingCallMode: true }),
      "phoneCallIncomingTrigger",
    );
    expect(content.startsWith("[start]")).toBe(true);
    expect(content).toContain("雙語通話");
    expect(await render(makeBuilder({ incomingCallMode: true }), "phoneCallIncomingTrigger")).toBe("[start]");
  });
});
