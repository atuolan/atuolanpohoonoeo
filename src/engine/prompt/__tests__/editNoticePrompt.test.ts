import { describe, expect, it } from "vitest";
import { PromptBuilder } from "@/engine/prompt/PromptBuilder";
import { createDefaultPromptManagerConfig } from "@/types/promptManager";

const NOW = new Date(2026, 9, 22, 21, 0);

function msg(isUser: boolean, content: string, extra: Record<string, unknown> = {}) {
  const t = NOW.getTime();
  return { id: `${content}-${isUser}`, is_user: isUser, name: isUser ? "用戶" : "阿玄", content, createdAt: t, storyTime: t, ...extra };
}

async function buildTexts(extra: Record<string, unknown>): Promise<string[]> {
  const result = await new PromptBuilder({
    character: { id: "char-1", data: { name: "阿玄", description: "" } },
    lorebooks: [],
    messages: [],
    settings: { maxContextLength: 100000, maxResponseLength: 1000 },
    userName: "小明",
    promptManagerConfig: createDefaultPromptManagerConfig(),
    enableRealTimeAwareness: false,
    ...extra,
  } as any).build();
  return result.messages.map((m: { content: unknown }) =>
    typeof m.content === "string" ? m.content : "",
  );
}

describe("改字被發現：提示詞附上原文", () => {
  it("被看到的訊息後面接上修改前的原文", async () => {
    const texts = await buildTexts({
      messages: [
        msg(false, "你會親我嗎"),
        msg(true, "該親的時候會親", { editNoticed: true, editOriginalContent: "該親的時候會清" }),
      ],
    });
    const edited = texts.find((c) => c.includes("該親的時候會親"));
    expect(edited).toContain("（小明送出後又改了這則訊息，阿玄看到了修改前的原文：「該親的時候會清」）");
  });

  it("群聊改成「群裡的人」", async () => {
    const texts = await buildTexts({
      groupChatMode: true,
      messages: [
        msg(false, "你會親我嗎"),
        msg(true, "該親的時候會親", { editNoticed: true, editOriginalContent: "該親的時候會清" }),
      ],
    });
    expect(texts.join("\n")).toContain("群裡的人看到了修改前的原文：「該親的時候會清」");
  });

  it("沒被看到就不提", async () => {
    const texts = await buildTexts({
      messages: [
        msg(false, "你會親我嗎"),
        msg(true, "該親的時候會親", { isUserEdited: true, editOriginalContent: "該親的時候會清" }),
      ],
    });
    expect(texts.join("\n")).not.toContain("該親的時候會清");
  });
});
