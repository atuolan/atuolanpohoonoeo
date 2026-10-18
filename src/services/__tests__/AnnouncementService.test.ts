import { describe, expect, it } from "vitest";
import {
  countAnnouncementStops,
  getPopupHighlights,
  planAnnouncementPopup,
  stripLeadingEmoji,
  type Announcement,
  type AnnouncementStatus,
} from "../AnnouncementService";

function ann(id: string, extra: Partial<Announcement> = {}): Announcement {
  return { id, title: id, body: "內容", level: "important", ...extra };
}

const records = (entries: Array<[string, AnnouncementStatus]>) => new Map(entries);

describe("planAnnouncementPopup", () => {
  it("新用戶（沒有任何紀錄）不跳，舊公告全部當成已讀", () => {
    const plan = planAnnouncementPopup([ann("c"), ann("b"), ann("a")], records([]));
    expect(plan).toEqual({ popupId: null, markSeen: [], markRead: ["c", "b", "a"] });
  });

  it("只跳最新一則沒跳過的，其他沒看過的直接收進信箱", () => {
    const plan = planAnnouncementPopup(
      [ann("c"), ann("b"), ann("a")],
      records([["a", "read"]]),
    );
    expect(plan.popupId).toBe("c");
    expect(plan.markSeen).toEqual(["c", "b"]);
    expect(plan.markRead).toEqual([]);
  });

  it("跳過的（seen）不會再跳", () => {
    const plan = planAnnouncementPopup(
      [ann("b"), ann("a")],
      records([
        ["b", "seen"],
        ["a", "read"],
      ]),
    );
    expect(plan.popupId).toBeNull();
    expect(plan.markSeen).toEqual([]);
  });

  it("critical 沒收下前每次都跳，而且優先", () => {
    const items = [ann("new"), ann("urgent", { level: "critical" }), ann("old")];
    const plan = planAnnouncementPopup(
      items,
      records([
        ["urgent", "seen"],
        ["old", "read"],
      ]),
    );
    expect(plan.popupId).toBe("urgent");
    expect(plan.markSeen).toEqual(["new"]);
  });

  it("critical 收下後就不再跳", () => {
    const plan = planAnnouncementPopup(
      [ann("urgent", { level: "critical" })],
      records([["urgent", "read"]]),
    );
    expect(plan.popupId).toBeNull();
  });
});

describe("getPopupHighlights", () => {
  it("作者有寫 highlight 就用，最多 3 個", () => {
    const highlights = [1, 2, 3, 4].map((n) => ({ title: `重點${n}` }));
    expect(getPopupHighlights(ann("a", { highlights }))).toHaveLength(3);
  });

  it("沒寫就取 body 的小標題，並去掉開頭的 emoji", () => {
    const body = [
      "前言",
      '<section class="ann-section feature">',
      "",
      "### 🎨 聊天外觀設定重新整理",
      "",
      "</section>",
      "### 🔮 占卜重新設計",
      "### 💬 聊天詳情頁改版",
      "### 🐰 面對面模式改用新預設",
    ].join("\n");
    expect(getPopupHighlights(ann("a", { body })).map((h) => h.title)).toEqual([
      "聊天外觀設定重新整理",
      "占卜重新設計",
      "聊天詳情頁改版",
    ]);
  });
});

describe("countAnnouncementStops", () => {
  it("每個 ann-section 算一站", () => {
    const body =
      '<section class="ann-section feature">a</section>\n<section class="ann-section bug">b</section>\n<div class="ann-feature-box">c</div>';
    expect(countAnnouncementStops(body)).toBe(3);
  });

  it("沒有區塊時數小標題", () => {
    expect(countAnnouncementStops("### 一\n內容\n### 二")).toBe(2);
    expect(countAnnouncementStops("只有一段文字")).toBe(0);
  });
});

describe("stripLeadingEmoji", () => {
  it("去掉開頭的 emoji 與變體符號", () => {
    expect(stripLeadingEmoji("🖥️ 大螢幕")).toBe("大螢幕");
    expect(stripLeadingEmoji("⏳ 劇情時鐘")).toBe("劇情時鐘");
    expect(stripLeadingEmoji("2K 螢幕")).toBe("2K 螢幕");
  });
});
