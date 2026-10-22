import { describe, expect, it } from "vitest";
import { PromptBuilder } from "@/engine/prompt/PromptBuilder";
import { createDefaultPromptManagerConfig } from "@/types/promptManager";

let t = 0;
function msg(extra: Record<string, unknown>) {
  t += 1000;
  const isUser = extra.sender === "user";
  return {
    id: `m${t}`,
    sender: isUser ? "user" : "assistant",
    name: isUser ? "User" : "小明",
    is_user: isUser,
    status: "sent",
    content: "",
    createdAt: 1_790_000_000_000 + t,
    updatedAt: 1_790_000_000_000 + t,
    ...extra,
  };
}

async function historyTexts(messages: unknown[], extra: Record<string, unknown> = {}): Promise<string[]> {
  const result = await new PromptBuilder({
    character: { id: "char-1", data: { name: "小明", description: "" } },
    lorebooks: [],
    messages,
    settings: { maxContextLength: 100000, maxResponseLength: 1000 },
    userName: "小美",
    promptManagerConfig: createDefaultPromptManagerConfig(),
    enableRealTimeAwareness: false,
    ...extra,
  } as any).build();
  // 連續的同角色訊息會被合併成一則，所以看全部內容
  return result.messages.map((m: { content: unknown }) => (typeof m.content === "string" ? m.content : ""));
}

describe("聊天歷史裡的卡片訊息", () => {
  it("角色的轉帳不再是空白，帶上使用者領了沒", async () => {
    const texts = await historyTexts([
      msg({ sender: "user", content: "我今天好累" }),
      msg({ isTransfer: true, transferType: "pay", transferAmount: 520, transferNote: "奶茶", transferStatus: "refunded" }),
      msg({ sender: "user", content: "不用啦" }),
    ]);
    const joined = texts.join("\n");
    expect(joined).toContain("<pay>520:奶茶</pay>[轉帳狀態：小美已退回]");
  });

  it("還沒領的寫還沒領取", async () => {
    const texts = await historyTexts([
      msg({ isTransfer: true, transferType: "pay", transferAmount: 88, transferStatus: "pending" }),
      msg({ sender: "user", content: "嗯？" }),
    ]);
    expect(texts.join("\n")).toContain("[轉帳狀態：小美還沒領取]");
  });

  it("使用者的轉帳說角色收了沒", async () => {
    const texts = await historyTexts([
      msg({ sender: "user", content: "<pay>100:飯錢</pay>", isTransfer: true, transferType: "pay", transferAmount: 100, transferNote: "飯錢", transferStatus: "sent" }),
    ]);
    expect(texts.join("\n")).toContain("<pay>100:飯錢</pay>[轉帳狀態：小明還沒收下]");
  });

  it("紅包、位置、禮物、語音也寫出來", async () => {
    const joined = (
      await historyTexts([
        msg({ sender: "user", content: "在嗎" }),
        msg({ isRedpacket: true, redpacketData: { amount: "66", blessing: "發財" } }),
        msg({ isLocation: true, locationContent: "星巴克信義店" }),
        msg({ isGift: true, giftName: "玫瑰" }),
        msg({ sender: "user", content: "🎤 語音訊息 (0:05)", messageType: "audio", audioTranscript: "我也到了" }),
      ])
    ).join("\n");
    expect(joined).toContain('<redpacket amount="66" blessing="發財"/>[紅包狀態：還沒有人領]');
    expect(joined).toContain("<location>星巴克信義店</location>");
    expect(joined).toContain("<送禮物>玫瑰</送禮物>");
    expect(joined).toContain("[語音訊息] 我也到了");
    expect(joined).not.toContain("🎤");
  });

  it("面對面邀請被拒絕時角色看得到", async () => {
    const texts = await historyTexts([
      msg({ isFaceToFaceRequest: true, faceToFaceRequestReason: "想見你", faceToFaceRequestStatus: "rejected" }),
      msg({ sender: "user", content: "今天不行" }),
    ]);
    expect(texts.join("\n")).toContain("[邀請狀態：小美拒絕了]");
  });
});
