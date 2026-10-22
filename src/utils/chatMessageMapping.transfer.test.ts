import { describe, expect, it } from "vitest";
import type { Chat, ChatMessage } from "@/types/chat";
import { convertStoredMessageToUiMessage, convertToStorableMessage } from "./chatMessageMapping";

const chat = { id: "c1", characterId: "char-1", name: "測試", messages: [], createdAt: 1, updatedAt: 1 } as unknown as Chat;
const deps = { characters: [], syncModeRequestFieldsFromContent: () => {} };
const stored = (extra: Partial<ChatMessage>): ChatMessage =>
  ({ id: "m1", sender: "assistant", name: "小明", content: "", is_user: false, status: "sent", createdAt: 1, updatedAt: 1, ...extra }) as ChatMessage;

describe("轉帳狀態載入", () => {
  it("沒存狀態的角色轉帳（主動訊息、舊資料）當成待收款", () => {
    const ui = convertStoredMessageToUiMessage(stored({ isTransfer: true, transferType: "pay", transferAmount: 50 }), chat, deps);
    expect(ui.transferStatus).toBe("pending");
  });

  it("沒存狀態的使用者轉帳是已發送、角色的退款是已退回", () => {
    expect(
      convertStoredMessageToUiMessage(stored({ sender: "user", is_user: true, isTransfer: true, transferType: "pay", transferAmount: 50 }), chat, deps).transferStatus,
    ).toBe("sent");
    expect(
      convertStoredMessageToUiMessage(stored({ isTransfer: true, transferType: "refund", transferAmount: 50 }), chat, deps).transferStatus,
    ).toBe("refunded");
  });

  it("已存的狀態不動，結算欄位存得回去", () => {
    const ui = convertStoredMessageToUiMessage(
      stored({ sender: "user", is_user: true, isTransfer: true, transferType: "pay", transferAmount: 50, transferStatus: "refunded", transferSettledBy: "r1" }),
      chat,
      deps,
    );
    expect(ui.transferStatus).toBe("refunded");
    const back = convertToStorableMessage(ui, "小明");
    expect(back.transferSettledBy).toBe("r1");
  });
});
