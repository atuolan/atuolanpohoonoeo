import { describe, expect, it } from "vitest";
import type { Chat, ChatMessage, PlurkActivity, PlurkShareSnapshot } from "@/types/chat";
import { convertStoredMessageToUiMessage, convertToStorableMessage } from "./chatMessageMapping";

const chat = { id: "c1", characterId: "char-1", name: "測試", messages: [], createdAt: 1, updatedAt: 1 } as unknown as Chat;
const deps = { characters: [], syncModeRequestFieldsFromContent: () => {} };
const stored = (extra: Partial<ChatMessage>): ChatMessage =>
  ({ id: "m1", sender: "assistant", name: "小明", content: "", is_user: false, status: "sent", createdAt: 1, updatedAt: 1, ...extra }) as ChatMessage;

const plurkShare: PlurkShareSnapshot = {
  ref: "plurk:p1",
  postId: "p1",
  sharedBy: "char",
  authorKind: "char",
  authorName: "小明",
  authorCharacterId: "char-1",
  audience: "friends",
  qualifier: "覺得",
  text: "今天天氣真好",
  imageCount: 1,
  imageDescription: "一張藍天照",
  postedAt: 1000,
  responseCount: 2,
  recentResponses: [
    { name: "阿華", text: "真的耶" },
    { name: "小美", text: "想去散步" },
  ],
  comment: { id: "r1", name: "阿華", text: "真的耶", qualifier: "說" },
};

const plurkActivity: PlurkActivity = {
  postId: "p1",
  commentId: "c9",
  content: "我也想去",
  qualifier: "回應",
  replyToId: "r1",
  replyToUsername: "阿華",
};

describe("噗文分享欄位來回轉換", () => {
  it("存檔→畫面→存檔後內容相同，且不是同一個物件參照", () => {
    const original = stored({ plurkShare, plurkActivity });

    const ui = convertStoredMessageToUiMessage(original, chat, deps);
    expect(ui.plurkShare).toEqual(plurkShare);
    expect(ui.plurkActivity).toEqual(plurkActivity);

    ui.plurkShare!.recentResponses[0].text = "改過了";
    ui.plurkActivity!.content = "改過了";
    expect(plurkShare.recentResponses[0].text).toBe("真的耶");
    expect(plurkActivity.content).toBe("我也想去");

    ui.plurkShare = plurkShare;
    ui.plurkActivity = plurkActivity;

    const back = convertToStorableMessage(ui, "小明");
    expect(back.plurkShare).toEqual(plurkShare);
    expect(back.plurkActivity).toEqual(plurkActivity);
    expect(back.plurkShare).not.toBe(plurkShare);
    expect(back.plurkActivity).not.toBe(plurkActivity);

    back.plurkShare!.comment!.text = "改過了";
    back.plurkActivity!.commentId = "改過了";
    expect(plurkShare.comment!.text).toBe("真的耶");
    expect(plurkActivity.commentId).toBe("c9");
  });
});
