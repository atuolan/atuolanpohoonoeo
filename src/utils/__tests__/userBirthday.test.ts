import { describe, expect, it } from "vitest";
import { buildUserCalendarPromptText } from "@/utils/calendarEventFormat";
import {
  birthdayInYear,
  buildBirthdayCalendarLine,
  daysUntilBirthday,
  normalizeBirthday,
  specialDayName,
  USER_BIRTHDAY_HOLIDAY_NAME,
  userBirthdayHoliday,
} from "@/utils/userBirthday";

const label = (date: string) => date;

describe("normalizeBirthday", () => {
  it("整理成 MM-DD", () => {
    expect(normalizeBirthday("3-7")).toBe("03-07");
    expect(normalizeBirthday(" 12-31 ")).toBe("12-31");
    expect(normalizeBirthday("02-29")).toBe("02-29");
  });

  it("不合法的月日收不進來", () => {
    expect(normalizeBirthday("02-30")).toBeUndefined();
    expect(normalizeBirthday("13-01")).toBeUndefined();
    expect(normalizeBirthday("04-31")).toBeUndefined();
    expect(normalizeBirthday("")).toBeUndefined();
    expect(normalizeBirthday(undefined)).toBeUndefined();
    expect(normalizeBirthday("2000-01-01")).toBeUndefined();
  });
});

describe("daysUntilBirthday", () => {
  it("今天生日是 0，還沒到算到今年的，過了算到明年的", () => {
    expect(daysUntilBirthday("11-10", "2026-11-10")).toBe(0);
    expect(daysUntilBirthday("11-12", "2026-11-10")).toBe(2);
    expect(daysUntilBirthday("11-09", "2026-11-10")).toBe(364);
    expect(daysUntilBirthday("01-02", "2026-12-30")).toBe(3);
  });

  it("2/29 生日平年過 2/28", () => {
    expect(birthdayInYear("02-29", 2027)).toBe("2027-02-28");
    expect(birthdayInYear("02-29", 2028)).toBe("2028-02-29");
    expect(daysUntilBirthday("02-29", "2027-02-28")).toBe(0);
  });

  it("沒設生日回傳 null", () => {
    expect(daysUntilBirthday(undefined, "2026-11-10")).toBeNull();
  });
});

describe("buildBirthdayCalendarLine", () => {
  it("7 天內才有，寫出還有幾天", () => {
    const opts = { today: "2026-11-10", userName: "小栩", dateLabel: label };
    expect(buildBirthdayCalendarLine("11-10", opts)).toBe("- 2026-11-10 🎂 小栩的生日（就是今天！）");
    expect(buildBirthdayCalendarLine("11-11", opts)).toBe("- 2026-11-11 🎂 小栩的生日（明天）");
    expect(buildBirthdayCalendarLine("11-16", opts)).toBe("- 2026-11-16 🎂 小栩的生日（還有 6 天）");
    expect(buildBirthdayCalendarLine("11-17", opts)).toBe("");
    expect(buildBirthdayCalendarLine(undefined, opts)).toBe("");
  });

  it("跨年也算得到", () => {
    expect(buildBirthdayCalendarLine("01-01", { today: "2026-12-30", userName: "小栩", dateLabel: label })).toBe(
      "- 2027-01-01 🎂 小栩的生日（還有 2 天）",
    );
  });
});

describe("buildUserCalendarPromptText 帶生日", () => {
  it("生日放在行程最前面；沒有行程也會輸出", () => {
    expect(
      buildUserCalendarPromptText([], { today: "2026-11-10", charName: "角色", birthday: "11-12", userName: "小栩" }),
    ).toBe("- 11/12（四） 🎂 小栩的生日（還有 2 天）");
    expect(buildUserCalendarPromptText([], { today: "2026-11-10", charName: "角色" })).toBe("");
  });
});

describe("userBirthdayHoliday", () => {
  it("只有生日當天回傳", () => {
    expect(userBirthdayHoliday("11-10", "2026-11-10")).toMatchObject({
      name: USER_BIRTHDAY_HOLIDAY_NAME,
      date: "11-10",
    });
    expect(userBirthdayHoliday("11-11", "2026-11-10")).toBeNull();
    expect(userBirthdayHoliday(undefined, "2026-11-10")).toBeNull();
  });

  it("同一天也是節日：合在一起，兩個都提到", () => {
    const holiday = { name: "聖誕節", date: "12-25", greeting: "聖誕快樂！", aiPrompt: "可以聊聖誕禮物", suggestionAmount: 1225 };
    const merged = userBirthdayHoliday("12-25", "2026-12-25", holiday)!;
    expect(merged.name).toBe(USER_BIRTHDAY_HOLIDAY_NAME);
    expect(merged.aiPrompt).toContain("{{user}} 的生日");
    expect(merged.aiPrompt).toContain("今天剛好也是聖誕節");
    expect(merged.aiPrompt).toContain("可以聊聖誕禮物");
    expect(merged.suggestionAmount).toBe(1225);
    // 不是生日就不合，交給原本的節日
    expect(userBirthdayHoliday("12-24", "2026-12-25", holiday)).toBeNull();
  });
});

describe("specialDayName", () => {
  it("生日、節日、兩個都是", () => {
    expect(specialDayName("12-25", "小栩", "2026-12-25", "聖誕節")).toBe("小栩的生日，也是聖誕節");
    expect(specialDayName("12-25", "小栩", "2026-12-25", undefined)).toBe("小栩的生日");
    expect(specialDayName("01-01", "小栩", "2026-12-25", "聖誕節")).toBe("聖誕節");
    expect(specialDayName(undefined, "小栩", "2026-12-25", undefined)).toBeUndefined();
  });
});
