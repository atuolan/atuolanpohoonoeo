import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CharAway, Chat, ChatMessage } from "@/types/chat";
import { canUseCharAway } from "./charAway";
import {
  activatePlanIfDue,
  cancelCharAway,
  recordCharAwayCall,
  returnCharAwayIfDue,
  setCharAwayViewingChat,
  startCharAway,
  startCharBusy,
  startCharSleep,
  urgeCharAway,
  wakeCharAwayNow,
} from "./charAwayRuntime";

const NOW = new Date(2026, 3, 1, 12, 0).getTime();
const NIGHT = new Date(2026, 3, 1, 23, 40).getTime();
const MINUTE = 60 * 1000;

/** 測試用的假資料庫與間諜（vi.mock 的工廠會用到，所以要先 hoisted） */
const store = vi.hoisted(() => ({
  chats: new Map<string, any>(),
  messages: new Map<string, any[]>(),
  saves: [] as any[],
  incrementUnread: vi.fn(async () => undefined),
  pushSend: vi.fn(),
  sendReply: vi.fn(async () => true),
}));

vi.mock("@/storage/chatStorage", () => ({
  loadChatById: vi.fn(async (chatId: string) => store.chats.get(chatId)),
  loadAllChats: vi.fn(async () => Array.from(store.chats.values())),
  saveChatMetadata: vi.fn(async (chat: any) => {
    const existing = store.chats.get(chat.id);
    store.chats.set(chat.id, { ...existing, ...chat, messages: [] });
    store.saves.push({
      chatId: chat.id,
      charAway: chat.charAway,
      charAwayPlan: chat.charAwayPlan,
    });
  }),
  refreshChatDerivedMetadata: vi.fn(async () => undefined),
  incrementLocalChatUnreadCount: (...args: any[]) =>
    (store.incrementUnread as any)(...args),
}));

vi.mock("@/storage/chatMessageStorage", () => ({
  loadMessages: vi.fn(async (chatId: string) => store.messages.get(chatId) ?? []),
  appendMessages: vi.fn(async (chatId: string, newMessages: any[]) => {
    const list = store.messages.get(chatId) ?? [];
    list.push(...newMessages);
    store.messages.set(chatId, list);
  }),
}));

vi.mock("@/native/platform", () => ({
  hasNativeNotifications: () => false,
}));

vi.mock("@/services/PushNotificationService", () => ({
  pushNotificationService: { send: store.pushSend },
}));

vi.mock("@/services/ProactiveMessageService", () => ({
  proactiveMessageService: { sendCharAwayReturnReply: store.sendReply },
}));

vi.mock("@/stores", () => ({
  useCharactersStore: () => ({
    characters: [{ id: "c1", data: { name: "阿明" } }],
  }),
}));

function makeAway(overrides: Partial<CharAway> = {}): CharAway {
  return {
    id: "away_1",
    reason: "開會",
    backText: "我回來了",
    startedAt: NOW,
    returnAt: NOW + 10 * MINUTE,
    urgeCount: 0,
    callCount: 0,
    updatedAt: NOW,
    ...overrides,
  };
}

function seedChat(overrides: Partial<Chat> = {}): Chat {
  const chat = {
    id: "chat1",
    name: "與 阿明 的對話",
    characterId: "c1",
    messages: [],
    metadata: {},
    createdAt: NOW - 1000,
    updatedAt: NOW - 1000,
    ...overrides,
  } as Chat;
  store.chats.set(chat.id, chat);
  store.messages.set(chat.id, []);
  return chat;
}

function leftMessage(away: CharAway, createdAt: number): ChatMessage {
  return {
    id: `msg_left_${createdAt}`,
    sender: "user",
    name: "你",
    content: "在嗎",
    is_user: true,
    status: "sent",
    createdAt,
    updatedAt: createdAt,
    sentWhileAway: away.id,
  } as ChatMessage;
}

