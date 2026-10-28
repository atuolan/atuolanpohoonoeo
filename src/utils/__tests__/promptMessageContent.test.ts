import { describe, expect, it } from "vitest";
import {
  describeMessageForPrompt,
  stripPromptStatusNotes,
  type PromptMessageLike,
} from "@/utils/promptMessageContent";

const names = { userName: "小美", charName: "小明" };
const ai = (extra: Partial<PromptMessageLike>): PromptMessageLike => ({ content: "", is_user: false, ...extra });
const user = (extra: Partial<PromptMessageLike>): PromptMessageLike => ({ content: "", is_user: true, ...extra });

describe("describeMessageForPrompt：轉帳", () => {
  const pay = { isTransfer: true, transferType: "pay" as const, transferAmount: 520, transferNote: "奶茶" };

  it("角色發的轉帳寫回標籤，並說使用者領了沒", () => {
    expect(describeMessageForPrompt(ai({ ...pay, transferStatus: "pending" }), names)).toBe(
      "<pay>520:奶茶</pay>[轉帳狀態：小美還沒領取]",
    );
    expect(describeMessageForPrompt(ai({ ...pay, transferStatus: "received" }), names)).toContain("[轉帳狀態：小美已領取]");
    expect(describeMessageForPrompt(ai({ ...pay, transferStatus: "refunded" }), names)).toContain("[轉帳狀態：小美已退回]");
  });

  it("舊資料沒有狀態的角色轉帳當成還沒領", () => {
    expect(describeMessageForPrompt(ai({ ...pay }), names)).toContain("還沒領取");
  });

  it("使用者的轉帳說角色收了沒；群聊不指名", () => {
    const sent = user({ ...pay, content: "<pay>520:奶茶</pay>", transferStatus: "sent" });
    expect(describeMessageForPrompt(sent, names)).toBe("<pay>520:奶茶</pay>[轉帳狀態：小明還沒收下]");
    expect(describeMessageForPrompt({ ...sent, transferStatus: "received" }, names)).toContain("小明已收下");
    expect(describeMessageForPrompt({ ...sent, transferStatus: "refunded" }, names)).toContain("小明已退回");
    expect(describeMessageForPrompt(sent, { ...names, groupChat: true })).toContain("[轉帳狀態：還沒有人收]");
  });

  it("角色的退款寫成 refund 標籤", () => {
    expect(
      describeMessageForPrompt(ai({ isTransfer: true, transferType: "refund", transferAmount: 100, transferStatus: "refunded" }), names),
    ).toBe("<refund>100</refund>");
  });

  it("同一則還有文字時文字在前、卡片在後", () => {
    expect(describeMessageForPrompt(ai({ ...pay, content: "拿去買", transferStatus: "pending" }), names)).toBe(
      "拿去買\n<pay>520:奶茶</pay>[轉帳狀態：小美還沒領取]",
    );
  });

  it("撤回的轉帳只留撤回提示", () => {
    expect(
      describeMessageForPrompt(user({ ...pay, content: "(小美撤回了此訊息)", isUserRecalled: true }), names),
    ).toBe("(小美撤回了此訊息)");
  });
});

