import { describe, expect, it } from "vitest";
import type { PeekPhoneData } from "@/types/peekPhone";
import { listSecrets, secretKeys, unfoundByPlace, viewedPercent } from "./peekSecrets";

function phone(overrides: Partial<PeekPhoneData> = {}): PeekPhoneData {
  return {
    characterId: "c1",
    chats: [],
    schedule: [],
    meals: [],
    balance: 0,
    transactions: [],
    memos: [],
    notes: [],
    diary: [],
    gallery: [],
    browserHistory: [],
    hiddenPhotos: [],
    ...overrides,
  };
}

describe("peekSecrets", () => {
  it("沒有秘密欄位的舊資料：一個秘密都沒有", () => {
    expect(listSecrets(phone())).toEqual([]);
    expect(listSecrets(null)).toEqual([]);
  });

  it("每種秘密各算一個，順序是鎖屏、訊息、相簿、瀏覽器、設定", () => {
    const data = phone({
      lockScreen: { passcode: "0912", hint: "初遇那天", reveal: "0912 是初遇" },
      chats: [
        {
          id: "t1",
          contactName: "栩",
          updatedAt: 1,
          draft: "其實那天我不是剛好路過。",
          messages: [
            { id: "m1", senderName: "沈既白", content: "我調班了。\n就是想去。", isSelf: true, timestamp: 1, recalled: true },
            { id: "m2", senderName: "栩", content: "你睡了嗎", isSelf: false, timestamp: 2 },
          ],
        },
      ],
      gallery: [
        { id: "g1", description: "台階", source: "scene", reason: "", date: "", deletedDaysLeft: 14, secret: "刪了三次" },
        // 刪了但沒故事，不算秘密
        { id: "g2", description: "窗外", source: "scene", reason: "", date: "", deletedDaysLeft: 3 },
      ],
      hiddenPhotos: [{ id: "h1", description: "側臉", type: "selfie", reason: "", date: "" }],
      browserHistory: [
        { id: "b1", title: "失眠", url: "", time: "", category: "search" },
        { id: "b2", title: "x", url: "", time: "", category: "adult" },
      ],
      screenTime: { hourly: [], topApps: [], pickups: 0, firstPickup: "", insight: "凌晨都在同一個聊天室" },
    });

    const secrets = listSecrets(data);
    expect(secrets.map((s) => s.key)).toEqual([
      secretKeys.lock("0912"),
      secretKeys.recalled("m1"),
      secretKeys.draft("t1"),
      secretKeys.photo("g1"),
      secretKeys.hidden,
      secretKeys.browser,
      secretKeys.screen,
    ]);
    expect(secrets[1]).toMatchObject({ label: "對栩收回的那句話", detail: "我調班了。", target: { view: "chat", threadId: "t1" } });
    expect(secrets[0].hint).toBe("鎖屏密碼：初遇那天");

    const progress = { unlocked: true, revealed: [secretKeys.recalled("m1"), secretKeys.hidden], viewed: [] };
    expect(unfoundByPlace(secrets, progress)).toEqual({ lock: 1, chat: 1, gallery: 1, browser: 1, settings: 1 });
  });

  it("看過幾 %：只算桌面上的 App", () => {
    expect(viewedPercent({ unlocked: false, revealed: [], viewed: [] })).toBe(0);
    expect(viewedPercent({ unlocked: false, revealed: [], viewed: ["chat", "gallery", "browser"] })).toBe(33);
    expect(viewedPercent({ unlocked: false, revealed: [], viewed: ["chat", "hidden", "notes"] })).toBe(11);
  });
});
