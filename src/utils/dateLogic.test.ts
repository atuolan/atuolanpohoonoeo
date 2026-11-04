import { describe, expect, it } from "vitest";
import { DATE_SPOTS, getDateSpot } from "@/data/dateSpots";
import {
  buildDateNote,
  createDateSession,
  dateCardContent,
  matchDateSpot,
  remainingDateMinutes,
  resolveDateShares,
  rollDateCost,
  rollDateEvent,
  shouldInjectDateEvent,
} from "./dateLogic";
import { parseDateTags, stripDateTags } from "./dateTags";

const names = { userName: "小明", charName: "阿光" };
/** 依序吐出給定的數字 */
const seq = (...values: number[]) => {
  let i = 0;
  return () => values[i++ % values.length];
};

describe("花費與事件", () => {
  it("兩人份花費落在範圍內、取到十位", () => {
    expect(rollDateCost([150, 400], () => 0)).toBe(300);
    expect(rollDateCost([150, 400], () => 0.9999)).toBe(800);
    expect(rollDateCost([155, 155], () => 0.5) % 10).toBe(0);
  });

  it("四成機率沒有事件", () => {
    expect(rollDateEvent(getDateSpot("cafe")!, names, () => 0.7)).toBeUndefined();
  });

  it("忘了帶錢包會寫出是誰", () => {
    const spot = { events: [] };
    const event = rollDateEvent(spot, names, seq(0.1, 0.99, 0.9));
    expect(event).toMatchObject({ id: "forgot-wallet", forgotWallet: "char" });
    expect(event!.text).toBe("阿光出門忘了帶錢包");
  });
});

describe("誰付錢", () => {
  it("一起付各一半，零頭給使用者", () => {
    expect(resolveDateShares(1001, "split")).toEqual({ payer: "split", userShare: 501, charShare: 500 });
  });

  it("忘了帶錢包的人付不了", () => {
    const forgotChar = { id: "f", text: "", forgotWallet: "char" as const };
    expect(resolveDateShares(1000, "char", forgotChar)).toMatchObject({ payer: "user", userShare: 1000 });
    expect(resolveDateShares(1000, "split", forgotChar)).toMatchObject({ payer: "user", userShare: 1000 });
    const forgotUser = { id: "f", text: "", forgotWallet: "user" as const };
    expect(resolveDateShares(1000, "user", forgotUser)).toMatchObject({ payer: "char", charShare: 1000 });
  });
});

describe("約會進行", () => {
  const session = () =>
    createDateSession({
      chatId: "chat",
      characterId: "c1",
      spot: getDateSpot("aquarium")!,
      startedBy: "user",
      inviteMessageId: "m1",
      names,
      now: 1,
      rng: seq(0.5, 0.1, 0.0),
    });

  it("建立時抽好花費和事件", () => {
    const s = session();
    expect(s).toMatchObject({ place: "水族館", status: "invited", durationMinutes: 180, aiReplies: 0 });
    expect(s.cost).toBeGreaterThanOrEqual(1000);
    expect(s.event).toBeDefined();
  });

  it("角色回了兩輪後才交出事件，而且只交一次", () => {
    const s = { ...session(), status: "ongoing" as const, aiReplies: 1 };
    expect(shouldInjectDateEvent(s)).toBe(false);
    expect(shouldInjectDateEvent({ ...s, aiReplies: 2 })).toBe(true);
    expect(shouldInjectDateEvent({ ...s, aiReplies: 2, eventInjected: true })).toBe(false);
  });

  it("結束時扣掉約會中已經過的劇情時間", () => {
    const s = { ...session(), startedStoryTime: 0 };
    expect(remainingDateMinutes(s, 60 * 60_000)).toBe(120);
    expect(remainingDateMinutes(s, 5 * 60 * 60_000)).toBe(0);
  });

  it("邀請中請他答應或拒絕；約會中說明怎麼付錢和結束", () => {
    const invited = session();
    expect(buildDateNote(invited, names, false)).toContain("<date-accept/>");
    const ongoing = { ...invited, status: "ongoing" as const, event: { id: "rain", text: "突然下起大雨" } };
    const note = buildDateNote(ongoing, names, true);
    expect(note).toContain("<date-pay");
    expect(note).toContain("【突發】突然下起大雨");
    expect(note).toContain("<date-end/>");
    const paid = { ...ongoing, payment: { payer: "char" as const, userPaid: 0, charPaid: 900, note: "阿光請客，付了 $900" } };
    expect(buildDateNote(paid, names, false)).not.toContain("<date-pay");
    expect(buildDateNote({ ...ongoing, status: "ended" as const }, names, false)).toBe("");
  });

  it("角色說的地點對到內建地點，對不到當自訂", () => {
    expect(matchDateSpot("去水族館看水母", DATE_SPOTS)?.id).toBe("aquarium");
    expect(matchDateSpot("陽明山", DATE_SPOTS)).toBeNull();
  });

  it("卡片文字照狀態寫", () => {
    const card = { kind: "invite" as const, sessionId: "s", place: "夜市", emoji: "🏮", startedBy: "user" as const };
    expect(dateCardContent({ ...card, status: "pending" }, names)).toBe("（小明約阿光去夜市約會，等阿光回覆）");
    expect(dateCardContent({ ...card, status: "declined", reason: "要加班" }, names)).toBe("（小明約阿光去夜市約會，阿光拒絕了：要加班）");
  });
});

describe("約會標籤", () => {
  it("解析各種標籤", () => {
    const raw = `<content>好啊</content>
<date-request place="水族館" reason="想看水母"/>
<date-accept/>
<date-decline reason='太累了' />
<date-pay payer="char"/>
<date-end></date-end>`;
    expect(parseDateTags(raw)).toEqual({
      request: { place: "水族館", reason: "想看水母" },
      accept: true,
      decline: { reason: "太累了" },
      pay: "char",
      end: true,
    });
  });

  it("沒有標籤回 null，內文裡的標籤會被拿掉", () => {
    expect(parseDateTags("<content>嗨</content>")).toBeNull();
    expect(stripDateTags("走吧<date-end/>")).toBe("走吧");
  });
});
