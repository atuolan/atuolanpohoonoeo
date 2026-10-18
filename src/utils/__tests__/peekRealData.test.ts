import { describe, expect, it } from "vitest";
import type { DiaryEntry } from "@/db/database";
import type { ChatMessage } from "@/types/chat";
import type { PeekChatThread } from "@/types/peekPhone";
import {
  buildPeekRealData,
  buildPendingCalls,
  describeRealDataForPrompt,
  describeRealPhotosForPrompt,
  mergeRealUserThread,
} from "@/utils/peekRealData";

const NOW = new Date(2026, 9, 18, 21, 0);
const opts = { userName: "小栩", charName: "沈既白", now: NOW };
let seq = 0;
const at = (h: number, m = 0, day = 18) => new Date(2026, 9, day, h, m).getTime();
function msg(over: Partial<ChatMessage>): ChatMessage {
  seq++;
  return {
    id: `m${seq}`,
    sender: "assistant",
    name: "沈既白",
    is_user: false,
    content: "",
    status: "sent",
    createdAt: at(12, seq),
    updatedAt: 0,
    ...over,
  } as ChatMessage;
}

describe("跟使用者那串用真的聊天", () => {
  it("角色傳的是自己傳的；紅包、轉帳、貼圖變成一行；收回的、系統訊息不放", () => {
    const real = buildPeekRealData(
      [
        msg({ sender: "user", is_user: true, name: "小栩", content: "你睡了嗎", createdAt: at(20, 1) }),
        msg({ content: "還沒", createdAt: at(20, 2) }),
        msg({ isTransfer: true, transferType: "pay", transferAmount: 520, transferNote: "宵夜", createdAt: at(20, 3) }),
        msg({ content: "[sticker:晚安]", createdAt: at(20, 4) }),
        msg({ sender: "system", content: "[行事曆] 已建立事件", createdAt: at(20, 5) }),
        msg({ isCharRecall: true, charRecallType: "hidden", charRecallHints: ["想念"], createdAt: at(20, 6) }),
      ],
      [],
      opts,
    );
    expect(real.userThread.map((m) => [m.isSelf, m.senderName, m.content])).toEqual([
      [false, "小栩", "你睡了嗎"],
      [true, "沈既白", "還沒"],
      [true, "沈既白", "[轉帳 520] 宵夜"],
      [true, "沈既白", "[貼圖]"],
    ]);
  });

  it("劇情時間優先", () => {
    const real = buildPeekRealData([msg({ content: "早", createdAt: at(9), storyTime: at(7, 0, 1) })], [], opts);
    expect(real.userThread[0].timestamp).toBe(at(7, 0, 1));
  });

  it("AI 寫的那串保留備註名和草稿，訊息換成真的；沒有那串就補一串", () => {
    const real = buildPeekRealData(
      [msg({ sender: "user", is_user: true, name: "小栩", content: "睡了嗎" }), msg({ content: "還沒" })],
      [],
      opts,
    ).userThread;
    const aiThreads: PeekChatThread[] = [
      { id: "t1", contactName: "笨蛋", isUser: true, draft: "其實…", messages: [], updatedAt: 1 },
      { id: "t2", contactName: "媽", messages: [], updatedAt: 1 },
    ];
    const merged = mergeRealUserThread(aiThreads, real, "小栩");
    expect(merged[0]).toMatchObject({ id: "t1", contactName: "笨蛋", draft: "其實…" });
    expect(merged[0].messages.map((m) => `${m.senderName}:${m.content}`)).toEqual(["笨蛋:睡了嗎", "沈既白:還沒"]);
    expect(mergeRealUserThread([aiThreads[1]], real, "小栩")[0]).toMatchObject({ contactName: "小栩", isUser: true });
    expect(mergeRealUserThread(aiThreads, [], "小栩")).toBe(aiThreads);
  });
});

