import { describe, expect, it } from "vitest";
import { PromptBuilder } from "@/engine/prompt/PromptBuilder";
import { createDefaultPromptManagerConfig } from "@/types/promptManager";

async function promptText(extra: Record<string, unknown>): Promise<string> {
  const result = await new PromptBuilder({
    character: { id: "char-1", data: { name: "跑團卡", description: "" } },
    lorebooks: [],
    messages: [
      { id: "m1", sender: "user", name: "User", is_user: true, status: "sent", content: ".ra 偵查 60", createdAt: 1, updatedAt: 1 },
    ],
    settings: { maxContextLength: 100000, maxResponseLength: 1000 },
    userName: "小美",
    promptManagerConfig: createDefaultPromptManagerConfig(),
    enableRealTimeAwareness: false,
    isMultiCharCard: true,
    multiCharMembers: [{ id: "a", name: "基拉奇" }, { id: "b", name: "雪拉比" }],
    ...extra,
  } as any).build();
  return result.messages.map((m: { content: unknown }) => (typeof m.content === "string" ? m.content : "")).join("\n");
}

describe("骰子機器人提示詞", () => {
  it("多人卡面對面：有擲骰紀錄才接上面對面版規則", async () => {
    const on = await promptText({ faceToFaceMode: true, diceBotActive: true });
    expect(on).toContain("<dice_bot>");
    expect(on).toContain("寫在正文裡角色擲骰的地方");
    const off = await promptText({ faceToFaceMode: true, diceBotActive: false });
    expect(off).not.toContain("<dice_bot>");
  });

  it("多人卡線上（群聊模式）：用群聊版規則", async () => {
    const text = await promptText({ groupChatMode: true, diceBotActive: true });
    expect(text).toContain("<dice_bot>");
    expect(text).toContain("放在 <content> 裡");
  });
});