describe("describeMessageForPrompt：其他卡片", () => {
  it("紅包說誰領了", () => {
    const rp = ai({ isRedpacket: true, redpacketData: { amount: "66", blessing: "發財" } });
    expect(describeMessageForPrompt(rp, names)).toBe('<redpacket amount="66" blessing="發財"/>[紅包狀態：還沒有人領]');
    expect(
      describeMessageForPrompt(
        { ...rp, redpacketState: { claims: [{ claimerName: "小美", cents: 6600 }], fullyClaimed: true } },
        names,
      ),
    ).toContain("[紅包狀態：小美領了 $66，已領完]");
  });

  it("位置：角色和使用者都寫成 location 標籤", () => {
    expect(describeMessageForPrompt(ai({ isLocation: true, locationContent: "星巴克" }), names)).toBe("<location>星巴克</location>");
    expect(
      describeMessageForPrompt(user({ content: "台北車站", isLocation: true, locationContent: "台北車站" }), names),
    ).toBe("<location>台北車站</location>");
  });

  it("角色送的禮物不再是空白", () => {
    expect(describeMessageForPrompt(ai({ isGift: true, giftName: "玫瑰" }), names)).toBe("<送禮物>玫瑰</送禮物>");
    expect(
      describeMessageForPrompt(user({ content: "<送禮物>巧克力</送禮物>", isGift: true, giftName: "巧克力" }), names),
    ).toBe("<送禮物>巧克力</送禮物>");
  });

  it("模式邀請說使用者答應了沒", () => {
    const req = ai({ isFaceToFaceRequest: true, faceToFaceRequestReason: "想見你", faceToFaceRequestStatus: "rejected" });
    expect(describeMessageForPrompt(req, names)).toBe('<face-to-face-request reason="想見你"/>[邀請狀態：小美拒絕了]');
    expect(
      describeMessageForPrompt(ai({ isOnlineModeRequest: true, onlineModeRequestStatus: "pending" }), names),
    ).toBe("<online-mode-request/>[邀請狀態：小美還沒回覆]");
  });

  it("手動轉文字的語音用辨識結果", () => {
    expect(
      describeMessageForPrompt(user({ content: "🎤 語音訊息 (0:05)", messageType: "audio", audioTranscript: "我到了" }), names),
    ).toBe("[語音訊息] 我到了");
    expect(
      describeMessageForPrompt(user({ content: "我到了", messageType: "audio", audioTranscript: "我到了" }), names),
    ).toBe("[語音訊息] 我到了");
    expect(
      describeMessageForPrompt(ai({ content: "[語音訊息] 我到家了", messageType: "audio", audioTranscript: "我到家了" }), names),
    ).toBe("[語音訊息] 我到家了");
  });

  it("外賣付款結果", () => {
    expect(
      describeMessageForPrompt(ai({ isWaimaiPaymentResult: true, waimaiOrder: { status: "paid" } }), names),
    ).toBe('<waimai-pay status="paid"/>');
  });

  it("一般訊息原樣回傳", () => {
    const m = user({ content: "早安" });
    expect(describeMessageForPrompt(m, names)).toBe("早安");
  });
});

describe("stripPromptStatusNotes", () => {
  it("拿掉角色照抄的狀態註記", () => {
    expect(stripPromptStatusNotes("<pay>100</pay>[轉帳狀態：小美還沒領取]")).toBe("<pay>100</pay>");
    expect(stripPromptStatusNotes("好[紅包狀態：還沒有人領]喔")).toBe("好喔");
    expect(stripPromptStatusNotes("[time:12:00] 嗨")).toBe("[time:12:00] 嗨");
  });
});

describe("describeMessageForPrompt：送禮與共感娃娃", () => {
  it("小卡跟著送禮標籤", () => {
    const m = user({ content: '<送禮物 card="嗨">花</送禮物>', isGift: true, giftName: "花", giftCard: "嗨" });
    expect(describeMessageForPrompt(m, names)).toBe('<送禮物 card="嗨">花</送禮物>');
  });

  it("送共感娃娃時附上說明", () => {
    const m = user({ content: "<送禮物>共感娃娃</送禮物>", isGift: true, giftName: "共感娃娃" });
    expect(describeMessageForPrompt(m, names)).toContain("小明 都感覺得到");
  });

  it("娃娃碰觸寫成一行並附上第幾次", () => {
    const m = user({
      content: "<共感娃娃>捏臉頰 ×2</共感娃娃>",
      isDollTouch: true,
      dollTouchText: "捏臉頰 ×2",
      dollTouchRound: 2,
    });
    expect(describeMessageForPrompt(m, names)).toBe(
      "<共感娃娃>捏臉頰 ×2</共感娃娃>（小美 對共感娃娃做了這些，小明 的身體同時感覺得到；這是 30 分鐘內第 2 次）",
    );
  });
});
