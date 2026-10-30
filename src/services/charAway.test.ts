import { describe, expect, it } from "vitest";
import {
  awayHeaderText,
  buildCharBusySpareNote,
  canBusyPeek,
  isBusySpare,
  recordBusyHangUp,
  scheduleBusyPeek,
  shouldHangUpBusy,
  startBusyPeek,
  awayUrgeLabel,
  buildAwayHintText,
  buildCharAwayGuide,
  buildCharAwayPlanNote,
  buildCharAwayReturnNote,
  buildCharAwaySneakNote,
  buildCharBusyGuide,
  buildCharSleepGuide,
  canUseCharAway,
  canUseCharBusy,
  canUseCharSleep,
  countLeftSinceSneak,
  createCharAway,
  createCharBusy,
  createCharSleep,
  endCharAway,
  fastForwardAway,
  fastForwardPlan,
  finishSneak,
  isCharAwayActive,
  isCharAwayCoolingDown,
  isCharAwayPlanPending,
  isNightTime,
  nextClockAfter,
  parseClock,
  pauseCharAway,
  quickBackTapTarget,
  recordAwayCall,
  recordSneakWin,
  recordUrgeAttempt,
  resumeCharAway,
  shouldWakeByCall,
  wakeCharAway,
} from "./charAway";
import type { CharAway } from "@/types/chat";

const NOW = new Date(2026, 9, 23, 14, 0).getTime();
const NIGHT = new Date(2026, 9, 23, 23, 40).getTime();
const BUSY_NOW = new Date(2026, 9, 23, 13, 50).getTime();
const MINUTE = 60 * 1000;

function makeAway(overrides: Partial<CharAway> = {}): CharAway {
  return {
    id: "away_1",
    reason: "開會",
    backText: "我回來了",
    startedAt: NOW,
    returnAt: NOW + 30 * MINUTE,
    urgeCount: 0,
    callCount: 0,
    updatedAt: NOW,
    ...overrides,
  };
}

function makeSleep(overrides: Partial<CharAway> = {}): CharAway {
  return {
    id: "sleep_1",
    kind: "sleep",
    reason: "睡覺",
    backText: "早安",
    startedAt: NIGHT,
    returnAt: new Date(2026, 9, 24, 7, 30).getTime(),
    urgeCount: 0,
    callCount: 0,
    sneakCount: 0,
    callAts: [],
    updatedAt: NIGHT,
    ...overrides,
  };
}

function makeBusy(overrides: Partial<CharAway> = {}): CharAway {
  return {
    id: "busy_1",
    kind: "busy",
    reason: "搭飛機",
    backText: "我忙完了",
    startedAt: NOW,
    returnAt: NOW + 4 * 60 * MINUTE,
    urgeCount: 0,
    callCount: 0,
    sneakCount: 0,
    updatedAt: NOW,
    ...overrides,
  };
}

describe("canUseCharAway", () => {
  const base = { faceToFace: false, now: NOW };

  it("可以用", () => {
    expect(canUseCharAway({}, base)).toBe(true);
    expect(canUseCharAway({ charAwayEnabled: true }, base)).toBe(true);
  });

  it("關掉就不能用", () => {
    expect(canUseCharAway({ charAwayEnabled: false }, base)).toBe(false);
  });

  it("群聊不能用", () => {
    expect(canUseCharAway({ isGroupChat: true }, base)).toBe(false);
  });

  it("面對面不能用", () => {
    expect(canUseCharAway({}, { faceToFace: true, now: NOW })).toBe(false);
  });

  it("進行中不能用", () => {
    expect(canUseCharAway({ charAway: makeAway() }, base)).toBe(false);
  });

  it("冷卻 59 分鐘不能用，滿 60 分鐘可以用", () => {
    const away = makeAway({ endedAt: NOW - 59 * MINUTE, endedBy: "time" });
    expect(canUseCharAway({ charAway: away }, base)).toBe(false);
    expect(
      canUseCharAway({ charAway: away }, { faceToFace: false, now: NOW + MINUTE }),
    ).toBe(true);
  });

  it("主動取消不算冷卻", () => {
    const away = makeAway({ endedAt: NOW - MINUTE, endedBy: "cancel" });
    expect(canUseCharAway({ charAway: away }, base)).toBe(true);
  });
});

describe("createCharAway", () => {
  it("算出 returnAt 並初始化計數", () => {
    const away = createCharAway({ minutes: 30, reason: "開會", backText: "回來了" }, NOW);
    expect(away.id).toBe(`away_${NOW}`);
    expect(away.returnAt).toBe(NOW + 30 * MINUTE);
    expect(away.startedAt).toBe(NOW);
    expect(away.urgeCount).toBe(0);
    expect(away.callCount).toBe(0);
    expect(away.updatedAt).toBe(NOW);
    expect(away.endedAt).toBeUndefined();
  });

  it("記下起始訊息 id", () => {
    const away = createCharAway(
      { minutes: 5, reason: "洗澡", backText: "回來了" },
      NOW,
      "msg_1",
    );
    expect(away.startMessageId).toBe("msg_1");
  });
});

describe("endCharAway", () => {
  it("時間到且有留言 → replyPending", () => {
    const ended = endCharAway(makeAway(), "time", NOW + MINUTE, true);
    expect(ended.endedAt).toBe(NOW + MINUTE);
    expect(ended.endedBy).toBe("time");
    expect(ended.replyPending).toBe(true);
    expect(ended.updatedAt).toBe(NOW + MINUTE);
  });

  it("時間到但沒留言 → 不用回", () => {
    expect(endCharAway(makeAway(), "time", NOW, false).replyPending).toBe(false);
  });

  it("被催回來 → 一定要回", () => {
    expect(endCharAway(makeAway(), "urge", NOW, false).replyPending).toBe(true);
  });

  it("取消 → 不用回", () => {
    expect(endCharAway(makeAway(), "cancel", NOW, true).replyPending).toBe(false);
  });
});

