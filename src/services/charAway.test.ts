import { describe, expect, it } from "vitest";
import {
  buildAwayHintText,
  buildCharAwayGuide,
  buildCharAwayReturnNote,
  canUseCharAway,
  createCharAway,
  endCharAway,
  quickBackTapTarget,
  recordUrgeAttempt,
} from "./charAway";
import type { CharAway } from "@/types/chat";

const NOW = new Date(2026, 9, 23, 14, 0).getTime();
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
