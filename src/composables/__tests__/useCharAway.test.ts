import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { effectScope, nextTick, ref } from "vue";
import type { EffectScope } from "vue";
import type { ChatScreenMessage as Message } from "@/types/chatScreen";
import type { Chat, CharAway } from "@/types/chat";
import {
  cancelCharAway,
  cancelCharAwayPlan,
  finishCharAwaySneak,
  markCharAwayReplied,
  noteCharBusyMessage,
  startCharAway,
  startCharBusy,
  startCharSleep,
  urgeCharAway,
  wakeCharAwayNow,
} from "@/services/charAwayRuntime";
import { useCharAway } from "../useCharAway";

vi.mock("@/services/charAwayRuntime", () => ({
  CHAR_AWAY_CHANGED_EVENT: "aguaphone:char-away-changed",
  startCharAway: vi.fn(),
  startCharSleep: vi.fn(),
  startCharBusy: vi.fn(),
  cancelCharAway: vi.fn(),
  cancelCharAwayPlan: vi.fn(),
  finishCharAwaySneak: vi.fn(),
  wakeCharAwayNow: vi.fn(),
  urgeCharAway: vi.fn(),
  markCharAwayReplied: vi.fn(),
  noteCharBusyMessage: vi.fn(),
  setCharAwayViewingChat: vi.fn(),
}));

const CHAT_ID = "chat_1";

let scopes: EffectScope[] = [];

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-01-01T10:00:00Z"));
  vi.clearAllMocks();
  vi.mocked(cancelCharAway).mockResolvedValue(undefined);
  vi.mocked(cancelCharAwayPlan).mockResolvedValue(undefined);
  vi.mocked(markCharAwayReplied).mockResolvedValue(undefined);
});

afterEach(() => {
  for (const scope of scopes) scope.stop();
  scopes = [];
  vi.useRealTimers();
});

function makeAway(overrides: Partial<CharAway> = {}): CharAway {
  const ts = Date.now();
  return {
    id: "away_1",
    reason: "開會",
    backText: "我開完會了",
    startedAt: ts - 60_000,
    returnAt: ts + 600_000,
    urgeCount: 0,
    callCount: 0,
    updatedAt: ts,
    ...overrides,
  };
}

function makeMessage(overrides: Partial<Message> = {}): Message {
  const ts = Date.now();
  return {
    id: `msg_${Math.random().toString(36).slice(2, 8)}`,
    role: "user",
    content: "你在嗎",
    timestamp: ts,
    ...overrides,
  };
}

function makeChat(away: CharAway | null): Chat {
  return {
    id: CHAT_ID,
    name: "小美",
    charAway: away ?? undefined,
    charAwayEnabled: true,
  } as Chat;
}

function setup(opts: { faceToFace?: boolean; isGroupChat?: boolean } = {}) {
  const currentChatId = ref<string | null | undefined>(CHAT_ID);
  const messages = ref<Message[]>([]);
  const faceToFace = ref(!!opts.faceToFace);
  const isGroupChat = ref(!!opts.isGroupChat);
  const characterName = ref("小美");
  const isGenerating = vi.fn(() => false);
  const triggerAIResponse = vi.fn(async () => undefined);

  const scope = effectScope();
  const api = scope.run(() =>
    useCharAway({
      currentChatId,
      messages,
      faceToFace,
      isGroupChat,
      characterName,
      isGenerating,
      triggerAIResponse,
    }),
  );
  if (!api) throw new Error("useCharAway 沒有回傳東西");
  scopes.push(scope);

  return {
    ...api,
    currentChatId,
    messages,
    faceToFace,
    isGroupChat,
    characterName,
    isGenerating,
    triggerAIResponse,
  };
}

async function settle(): Promise<void> {
  await nextTick();
  await nextTick();
}