describe("recordUrgeAttempt", () => {
  it("輸了會鎖住並累加次數", () => {
    const away = recordUrgeAttempt(makeAway(), false, NOW);
    expect(away.urgeCount).toBe(1);
    expect(away.urgeLockedUntil).toBe(NOW + 5 * MINUTE);
    expect(away.updatedAt).toBe(NOW);
  });

  it("贏了不鎖", () => {
    const away = recordUrgeAttempt(makeAway(), true, NOW);
    expect(away.urgeCount).toBe(1);
    expect(away.urgeLockedUntil).toBeUndefined();
  });
});

describe("buildCharAwayGuide", () => {
  it("可用時回提示", () => {
    expect(buildCharAwayGuide(true)).toContain("<char-away minutes=");
  });

  it("不可用時回空字串", () => {
    expect(buildCharAwayGuide(false)).toBe("");
  });
});

describe("buildCharAwayReturnNote", () => {
  it("時間到、有全部 parts", () => {
    const away = makeAway({
      endedAt: NOW + 30 * MINUTE,
      endedBy: "time",
      replyPending: true,
      callCount: 2,
      urgeCount: 1,
    });
    const note = buildCharAwayReturnNote(away, 3);
    expect(note).toBe(
      [
        "[剛忙完回來]",
        "{{char}} 14:00 因為「開會」暫時離開，14:30 回來了，回來的第一句已經說了：「我回來了」",
        "這段時間 {{user}} 留了 3 則訊息、打了 2 通電話給你（你在忙沒接）、按了 1 次「快回來」想催你（沒催成功）。",
        "現在接著回 {{user}} 留的話，不用再說一次自己回來了。",
      ].join("\n"),
    );
  });

  it("時間到、沒有 parts 就沒有「這段時間」那行", () => {
    const away = makeAway({ endedAt: NOW + MINUTE, endedBy: "time", replyPending: true });
    const note = buildCharAwayReturnNote(away, 0);
    expect(note).not.toContain("這段時間");
    expect(note?.split("\n")).toHaveLength(3);
  });

  it("被催回來、有留言", () => {
    const away = makeAway({
      endedAt: NOW + 10 * MINUTE,
      endedBy: "urge",
      replyPending: true,
      callCount: 1,
      urgeCount: 4,
    });
    const note = buildCharAwayReturnNote(away, 2);
    expect(note).toBe(
      [
        "[被催回來]",
        "{{char}} 本來因為「開會」要忙到 14:30，{{user}} 一直催（打了 1 通電話、按了 4 次「快回來」），{{char}} 14:10 提早回來了。",
        "先用一兩句依性格自然反應被催回來，再回 {{user}} 留的 2 則訊息。",
      ].join("\n"),
    );
  });

  it("被催回來、沒留言", () => {
    const away = makeAway({
      endedAt: NOW + 10 * MINUTE,
      endedBy: "urge",
      replyPending: true,
    });
    const note = buildCharAwayReturnNote(away, 0);
    expect(note?.split("\n")[2]).toBe("用一兩句依性格自然反應被催回來。");
  });

  it("取消或還沒回完回 null", () => {
    expect(
      buildCharAwayReturnNote(
        makeAway({ endedAt: NOW, endedBy: "cancel", replyPending: true }),
        1,
      ),
    ).toBeNull();
    expect(
      buildCharAwayReturnNote(
        makeAway({ endedAt: NOW, endedBy: "time", replyPending: false }),
        1,
      ),
    ).toBeNull();
    expect(buildCharAwayReturnNote(makeAway(), 1)).toBeNull();
    expect(buildCharAwayReturnNote(undefined, 1)).toBeNull();
  });
});

describe("quickBackTapTarget", () => {
  it("依剩餘時間夾在 15～35", () => {
    expect(quickBackTapTarget(0)).toBe(15);
    expect(quickBackTapTarget(30 * MINUTE)).toBe(25);
    expect(quickBackTapTarget(60 * MINUTE)).toBe(35);
    expect(quickBackTapTarget(120 * MINUTE)).toBe(35);
    expect(quickBackTapTarget(-5 * MINUTE)).toBe(15);
  });
});

describe("buildAwayHintText", () => {
  it("組出提示文字", () => {
    expect(buildAwayHintText("小明", makeAway())).toBe(
      "小明去忙了（開會），大約 14:30 回來",
    );
  });
});

describe("parseClock", () => {
  it("接受 1～2 位的小時", () => {
    expect(parseClock("7:30")).toEqual({ h: 7, m: 30 });
    expect(parseClock("07:30")).toEqual({ h: 7, m: 30 });
    expect(parseClock(" 23:05 ")).toEqual({ h: 23, m: 5 });
  });

  it("超出範圍或格式錯回 null", () => {
    expect(parseClock("24:00")).toBeNull();
    expect(parseClock("23:60")).toBeNull();
    expect(parseClock("abc")).toBeNull();
    expect(parseClock("")).toBeNull();
  });
});

describe("nextClockAfter", () => {
  it("當天還早就是當天", () => {
    expect(nextClockAfter("23:50", NIGHT)).toBe(new Date(2026, 9, 23, 23, 50).getTime());
  });

  it("已經過了就是隔天", () => {
    expect(nextClockAfter("07:30", NIGHT)).toBe(new Date(2026, 9, 24, 7, 30).getTime());
    expect(nextClockAfter("23:40", NIGHT)).toBe(new Date(2026, 9, 24, 23, 40).getTime());
  });

  it("格式錯回 null", () => {
    expect(nextClockAfter("25:00", NIGHT)).toBeNull();
    expect(nextClockAfter("abc", NIGHT)).toBeNull();
  });
});

