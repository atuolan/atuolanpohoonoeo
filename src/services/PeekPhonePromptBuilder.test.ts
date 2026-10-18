import { describe, expect, it } from "vitest";
import {
  buildContactReplyPrompt,
  buildGroupAPrompt,
  buildGroupBCPrompt,
  buildGroupDPrompt,
  type PeekPromptContext,
} from "./PeekPhonePromptBuilder";

const ctx: PeekPromptContext = {
  charName: "沈既白",
  charDesc: "外科醫生，27 歲。",
  personality: "話少、嘴硬",
  scenario: "跟小栩是同事",
  chatContext: "沈既白: 早點睡\n小栩: 你也是",
  userName: "小栩",
  userDescription: "策展人",
  worldInfo: "",
  summariesAndEvents: "",
  now: new Date(2026, 9, 18, 1, 47),
};

const prompts = {
  A: buildGroupAPrompt(ctx),
  BC: buildGroupBCPrompt(ctx, "【聊天紀錄】\n- 與 小栩 的對話"),
  D: buildGroupDPrompt(ctx, "【聊天紀錄】\n- 與 小栩 的對話"),
};

describe("PeekPhonePromptBuilder", () => {
  it.each(Object.entries(prompts))("%s：告訴 AI 現在的日期和時間", (_name, prompt) => {
    expect(prompt).toContain("【現在時間】2026-10-18（星期日）01:47");
  });

  it.each(Object.entries(prompts))("%s：範例裡沒有會被 AI 照抄的說明文字", (_name, prompt) => {
    for (const placeholder of ["時間戳數字", "true或false", "（可省略）", "如有翻譯", "{{user}}", "{{char}}"]) {
      expect(prompt).not.toContain(placeholder);
    }
  });

  it.each(Object.entries(prompts))("%s：範例是中文，雙語只當小例子", (_name, prompt) => {
    expect(prompt).toContain("說中文的角色");
    expect(prompt).not.toContain("最重要的規則");
    expect(prompt).not.toMatch(/Hey, are you free tonight/);
  });

  it("聊天組：一定要有一串跟使用者的對話，標 is_user，時間用「月/日 時:分」", () => {
    expect(prompts.A).toContain("其中一串一定是跟「小栩」的對話，這一串加上 is_user: true");
    expect(prompts.A).toMatch(/time: "\d{1,2}\/\d{1,2} \d{2}:\d{2}"/);
  });

  it("行程組：日記和記事本要呼應使用者與秘密；日記範例用今天的日期", () => {
    expect(prompts.BC).toContain("寫出角色對小栩真正的心情");
    expect(prompts.BC).toContain("收回的訊息和沒送出的草稿");
    expect(prompts.BC).toContain('date: "2026-10-18"');
    expect(prompts.BC).toContain("【已生成的手機內容");
  });

  it("相簿組：成人內容照角色寫，不寫年齡判斷；沒有 teen 範例、沒有簡體字", () => {
    expect(prompts.D).toContain("寫出這個角色私下會看的成人內容");
    expect(prompts.D).not.toContain("推測年紀");
    expect(prompts.D).not.toContain("未滿");
    expect(prompts.D.toLowerCase()).not.toContain("teen");
    expect(prompts.D).not.toContain("这");
    expect(prompts.D).toContain("現在之後的小時一律是 0");
  });

  it("聯絡人回覆：沒有 YAML 指示；聯絡人是使用者時帶入人設", () => {
    const reply = buildContactReplyPrompt({
      ownerName: "沈既白",
      ownerDesc: "外科醫生",
      ownerPersona: "話少",
      scenario: "",
      worldInfo: "",
      contactName: "栩",
      contactProfile: "你就是小栩（沈既白手機裡存成「栩」）。\n策展人",
      history: "栩: 你睡了嗎\n沈既白: 還沒",
      newMessage: "在想你",
      now: ctx.now,
    });
    expect(reply).not.toContain("YAML");
    expect(reply).not.toContain("|");
    expect(reply).toContain("你就是小栩");
    expect(reply).toContain("【現在時間】2026-10-18");
  });

  it("聯絡人回覆：不是使用者時，身分從歷史對話推斷", () => {
    const reply = buildContactReplyPrompt({
      ownerName: "沈既白",
      ownerDesc: "",
      ownerPersona: "",
      scenario: "",
      worldInfo: "",
      contactName: "媽",
      history: "",
      newMessage: "好",
      now: ctx.now,
    });
    expect(reply).toContain("從下面的歷史對話推斷");
    expect(reply).toContain("（這是你們的第一次對話）");
  });
});
