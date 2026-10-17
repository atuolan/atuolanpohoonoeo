import { describe, expect, it } from "vitest";
import { PromptBuilder } from "@/engine/prompt/PromptBuilder";
import { createDefaultPromptManagerConfig } from "@/types/promptManager";

function msg(id: string, isUser: boolean, content: string) {
  return {
    id,
    sender: isUser ? "user" : "assistant",
    name: isUser ? "小林" : "小鯤",
    is_user: isUser,
    content,
    status: "sent",
    createdAt: 1,
    updatedAt: 1,
  };
}

async function build(extra: Record<string, unknown> = {}) {
  const builder = new PromptBuilder({
    character: {
      id: "char-1",
      data: {
        name: "小鯤",
        description: "住在北冥的一條魚",
        personality: "愛吐槽",
        scenario: "",
        first_mes: "這句開場白不該出現",
      },
    },
    lorebooks: [],
    messages: [msg("m1", true, "所以小鳥也算逍遙嗎？")],
    settings: { maxContextLength: 100000, maxResponseLength: 1000 },
    userName: "小林",
    userPersona: "上班族，喜歡古文",
    promptManagerConfig: createDefaultPromptManagerConfig(),
    companionReadingMode: true,
    companionReading: { bookTitle: "莊子", readingWindow: "【逍遙遊】\n北冥有魚，其名為鯤。" },
    summaries: [{ id: "s1", content: "上週一起去了海邊", createdAt: 1 }],
    importantEvents: [{ id: "e1", content: "小林換了新工作" }],
    recentChatHistory: [{ role: "user", name: "小林", content: "今天好累", createdAt: 1 }],
    ...extra,
  } as any);
  const result = await builder.build();
  return result.messages.map((m) => m.content).join("\n---\n");
}

describe("伴讀模式提示詞", () => {
  it("帶入書名、讀到的內容、角色與人設", async () => {
    const text = await build();
    expect(text).toContain("《莊子》");
    expect(text).toContain("北冥有魚，其名為鯤。");
    expect(text).toContain("住在北冥的一條魚");
    expect(text).toContain("上班族，喜歡古文");
    expect(text).toContain("不可以透露");
  });

  it("跟私聊共用記憶：總結、重要事件、最近對話", async () => {
    const text = await build();
    expect(text).toContain("上週一起去了海邊");
    expect(text).toContain("小林換了新工作");
    expect(text).toContain("今天好累");
  });

  it("不放開場白，伴讀對話放在最後", async () => {
    const text = await build();
    expect(text).not.toContain("這句開場白不該出現");
    // 聊天紀錄會被 <Chat history> 標記包住；伴讀對話是最後一則真正的訊息
    const parts = text.split("\n---\n").filter((p) => !/^<\/?Chat history>$/.test(p.trim()));
    expect(parts[parts.length - 1]).toContain("所以小鳥也算逍遙嗎？");
    expect(text.indexOf("回覆格式")).toBeLessThan(text.indexOf("所以小鳥也算逍遙嗎？"));
  });

  it("世界書照關鍵字觸發，不是整包塞", async () => {
    const lorebooks = [
      {
        id: "lb",
        name: "設定",
        entries: [
          { uid: 1, key: ["逍遙"], content: "觸發到的條目", enabled: true, order: 100, position: 0 },
          { uid: 2, key: ["火星"], content: "不該出現的條目", enabled: true, order: 100, position: 0 },
        ],
      },
    ];
    const text = await build({ lorebooks });
    expect(text).toContain("觸發到的條目");
    expect(text).not.toContain("不該出現的條目");
  });
});
