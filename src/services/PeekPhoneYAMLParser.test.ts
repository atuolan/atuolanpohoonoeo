import { describe, expect, it } from "vitest";
import {
  parseGroupA,
  parseGroupD,
  parseLockScreen,
  parseMessageTime,
  parseScreenTime,
} from "./PeekPhoneYAMLParser";

describe("PeekPhoneYAMLParser：秘密欄位", () => {
  it("鎖屏密碼：取 4 位數字，提示和意義原樣保留", () => {
    const yaml = `lock_screen:
  passcode: "0912"
  hint: 第一次見到她的那天（月月日日）
  reveal: |
    0912，是你們初遇的那天

chats:
  - contact: 栩
    messages: []`;
    expect(parseLockScreen(yaml)).toEqual({
      passcode: "0912",
      hint: "第一次見到她的那天（月月日日）",
      reveal: "0912，是你們初遇的那天",
    });
  });

  it("鎖屏密碼不是 4 位數字就當作沒有", () => {
    expect(parseLockScreen(`lock_screen:\n  passcode: "12345"\n  hint: x`)).toBeUndefined();
    expect(parseLockScreen(`chats:\n  - contact: 栩`)).toBeUndefined();
  });

  it("收回的訊息和沒送出的草稿：草稿寫在 messages 後面也讀得到，草稿歷史不會變成訊息", () => {
    const yaml = `chats:
  - contact: 栩
    messages:
      - from: 沈既白
        text: |
          我調班了。就是想去。
        self: true
        time: 1760000000
        recalled: true
        recalled_after: 11
      - from: 栩
        text: 你睡了嗎
        self: false
        time: 1760000300
    draft: |
      其實那天我不是剛好路過。
    draft_history:
      - text: 那天
      - text: 其實那天我
  - contact: 媽
    messages:
      - from: 媽
        text: 記得吃飯
        self: false
        time: 1760000000`;
    const [xu, mom] = parseGroupA(yaml);

    expect(xu.messages).toHaveLength(2);
    expect(xu.messages[0]).toMatchObject({ content: "我調班了。就是想去。", recalled: true, recalledAfter: 11 });
    expect(xu.messages[1].recalled).toBeUndefined();
    expect(xu.draft).toBe("其實那天我不是剛好路過。");
    expect(xu.draftHistory).toEqual(["那天", "其實那天我"]);

    expect(mom.messages).toHaveLength(1);
    expect(mom.draft).toBeUndefined();
    expect(mom.draftHistory).toBeUndefined();
  });

  it("只有草稿歷史沒有草稿：最新一版當草稿", () => {
    const yaml = `chats:
  - contact: 栩
    draft_history:
      - text: 第一版
      - text: 第二版
    messages:
      - from: 栩
        text: 嗨
        self: false
        time: 1`;
    const [xu] = parseGroupA(yaml);
    expect(xu.draft).toBe("第二版");
    expect(xu.draftHistory).toEqual(["第一版"]);
    expect(xu.messages).toHaveLength(1);
  });

  it("最近刪除：天數在 1–30 之間才算，故事去掉前後空白", () => {
    const yaml = `gallery:
  - description: 美術館外的台階
    source: scene
    reason: 那天她站在這裡
    date: "2026-10-03"
    deleted: 14
    secret: |
      刪除 3 次、又復原 3 次。
  - description: 值班室窗外
    source: scene
    reason: 剛下刀
    date: "2026-10-09"
    deleted: 99`;
    const { gallery } = parseGroupD(yaml);
    expect(gallery[0]).toMatchObject({ deletedDaysLeft: 14, secret: "刪除 3 次、又復原 3 次。" });
    expect(gallery[1].deletedDaysLeft).toBeUndefined();
    expect(gallery[1].secret).toBeUndefined();
  });

  it("螢幕使用時間：一行陣列補到 24 小時，最常使用的 App 一個個讀", () => {
    const yaml = `screen_time:
  hourly: [42, 38, 33, 26, 8]
  pickups: 87
  first_pickup: "00:04"
  top_apps:
    - name: 訊息
      minutes: 182
    - name: 相簿
      minutes: 48
  insight: |
    凌晨 0–3 點就用了 2 小時 19 分`;
    const st = parseScreenTime(yaml)!;
    expect(st.hourly).toHaveLength(24);
    expect(st.hourly.slice(0, 6)).toEqual([42, 38, 33, 26, 8, 0]);
    expect(st.topApps).toEqual([
      { name: "訊息", minutes: 182 },
      { name: "相簿", minutes: 48 },
    ]);
    expect(st.pickups).toBe(87);
    expect(st.firstPickup).toBe("00:04");
    // insight 寫在 top_apps 後面也不會被當成某個 App 的欄位
    expect(st.insight).toBe("凌晨 0–3 點就用了 2 小時 19 分");
  });

  it("螢幕使用時間：hourly 寫成列表也讀得到；超過 60 分鐘的截到 60", () => {
    const yaml = `screen_time:
  hourly:
    - 70
    - 12
  pickups: 3`;
    const st = parseScreenTime(yaml)!;
    expect(st.hourly.slice(0, 3)).toEqual([60, 12, 0]);
  });

  it("沒有螢幕使用時間就回傳 undefined", () => {
    expect(parseScreenTime(`gallery:\n  - description: x`)).toBeUndefined();
  });

  it("跟使用者的那串標 is_user", () => {
    const [user, mom] = parseGroupA(`chats:
  - contact: 栩
    is_user: true
    messages:
      - from: 栩
        text: 你睡了嗎
        self: false
        time: "10/18 01:45"
  - contact: 媽
    messages:
      - from: 媽
        text: 記得吃飯
        self: false
        time: "10/17 19:20"`);
    expect(user.isUser).toBe(true);
    expect(mom.isUser).toBeUndefined();
    expect(user.messages[0].timestamp).toBeGreaterThan(0);
  });
});

describe("parseMessageTime：訊息時間", () => {
  const now = new Date(2026, 9, 18, 1, 47);

  it("「月/日 時:分」用今年", () => {
    expect(parseMessageTime("10/17 23:12", now)).toBe(new Date(2026, 9, 17, 23, 12).getTime());
  });

  it("沒寫年份、算出來在未來：當作去年（例如一月看到 12 月的訊息）", () => {
    const jan = new Date(2026, 0, 2, 10, 0);
    expect(parseMessageTime("12/31 23:00", jan)).toBe(new Date(2025, 11, 31, 23, 0).getTime());
  });

  it("寫了年份就照寫的", () => {
    expect(parseMessageTime("2026-10-03 21:48", now)).toBe(new Date(2026, 9, 3, 21, 48).getTime());
  });

  it("只寫「時:分」：今天的；比現在晚就是昨天的", () => {
    expect(parseMessageTime("01:30", now)).toBe(new Date(2026, 9, 18, 1, 30).getTime());
    expect(parseMessageTime("23:12", now)).toBe(new Date(2026, 9, 17, 23, 12).getTime());
  });

  it("舊格式的時間戳數字照收", () => {
    expect(parseMessageTime("1760000000", now)).toBe(1760000000);
    expect(parseMessageTime("1760000000000", now)).toBe(1760000000000);
  });

  it("看不懂的（例如照抄說明文字）回傳 0", () => {
    expect(parseMessageTime("時間戳數字", now)).toBe(0);
    expect(parseMessageTime("", now)).toBe(0);
  });
});