describe("isNightTime", () => {
  it("20:00～05:59 是晚上", () => {
    expect(isNightTime(new Date(2026, 9, 23, 19, 59).getTime())).toBe(false);
    expect(isNightTime(new Date(2026, 9, 23, 20, 0).getTime())).toBe(true);
    expect(isNightTime(new Date(2026, 9, 24, 5, 59).getTime())).toBe(true);
    expect(isNightTime(new Date(2026, 9, 24, 6, 0).getTime())).toBe(false);
  });
});

describe("isCharAwayCoolingDown", () => {
  it("只看同一種，睡覺不冷卻", () => {
    const ended = { endedAt: NOW - MINUTE, endedBy: "time" as const };
    expect(isCharAwayCoolingDown(makeAway(ended), NOW, "away")).toBe(true);
    expect(isCharAwayCoolingDown(makeAway(ended), NOW, "busy")).toBe(false);
    expect(isCharAwayCoolingDown(makeSleep(ended), NOW, "sleep")).toBe(false);
    expect(isCharAwayCoolingDown(makeBusy(ended), NOW, "busy")).toBe(true);
    expect(isCharAwayCoolingDown(makeSleep(ended), NOW, "away")).toBe(false);
  });
});

describe("createCharSleep", () => {
  it("算出隔天的起床時間", () => {
    const away = createCharSleep({ wake: "07:30", backText: "早安…" }, NIGHT);
    expect(away?.id).toBe(`sleep_${NIGHT}`);
    expect(away?.kind).toBe("sleep");
    expect(away?.reason).toBe("睡覺");
    expect(away?.backText).toBe("早安…");
    expect(away?.returnAt).toBe(new Date(2026, 9, 24, 7, 30).getTime());
    expect(away?.sneakCount).toBe(0);
    expect(away?.callAts).toEqual([]);
  });

  it("不到一小時就夾到一小時", () => {
    const away = createCharSleep({ wake: "23:50", backText: "早安" }, NIGHT);
    expect(away?.returnAt).toBe(NIGHT + 60 * MINUTE);
  });

  it("wake 格式錯回 null", () => {
    expect(createCharSleep({ wake: "abc", backText: "" }, NIGHT)).toBeNull();
  });

  it("有預約時提前到預約開始", () => {
    const planStartAt = new Date(2026, 9, 24, 3, 0).getTime();
    const away = createCharSleep({ wake: "07:30", backText: "" }, NIGHT, undefined, planStartAt);
    expect(away?.returnAt).toBe(planStartAt);
  });
});

describe("createCharBusy", () => {
  const parsed = { start: "14:00", end: "18:00", reason: "搭飛機", backText: "我忙完了" };

  it("剛過去的開始時間就當現在開始", () => {
    const away = createCharBusy({ ...parsed, start: "13:30" }, BUSY_NOW);
    expect(away?.startedAt).toBe(BUSY_NOW);
    expect(away?.returnAt).toBe(new Date(2026, 9, 23, 18, 0).getTime());
  });

  it("還沒到的開始時間就是預約", () => {
    const away = createCharBusy(parsed, BUSY_NOW);
    expect(away?.startedAt).toBe(new Date(2026, 9, 23, 14, 0).getTime());
    expect(away?.id).toBe(`busy_${new Date(2026, 9, 23, 14, 0).getTime()}`);
    expect(away?.returnAt).toBe(new Date(2026, 9, 23, 18, 0).getTime());
  });

  it("不到 30 分鐘就夾到 30 分鐘", () => {
    const away = createCharBusy({ ...parsed, end: "14:10" }, BUSY_NOW);
    expect(away?.returnAt).toBe(away!.startedAt + 30 * MINUTE);
  });

  const NIGHT_NOW = new Date(2026, 9, 30, 22, 8).getTime();
  const nightBusy = (end: string) =>
    createCharBusy({ end, reason: "補筆錄", backText: "" }, NIGHT_NOW);

  it("end 超過 12 小時的 1～11 點當 12 小時制", () => {
    expect(nightBusy("10:40")?.returnAt).toBe(new Date(2026, 9, 30, 22, 40).getTime());
    expect(nightBusy("11:00")?.returnAt).toBe(new Date(2026, 9, 30, 23, 0).getTime());
  });

  it("end 在 12 小時內就照字面（半夜到早上）", () => {
    expect(nightBusy("07:00")?.returnAt).toBe(new Date(2026, 9, 31, 7, 0).getTime());
  });

  it("end 是已經過去的時間就不排，不會消失 12 小時", () => {
    expect(nightBusy("21:00")).toBeNull();
    expect(nightBusy("12:30")).toBeNull();
  });

  it("有 minutes 就照分鐘算，不看 end", () => {
    const away = createCharBusy({ end: "abc", minutes: 90, reason: "", backText: "" }, BUSY_NOW);
    expect(away?.startedAt).toBe(BUSY_NOW);
    expect(away?.returnAt).toBe(BUSY_NOW + 90 * MINUTE);
  });

  it("minutes 夾在 30 分鐘～12 小時", () => {
    const short = createCharBusy({ minutes: 5, reason: "", backText: "" }, BUSY_NOW);
    const long = createCharBusy({ minutes: 2000, reason: "", backText: "" }, BUSY_NOW);
    expect(short?.returnAt).toBe(BUSY_NOW + 30 * MINUTE);
    expect(long?.returnAt).toBe(BUSY_NOW + 12 * 60 * MINUTE);
  });

  it("check、auto 帶進忙碌", () => {
    const away = createCharBusy(
      { minutes: 60, check: 40, auto: "開會中", reason: "開會", backText: "" },
      BUSY_NOW,
    );
    expect(away?.checkMinutes).toBe(40);
    expect(away?.autoReply).toBe("開會中");
  });

  it("minutes 配 start 是預約", () => {
    const away = createCharBusy({ start: "14:00", minutes: 60, reason: "", backText: "" }, BUSY_NOW);
    const start = new Date(2026, 9, 23, 14, 0).getTime();
    expect(away?.startedAt).toBe(start);
    expect(away?.returnAt).toBe(start + 60 * MINUTE);
  });

  it("沒寫 start 就現在開始，預設 reason／back", () => {
    const away = createCharBusy(
      { end: "18:00", reason: "", backText: "" },
      BUSY_NOW,
    );
    expect(away?.startedAt).toBe(BUSY_NOW);
    expect(away?.reason).toBe("有事");
    expect(away?.backText).toBe("我忙完了");
  });

  it("end 格式錯回 null", () => {
    expect(createCharBusy({ ...parsed, end: "abc" }, BUSY_NOW)).toBeNull();
    expect(createCharBusy({ start: "14:00", end: "", reason: "", backText: "" }, BUSY_NOW)).toBeNull();
  });
});

