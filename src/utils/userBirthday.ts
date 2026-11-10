/**
 * user 的生日（存在人設上，MM-DD，每年重複）。
 * 純函式：行事曆 App 標記、給 AI 看的行事曆、生日當天角色主動祝福都用這裡。
 */
import type { Holiday } from "@/types/holiday";

/** 生日觸發紀錄用的名字（跟節日共用觸發紀錄，一個聊天一天只祝一次） */
export const USER_BIRTHDAY_HOLIDAY_NAME = "使用者生日";

const pad = (n: number) => String(n).padStart(2, "0");

function toDateString(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** 整理成 MM-DD；不是合法的月日回傳 undefined（2/29 算合法） */
export function normalizeBirthday(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const match = /^(\d{1,2})-(\d{1,2})$/.exec(value.trim());
  if (!match) return undefined;
  const month = Number(match[1]);
  const day = Number(match[2]);
  if (month < 1 || month > 12 || day < 1) return undefined;
  // 用閏年算當月天數，2/29 生日也收
  if (day > new Date(2000, month, 0).getDate()) return undefined;
  return `${pad(month)}-${pad(day)}`;
}

/** 這一年過生日的日期 YYYY-MM-DD；2/29 生日平年過 2/28 */
export function birthdayInYear(birthday: string, year: number): string {
  const [month, day] = birthday.split("-").map(Number);
  const lastDay = new Date(year, month, 0).getDate();
  return `${year}-${pad(month)}-${pad(Math.min(day, lastDay))}`;
}

/** 從 today（YYYY-MM-DD）算還有幾天生日；今天就是回傳 0。生日不合法回傳 null */
export function daysUntilBirthday(birthday: string | undefined, today: string): number | null {
  const b = normalizeBirthday(birthday);
  if (!b) return null;
  const year = Number(today.slice(0, 4));
  let next = birthdayInYear(b, year);
  if (next < today) next = birthdayInYear(b, year + 1);
  return Math.round((Date.parse(`${next}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
}

/** 「10 月 24 日」 */
export function formatBirthday(birthday: string | undefined): string {
  const b = normalizeBirthday(birthday);
  if (!b) return "";
  const [month, day] = b.split("-").map(Number);
  return `${month} 月 ${day} 日`;
}

/**
 * 給 AI 看的行事曆裡那一行：生日在 today 起 7 天內才有，不然回傳空字串。
 * dateLabel 把 YYYY-MM-DD 轉成行事曆其他行一樣的日期格式
 */
export function buildBirthdayCalendarLine(
  birthday: string | undefined,
  options: { today: string; userName: string; dateLabel: (date: string) => string },
): string {
  const days = daysUntilBirthday(birthday, options.today);
  if (days === null || days > 6) return "";
  const d = new Date(`${options.today}T00:00:00`);
  d.setDate(d.getDate() + days);
  const date = toDateString(d);
  const when = days === 0 ? "就是今天！" : days === 1 ? "明天" : `還有 ${days} 天`;
  return `- ${options.dateLabel(date)} 🎂 ${options.userName}的生日（${when}）`;
}

/** 今天（預設現實時間）是 user 生日的話，當成一個節日給節日主動祝福用；不是回傳 null */
export function userBirthdayHoliday(birthday: string | undefined, today: string = toDateString(new Date())): Holiday | null {
  if (daysUntilBirthday(birthday, today) !== 0) return null;
  return {
    name: USER_BIRTHDAY_HOLIDAY_NAME,
    date: today.slice(5),
    greeting: "生日快樂！",
    aiPrompt:
      "今天是 {{user}} 的生日！請讓 {{char}} 主動祝 {{user}} 生日快樂。" +
      "可以依你們的關係和 {{char}} 的性格，表達特別的心意（例如準備驚喜、約定慶祝、送禮物），不要只是一句客套話。",
  };
}
