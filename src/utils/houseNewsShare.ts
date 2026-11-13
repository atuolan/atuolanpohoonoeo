/**
 * 「小屋的事」卡片：時間怎麼寫、畫面摘要、寫給角色看的說明。
 *
 * 只在卡片那一則訊息裡出現，不會寫進每次都帶的設定：他知道這些事，是因為聊天紀錄裡有這張卡片，
 * 紀錄往前推了就自然淡掉，不會一直重複提起。
 */
import type { HouseNewsShare } from "@/types/houseNews";

const pad = (n: number) => String(n).padStart(2, "0");

/** 「14:20」；不是今天的寫「昨天 22:10」，更早的寫「11/12 22:10」 */
export function houseNewsTime(at: number, now: number): string {
  const d = new Date(at);
  const today = new Date(now);
  const hm = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const dayStart = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffDays = Math.round((dayStart(today) - dayStart(d)) / 86_400_000);
  if (diffDays <= 0) return hm;
  if (diffDays === 1) return `昨天 ${hm}`;
  return `${d.getMonth() + 1}/${d.getDate()} ${hm}`;
}

/** 聊天列表、轉發用的一行摘要 */
export function houseNewsSummary(s: HouseNewsShare): string {
  const first = s.items[0]?.text ?? "";
  return s.items.length > 1 ? `[小屋的事] ${first}等 ${s.items.length} 件` : `[小屋的事] ${first}`;
}

/** 寫給角色看的說明（取代卡片的畫面文字） */
export function describeHouseNewsForPrompt(s: HouseNewsShare, names: { userName: string }): string {
  const lines = s.items.map((i) => `・${houseNewsTime(i.at, s.sentAt)} ${i.text}`);
  return [
    `[${names.userName} 傳來一張「小屋的事」卡片，告訴你你們家（小屋）最近發生的事：`,
    ...lines,
    `（這是 ${names.userName} 挑出來告訴你的家裡近況，句子裡的「你」是你、「我」是 ${names.userName}。自然地回應一次就好，之後不用一直提起。）]`,
  ].join("\n");
}