describe("canUseCharSleep", () => {
  const opts = { faceToFace: false, now: NOW };

  it("白天不能用、晚上可以用", () => {
    expect(canUseCharSleep({}, opts)).toBe(false);
    expect(canUseCharSleep({}, { faceToFace: false, now: NIGHT })).toBe(true);
  });

  it("開關關、進行中、群聊、面對面都不能用", () => {
    const night = { faceToFace: false, now: NIGHT };
    expect(canUseCharSleep({ charSleepEnabled: false }, night)).toBe(false);
    expect(canUseCharSleep({ charAway: makeSleep() }, night)).toBe(false);
    expect(canUseCharSleep({ isGroupChat: true }, night)).toBe(false);
    expect(canUseCharSleep({}, { faceToFace: true, now: NIGHT })).toBe(false);
  });
});

describe("canUseCharBusy", () => {
  it("上次忙完 30 分鐘前 -> 冷卻中", () => {
    const away = makeBusy({ endedAt: NOW - 30 * MINUTE, endedBy: "time" });
    expect(canUseCharBusy({ charAway: away }, { faceToFace: false, now: NOW })).toBe(false);
  });

  it("上次是暫離剛結束還是可以用", () => {
    const away = makeAway({ endedAt: NOW - 30 * MINUTE, endedBy: "time" });
    expect(canUseCharBusy({ charAway: away }, { faceToFace: false, now: NOW })).toBe(true);
  });

  it("已經有預約也可以（會蓋掉）", () => {
    const plan = makeBusy({ startedAt: NOW + 60 * MINUTE });
    expect(
      canUseCharBusy({ charAwayPlan: plan }, { faceToFace: false, now: NOW }),
    ).toBe(true);
  });

  it("關掉、進行中、群聊、面對面都不能用", () => {
    const opts = { faceToFace: false, now: NOW };
    expect(canUseCharBusy({ charBusyEnabled: false }, opts)).toBe(false);
    expect(canUseCharBusy({ charAway: makeBusy() }, opts)).toBe(false);
    expect(canUseCharBusy({ isGroupChat: true }, opts)).toBe(false);
    expect(canUseCharBusy({}, { faceToFace: true, now: NOW })).toBe(false);
  });
});

describe("canUseCharAway 只看暫離的冷卻", () => {
  it("上次是睡覺剛結束 -> 可以用", () => {
    const away = makeSleep({ endedAt: NIGHT - MINUTE, endedBy: "time" });
    expect(canUseCharAway({ charAway: away }, { faceToFace: false, now: NIGHT })).toBe(true);
  });
});

describe("recordSneakWin / finishSneak / wakeCharAway", () => {
  it("贏了記偷回但不結束", () => {
    const away = recordSneakWin(makeSleep(), NOW);
    expect(away.urgeCount).toBe(1);
    expect(away.sneakCount).toBe(1);
    expect(away.sneakPending).toBe(true);
    expect(away.urgeLockedUntil).toBe(NOW + 5 * MINUTE);
    expect(away.endedAt).toBeUndefined();
  });

  it("偷回生成完清 sneakPending，成功才記 lastSneakAt", () => {
    const ok = finishSneak(makeSleep({ sneakPending: true }), NOW, true);
    expect(ok.sneakPending).toBe(false);
    expect(ok.lastSneakAt).toBe(NOW);

    const failed = finishSneak(makeSleep({ sneakPending: true }), NOW, false);
    expect(failed.sneakPending).toBe(false);
    expect(failed.lastSneakAt).toBeUndefined();
  });

  it("起床結束狀態但不留回來待回", () => {
    const away = wakeCharAway(makeSleep({ sneakPending: true }), NOW);
    expect(away.endedAt).toBe(NOW);
    expect(away.endedBy).toBe("wake");
    expect(away.replyPending).toBe(false);
    expect(away.sneakPending).toBe(false);
  });
});

describe("recordAwayCall / shouldWakeByCall", () => {
  it("睡覺時記下沒接的時間並丟掉 10 分鐘前的", () => {
    const old = makeSleep({ callAts: [NOW - 11 * MINUTE], callCount: 1 });
    const away = recordAwayCall(old, NOW);
    expect(away.callCount).toBe(2);
    expect(away.callAts).toEqual([NOW]);
  });

  it("暫離不記 callAts", () => {
    const away = recordAwayCall(makeAway(), NOW);
    expect(away.callAts).toBeUndefined();
  });

  it("10 分鐘內第 3 通會吵醒", () => {
    const two = makeSleep({ callAts: [NOW - 5 * MINUTE, NOW - 3 * MINUTE] });
    expect(shouldWakeByCall(two, NOW)).toBe(true);

    const spread = makeSleep({ callAts: [NOW - 11 * MINUTE, NOW - 5 * MINUTE] });
    expect(shouldWakeByCall(spread, NOW)).toBe(false);

    const busy = makeBusy({ callAts: [NOW - 5 * MINUTE, NOW - 3 * MINUTE] });
    expect(shouldWakeByCall(busy, NOW)).toBe(false);
    expect(shouldWakeByCall(undefined, NOW)).toBe(false);
  });
});

