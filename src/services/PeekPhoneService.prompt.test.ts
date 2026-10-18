import { describe, expect, it, vi } from "vitest";
import type { StoredCharacter } from "@/types/character";
import type { Chat } from "@/types/chat";

// 只測組 prompt 資料，不會真的呼叫 API
vi.mock("@/api/OpenAICompatible", () => ({ OpenAICompatibleClient: vi.fn() }));
vi.mock("@/stores/promptManager", () => ({ usePromptManagerStore: vi.fn() }));
vi.mock("@/stores/settings", () => ({ useSettingsStore: vi.fn() }));
vi.mock("@/storage/chatMessageStorage", () => ({ loadMessages: vi.fn(async () => []) }));

import { buildPromptContext, extractChatContext } from "./PeekPhoneService";

describe("PeekPhoneService：組 prompt 資料", () => {
  it("角色卡裡的 {{char}}／{{user}} 換成真名", async () => {
    const character = {
      id: "c1",
      nickname: "",
      data: {
        name: "沈既白",
        description: "{{char}}是外科醫生。",
        personality: "對{{user}}嘴硬",
        scenario: "{{user}}和{{char}}是同事",
      },
    } as unknown as StoredCharacter;

    const ctx = await buildPromptContext(character, "（聊天）", "小栩", "{{user}}是策展人", "{{char}}住在台北", "");

    expect(ctx.charDesc).toBe("沈既白是外科醫生。");
    expect(ctx.personality).toBe("對小栩嘴硬");
    expect(ctx.scenario).toBe("小栩和沈既白是同事");
    expect(ctx.userDescription).toBe("小栩是策展人");
    expect(ctx.worldInfo).toBe("沈既白住在台北");
    expect(ctx.now).toBeInstanceOf(Date);
  });

  it("最近的聊天紀錄用使用者的名字，不寫「用戶」", async () => {
    const chat = {
      id: "chat-1",
      messages: [
        { is_user: true, name: "You", content: "早點睡" },
        { is_user: false, name: "沈既白", content: "你也是" },
      ],
    } as unknown as Chat;

    const text = await extractChatContext(chat, 15, "小栩");

    expect(text).toBe("小栩: 早點睡\n沈既白: 你也是");
  });
});
