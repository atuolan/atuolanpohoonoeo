import { describe, expect, it } from "vitest";
import { PromptBuilder } from "@/engine/prompt/PromptBuilder";
import { createDefaultPromptManagerConfig } from "@/types/promptManager";

const NOW = new Date(2026, 9, 22, 21, 0);

function msg(isUser: boolean, content: string, extra: Record<string, unknown> = {}) {
  const t = NOW.getTime();
  return { id: `${content}-${isUser}`, is_user: isUser, name: isUser ? "用戶" : "阿玄", content, createdAt: t, storyTime: t, ...extra };
}

const image = (extra: Record<string, unknown> = {}) => ({
  messageType: "image",
  imageData: "BASE64DATA",
  imageMimeType: "image/jpeg",
  ...extra,
});

async function build(messages: unknown[]) {
  const result = await new PromptBuilder({
    character: { id: "char-1", data: { name: "阿玄", description: "" } },
    lorebooks: [],
    messages,
    settings: { maxContextLength: 100000, maxResponseLength: 1000 },
    userName: "小明",
    promptManagerConfig: createDefaultPromptManagerConfig(),
    enableRealTimeAwareness: false,
  } as any).build();
  return result.messages as Array<{ content: string; imageData?: string }>;
}

describe("聊天歷史的圖片：只送這一輪的", () => {
  it("模型回應過的舊圖換成備註文字，不再帶圖片資料", async () => {
    const built = await build([
      msg(true, "[圖片]", image({ imageNote: "一隻橘貓趴在藍色沙發上" })),
      msg(false, "好胖的貓"),
      msg(true, "對吧"),
    ]);
    expect(built.some((m) => m.imageData)).toBe(false);
    expect(built.map((m) => m.content).join("\n")).toContain("[圖片：一隻橘貓趴在藍色沙發上]");
  });

  it("沒有備註時用 user 寫的說明", async () => {
    const built = await build([
      msg(true, "我的貓", image({ imageCaption: "我的貓" })),
      msg(false, "好胖的貓"),
      msg(true, "對吧"),
    ]);
    expect(built.map((m) => m.content).join("\n")).toContain("我的貓\n[圖片：我的貓]");
  });

  it("這一輪傳的圖保留圖片資料", async () => {
    const built = await build([
      msg(false, "在幹嘛"),
      msg(true, "[圖片]", image()),
    ]);
    expect(built.some((m) => m.imageData === "BASE64DATA")).toBe(true);
  });
});