describe("countLeftSinceSneak", () => {
  it("只算上次偷回之後 user 留的", () => {
    const away = makeSleep({ lastSneakAt: NIGHT });
    const count = countLeftSinceSneak(away, [
      { sentWhileAway: away.id, isUser: true, at: NIGHT + MINUTE },
      { sentWhileAway: away.id, isUser: true, at: NIGHT - MINUTE },
      { sentWhileAway: away.id, isUser: false, at: NIGHT + 2 * MINUTE },
    ]);
    expect(count).toBe(1);
  });
});

describe("buildCharSleepGuide / buildCharBusyGuide", () => {
  it("可用時回提示、不可用回空字串", () => {
    expect(buildCharSleepGuide(true)).toContain("<char-sleep wake=");
    expect(buildCharSleepGuide(false)).toBe("");
    expect(buildCharBusyGuide(true, undefined, NOW)).toContain("<char-busy start=");
    expect(buildCharBusyGuide(true, undefined, NOW)).toContain('check="');
    expect(buildCharBusyGuide(true, undefined, NOW)).toContain("走不開就兩個都不寫");
    expect(buildCharBusyGuide(false, undefined, NOW)).toBe("");
  });

  it("有預約時多一句提醒，跨天寫「明天」", () => {
    const plan = makeBusy({
      startedAt: new Date(2026, 9, 24, 14, 0).getTime(),
      returnAt: new Date(2026, 9, 24, 18, 0).getTime(),
    });
    const guide = buildCharBusyGuide(true, plan, NOW);
    expect(guide).toContain("（你已經排了 明天 14:00～18:00「搭飛機」");
  });

  it("預約同一天就不寫「明天」", () => {
    const plan = makeBusy({
      startedAt: new Date(2026, 9, 23, 16, 0).getTime(),
      returnAt: new Date(2026, 9, 23, 18, 0).getTime(),
    });
    expect(buildCharBusyGuide(true, plan, NOW)).toContain("（你已經排了 16:00～18:00");
  });
});


describe("buildCharAwayPlanNote", () => {
  it("待開始時列出接下來的行程", () => {
    const plan = makeBusy({
      startedAt: new Date(2026, 9, 24, 14, 0).getTime(),
      returnAt: new Date(2026, 9, 24, 18, 0).getTime(),
    });
    expect(buildCharAwayPlanNote(plan, NOW)).toBe(
      [
        "[接下來的行程]",
        "{{char}} 明天 14:00～18:00 要「搭飛機」，那段時間沒辦法回訊息。時間快到時可以自然地跟 {{user}} 說一聲。",
      ].join("\n"),
    );
  });

  it("已開始或已取消回 null", () => {
    expect(buildCharAwayPlanNote(undefined, NOW)).toBeNull();
    expect(
      buildCharAwayPlanNote(makeBusy({ endedAt: NOW, endedBy: "cancel" }), NOW),
    ).toBeNull();
  });
});

describe("buildCharAwaySneakNote", () => {
  it("睡覺：被吵醒，有留言就寫則數", () => {
    const away = makeSleep({ sneakPending: true, sneakCount: 2 });
    expect(buildCharAwaySneakNote(away, 3)).toBe(
      [
        "[被吵醒]",
        "{{char}} 23:40 睡著了（預計 07:30 起床），現在被 {{user}} 吵醒（這是第 2 次）。迷迷糊糊依性格回一兩句，回應 {{user}} 留的 3 則訊息，回完會繼續睡，不要說自己起床了。",
        "如果 {{user}} 在哭、很難過或有急事，或依你的個性就是想起來陪他，可以在 </content> 之後放 <char-wake/> 真的起床，之後就正常聊天。",
      ].join("\n"),
    );
  });

  it("睡覺：沒留言就省略那句", () => {
    const away = makeSleep({ sneakPending: true, sneakCount: 1 });
    expect(buildCharAwaySneakNote(away, 0)).toContain("回一兩句，回完會繼續睡");
  });

  it("忙碌：偷偷回", () => {
    const away = makeBusy({ sneakPending: true });
    expect(buildCharAwaySneakNote(away, 0)).toBe(
      [
        "[偷偷回]",
        "{{char}} 正在「搭飛機」（到 18:00），{{user}} 一直催，{{char}} 偷偷拿手機回一下。簡短回一句，語氣像在偷用手機，回完還是在忙。",
        "如果 {{user}} 有急事、很難過，而你正在做的事走得開，可以在 </content> 之後放 <char-wake/> 先不忙了；走不開（例如在飛機上）就不要放。",
      ].join("\n"),
    );
  });

  it("暫離、沒有 sneakPending、已結束都回 null", () => {
    expect(buildCharAwaySneakNote(makeAway({ sneakPending: true }), 1)).toBeNull();
    expect(buildCharAwaySneakNote(makeSleep(), 1)).toBeNull();
    expect(
      buildCharAwaySneakNote(
        makeSleep({ sneakPending: true, endedAt: NOW, endedBy: "time" }),
        1,
      ),
    ).toBeNull();
    expect(buildCharAwaySneakNote(undefined, 1)).toBeNull();
  });
});

