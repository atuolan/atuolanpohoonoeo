import { describe, expect, it } from "vitest";
import { PromptBuilder } from "@/engine/prompt/PromptBuilder";
import { createDefaultPromptManagerConfig } from "@/types/promptManager";

const history = [
  { id: "m1", sender: "user", name: "User", is_user: true, status: "sent", content: "大家覺得呢", createdAt: 1, updatedAt: 1 },
  { id: "m2", sender: "assistant", name: "甲", senderCharacterId: "a", is_user: false, status: "sent", content: "我贊成", createdAt: 2, updatedAt: 2 },
  { id: "m3", sender: "assistant", name: "乙", senderCharacterId: "b", is_user: false, status: "sent", content: "我反對", createdAt: 3, updatedAt: 3 },
];

async function historyRoles(extra: Record<string, unknown>) {
  const result = await new PromptBuilder({
    character: { id: "a", data: { name: "甲", description: "" } },
    lorebooks: [],
    messages: history,
    settings: { maxContextLength: 100000, maxResponseLength: 1000 },
    userName: "小美",
    promptManagerConfig: createDefaultPromptManagerConfig(),
    enableRealTimeAwareness: false,
    groupChatMode: true,
    groupMembers: [{ characterId: "a", name: "甲" }, { characterId: "b", name: "乙" }],
    ...extra,
  } as any).build();
  const find = (text: string) =>
    result.messages.find((m: { content: unknown }) => typeof m.content === "string" && m.content.includes(text))?.role;
  return { mine: find("我贊成"), other: find("我反對") };
}

describe("圓桌模式的歷史訊息角色", () => {
  it("平常群聊：成員發言都是 assistant", async () => {
    expect(await historyRoles({})).toEqual({ mine: "assistant", other: "assistant" });
  });

  it("圓桌：只有這次的發言人是 assistant，其他人變 user", async () => {
    expect(await historyRoles({ roundTableSpeaker: { characterId: "a", name: "甲" } })).toEqual({
      mine: "assistant",
      other: "user",
    });
  });
});

describe("圓桌接力找「使用者這一輪說了什麼」", () => {
  const lastTurn = (msgs: unknown[]) =>
    (PromptBuilder as any).getLastUserTurnMessages(msgs).map((m: { id: string }) => m.id);

  it("平常遇到 AI 回覆就停", () => {
    expect(lastTurn(history)).toEqual([]);
  });

  it("同一輪前面成員的發言跳過，找得到使用者的訊息", () => {
    const marked = history.map((m) => (m.is_user ? m : { ...m, roundTableSameRound: true }));
    expect(lastTurn(marked)).toEqual(["m1"]);
  });
});