beforeEach(() => {
  vi.useFakeTimers({ now: NOW });
  store.chats.clear();
  store.messages.clear();
  store.saves.length = 0;
  store.incrementUnread.mockClear();
  store.pushSend.mockClear();
  store.sendReply.mockClear();
  store.sendReply.mockResolvedValue(true);
  setCharAwayViewingChat(null);
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

describe("startCharAway", () => {
  it("可以用時存進聊天並回傳這次暫離", async () => {
    seedChat();

    const away = await startCharAway("chat1", {
      minutes: 10,
      reason: "開會",
      backText: "我回來了",
    });

    expect(away).not.toBeNull();
    expect(away!.returnAt).toBe(NOW + 10 * MINUTE);
    expect(store.chats.get("chat1")?.charAway?.id).toBe(away!.id);
    expect(store.chats.get("chat1")?.charAway?.endedAt).toBeUndefined();
  });

  it("冷卻中回 null", async () => {
    seedChat({
      charAway: makeAway({ endedAt: NOW - 1000, endedBy: "time" }),
    });

    const away = await startCharAway("chat1", {
      minutes: 10,
      reason: "開會",
      backText: "我回來了",
    });

    expect(away).toBeNull();
  });
});

describe("returnCharAwayIfDue", () => {
  it("還沒到時間回 false，也不加訊息", async () => {
    seedChat({ charAway: makeAway() });

    expect(await returnCharAwayIfDue("chat1", NOW + MINUTE)).toBe(false);
    expect(store.messages.get("chat1")).toHaveLength(0);
  });

  it("時間到就加一則他回來的訊息並結束暫離，再呼叫不會重複加", async () => {
    const away = makeAway();
    seedChat({ charAway: away });

    expect(await returnCharAwayIfDue("chat1", away.returnAt + 2000)).toBe(
      true,
    );

    const messages = store.messages.get("chat1")!;
    expect(messages).toHaveLength(1);
    expect(messages[0].sender).toBe("assistant");
    expect(messages[0].content).toBe(away.backText);
    expect(messages[0].createdAt).toBe(away.returnAt);

    const ended = store.chats.get("chat1")!.charAway!;
    expect(ended.endedBy).toBe("time");
    expect(ended.replyPending).toBe(false);

    expect(await returnCharAwayIfDue("chat1", away.returnAt + 60000)).toBe(
      false,
    );
    expect(store.messages.get("chat1")).toHaveLength(1);
  });

  it("回來訊息的時間排在最後一則之後", async () => {
    const away = makeAway();
    seedChat({ charAway: away });
    store.messages.set("chat1", [leftMessage(away, away.returnAt + 3000)]);

    await returnCharAwayIfDue("chat1", away.returnAt + 4000);

    const messages = store.messages.get("chat1")!;
    expect(messages[1].createdAt).toBe(away.returnAt + 3001);
  });

  it("有留話時 replyPending 為 true、呼叫補回覆，之後清掉", async () => {
    const away = makeAway();
    seedChat({ charAway: away });
    store.messages.set("chat1", [leftMessage(away, away.returnAt + 1000)]);

    expect(await returnCharAwayIfDue("chat1", away.returnAt + 2000)).toBe(
      true,
    );

    // 中間曾經寫入 replyPending: true，回覆完被清掉
    expect(
      store.saves.some((save) => save.charAway?.replyPending === true),
    ).toBe(true);
    expect(store.sendReply).toHaveBeenCalledTimes(1);
    expect(store.sendReply).toHaveBeenCalledWith("chat1");
    expect(store.chats.get("chat1")!.charAway!.replyPending).toBe(false);
  });

  it("沒有留話時 replyPending 為 false 也不呼叫補回覆", async () => {
    const away = makeAway();
    seedChat({ charAway: away });

    await returnCharAwayIfDue("chat1", away.returnAt + 2000);

    expect(store.sendReply).not.toHaveBeenCalled();
    expect(store.chats.get("chat1")!.charAway!.replyPending).toBe(false);
  });

  it("不看著這個聊天時未讀 +1 並發通知", async () => {
    const away = makeAway();
    seedChat({ charAway: away });

    await returnCharAwayIfDue("chat1", away.returnAt + 2000);

    expect(store.incrementUnread).toHaveBeenCalledTimes(1);
    expect(store.pushSend).toHaveBeenCalledTimes(1);
    const item = store.pushSend.mock.calls[0][0];
    expect(item.type).toBe("chat_message");
    expect(item.title).toBe("阿明");
    expect(item.message).toBe(away.backText);
    expect(item.chatId).toBe("chat1");
  });

  it("正看著這個聊天時不發通知也不補回覆", async () => {
    const away = makeAway();
    seedChat({ charAway: away });
    store.messages.set("chat1", [leftMessage(away, away.returnAt + 1000)]);
    setCharAwayViewingChat("chat1");

    expect(await returnCharAwayIfDue("chat1", away.returnAt + 2000)).toBe(
      true,
    );

    expect(store.pushSend).not.toHaveBeenCalled();
    expect(store.incrementUnread).not.toHaveBeenCalled();
    expect(store.sendReply).not.toHaveBeenCalled();
    // 留給聊天頁打開時補
    expect(store.chats.get("chat1")!.charAway!.replyPending).toBe(true);
  });

  it("睡覺時間到：送 back、結束，有留言時 replyPending 留著但不呼叫背景回覆", async () => {
    const away = makeAway({
      kind: "sleep",
      reason: "睡覺",
      backText: "早安",
      sneakCount: 0,
      callAts: [],
    });
    seedChat({ charAway: away });
    store.messages.set("chat1", [leftMessage(away, away.returnAt + 1000)]);

    expect(await returnCharAwayIfDue("chat1", away.returnAt + 2000)).toBe(
      true,
    );

    const messages = store.messages.get("chat1")!;
    expect(messages).toHaveLength(2);
    expect(messages[1].sender).toBe("assistant");
    expect(messages[1].content).toBe("早安");
    const ended = store.chats.get("chat1")!.charAway!;
    expect(ended.endedAt).toBeDefined();
    expect(ended.endedBy).toBe("time");
    expect(ended.replyPending).toBe(true);
    expect(store.sendReply).not.toHaveBeenCalled();
  });
});

describe("urgeCharAway", () => {
  it("輸了會鎖住，鎖住期間再催回 null", async () => {
    seedChat({ charAway: makeAway() });

    const lost = await urgeCharAway("chat1", false);
    expect(lost).not.toBeNull();
    expect(lost!.endedAt).toBeUndefined();
    expect(lost!.urgeLockedUntil).toBeGreaterThan(NOW);

    expect(await urgeCharAway("chat1", false)).toBeNull();
  });

  it("贏了提早回來且待回覆", async () => {
    seedChat({ charAway: makeAway() });

    const won = await urgeCharAway("chat1", true);

    expect(won).not.toBeNull();
    expect(won!.endedBy).toBe("urge");
    expect(won!.replyPending).toBe(true);
    expect(store.chats.get("chat1")!.charAway!.endedBy).toBe("urge");
    expect(store.chats.get("chat1")!.charAway!.replyPending).toBe(true);
  });
});

describe("urgeCharAway 睡覺", () => {
  it("贏了不結束、sneakPending true、鎖 5 分鐘；鎖住中回 null", async () => {
    seedChat({
      charAway: makeAway({ kind: "sleep", reason: "睡覺", sneakCount: 0 }),
    });

    const won = await urgeCharAway("chat1", true);

    expect(won).not.toBeNull();
    expect(won!.endedAt).toBeUndefined();
    expect(won!.sneakPending).toBe(true);
    expect(won!.sneakCount).toBe(1);
    expect(won!.urgeLockedUntil).toBe(NOW + 5 * MINUTE);
    expect(await urgeCharAway("chat1", true)).toBeNull();
  });
});

describe("wakeCharAwayNow", () => {
  it("endedBy wake、不加 back 訊息", async () => {
    seedChat({ charAway: makeAway({ kind: "sleep", reason: "睡覺" }) });

    const woken = await wakeCharAwayNow("chat1");

    expect(woken).not.toBeNull();
    expect(woken!.endedBy).toBe("wake");
    expect(store.chats.get("chat1")!.charAway!.endedBy).toBe("wake");
    expect(store.messages.get("chat1")).toHaveLength(0);
  });
});

describe("recordCharAwayCall", () => {
  it("留一則未接來電並記次數", async () => {
    const away = makeAway();
    seedChat({ charAway: away });

    await recordCharAwayCall("chat1", "阿明");

    const messages = store.messages.get("chat1")!;
    expect(messages).toHaveLength(1);
    expect(messages[0].isCallNotification).toBe(true);
    expect(messages[0].callNotificationType).toBe("unanswered");
    expect(messages[0].sentWhileAway).toBe(away.id);
    expect(store.chats.get("chat1")!.charAway!.callCount).toBe(1);
  });
});

describe("startCharSleep", () => {
  it("白天不能睡，回 null", async () => {
    seedChat();

    const away = await startCharSleep("chat1", {
      wake: "07:30",
      backText: "",
    });

    expect(away).toBeNull();
    expect(store.chats.get("chat1")!.charAway).toBeUndefined();
  });

  it("晚上存進聊天並排回來計時器", async () => {
    vi.setSystemTime(NIGHT);
    seedChat();

    const away = await startCharSleep("chat1", {
      wake: "07:30",
      backText: "",
    });

    expect(away).not.toBeNull();
    expect(away!.kind).toBe("sleep");
    expect(store.chats.get("chat1")!.charAway!.id).toBe(away!.id);
    expect(vi.getTimerCount()).toBe(1);
  });
});

describe("startCharBusy 預約", () => {
  it("存進 charAwayPlan，charAway 不變", async () => {
    seedChat();

    const result = await startCharBusy("chat1", {
      start: "14:00",
      end: "16:00",
      reason: "搭飛機",
      backText: "",
    });

    expect(result?.plan).toBeDefined();
    expect(store.chats.get("chat1")!.charAway).toBeUndefined();
    expect(store.chats.get("chat1")!.charAwayPlan!.id).toBe(
      result!.plan!.id,
    );
    expect(store.chats.get("chat1")!.charAwayPlan!.startedAt).toBe(
      new Date(2026, 3, 1, 14, 0).getTime(),
    );
  });

  it("再排一個會把舊的預約寫成 cancel", async () => {
    seedChat();

    await startCharBusy("chat1", {
      start: "14:00",
      end: "16:00",
      reason: "搭飛機",
      backText: "",
    });
    await startCharBusy("chat1", {
      start: "15:00",
      end: "17:00",
      reason: "開會",
      backText: "",
    });

    expect(
      store.saves.some((save) => save.charAwayPlan?.endedBy === "cancel"),
    ).toBe(true);
    expect(store.chats.get("chat1")!.charAwayPlan!.reason).toBe("開會");
  });
});

describe("activatePlanIfDue", () => {
  it("到點後 charAway 變成進行中，plan 有 endedAt", async () => {
    seedChat();

    const result = await startCharBusy("chat1", {
      start: "14:00",
      end: "16:00",
      reason: "搭飛機",
      backText: "我忙完了",
    });
    const plan = result!.plan!;
    const startAt = new Date(2026, 3, 1, 14, 0).getTime();

    expect(await activatePlanIfDue("chat1", startAt)).toBe(true);

    const chat = store.chats.get("chat1")!;
    expect(chat.charAway!.id).toBe(plan.id);
    expect(chat.charAway!.fromPlan).toBe(true);
    expect(chat.charAway!.endedAt).toBeUndefined();
    expect(chat.charAwayPlan!.endedAt).toBe(startAt);
    expect(chat.charAwayPlan!.endedBy).toBe("time");
  });

  it("打開時已過結束時間：直接回來並有 back 訊息", async () => {
    seedChat();

    const result = await startCharBusy("chat1", {
      start: "13:00",
      end: "13:30",
      reason: "開會",
      backText: "我忙完了",
    });
    const plan = result!.plan!;
    const late = new Date(2026, 3, 1, 14, 0).getTime();

    expect(await activatePlanIfDue("chat1", late)).toBe(true);

    const messages = store.messages.get("chat1")!;
    expect(messages).toHaveLength(1);
    expect(messages[0].content).toBe("我忙完了");
    expect(messages[0].createdAt).toBe(plan.returnAt);
    expect(store.chats.get("chat1")!.charAway!.endedBy).toBe("time");
  });
});

describe("cancelCharAway", () => {
  it("主動取消後不算冷卻", async () => {
    seedChat({ charAway: makeAway() });

    await cancelCharAway("chat1");

    const chat = store.chats.get("chat1")!;
    expect(chat.charAway!.endedBy).toBe("cancel");
    expect(canUseCharAway(chat, { faceToFace: false, now: NOW })).toBe(true);
  });
});