describe("buildCharAwayReturnNote 的睡覺／忙碌", () => {
  it("起床了", () => {
    const away = makeSleep({
      backText: "早安…",
      endedAt: new Date(2026, 9, 24, 7, 30).getTime(),
      endedBy: "time",
      replyPending: true,
      callCount: 1,
      sneakCount: 1,
    });
    expect(buildCharAwayReturnNote(away, 3)).toBe(
      [
        "[起床了]",
        "{{char}} 23:40 去睡覺，07:30 起床了，起床的第一句已經說了：「早安…」",
        "這段時間 {{user}} 留了 3 則訊息、打了 1 通電話給你（你在睡沒接）、把你吵醒過 1 次。",
        "現在接著回 {{user}} 留的話，不用再說一次自己起床了。",
      ].join("\n"),
    );
  });

  it("忙完了", () => {
    const away = makeBusy({
      endedAt: NOW + 4 * 60 * MINUTE,
      endedBy: "time",
      replyPending: true,
      callCount: 1,
      sneakCount: 2,
    });
    expect(buildCharAwayReturnNote(away, 1)).toBe(
      [
        "[忙完了]",
        "{{char}} 因為「搭飛機」從 14:00 忙到 18:00，忙完的第一句已經說了：「我忙完了」",
        "這段時間 {{user}} 留了 1 則訊息、打了 1 通電話給你（你在忙沒接）、讓你偷偷回過 2 次。",
        "現在接著回 {{user}} 留的話，不用再說一次自己忙完了。",
      ].join("\n"),
    );
  });

  it("被吵醒結束回 null", () => {
    const away = makeSleep({
      endedAt: NOW,
      endedBy: "wake",
      replyPending: true,
    });
    expect(buildCharAwayReturnNote(away, 2)).toBeNull();
  });

  it("沒有留言就沒有「這段時間」那行", () => {
    const away = makeSleep({
      endedAt: new Date(2026, 9, 24, 7, 30).getTime(),
      endedBy: "time",
      replyPending: true,
    });
    expect(buildCharAwayReturnNote(away, 0)?.split("\n")).toHaveLength(3);
  });
});

describe("scheduleBusyPeek", () => {
  const busy = (overrides: Partial<CharAway> = {}) =>
    makeBusy({ startedAt: NOW, returnAt: NOW + 300 * MINUTE, checkMinutes: 40, ...overrides });

  it("有 check 的進行中忙碌才能看手機", () => {
    expect(canBusyPeek(busy())).toBe(true);
    expect(canBusyPeek(makeBusy())).toBe(false);
    expect(canBusyPeek(makeSleep({ checkMinutes: 40 }))).toBe(false);
    expect(canBusyPeek(busy({ endedAt: NOW }))).toBe(false);
    expect(canBusyPeek(busy({ pausedAt: NOW }))).toBe(false);
    expect(canBusyPeek(undefined)).toBe(false);
  });

  it("第一則留言照 check 排，上下浮動 30%", () => {
    expect(scheduleBusyPeek(busy(), NOW, () => 0).peekAt).toBe(NOW + 28 * MINUTE);
    expect(scheduleBusyPeek(busy(), NOW, () => 0.5).peekAt).toBe(NOW + 40 * MINUTE);
    expect(scheduleBusyPeek(busy(), NOW, () => 1).peekAt).toBe(NOW + 52 * MINUTE);
  });

  it("連傳每多一則就提早，最短 3 分鐘", () => {
    const first = scheduleBusyPeek(busy(), NOW, () => 0.5);
    const second = scheduleBusyPeek(first, NOW, () => 0.5);
    const third = scheduleBusyPeek(second, NOW, () => 0.5);
    expect(second.peekAt).toBe(NOW + 20 * MINUTE);
    expect(third.peekAt).toBe(NOW + 10 * MINUTE);
    let later = third;
    for (let i = 0; i < 5; i++) later = scheduleBusyPeek(later, NOW, () => 0.5);
    expect(later.peekAt).toBe(NOW + 3 * MINUTE);
    expect(later.peekLeftCount).toBe(8);
  });

  it("不會把已經排好的時間往後延", () => {
    const away = busy({ peekAt: NOW + MINUTE, peekLeftCount: 1 });
    expect(scheduleBusyPeek(away, NOW, () => 1).peekAt).toBe(NOW + MINUTE);
  });

  it("排到忙完之後就不排", () => {
    const away = busy({ returnAt: NOW + 30 * MINUTE });
    expect(scheduleBusyPeek(away, NOW, () => 0.5).peekAt).toBeUndefined();
  });

  it("有 auto 時排 20～60 秒後先回，只排一次", () => {
    const first = scheduleBusyPeek(busy({ autoReply: "開會中" }), NOW, () => 0);
    expect(first.autoReplyAt).toBe(NOW + 20_000);
    const second = scheduleBusyPeek(first, NOW + MINUTE, () => 1);
    expect(second.autoReplyAt).toBe(NOW + 20_000);
    expect(scheduleBusyPeek(busy({ autoReply: "開會中" }), NOW, () => 1).autoReplyAt).toBe(NOW + 60_000);
  });

  it("沒有 check 就原樣回傳", () => {
    const away = makeBusy();
    expect(scheduleBusyPeek(away, NOW)).toBe(away);
  });
});

describe("忙碌時掛電話", () => {
  const busy = (overrides: Partial<CharAway> = {}) =>
    makeBusy({ startedAt: NOW, returnAt: NOW + 300 * MINUTE, checkMinutes: 40, ...overrides });

  it("只有能看手機的忙碌會掛電話，5 分鐘內不重複", () => {
    expect(shouldHangUpBusy(busy(), NOW)).toBe(true);
    expect(shouldHangUpBusy(makeBusy(), NOW)).toBe(false);
    expect(shouldHangUpBusy(makeSleep({ checkMinutes: 40 }), NOW)).toBe(false);
    expect(shouldHangUpBusy(busy({ lastHangUpAt: NOW - 4 * MINUTE }), NOW)).toBe(false);
    expect(shouldHangUpBusy(busy({ lastHangUpAt: NOW - 5 * MINUTE }), NOW)).toBe(true);
  });

  it("掛電話後 15～30 秒看手機", () => {
    expect(recordBusyHangUp(busy(), NOW, () => 0).peekAt).toBe(NOW + 15_000);
    expect(recordBusyHangUp(busy(), NOW, () => 1).peekAt).toBe(NOW + 30_000);
    const away = recordBusyHangUp(busy(), NOW, () => 0);
    expect(away.hangUpPeek).toBe(true);
    expect(away.lastHangUpAt).toBe(NOW);
  });

  it("不會把更早的看手機往後延", () => {
    expect(recordBusyHangUp(busy({ peekAt: NOW + 1000 }), NOW, () => 1).peekAt).toBe(NOW + 1000);
  });

  it("快忙完時不排，等忙完一起回", () => {
    const away = recordBusyHangUp(busy({ returnAt: NOW + 10_000 }), NOW, () => 0);
    expect(away.peekAt).toBeUndefined();
    expect(away.hangUpPeek).toBe(false);
  });
});