describe("錢包、飲食、日記", () => {
  it("收下的轉帳、領了的紅包、他幫付的外送；從他的角度記，新的在前", () => {
    const order = {
      orderId: "o1",
      item: { itemId: "i", name: "牛肉麵", storeName: "店", section: "food", unitPrice: 180, quantity: 1 },
      subtotal: 180,
      shippingFee: 30,
      totalPrice: 210,
      recipientName: "小栩",
      createdBy: "user",
      payer: "assistant",
      status: "paid",
      createdAt: at(18),
      paidAt: at(18, 30),
    } as ChatMessage["waimaiOrder"];
    const real = buildPeekRealData(
      [
        msg({ sender: "user", is_user: true, isTransfer: true, transferType: "pay", transferAmount: 520, transferStatus: "received", createdAt: at(10) }),
        msg({ sender: "user", is_user: true, isTransfer: true, transferType: "pay", transferAmount: 99, transferStatus: "pending", createdAt: at(11) }),
        msg({ isTransfer: true, transferType: "pay", transferAmount: 1314, transferStatus: "received", transferNote: "生日快樂", createdAt: at(12, 0, 16) }),
        msg({
          sender: "user",
          is_user: true,
          isRedpacket: true,
          redpacketState: {
            totalCents: 6600, totalCount: 1, remainingCents: 0, remainingCount: 0, fullyClaimed: true,
            claims: [{ claimerName: "沈既白", isUser: false, cents: 6600, timestamp: at(13) }],
          },
          createdAt: at(12, 59),
        }),
        msg({ isWaimaiPaymentRequest: true, waimaiOrder: { ...order!, status: "payment_requested" }, createdAt: at(18) }),
        msg({ isWaimaiPaymentResult: true, waimaiOrder: order, createdAt: at(18, 30) }),
      ],
      [],
      opts,
    );
    expect(real.transactions.map((t) => [t.time, t.description, t.amount])).toEqual([
      ["18:30", "幫小栩付外送：牛肉麵", -210],
      ["13:00", "領了小栩的紅包", 66],
      ["10:00", "收到小栩的轉帳", 520],
      ["10/16 12:00", "轉帳給小栩（生日快樂）", -1314],
    ]);
  });

  it("今天小栩點給他、送到的外送算一餐", () => {
    const order = {
      orderId: "o2",
      item: { itemId: "i", name: "珍珠奶茶", storeName: "店", section: "kind", unitPrice: 60, quantity: 1 },
      subtotal: 60, shippingFee: 0, totalPrice: 60, recipientName: "沈既白",
      createdBy: "user", payer: "user", status: "delivered", createdAt: at(14), deliveredAt: at(15, 10),
    } as ChatMessage["waimaiOrder"];
    const real = buildPeekRealData([msg({ isWaimaiDelivery: true, waimaiOrder: order })], [], opts);
    expect(real.meals).toEqual([{ id: "real-o2", mealType: "snack", food: "珍珠奶茶", note: "小栩點給我的", time: "15:10" }]);
  });

  it("聊天日記：寫好的、新的在前，拿掉 Markdown", () => {
    const diaries = [
      { id: "d1", chatId: "c", characterId: "x", content: "# 今天\n**見到她了**", createdAt: at(22, 0, 17), messageCount: 1, status: "ready" },
      { id: "d2", chatId: "c", characterId: "x", content: "寫到一半", createdAt: at(22, 0, 18), messageCount: 1, status: "writing" },
    ] as DiaryEntry[];
    const real = buildPeekRealData([], diaries, opts);
    expect(real.diary).toEqual([{ id: "real-d1", date: "2026-10-17", mood: "neutral", content: "今天\n見到她了" }]);
  });

  it("給生成用的說明：交易、外送、日記日期", () => {
    const text = describeRealDataForPrompt(
      {
        userThread: [],
        transactions: [{ id: "t", description: "收到小栩的轉帳", amount: 520, time: "10:00" }],
        meals: [{ id: "m", mealType: "snack", food: "珍珠奶茶", time: "15:10" }],
        diary: [{ id: "d", date: "2026-10-17", mood: "neutral", content: "" }],
        photos: [{ id: "p", description: "海邊的夕陽", source: "scene", reason: "", date: "2026-10-16" }],
        pendingCalls: [{ id: "c", at: 0, time: "22:30", reason: "想聽你的聲音" }],
      },
      "小栩",
    );
    expect(text).toContain("- 10:00 收到小栩的轉帳 +520");
    expect(text).toContain("- 15:10 珍珠奶茶");
    expect(text).toContain("2026-10-17");
    expect(text).not.toContain("海邊的夕陽");
    expect(text).toContain("- 22:30，原因：想聽你的聲音");
  });
});

