import { describe, expect, it } from "vitest";
import {
  applyUserEdit,
  clampEditNoticeChance,
  formatEditNoticeNote,
  isMeaningfulEdit,
  isUnrepliedByChar,
  type EditNoticeFields,
} from "@/utils/editNotice";

function userMsg(content: string, extra: Partial<EditNoticeFields> = {}): EditNoticeFields {
  return { role: "user", content, ...extra };
}

describe("isMeaningfulEdit", () => {
  it("只差空白或標點不算改字", () => {
    expect(isMeaningfulEdit("該親的時候會親", "該親的時候會親！")).toBe(false);
    expect(isMeaningfulEdit("好 啊", "好啊")).toBe(false);
  });

  it("換了字就算", () => {
    expect(isMeaningfulEdit("該親的時候會清", "該親的時候會親")).toBe(true);
  });
});

describe("isUnrepliedByChar", () => {
  const messages = [
    { id: "a", role: "user" },
    { id: "b", role: "ai" },
    { id: "c", role: "user" },
    { id: "d", role: "system" },
  ];

  it("後面只有用戶或系統訊息：還沒回", () => {
    expect(isUnrepliedByChar(messages, "c")).toBe(true);
  });

  it("後面有角色訊息：已經回過", () => {
    expect(isUnrepliedByChar(messages, "a")).toBe(false);
  });

  it("找不到訊息：當作已回", () => {
    expect(isUnrepliedByChar(messages, "zzz")).toBe(false);
  });
});

describe("applyUserEdit", () => {
  it("還沒回覆＋擲中：記原文並標記被發現", () => {
    const m = userMsg("該親的時候會清");
    applyUserEdit(m, "該親的時候會親", { unreplied: true, chance: 30, random: () => 0.1 });
    expect(m).toMatchObject({
      isUserEdited: true,
      editOriginalContent: "該親的時候會清",
      editNoticed: true,
    });
  });

  it("還沒回覆＋沒擲中：只標記已編輯", () => {
    const m = userMsg("該親的時候會清");
    applyUserEdit(m, "該親的時候會親", { unreplied: true, chance: 30, random: () => 0.5 });
    expect(m.isUserEdited).toBe(true);
    expect(m.editNoticed).toBeUndefined();
  });

  it("已經回過：不擲骰子", () => {
    const m = userMsg("該親的時候會清");
    applyUserEdit(m, "該親的時候會親", { unreplied: false, chance: 100, random: () => 0 });
    expect(m.isUserEdited).toBe(true);
    expect(m.editNoticed).toBeUndefined();
  });

  it("機率 0 永遠不會被發現", () => {
    const m = userMsg("錯字");
    applyUserEdit(m, "對字", { unreplied: true, chance: 0, random: () => 0 });
    expect(m.editNoticed).toBeUndefined();
  });

  it("只改標點：什麼都不做", () => {
    const m = userMsg("好啊");
    applyUserEdit(m, "好啊！", { unreplied: true, chance: 100, random: () => 0 });
    expect(m.isUserEdited).toBeUndefined();
    expect(m.editOriginalContent).toBeUndefined();
  });

  it("改很多次：保留第一次的原文，被發現不會被洗掉", () => {
    const m = userMsg("第一版");
    applyUserEdit(m, "第二版", { unreplied: true, chance: 30, random: () => 0 });
    m.content = "第二版";
    applyUserEdit(m, "第三版", { unreplied: true, chance: 30, random: () => 0.99 });
    expect(m.editOriginalContent).toBe("第一版");
    expect(m.editNoticed).toBe(true);
  });

  it("角色訊息不處理", () => {
    const m: EditNoticeFields = { role: "ai", content: "原本" };
    applyUserEdit(m, "改過", { unreplied: true, chance: 100, random: () => 0 });
    expect(m.isUserEdited).toBeUndefined();
  });
});

describe("clampEditNoticeChance", () => {
  it("沒設定用預設 30，超出範圍夾到 0–100", () => {
    expect(clampEditNoticeChance(undefined)).toBe(30);
    expect(clampEditNoticeChance(150)).toBe(100);
    expect(clampEditNoticeChance(-5)).toBe(0);
  });
});

describe("formatEditNoticeNote", () => {
  it("被發現：附上原文", () => {
    const note = formatEditNoticeNote(
      { content: "該親的時候會親", editNoticed: true, editOriginalContent: "該親的時候會清" },
      "小明",
      "阿玄",
    );
    expect(note).toBe("（小明送出後又改了這則訊息，阿玄看到了修改前的原文：「該親的時候會清」）");
  });

  it("沒被發現：空字串", () => {
    expect(
      formatEditNoticeNote({ content: "新", editOriginalContent: "舊" }, "小明", "阿玄"),
    ).toBe("");
  });

  it("改回原樣：空字串", () => {
    expect(
      formatEditNoticeNote(
        { content: "一樣", editNoticed: true, editOriginalContent: "一樣" },
        "小明",
        "阿玄",
      ),
    ).toBe("");
  });
});