describe("看手機與擲骰", () => {
  const busy = (overrides: Partial<CharAway> = {}) =>
    makeBusy({ startedAt: NOW, returnAt: NOW + 300 * MINUTE, checkMinutes: 40, ...overrides });

  it("startBusyPeek：骰到 20% 內就提早結束", () => {
    expect(startBusyPeek(busy(), NOW, () => 0.19).earlyEndPending).toBe(true);
    expect(startBusyPeek(busy(), NOW, () => 0.2).earlyEndPending).toBe(false);
  });

  it("startBusyPeek：清掉排程並標記原因", () => {
    const away = startBusyPeek(busy({ peekAt: NOW, peekLeftCount: 3 }), NOW, () => 1);
    expect(away.sneakPending).toBe(true);
    expect(away.sneakReason).toBe("peek");
    expect(away.peekAt).toBeUndefined();
    expect(away.peekLeftCount).toBe(0);
    expect(away.sneakCount).toBe(1);
  });

  it("startBusyPeek：掛電話後的看手機", () => {
    const away = startBusyPeek(busy({ hangUpPeek: true }), NOW, () => 1);
    expect(away.sneakReason).toBe("hangUp");
    expect(away.hangUpPeek).toBe(false);
  });

  it("偷偷回我：有 check 才擲骰", () => {
    const withCheck = recordSneakWin(busy(), NOW, () => 0);
    expect(withCheck.earlyEndPending).toBe(true);
    expect(withCheck.sneakReason).toBe("urge");
    const noCheck = recordSneakWin(makeBusy(), NOW, () => 0);
    expect(noCheck.earlyEndPending).toBeUndefined();
    expect(noCheck.sneakReason).toBeUndefined();
  });

  it("finishSneak：成功才開 5 分鐘空檔，沒有 check 不開", () => {
    const pending = busy({ sneakPending: true, sneakReason: "peek", earlyEndPending: true });
    const ok = finishSneak(pending, NOW, true);
    expect(ok.spareUntil).toBe(NOW + 5 * MINUTE);
    expect(ok.sneakReason).toBeUndefined();
    expect(ok.earlyEndPending).toBe(false);
    expect(finishSneak(pending, NOW, false).spareUntil).toBeUndefined();
    expect(finishSneak(makeBusy({ sneakPending: true }), NOW, true).spareUntil).toBeUndefined();
  });

  it("isBusySpare 看空檔結束時間", () => {
    const away = busy({ spareUntil: NOW + MINUTE });
    expect(isBusySpare(away, NOW)).toBe(true);
    expect(isBusySpare(away, NOW + MINUTE)).toBe(false);
    expect(isBusySpare(busy(), NOW)).toBe(false);
  });

  it("面對面暫停時清掉排程與空檔", () => {
    const paused = pauseCharAway(
      busy({ peekAt: NOW + MINUTE, spareUntil: NOW + MINUTE, autoReplyAt: NOW + MINUTE, autoReply: "開會中", peekLeftCount: 2 }),
      NOW,
    );
    expect(paused.peekAt).toBeUndefined();
    expect(paused.spareUntil).toBeUndefined();
    expect(paused.autoReplyAt).toBeUndefined();
    expect(paused.peekLeftCount).toBeUndefined();
    expect(paused.autoReply).toBe("開會中");
  });

  it("各情境的提示", () => {
    const note = (overrides: Partial<CharAway>, background = false) =>
      buildCharAwaySneakNote(busy({ sneakPending: true, ...overrides }), 2, { background })!;

    expect(note({ sneakReason: "peek" })).toContain("[看手機]");
    expect(note({ sneakReason: "peek" })).toContain("<char-wake/>");
    expect(note({ sneakReason: "peek" }, true)).not.toContain("<char-wake/>");
    expect(note({ sneakReason: "hangUp" })).toContain("[掛電話]");
    expect(note({ sneakReason: "hangUp" }, true)).not.toContain("<char-wake/>");
    expect(note({ sneakReason: "urge", earlyEndPending: true })).toContain("[提早忙完]");
    expect(note({ sneakReason: "peek", earlyEndPending: true })).toContain("2 則");
  });

  it("空檔提示：快結束時要他說要去忙", () => {
    const away = busy({ spareUntil: NOW + 4 * MINUTE });
    expect(buildCharBusySpareNote(away, NOW)).toContain("大約還剩 4 分鐘");
    expect(buildCharBusySpareNote(away, NOW + 3 * MINUTE)).toContain("這次就說要回去忙了");
    expect(buildCharBusySpareNote(busy(), NOW)).toBeNull();
    expect(buildCharBusySpareNote({ ...away, sneakPending: true }, NOW)).toBeNull();
  });
});