describe("相簿、通話、第一次聊天", () => {
  it("他傳的照片算他拍的，使用者傳的算他存的；新的在前，只留網址或 data URL", () => {
    const real = buildPeekRealData(
      [
        msg({ messageType: "descriptive-image", imageCaption: "窗外的雨", createdAt: at(10) }),
        msg({ sender: "user", is_user: true, name: "小栩", messageType: "image", imageUrl: "idb://blob/1", createdAt: at(11) }),
        msg({ messageType: "image-url", imageUrl: "https://x.test/a.jpg", imageCaption: "自拍一張", createdAt: at(12) }),
        msg({ messageType: "image", imageCaption: "收回的", isCharRecall: true, createdAt: at(13) }),
      ],
      [],
      opts,
    );
    expect(real.photos.map((p) => [p.source, p.description, p.reason, p.imageUrl])).toEqual([
      ["selfie", "自拍一張", "傳給小栩看的", "https://x.test/a.jpg"],
      ["saved", "小栩傳來的照片", "小栩傳給我的", undefined],
      ["scene", "窗外的雨", "傳給小栩看的", undefined],
    ]);
  });

  it("沒接通的電話變成他打出去的那通，原因藏起來", () => {
    const real = buildPeekRealData(
      [
        msg({ sender: "system", isCallNotification: true, callNotificationType: "declined", callReason: "想道歉", createdAt: at(19) }),
        msg({ sender: "system", isCallNotification: true, callNotificationType: "missed", createdAt: at(20) }),
      ],
      [],
      opts,
    );
    expect(real.userThread.map((m) => [m.isSelf, m.content, m.callReason])).toEqual([
      [true, "📞 撥出的電話 · 對方拒接", "想道歉"],
      [true, "📞 撥出的電話 · 沒有接通", undefined],
    ]);
  });

  it("第一次聊天：讀到最舊的就用第一則，不然用聊天建立時間", () => {
    const m = [msg({ content: "嗨", createdAt: at(9, 0, 3), storyTime: at(9, 0, 2) })];
    expect(buildPeekRealData(m, [], opts, { hasAllMessages: true, chatCreatedAt: at(8, 0, 1) }).firstChatDate).toBe("2026-10-02");
    expect(buildPeekRealData(m, [], opts, { hasAllMessages: false, chatCreatedAt: at(8, 0, 1) }).firstChatDate).toBe("2026-10-01");
  });
});

describe("給相簿組的照片說明", () => {
  it("有照片才給，寫日期、描述、為什麼存", () => {
    const real = buildPeekRealData([msg({ messageType: "descriptive-image", imageCaption: "窗外的雨" })], [], opts);
    expect(describeRealPhotosForPrompt(real)).toContain("- 2026-10-18 窗外的雨（傳給小栩看的）");
    expect(describeRealPhotosForPrompt(buildPeekRealData([], [], opts))).toBe("");
  });
});

describe("排好要打的電話", () => {
  it("照聊天的時間顯示，早的在前，沒原因的不放", () => {
    const realNow = new Date(2026, 9, 1, 12, 0).getTime();
    const calls = [
      { id: "b", characterId: "x", characterName: "", chatId: "c", triggerTime: realNow + 120 * 60_000, reason: "第二通", createdAt: 0 },
      { id: "a", characterId: "x", characterName: "", chatId: "c", triggerTime: realNow + 30 * 60_000, reason: "想你", createdAt: 0 },
      { id: "z", characterId: "x", characterName: "", chatId: "c", triggerTime: realNow, reason: " ", createdAt: 0 },
    ];
    expect(buildPendingCalls(calls, NOW, realNow).map((c) => [c.id, c.time])).toEqual([
      ["a", "21:30"],
      ["b", "23:00"],
    ]);
  });
});
