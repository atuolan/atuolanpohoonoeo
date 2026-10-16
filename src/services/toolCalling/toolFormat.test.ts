import { describe, expect, it } from "vitest";
import { buildTextSearchTerms } from "@/services/memoryRetriever";
import {
  describeEvents,
  describeMemories,
  describeTracks,
  parseDateArg,
  parseDateArgOrThrow,
  parseTimeArg,
  toCalendarEventData,
} from "./toolFormat";

const TODAY = new Date(2026, 9, 17); // 2026-10-17

describe("parseDateArg", () => {
  it("看得懂常見的日期寫法", () => {
    expect(parseDateArg("2026-10-20")).toBe("2026-10-20");
    expect(parseDateArg("2026/10/5")).toBe("2026-10-05");
    expect(parseDateArg("2026年10月5日 下午三點")).toBe("2026-10-05");
    expect(parseDateArg("2026-10-20T15:00:00")).toBe("2026-10-20");
  });

  it("看得懂今天、明天、後天、昨天", () => {
    expect(parseDateArg("今天", TODAY)).toBe("2026-10-17");
    expect(parseDateArg("明天 15:00", TODAY)).toBe("2026-10-18");
    expect(parseDateArg("後天", TODAY)).toBe("2026-10-19");
    expect(parseDateArg("yesterday", TODAY)).toBe("2026-10-16");
  });

  it("不存在的日期和看不懂的字回傳 undefined", () => {
    expect(parseDateArg("2026-02-30")).toBeUndefined();
    expect(parseDateArg("下週一")).toBeUndefined();
    expect(parseDateArg("")).toBeUndefined();
    expect(parseDateArg(undefined)).toBeUndefined();
  });

  it("有填但看不懂要丟錯，模型才會改用正確格式", () => {
    expect(parseDateArgOrThrow("", "from")).toBeUndefined();
    expect(() => parseDateArgOrThrow("下週一", "from")).toThrow("from 看不懂");
  });
});

describe("parseTimeArg", () => {
  it("抓出時間，補零，擋掉不合理的時間", () => {
    expect(parseTimeArg("2026-10-20 15:00")).toBe("15:00");
    expect(parseTimeArg("9:05")).toBe("09:05");
    expect(parseTimeArg("25:00")).toBeUndefined();
    expect(parseTimeArg("下午")).toBeUndefined();
  });
});

describe("toCalendarEventData", () => {
  it("把時間和備註寫進說明", () => {
    expect(toCalendarEventData({ title: "看牙醫", start: "2026-10-20 15:00", end: "16:00", notes: "帶健保卡" })).toEqual({
      type: "user",
      title: "看牙醫",
      date: "2026-10-20",
      description: "15:00–16:00，帶健保卡",
      startTime: "15:00",
      endTime: "16:00",
    });
    expect(toCalendarEventData({ title: "畢旅", start: "2026-10-20", end: "2026-10-22" })).toEqual({
      type: "user",
      title: "畢旅",
      date: "2026-10-20",
      description: "到 2026-10-22",
      endDate: "2026-10-22",
    });
    expect(toCalendarEventData({ title: "生日", start: "明天" }, TODAY)).toEqual({
      type: "user",
      title: "生日",
      date: "2026-10-18",
      description: undefined,
    });
  });

  it("沒有標題或日期看不懂就丟錯", () => {
    expect(() => toCalendarEventData({ title: " ", start: "2026-10-20" })).toThrow("標題");
    expect(() => toCalendarEventData({ title: "看牙醫", start: "下週一" })).toThrow("start 要有日期");
  });
});

describe("結果文字", () => {
  it("沒有資料時說清楚", () => {
    expect(describeEvents([], "2026-10-17")).toBe("2026-10-17 之後沒有行程");
    expect(describeEvents([], "2026-10-17", "2026-10-20")).toBe("2026-10-17 到 2026-10-20沒有行程");
    expect(describeMemories([])).toBe("沒有找到相關的記憶");
    expect(describeTracks([])).toBe("沒有搜到歌曲");
  });

  it("曲目附上編號和 trackId，模型才知道怎麼播放", () => {
    const text = describeTracks([{ id: "t1", name: "晴天", artist: "周杰倫", album: "葉惠美" }]);
    expect(text).toContain("0. 晴天 – 周杰倫（葉惠美）　trackId: t1");
    expect(text).toContain("play_music");
  });
});

describe("buildTextSearchTerms", () => {
  it("依空白切詞，長的中文切成兩字一組", () => {
    expect(buildTextSearchTerms("九份 夜景")).toEqual(["九份", "夜景"]);
    expect(buildTextSearchTerms("上次吵架的原因")).toEqual(expect.arrayContaining(["吵架", "原因"]));
    expect(buildTextSearchTerms("我")).toEqual([]);
  });
});
