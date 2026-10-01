import { describe, expect, it } from "vitest";
import { PromptBuilder } from "@/engine/prompt/PromptBuilder";
import type { ChatLocalPrompt } from "@/types/chat";
import {
  createDefaultPromptManagerConfig,
  DEFAULT_PHONE_CALL_PROMPT_ORDER,
} from "@/types/promptManager";

function entry(patch: Partial<ChatLocalPrompt> & { id: string }): ChatLocalPrompt {
  return {
    name: patch.id,
    role: "system",
    content: `【${patch.id}】`,
    placement: "end",
    depth: 0,
    modes: ["online", "f2f"],
    enabled: true,
    createdAt: 1,
    updatedAt: 1,
    ...patch,
  };
}

function builder(extra: Record<string, unknown>) {
  return new PromptBuilder({
    character: { id: "char-1", data: { name: "角色", description: "" } },
    lorebooks: [],
    messages: [],
    settings: { maxContextLength: 100000, maxResponseLength: 1000 },
    userName: "用戶",
    promptManagerConfig: createDefaultPromptManagerConfig(),
    ...extra,
  } as any) as any;
}

function orderIds(extra: Record<string, unknown>): string[] {
  return builder(extra)
    .getEffectivePromptOrder()
    .map((e: { identifier: string }) => e.identifier);
}

describe("PromptBuilder 套用專屬預設", () => {
  const prompts = [
    entry({ id: "chat__top", placement: "top" }),
    entry({ id: "chat__before", placement: "beforeHistory" }),
    entry({ id: "chat__end", placement: "end" }),
    entry({ id: "chat__call", placement: "end", modes: ["call"] }),
  ];

  it("線上模式：專屬條目落在指定位置，通話專用的不帶上", () => {
    const ids = orderIds({ chatLocalPrompts: prompts });
    expect(ids[0]).toBe("chat__top");
    expect(ids[ids.indexOf("chatHistory") - 1]).toBe("chat__before");
    expect(ids[ids.length - 1]).toBe("chat__end");
    expect(ids).not.toContain("chat__call");
  });

  it("面對面模式：以面對面的聊天記錄為基準", () => {
    const ids = orderIds({ chatLocalPrompts: prompts, faceToFaceMode: true });
    expect(ids[0]).toBe("chat__top");
    expect(ids[ids.indexOf("f2fChatHistory") - 1]).toBe("chat__before");
    expect(ids[ids.length - 1]).toBe("chat__end");
  });

  it("電話模式：只帶上勾選了通話的條目", () => {
    const ids = orderIds({ chatLocalPrompts: prompts, phoneCallMode: true });
    const added = ids.filter(
      (id) => !DEFAULT_PHONE_CALL_PROMPT_ORDER.some((e) => e.identifier === id),
    );
    expect(added).toEqual(["chat__call"]);
  });

  it("群通話算通話模式，不算群聊", () => {
    const ids = orderIds({
      chatLocalPrompts: [
        entry({ id: "chat__gc", modes: ["gc"] }),
        entry({ id: "chat__call", modes: ["call"] }),
      ],
      groupChatMode: true,
      groupCallMode: true,
    });
    expect(ids).toContain("chat__call");
    expect(ids).not.toContain("chat__gc");
  });

  it("強制開關只影響列出的條目", () => {
    const base = builder({}).getEffectivePromptOrder();
    const target = base.find((e: { enabled: boolean }) => e.enabled).identifier;
    const forced = builder({ chatPromptToggles: { [target]: false } }).getEffectivePromptOrder();

    expect(forced.find((e: { identifier: string }) => e.identifier === target).enabled).toBe(false);
    expect(forced.filter((e: { enabled: boolean }) => e.enabled)).toHaveLength(
      base.filter((e: { enabled: boolean }) => e.enabled).length - 1,
    );
  });

  it("「聊天記錄裡」的條目轉成絕對深度插入", () => {
    const b = builder({ chatLocalPrompts: [entry({ id: "chat__depth", placement: "depth", depth: 3 })] });
    const def = b.getPromptDefinition("chat__depth");
    expect(def.injection_position).toBe(1);
    expect(def.injection_depth).toBe(3);

    const relative = builder({ chatLocalPrompts: [entry({ id: "chat__end" })] }).getPromptDefinition(
      "chat__end",
    );
    expect(relative.injection_position).toBe(0);
  });

  it("實際組出的提示詞裡，專屬條目出現在對應位置", async () => {
    const result = await builder({
      chatLocalPrompts: prompts,
      messages: [
        {
          id: "m1",
          sender: "user",
          name: "用戶",
          is_user: true,
          content: "你好嗎",
          status: "sent",
          createdAt: 1,
          updatedAt: 1,
        },
      ],
    }).build();

    const text = result.messages.map((m: { content: string }) => m.content).join("\n");
    const top = text.indexOf("【chat__top】");
    const before = text.indexOf("【chat__before】");
    const history = text.indexOf("你好嗎");
    const end = text.indexOf("【chat__end】");

    expect(top).toBeGreaterThanOrEqual(0);
    expect(top).toBeLessThan(before);
    expect(before).toBeLessThan(history);
    expect(history).toBeLessThan(end);
    expect(text).not.toContain("【chat__call】");
  });
});