describe("useCharAway", () => {
  describe("beforeGenerate", () => {
    it("進行中且 startMessageId 還在 → 擋住", async () => {
      const api = setup();
      const away = makeAway({ startMessageId: "msg_ai_start" });
      api.messages.value = [
        makeMessage({ id: "msg_ai_start", role: "ai" }),
      ];
      api.loadFromChat(makeChat(away));

      expect(api.isAwayActive.value).toBe(true);
      await expect(api.beforeGenerate()).resolves.toBe(true);
      expect(cancelCharAway).not.toHaveBeenCalled();
    });

    it("startMessageId 那則不見了 → 取消暫離、回 false、不再進行中", async () => {
      const api = setup();
      const away = makeAway({ startMessageId: "msg_ai_start" });
      api.messages.value = [
        makeMessage({ id: "msg_ai_start", role: "ai" }),
      ];
      api.loadFromChat(makeChat(away));
      expect(api.isAwayActive.value).toBe(true);

      api.messages.value = [makeMessage({ id: "msg_ai_other", role: "ai" })];

      await expect(api.beforeGenerate()).resolves.toBe(false);
      expect(cancelCharAway).toHaveBeenCalledWith(CHAT_ID);
      expect(api.isAwayActive.value).toBe(false);
    });

    it("面對面時不擋", async () => {
      const api = setup({ faceToFace: true });
      const away = makeAway({ startMessageId: "msg_ai_start" });
      api.messages.value = [
        makeMessage({ id: "msg_ai_start", role: "ai" }),
      ];
      api.loadFromChat(makeChat(away));

      expect(api.isAwayActive.value).toBe(false);
      await expect(api.beforeGenerate()).resolves.toBe(false);
      expect(cancelCharAway).not.toHaveBeenCalled();
    });

    it("偷回那一輪放行一次，不取消暫離", async () => {
      const api = setup();
      const away = makeAway({
        startMessageId: "msg_ai_start",
        sneakPending: true,
      });
      api.messages.value = [makeMessage({ id: "msg_ai_other", role: "ai" })];
      api.loadFromChat(makeChat(away));

      await expect(api.beforeGenerate()).resolves.toBe(false);
      expect(cancelCharAway).not.toHaveBeenCalled();
      expect(api.isAwayActive.value).toBe(true);
    });
  });

  describe("awayHintFor", () => {
    it("只有第一則 sentWhileAway 的訊息有提示", () => {
      const api = setup();
      const away = makeAway();
      const first = makeMessage({
        id: "msg_user_first",
        sentWhileAway: away.id,
      });
      const second = makeMessage({
        id: "msg_user_second",
        sentWhileAway: away.id,
      });
      api.messages.value = [first, second];
      api.loadFromChat(makeChat(away));

      const hint = api.awayHintFor(first);
      expect(hint).not.toBeNull();
      expect(hint?.text).toContain("小美");
      expect(hint?.text).toContain("開會");
      expect(hint?.action).toBe("urge");

      expect(api.awayHintFor(second)).toBeNull();
      expect(api.awayHintFor(makeMessage({ id: "msg_user_other" }))).toBeNull();
    });

    it("urgeLockedUntil 在未來 → locked 且顯示分:秒", () => {
      const api = setup();
      const away = makeAway({
        urgeLockedUntil: Date.now() + 4 * 60_000 + 32_000,
      });
      const first = makeMessage({
        id: "msg_user_first",
        sentWhileAway: away.id,
      });
      api.messages.value = [first];
      api.loadFromChat(makeChat(away));

      const hint = api.awayHintFor(first);
      expect(hint?.action).toBe("locked");
      expect(hint?.lockedText).toBe("4:32 後可以再催");
      expect(api.awayHintKey(first.id)).toBe(
        `${away.id}|${hint?.text}|快回來|locked|4:32 後可以再催`,
      );
    });

    it("偷回之後才顯示提示，按鈕文字依種類", () => {
      const api = setup();
      const ts = Date.now();
      const away = makeAway({
        kind: "sleep",
        lastSneakAt: ts - 30_000,
        reason: "睡覺",
      });
      const before = makeMessage({
        id: "msg_before_sneak",
        sentWhileAway: away.id,
        timestamp: ts - 60_000,
      });
      const after = makeMessage({
        id: "msg_after_sneak",
        sentWhileAway: away.id,
        timestamp: ts - 10_000,
      });
      api.messages.value = [before, after];
      api.loadFromChat(makeChat(away));

      expect(api.awayHintFor(before)).toBeNull();
      const hint = api.awayHintFor(after);
      expect(hint?.label).toBe("起床重睡");
      expect(hint?.text).toContain("睡著了");
    });

    it("已結束 → none，非第一筆的 key 是空字串", () => {
      const api = setup();
      const away = makeAway({ endedAt: Date.now(), endedBy: "time" });
      const first = makeMessage({
        id: "msg_user_first",
        sentWhileAway: away.id,
      });
      api.messages.value = [first];
      api.loadFromChat(makeChat(away));

      expect(api.awayHintFor(first)?.action).toBe("none");
      expect(api.awayHintKey("msg_user_post")).toBe("");
    });
  });

  describe("promptOptions", () => {
    it("可用時 guide 含 <char-away", () => {
      const api = setup();
      api.loadFromChat(makeChat(null));

      const opts = api.promptOptions();
      expect(opts.charAwayGuide).toContain("<char-away");
      expect(opts.charAwayReturnNote).toBeUndefined();
    });

    it("進行中時 guide 是空字串", () => {
      const api = setup();
      api.loadFromChat(makeChat(makeAway()));

      expect(api.promptOptions().charAwayGuide).toBe("");
    });

    it("時間到且 replyPending → 回來提示含留言數", () => {
      const api = setup();
      const away = makeAway({
        endedAt: Date.now(),
        endedBy: "time",
        replyPending: true,
      });
      api.messages.value = [
        makeMessage({ id: "msg_u1", sentWhileAway: away.id }),
        makeMessage({ id: "msg_u2", sentWhileAway: away.id }),
        makeMessage({ id: "msg_u3" }),
      ];
      api.loadFromChat(makeChat(away));

      const note = api.promptOptions().charAwayReturnNote;
      expect(note).toContain("[剛忙完回來]");
      expect(note).toContain("留了 2 則訊息");
    });
  });

  describe("afterReply", () => {
    it("replyPending 時呼叫 markCharAwayReplied", async () => {
      const api = setup();
      const away = makeAway({
        endedAt: Date.now(),
        endedBy: "time",
        replyPending: true,
      });
      api.loadFromChat(makeChat(away));

      await api.afterReply();

      expect(markCharAwayReplied).toHaveBeenCalledWith(CHAT_ID);
      expect(api.charAway.value?.replyPending).toBe(false);
    });

    it("有 parsed 時用最後一則 ai 訊息 id 開始暫離", async () => {
      const api = setup();
      const away = makeAway();
      api.messages.value = [
        makeMessage({ id: "msg_ai_old", role: "ai" }),
        makeMessage({ id: "msg_user_mid", role: "user" }),
        makeMessage({ id: "msg_ai_last", role: "ai" }),
      ];
      vi.mocked(startCharAway).mockResolvedValue(away);

      const parsed = { minutes: 10, reason: "開會", backText: "回來了" };
      await api.afterReply({ away: parsed });

      expect(startCharAway).toHaveBeenCalledWith(
        CHAT_ID,
        parsed,
        "msg_ai_last",
      );
      expect(api.charAway.value?.id).toBe(away.id);
    });

    it("同時有 sleep 與 away 標籤時只開始睡覺", async () => {
      const api = setup();
      api.messages.value = [makeMessage({ id: "msg_ai_last", role: "ai" })];
      const sleepParsed = { wake: "07:30", backText: "早安" };
      const awayParsed = { minutes: 10, reason: "開會", backText: "回來了" };
      vi.mocked(startCharSleep).mockResolvedValue(
        makeAway({ kind: "sleep", reason: "睡覺" }),
      );

      await api.afterReply({ sleep: sleepParsed, away: awayParsed });

      expect(startCharSleep).toHaveBeenCalledWith(
        CHAT_ID,
        sleepParsed,
        "msg_ai_last",
      );
      expect(startCharAway).not.toHaveBeenCalled();
      expect(api.charAway.value?.kind).toBe("sleep");
    });

    it("偷回那一輪帶 wake → 呼叫 wakeCharAwayNow，其他標籤忽略", async () => {
      const api = setup();
      const away = makeAway({ kind: "sleep", sneakPending: true });
      api.loadFromChat(makeChat(away));
      const woken = makeAway({
        kind: "sleep",
        endedAt: Date.now(),
        endedBy: "wake",
      });
      vi.mocked(wakeCharAwayNow).mockResolvedValue(woken);

      await api.afterReply({
        wake: true,
        sleep: { wake: "07:30", backText: "早安" },
      });

      expect(wakeCharAwayNow).toHaveBeenCalledWith(CHAT_ID);
      expect(finishCharAwaySneak).not.toHaveBeenCalled();
      expect(startCharSleep).not.toHaveBeenCalled();
      expect(api.charAway.value?.endedBy).toBe("wake");
    });

    it("偷回那一輪沒有 wake → 呼叫 finishCharAwaySneak", async () => {
      const api = setup();
      const away = makeAway({ kind: "busy", sneakPending: true });
      api.loadFromChat(makeChat(away));
      const finished = makeAway({
        kind: "busy",
        lastSneakAt: Date.now(),
      });
      vi.mocked(finishCharAwaySneak).mockResolvedValue(finished);

      await api.afterReply({ busy: { end: "18:00", reason: "搭飛機", backText: "忙完了" } });

      expect(finishCharAwaySneak).toHaveBeenCalledWith(CHAT_ID, true);
      expect(wakeCharAwayNow).not.toHaveBeenCalled();
      expect(startCharBusy).not.toHaveBeenCalled();
      expect(api.charAway.value?.lastSneakAt).toBe(finished.lastSneakAt);
    });
  });

  describe("onQuickBackFinish", () => {
    it("催成功 → 呼叫 urgeCharAway 與 triggerAIResponse", async () => {
      const api = setup();
      const away = makeAway();
      api.loadFromChat(makeChat(away));
      const endedAway = makeAway({
        endedAt: Date.now(),
        endedBy: "urge",
        replyPending: true,
      });
      vi.mocked(urgeCharAway).mockResolvedValue(endedAway);

      api.openQuickBack();
      expect(api.quickBackGame.value).not.toBeNull();
      expect(api.quickBackGame.value?.tapTarget).toBeGreaterThanOrEqual(15);

      await api.onQuickBackFinish(true);

      expect(api.quickBackGame.value).toBeNull();
      expect(urgeCharAway).toHaveBeenCalledWith(CHAT_ID, true);
      expect(api.triggerAIResponse).toHaveBeenCalledTimes(1);
      expect(api.charAway.value?.endedBy).toBe("urge");
    });

    it("催失敗 → 不呼叫 triggerAIResponse", async () => {
      const api = setup();
      const away = makeAway();
      api.loadFromChat(makeChat(away));
      const lockedAway = makeAway({
        urgeLockedUntil: Date.now() + 5 * 60_000,
      });
      vi.mocked(urgeCharAway).mockResolvedValue(lockedAway);

      api.openQuickBack();
      await api.onQuickBackFinish(false);

      expect(urgeCharAway).toHaveBeenCalledWith(CHAT_ID, false);
      expect(api.triggerAIResponse).not.toHaveBeenCalled();
      expect(api.charAway.value?.urgeLockedUntil).toBe(
        lockedAway.urgeLockedUntil,
      );
    });
  });

  describe("自動回覆", () => {
    function endedAway(): CharAway {
      return makeAway({
        id: "away_time_done",
        startedAt: Date.now() - 600_000,
        returnAt: Date.now() - 60_000,
        endedAt: Date.now() - 60_000,
        endedBy: "time",
        replyPending: true,
      });
    }

    it("沒有回來那則訊息時不呼叫", async () => {
      const api = setup();
      const away = endedAway();

      api.messages.value = [makeMessage({ id: "msg_user_1" })];
      api.loadFromChat(makeChat(away));
      await settle();

      expect(api.triggerAIResponse).not.toHaveBeenCalled();
    });

    it("出現 msg_away_back_ 且時間到 → 只呼叫一次", async () => {
      const api = setup();
      const away = endedAway();

      api.messages.value = [makeMessage({ id: "msg_user_1" })];
      api.loadFromChat(makeChat(away));
      await settle();
      expect(api.triggerAIResponse).not.toHaveBeenCalled();

      api.messages.value = [
        ...api.messages.value,
        makeMessage({
          id: `msg_away_back_${away.returnAt}`,
          role: "ai",
          timestamp: away.returnAt,
        }),
      ];
      await settle();

      expect(api.triggerAIResponse).toHaveBeenCalledTimes(1);

      api.messages.value = [
        ...api.messages.value,
        makeMessage({ id: "msg_user_2" }),
      ];
      await settle();

      expect(api.triggerAIResponse).toHaveBeenCalledTimes(1);
    });
  });
});

describe("loadFromChat", () => {
  it("重新讀到同一次暫離的舊狀態時不覆蓋（事件比重新讀聊天先到）", () => {
    const ctx = setup();
    const ended = makeAway({ endedAt: Date.now(), endedBy: "time", replyPending: true, updatedAt: Date.now() + 10 });
    ctx.charAway.value = ended; // 事件先送到的「已回來」
    ctx.loadFromChat(makeChat(makeAway()));
    expect(ctx.charAway.value?.endedAt).toBe(ended.endedAt);
    expect(ctx.isAwayActive.value).toBe(false);
  });

  it("換成別的暫離或沒有暫離時照讀", () => {
    const ctx = setup();
    ctx.loadFromChat(makeChat(makeAway({ updatedAt: Date.now() + 10 })));
    ctx.loadFromChat(makeChat(makeAway({ id: "away_2" })));
    expect(ctx.charAway.value?.id).toBe("away_2");
    ctx.loadFromChat(makeChat(null));
    expect(ctx.charAway.value).toBeNull();
  });
});
