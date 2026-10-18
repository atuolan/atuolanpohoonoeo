/**
 * 內建角色工具的參數解析，和交給模型看的結果文字（短而清楚，不塞原始 JSON）。
 */
import type { WeatherData } from "@/services/WeatherService";
import type { CalendarEventData } from "@/types/calendar";
import { eventNotes, formatEventTime } from "@/utils/calendarEventFormat";
import type { CalendarToolEvent, MemoryToolEntry, MusicToolTrack } from "./toolServices";

export function formatDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

export function textArg(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

const RELATIVE_DAYS: Array<[string, number]> = [
  ["今天", 0],
  ["今日", 0],
  ["today", 0],
  ["明天", 1],
  ["明日", 1],
  ["tomorrow", 1],
  ["後天", 2],
  ["昨天", -1],
  ["yesterday", -1],
];

/** 抓出日期 YYYY-MM-DD；看得懂 2026-10-20、2026/10/20、2026年10月20日，以及開頭的今天、明天、後天、昨天 */
export function parseDateArg(value: unknown, today = new Date()): string | undefined {
  const text = textArg(value);
  if (!text) return undefined;

  const lower = text.toLowerCase();
  const relative = RELATIVE_DAYS.find(([word]) => lower.startsWith(word));
  if (relative) {
    const date = new Date(today);
    date.setDate(date.getDate() + relative[1]);
    return formatDate(date);
  }

  const match = text.match(/(\d{4})\s*[-/.年]\s*(\d{1,2})\s*[-/.月]\s*(\d{1,2})/);
  if (!match) return undefined;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(year, month - 1, day);
  // 2026-02-30 這種不存在的日期會被 Date 自動進位，這裡擋掉
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return undefined;
  }
  return formatDate(date);
}

/** 有填但看不懂就丟錯，讓模型改用正確格式重試 */
export function parseDateArgOrThrow(value: unknown, name: string, today = new Date()): string | undefined {
  if (!textArg(value)) return undefined;
  const date = parseDateArg(value, today);
  if (!date) throw new Error(`${name} 看不懂，請用 YYYY-MM-DD，例如 2026-10-20`);
  return date;
}

/** 抓出時間 HH:MM */
export function parseTimeArg(value: unknown): string | undefined {
  const match = textArg(value).match(/(\d{1,2})[:：](\d{2})/);
  if (!match) return undefined;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return undefined;
  return `${String(hour).padStart(2, "0")}:${match[2]}`;
}

/** 「新增行程」的參數 → 行事曆事件；日期看不懂會丟錯 */
export function toCalendarEventData(args: Record<string, unknown>, today = new Date()): CalendarEventData {
  const title = textArg(args.title);
  if (!title) throw new Error("行程要有標題");
  const date = parseDateArg(args.start, today);
  if (!date) throw new Error("start 要有日期，例如 2026-10-20 或 2026-10-20 15:00");

  const startTime = parseTimeArg(args.start);
  const endTime = parseTimeArg(args.end);
  const endDate = parseDateArg(args.end, today);
  const multiDay = !!endDate && endDate !== date;

  const parts: string[] = [];
  if (startTime && endTime && !multiDay) parts.push(`${startTime}–${endTime}`);
  else if (startTime) parts.push(`${startTime} 開始`);
  if (multiDay) parts.push(`到 ${endDate}${endTime ? ` ${endTime}` : ""}`);
  else if (!startTime && endTime) parts.push(`到 ${endTime}`);
  const notes = textArg(args.notes);
  if (notes) parts.push(notes);

  // 說明給行事曆 App 顯示；時間另外存，加到手機日曆時才有真正的起訖時間
  const data: CalendarEventData = { type: "user", title, date, description: parts.length ? parts.join("，") : undefined };
  if (startTime) data.startTime = startTime;
  if (endTime) data.endTime = endTime;
  if (multiDay) data.endDate = endDate;
  return data;
}

export function describeWeather(data: WeatherData): string {
  const { location, current } = data;
  const place = [...new Set([location.name, location.region, location.country].filter(Boolean))].join("，");
  const lines = [
    `${place}（當地時間 ${location.localtime}）`,
    `現在：${current.condition.text}，${Math.round(current.temp_c)}°C，體感 ${Math.round(current.feelslike_c)}°C，濕度 ${current.humidity}%，風速 ${Math.round(current.wind_kph)} km/h`,
  ];
  const days = data.forecast?.forecastday ?? [];
  if (days.length) {
    lines.push("預報：");
    for (const { date, day } of days) {
      lines.push(`- ${date}：${day.condition.text}，${Math.round(day.mintemp_c)}～${Math.round(day.maxtemp_c)}°C`);
    }
  }
  return lines.join("\n");
}

const EVENT_TYPE_LABELS: Record<CalendarToolEvent["type"], string> = {
  user: "",
  period: "（經期紀錄）",
  holiday: "（節日）",
};

export function describeEvents(events: CalendarToolEvent[], from: string, to?: string): string {
  const range = to ? `${from} 到 ${to}` : `${from} 之後`;
  if (!events.length) return `${range}沒有行程`;
  return [
    `${range}的行程：`,
    ...events.map((event) => {
      const days = event.endDate && event.endDate > event.date ? `${event.date} 到 ${event.endDate}` : event.date;
      const time = formatEventTime(event);
      const notes = eventNotes(event);
      return `- ${days}${time ? ` ${time}` : ""}${EVENT_TYPE_LABELS[event.type]}：${event.title}${notes ? `（${notes}）` : ""}`;
    }),
  ].join("\n");
}

const MEMORY_KIND_LABELS: Record<MemoryToolEntry["kind"], string> = {
  summary: "總結",
  diary: "日記",
  event: "重要事件",
};

export function describeMemories(entries: MemoryToolEntry[]): string {
  if (!entries.length) return "沒有找到相關的記憶";
  return entries
    .map((entry) => `- [${MEMORY_KIND_LABELS[entry.kind]}${entry.date ? ` ${entry.date}` : ""}] ${entry.content}`)
    .join("\n");
}

export function describeTracks(tracks: MusicToolTrack[]): string {
  if (!tracks.length) return "沒有搜到歌曲";
  return [
    ...tracks.map(
      (track, index) =>
        `${index}. ${track.name} – ${track.artist}${track.album ? `（${track.album}）` : ""}　trackId: ${track.id}`,
    ),
    "要播放就用 play_music，傳 index 或 trackId。",
  ].join("\n");
}
