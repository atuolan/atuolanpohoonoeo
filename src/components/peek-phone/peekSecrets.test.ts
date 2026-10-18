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
    expect(unfoundByPlace(secrets, progress)).toEqual({
      lock: 1,
      chat: 1,
      gallery: 1,
      browser: 1,
      settings: 1,
      memo: 0,
      schedule: 0,
    });
  });

  it("看過幾 %：只算桌面上的 App", () => {
    expect(viewedPercent({ unlocked: false, revealed: [], viewed: [] })).toBe(0);
    expect(viewedPercent({ unlocked: false, revealed: [], viewed: ["chat", "gallery", "browser"] })).toBe(33);
    expect(viewedPercent({ unlocked: false, revealed: [], viewed: ["chat", "hidden", "notes"] })).toBe(11);
  });
});

describe("角色待辦與行程裡的秘密", () => {
  it("標了秘密的待辦、行程算這支手機的秘密，放在備忘錄、行事曆", () => {
    const planner = {
      todos: [
        { id: "t1", text: "偷偷訂戒指", done: false, secret: true, source: "chat" as const, createdAt: 0 },
        { id: "t2", text: "買花", done: false, source: "chat" as const, createdAt: 0 },
      ],
      plans: [{ id: "p1", date: "2026-10-24", title: "去看婚戒", secret: true, source: "chat" as const, createdAt: 0 }],
    };
    const secrets = listSecrets(phone(), planner);
    expect(secrets.map((s) => [s.key, s.place, s.detail])).toEqual([
      ["todo:t1", "memo", "偷偷訂戒指"],
      ["plan:p1", "schedule", "10/24（六） 去看婚戒"],
    ]);
    expect(unfoundByPlace(secrets, { unlocked: true, revealed: ["todo:t1"], viewed: [] }).schedule).toBe(1);
  });
});

describe("電話裡的秘密", () => {
  it("沒接通的電話原因算訊息裡的秘密，排好的電話算行事曆的", () => {
    const data = phone({
      chats: [
        {
          id: "u",
          contactName: "笨蛋",
          isUser: true,
          updatedAt: 0,
          messages: [
            { id: "real-1", senderName: "他", content: "📞 打給小栩，沒人接", isSelf: true, timestamp: 0, callReason: "想道歉" },
            { id: "real-2", senderName: "他", content: "📞 打給小栩，沒人接", isSelf: true, timestamp: 0 },
          ],
        },
      ],
    });
    const secrets = listSecrets(data, null, [{ id: "pc1", time: "22:30", reason: "想聽你的聲音" }]);
    expect(secrets.map((s) => [s.key, s.place, s.detail])).toEqual([
      [secretKeys.call("real-1"), "chat", "想道歉"],
      [secretKeys.call("pc1"), "schedule", "22:30：想聽你的聲音"],
    ]);
  });
});