describe("buildAwayHintText / awayUrgeLabel / awayHeaderText", () => {
  it("三種狀態各自的文字", () => {
    expect(buildAwayHintText("小明", makeAway())).toBe(
      "小明去忙了（開會），大約 14:30 回來",
    );
    expect(buildAwayHintText("小明", makeSleep())).toBe(
      "小明睡著了，大約 07:30 起床",
    );
    expect(buildAwayHintText("小明", makeBusy())).toBe(
      "小明在忙（搭飛機），大約 18:00 忙完",
    );

    expect(awayUrgeLabel(makeAway())).toBe("快回來");
    expect(awayUrgeLabel(makeSleep())).toBe("起床重睡");
    expect(awayUrgeLabel(makeBusy())).toBe("偷偷回我");

    expect(awayHeaderText(makeAway())).toBe("忙碌中・開會");
    expect(awayHeaderText(makeSleep())).toBe("睡覺中");
    expect(awayHeaderText(makeBusy())).toBe("忙碌中・搭飛機");
  });

  it("結束時間跨天就寫明天", () => {
    const nightNow = new Date(2026, 9, 30, 22, 8).getTime();
    const away = makeBusy({ returnAt: new Date(2026, 9, 31, 10, 8).getTime() });
    expect(buildAwayHintText("小明", away, 0, nightNow)).toBe(
      "小明在忙（搭飛機），大約 明天 10:08 忙完",
    );
    const sameDay = makeBusy({ returnAt: new Date(2026, 9, 30, 23, 8).getTime() });
    expect(buildAwayHintText("小明", sameDay, 0, nightNow)).toContain("大約 23:08 忙完");
  });
});

describe("劇情時間換算（shiftMs）", () => {
  const SHIFT = 10 * 60 * MINUTE; // 劇情比現實快 10 小時：現實 14:00＝劇情隔天 00:00

  it("能不能去睡看劇情時間", () => {
    expect(canUseCharSleep({}, { faceToFace: false, now: NOW, shiftMs: SHIFT })).toBe(true);
    expect(canUseCharSleep({}, { faceToFace: false, now: NOW })).toBe(false);
  });

  it("起床時間是劇情時間，存成對應的現實時間", () => {
    const sleep = createCharSleep({ wake: "08:00", backText: "" }, NOW, undefined, undefined, SHIFT)!;
    expect(sleep.returnAt).toBe(NOW + 8 * 60 * MINUTE);
  });

  it("忙碌的開始／結束是劇情時間", () => {
    const busy = createCharBusy(
      { start: "02:00", end: "05:00", reason: "值班", backText: "" },
      NOW,
      undefined,
      SHIFT,
    )!;
    expect(busy.startedAt).toBe(NOW + 2 * 60 * MINUTE);
    expect(busy.returnAt).toBe(NOW + 5 * 60 * MINUTE);
  });

  it("給 AI 和畫面看的時間用劇情時間", () => {
    const away = makeAway({ kind: "sleep", returnAt: NOW + 8 * 60 * MINUTE });
    expect(buildAwayHintText("他", away, SHIFT)).toContain("08:00");
    const plan = makeAway({
      kind: "busy",
      reason: "值班",
      startedAt: NOW + 2 * 60 * MINUTE,
      returnAt: NOW + 5 * 60 * MINUTE,
    });
    expect(buildCharAwayPlanNote(plan, NOW, SHIFT)).toContain("02:00～05:00");
    expect(buildCharBusyGuide(true, plan, NOW, SHIFT)).toContain("02:00～05:00");
  });
});

describe("面對面暫停", () => {
  it("暫停中不算進行中，預約不算待開始", () => {
    const away = pauseCharAway(makeAway({ returnAt: NOW + 30 * MINUTE }), NOW);
    expect(away.pausedAt).toBe(NOW);
    expect(isCharAwayActive(away)).toBe(false);
    const plan = pauseCharAway(
      makeAway({ kind: "busy", startedAt: NOW + 60 * MINUTE, returnAt: NOW + 120 * MINUTE }),
      NOW,
    );
    expect(isCharAwayPlanPending(plan)).toBe(false);
  });

  it("恢復時從剩下的時間繼續", () => {
    const away = makeAway({
      startedAt: NOW - 10 * MINUTE,
      returnAt: NOW + 30 * MINUTE,
      urgeLockedUntil: NOW + 3 * MINUTE,
    });
    const later = NOW + 2 * 60 * MINUTE;
    const resumed = resumeCharAway(pauseCharAway(away, NOW), later);
    expect(resumed.pausedAt).toBeUndefined();
    expect(resumed.returnAt).toBe(later + 30 * MINUTE);
    expect(resumed.startedAt).toBe(later - 10 * MINUTE);
    expect(resumed.urgeLockedUntil).toBe(later + 3 * MINUTE);
    expect(isCharAwayActive(resumed)).toBe(true);
  });

  it("已結束或已暫停的不重複暫停；沒暫停的恢復時原樣回傳", () => {
    const ended = makeAway({ endedAt: NOW - MINUTE });
    expect(pauseCharAway(ended, NOW)).toBe(ended);
    const paused = pauseCharAway(makeAway(), NOW);
    expect(pauseCharAway(paused, NOW + MINUTE)).toBe(paused);
    const plain = makeAway();
    expect(resumeCharAway(plain, NOW)).toBe(plain);
  });
});

describe("手動調時間跨過", () => {
  it("跨過回來的劇情時間就把 returnAt 拉到現在", () => {
    const away = makeAway({ returnAt: NOW + 3 * 60 * MINUTE });
    expect(fastForwardAway(away, NOW, 0, 4 * 60 * MINUTE)?.returnAt).toBe(NOW);
    expect(fastForwardAway(away, NOW, 0, 60 * MINUTE)).toBeNull();
    expect(fastForwardAway(away, NOW, 60 * MINUTE, 0)).toBeNull();
  });

  it("預約：跨過開始就現在開始，連結束也跨過就一起拉到現在", () => {
    const plan = makeAway({
      kind: "busy",
      startedAt: NOW + 60 * MINUTE,
      returnAt: NOW + 3 * 60 * MINUTE,
    });
    const started = fastForwardPlan(plan, NOW, 0, 2 * 60 * MINUTE)!;
    expect(started.startedAt).toBe(NOW);
    expect(started.returnAt).toBe(NOW + 3 * 60 * MINUTE);
    const done = fastForwardPlan(plan, NOW, 0, 5 * 60 * MINUTE)!;
    expect(done.startedAt).toBe(NOW);
    expect(done.returnAt).toBe(NOW);
    expect(fastForwardPlan(plan, NOW, 0, 30 * MINUTE)).toBeNull();
  });
});
