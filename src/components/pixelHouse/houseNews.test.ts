import { describe, expect, it } from "vitest";
import { describeHouseNewsForPrompt, houseNewsSummary, houseNewsTime } from "@/utils/houseNewsShare";
import { describeMessageForPrompt } from "@/utils/promptMessageContent";
import { buildHouseNewsMessage } from "@/services/houseNewsChat";
import {
  addNews,
  buildNewsShare,
  markTold,
  NEWS_KEEP_MS,
  NEWS_MAX,
  NEWS_MERGE_MS,
  NEWS_PICK_MAX,
  newsCardText,
  newsFor,
  newsHouseText,
  parseNews,
  type HouseNews,
} from "./houseNews";

const T = new Date(2026, 10, 13, 15, 0).getTime();
const MIN = 60_000;

describe("小屋記事", () => {
  it("新的在前面，三十分鐘內一樣的事只記一次", () => {
    let list: HouseNews[] = [];
    list = addNews(list, { text: "小咪生病了", who: "pet" }, T);
    list = addNews(list, { text: "{user}把貓砂盆鏟乾淨了", who: "user" }, T + MIN);
    list = addNews(list, { text: "{user}把貓砂盆鏟乾淨了", who: "user" }, T + 10 * MIN);
    expect(list.map((n) => n.text)).toEqual(["{user}把貓砂盆鏟乾淨了", "小咪生病了"]);
    list = addNews(list, { text: "{user}把貓砂盆鏟乾淨了", who: "user" }, T + MIN + NEWS_MERGE_MS);
    expect(list).toHaveLength(3);
  });

  it("超過一天的自己消失，最多留 NEWS_MAX 件", () => {
    let list: HouseNews[] = [];
    list = addNews(list, { text: "很久以前", who: "pet" }, T);
    list = addNews(list, { text: "剛剛", who: "pet" }, T + NEWS_KEEP_MS + MIN);
    expect(list.map((n) => n.text)).toEqual(["剛剛"]);
    for (let i = 0; i < NEWS_MAX + 5; i++) list = addNews(list, { text: `第 ${i} 件`, who: "pet" }, T + NEWS_KEEP_MS + 2 * MIN + i);
    expect(list).toHaveLength(NEWS_MAX);
    expect(list[0].text).toBe(`第 ${NEWS_MAX + 4} 件`);
  });

  it("讀存檔：認不得的丟掉、過期的丟掉", () => {
    const raw = [
      { id: "a", at: T, who: "char", text: "{char}煮了咖哩飯", charId: "c1" },
      { id: "b", at: T - NEWS_KEEP_MS - MIN, who: "pet", text: "太久了" },
      { id: "c", at: T, who: "dragon", text: "不認得" },
      { id: "d", at: T, who: "user", text: "{user}洗了澡", told: T + 1 },
      null,
      "x",
    ];
    const list = parseNews(raw, T + MIN);
    expect(list.map((n) => n.id).sort()).toEqual(["a", "d"]);
    expect(list.find((n) => n.id === "d")?.told).toBe(T + 1);
  });

  it("他做的事只給做的那個人聽", () => {
    const list: HouseNews[] = [
      { id: "a", at: T, who: "char", text: "{char}煮了咖哩飯", charId: "c1" },
      { id: "b", at: T, who: "char", text: "{char}洗了碗", charId: "c2" },
      { id: "c", at: T, who: "pet", text: "小咪生病了" },
    ];
    expect(newsFor(list, "c1").map((n) => n.id)).toEqual(["a", "c"]);
  });

  it("小屋裡寫「他、你」，卡片寫「你、我」", () => {
    expect(newsHouseText("{user}吃了{char}煮的咖哩飯", "她")).toBe("你吃了她煮的咖哩飯");
    expect(newsCardText("{user}吃了{char}煮的咖哩飯")).toBe("我吃了你煮的咖哩飯");
  });

  it("做成卡片：只放勾的、沒說過的，照發生的順序；標成已告訴後不能再說", () => {
    let list: HouseNews[] = [];
    list = addNews(list, { text: "小咪在臥室地上尿尿了", who: "pet" }, T);
    list = addNews(list, { text: "{char}帶豆豆出門散步", who: "char", charId: "c1" }, T + 30 * MIN);
    list = addNews(list, { text: "{user}把貓砂盆鏟乾淨了", who: "user" }, T + 60 * MIN);
    const ids = list.filter((n) => !n.text.includes("貓砂")).map((n) => n.id);
    const share = buildNewsShare(list, ids, T + 2 * 60 * MIN)!;
    expect(share.items.map((i) => i.text)).toEqual(["小咪在臥室地上尿尿了", "你帶豆豆出門散步"]);
    list = markTold(list, ids, T + 2 * 60 * MIN);
    expect(buildNewsShare(list, ids, T + 3 * 60 * MIN)).toBeNull();
  });

  it("一次最多 NEWS_PICK_MAX 件（留最新的）", () => {
    let list: HouseNews[] = [];
    for (let i = 0; i < NEWS_PICK_MAX + 3; i++) list = addNews(list, { text: `第 ${i} 件`, who: "pet" }, T + i * MIN);
    const share = buildNewsShare(list, list.map((n) => n.id), T + 60 * MIN)!;
    expect(share.items).toHaveLength(NEWS_PICK_MAX);
    expect(share.items[share.items.length - 1].text).toBe(`第 ${NEWS_PICK_MAX + 2} 件`);
  });
});

describe("小屋的事卡片", () => {
  const share = { items: [{ at: T - 24 * 60 * MIN + 10 * MIN, text: "小咪在臥室地上尿尿了" }, { at: T - 5 * MIN, text: "你帶豆豆出門散步" }], sentAt: T };

  it("時間：今天只寫時分、昨天寫昨天", () => {
    expect(houseNewsTime(T - 5 * MIN, T)).toBe("14:55");
    expect(houseNewsTime(share.items[0].at, T)).toBe("昨天 15:10");
  });

  it("摘要", () => {
    expect(houseNewsSummary(share)).toBe("[小屋的事] 小咪在臥室地上尿尿了等 2 件");
  });

  it("給 AI 的說明：列出每件事，提醒只要回應一次", () => {
    const text = describeHouseNewsForPrompt(share, { userName: "小雨" });
    expect(text).toContain("小雨 傳來一張「小屋的事」卡片");
    expect(text).toContain("・昨天 15:10 小咪在臥室地上尿尿了");
    expect(text).toContain("・14:55 你帶豆豆出門散步");
    expect(text).toContain("自然地回應一次就好，之後不用一直提起");
  });

  it("聊天紀錄裡的卡片：給 AI 看的是事情的清單，不是畫面摘要", () => {
    const msg = buildHouseNewsMessage(share, T, T);
    expect(msg.is_user).toBe(true);
    expect(msg.content).toBe("[小屋的事] 小咪在臥室地上尿尿了等 2 件");
    const text = describeMessageForPrompt({ content: msg.content, houseNews: msg.houseNews }, { userName: "小雨", charName: "小明" });
    expect(text).toContain("・14:55 你帶豆豆出門散步");
    expect(text).not.toContain("等 2 件");
  });
});
