/**
 * 雲端主動訊息：App 組好的整份請求在 Worker 這邊怎麼補時間、寫提醒。
 */
import { describe, expect, it } from "vitest";
import { CLOUD_PUSH_MARKERS } from "../../../src/utils/proactiveHistory";
import {
  CP_NOTE,
  fillTimeMarkers,
  finalizeCloudPromptBody,
  toVisibleText,
  unrepliedNoteText,
  visibleHistoryText,
} from "./cloud-prompt.js";

describe("記號跟 App 一致", () => {
  it("note 一樣", () => {
    expect(CP_NOTE).toBe(CLOUD_PUSH_MARKERS.note);
  });
  it("時間記號都換得掉", () => {
    const text = [
      CLOUD_PUSH_MARKERS.time,
      CLOUD_PUSH_MARKERS.date,
      CLOUD_PUSH_MARKERS.year,
      CLOUD_PUSH_MARKERS.day,
      CLOUD_PUSH_MARKERS.tzTime("Asia/Tokyo"),
    ].join("|");
    const filled = fillTimeMarkers(text, Date.UTC(2026, 10, 11, 15, 5), { timeZone: "Asia/Taipei" });
    expect(filled).not.toContain("⟦");
    // 台北 2026/11/11 23:05 星期三；東京 11/12 00:05
    expect(filled).toBe("下午11:05|2026/11/11|2026|三|2026/11/12 00:05");
  });
  it("時區不認得時用 UTC 差距", () => {
    const filled = fillTimeMarkers(CLOUD_PUSH_MARKERS.time, Date.UTC(2026, 10, 11, 1, 30), {
      timeZone: "Not/AZone",
      timezoneOffset: -480,
    });
    expect(filled).toBe("上午9:30");
  });
});

describe("finalizeCloudPromptBody", () => {
  const bodyText = JSON.stringify({
    model: "m",
    messages: [
      { role: "system", content: `現在時間：${CLOUD_PUSH_MARKERS.time}` },
      { role: "user", content: `話題引導${CP_NOTE}` },
      { role: "system", content: `<lastUserMessage>話題引導${CP_NOTE}</lastUserMessage>` },
    ],
  });

  it("填時間、換提醒、雲端發過的列在提醒裡", () => {
    const out = JSON.parse(
      finalizeCloudPromptBody(bodyText, {
        nowMs: Date.UTC(2026, 10, 11, 15, 5),
        schedule: { timeZone: "Asia/Taipei" },
        userName: "雪丘",
        unrepliedCount: 2,
        sentTexts: ["ˇ想妳ˇ 睡了嗎\n[sticker:晚安]"],
      }),
    );
    expect(JSON.stringify(out)).not.toContain("⟦");
    expect(out.messages[0].content).toBe("現在時間：下午11:05");
    expect(out.messages[1].content).toContain("主動傳了 3 次");
    expect(out.messages[1].content).toContain("「ˇ想妳ˇ 睡了嗎 / [sticker:晚安]」");
    expect(out.messages[1].content.startsWith("話題引導\n<request>")).toBe(true);
  });

  it("假時間：照差距往後推", () => {
    const out = JSON.parse(
      finalizeCloudPromptBody(bodyText, {
        nowMs: Date.UTC(2026, 10, 11, 15, 5),
        timeOffsetMs: 2 * 60 * 60 * 1000,
        schedule: { timeZone: "Asia/Taipei" },
        userName: "雪丘",
      }),
    );
    expect(out.messages[0].content).toBe("現在時間：上午1:05");
  });

  it("沒連發也沒時間：記號直接拿掉", () => {
    const out = JSON.parse(
      finalizeCloudPromptBody(bodyText, { nowMs: Date.now(), schedule: {}, userName: "雪丘" }),
    );
    expect(out.messages[1].content).toBe("話題引導");
  });
});

describe("模型原文轉換", () => {
  const raw = "<think>想一下</think><msg>ˇ其實很想妳ˇ 雪丘小姐，睡了嗎？</msg>\n<msg reply=\"1\">[sticker:晚安]</msg><char-status>躺在床上</char-status>";
  it("通知：拿掉思考、心聲、標籤", () => {
    expect(toVisibleText(raw)).toBe("雪丘小姐，睡了嗎？\n[sticker:晚安]");
  });
  it("聊天紀錄：保留心聲", () => {
    expect(visibleHistoryText(raw)).toBe("ˇ其實很想妳ˇ 雪丘小姐，睡了嗎？\n[sticker:晚安]");
  });
});

describe("unrepliedNoteText", () => {
  it("沒連發：只寫多久沒說話", () => {
    const note = unrepliedNoteText("雪丘", 0, Date.now() - 3 * 60 * 60 * 1000);
    expect(note).toBe("（雪丘 最後一次傳訊息是 3 小時前。）");
  });
  it("連發：寫次數、別重複", () => {
    const note = unrepliedNoteText("雪丘", 4, undefined);
    expect(note).toContain("主動傳了 4 次");
    expect(note).toContain("不要重複");
  });
  it("都沒有：空字串", () => {
    expect(unrepliedNoteText("雪丘", 0, undefined)).toBe("");
  });
});
