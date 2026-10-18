/**
 * 把行程加到手機內建的日曆。
 * 網頁沒辦法直接寫入手機日曆，每次都要使用者點一下：
 * - iPhone：捷徑 App（要先建好捷徑，最穩），或行事曆檔 .ics（不用設定，但主畫面 App 裡不一定跳得出來）
 * - Android：行事曆檔（小米、華為等手機自己的日曆，大陸手機沒有 Google 服務就用這個），或 Google 日曆預填好的新增頁面；
 *   哪一種要看手機，所以「自動」時第一次按會問
 * 一律用「點連結」的方式打開，不換掉 App 本身的頁面，失敗也不會把人踢出 App。
 */
import type { CalendarEventData } from "@/types/calendar";

export type PhoneCalendarMethod = "auto" | "shortcut" | "ics" | "google";
export type ResolvedPhoneCalendarMethod = Exclude<PhoneCalendarMethod, "auto">;
export type DevicePlatform = "ios" | "android" | "other";

export interface PhoneCalendarSettings {
  method: PhoneCalendarMethod;
  /** 捷徑 App 裡的捷徑名稱，要一字不差 */
  shortcutName: string;
}

/** 和 public/shortcuts 裡簽好的捷徑檔同名，匯入後不用改名（原始碼在 scripts/shortcuts） */
export const DEFAULT_SHORTCUT_NAME = "203 Phone Calendar";
/** 一鍵安裝用的捷徑檔 */
export const SHORTCUT_FILE_URL = `${import.meta.env.BASE_URL}shortcuts/${encodeURIComponent(DEFAULT_SHORTCUT_NAME)}.shortcut`;
const STORAGE_KEY = "phone-calendar-settings";

export const PHONE_CALENDAR_METHOD_LABELS: Record<ResolvedPhoneCalendarMethod, string> = {
  shortcut: "iPhone 捷徑",
  ics: "行事曆檔",
  google: "Google 日曆",
};

/** 加入方式跟裝置有關，只存在這台裝置 */
export function loadPhoneCalendarSettings(): PhoneCalendarSettings {
  const fallback: PhoneCalendarSettings = { method: "auto", shortcutName: DEFAULT_SHORTCUT_NAME };
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null") as Partial<PhoneCalendarSettings> | null;
    if (!saved) return fallback;
    return {
      method: saved.method && saved.method in { auto: 1, shortcut: 1, ics: 1, google: 1 } ? saved.method : "auto",
      shortcutName: saved.shortcutName?.trim() || DEFAULT_SHORTCUT_NAME,
    };
  } catch {
    return fallback;
  }
}

export function savePhoneCalendarSettings(settings: PhoneCalendarSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    /* 無痕模式等存不了就算了，下次用預設值 */
  }
}

export function detectPlatform(
  userAgent = typeof navigator === "undefined" ? "" : navigator.userAgent,
  maxTouchPoints = typeof navigator === "undefined" ? 0 : navigator.maxTouchPoints ?? 0,
): DevicePlatform {
  if (/iPhone|iPad|iPod/i.test(userAgent)) return "ios";
  // iPadOS 13 起 Safari 假裝成 Mac，用觸控點數分辨
  if (/Macintosh/i.test(userAgent) && maxTouchPoints > 1) return "ios";
  if (/Android/i.test(userAgent)) return "android";
  return "other";
}

/** 「自動」：用行事曆檔（Android 會先問，見 needsMethodChoice；沒問就按的話也用行事曆檔） */
export function resolvePhoneCalendarMethod(method: PhoneCalendarMethod): ResolvedPhoneCalendarMethod {
  return method === "auto" ? "ics" : method;
}

/** Android 有沒有 Google 服務網頁看不出來，「自動」時第一次按要先問用手機日曆還是 Google 日曆 */
export function needsMethodChoice(method: PhoneCalendarMethod, platform: DevicePlatform): boolean {
  return method === "auto" && platform === "android";
}

/** 加入方式的名稱；Android 的行事曆檔是給手機自己的日曆用的，講白一點 */
export function phoneCalendarMethodLabel(method: ResolvedPhoneCalendarMethod, platform: DevicePlatform): string {
  if (method === "ics" && platform === "android") return "手機日曆（行事曆檔）";
  return PHONE_CALENDAR_METHOD_LABELS[method];
}

/** 微信、QQ 裡的瀏覽器下載不了檔案，行事曆檔要換到一般瀏覽器 */
export function detectInAppBrowser(
  userAgent = typeof navigator === "undefined" ? "" : navigator.userAgent,
): "微信" | "QQ" | undefined {
  if (/MicroMessenger/i.test(userAgent)) return "微信";
  // QQ App 裡是「QQ/版本」；QQ 瀏覽器是「MQQBrowser」，可以下載
  if (/\sQQ\//.test(userAgent)) return "QQ";
  return undefined;
}

/** 要放進手機日曆的一筆行程 */
export interface PhoneCalendarEvent {
  title: string;
  /** YYYY-MM-DD */
  date: string;
  /** HH:MM；沒有就是整天 */
  startTime?: string;
  endTime?: string;
  /** 跨天行程的最後一天 YYYY-MM-DD */
  endDate?: string;
  description?: string;
}

const TIME_PATTERN = /(\d{1,2})[:：](\d{2})/g;

function normalizeTime(hour: string, minute: string): string | undefined {
  const h = Number(hour);
  const m = Number(minute);
  if (h > 23 || m > 59) return undefined;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** 舊資料和標籤建立的行程沒有時間欄位，就從說明裡找 HH:MM */
export function toPhoneCalendarEvent(
  data: Pick<CalendarEventData, "title" | "date" | "description" | "startTime" | "endTime" | "endDate">,
): PhoneCalendarEvent {
  let { startTime, endTime } = data;
  if (!startTime && data.description) {
    const times = [...data.description.matchAll(TIME_PATTERN)]
      .map((match) => normalizeTime(match[1], match[2]))
      .filter((time): time is string => !!time);
    startTime = times[0];
    endTime = endTime ?? times[1];
  }
  return { title: data.title, date: data.date, startTime, endTime, endDate: data.endDate, description: data.description };
}

function shiftDate(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const shifted = new Date(y, m - 1, d + days);
  return `${shifted.getFullYear()}-${String(shifted.getMonth() + 1).padStart(2, "0")}-${String(shifted.getDate()).padStart(2, "0")}`;
}

interface ResolvedRange {
  allDay: boolean;
  start: { date: string; time?: string };
  /** 整天行程是「最後一天的隔天」（.ics 和 Google 日曆的寫法）；有時間的是真正的結束時間 */
  end: { date: string; time?: string };
  /** 整天行程的最後一天（捷徑用） */
  lastDay: string;
}

export function resolveRange(event: PhoneCalendarEvent): ResolvedRange {
  const lastDay = event.endDate && event.endDate > event.date ? event.endDate : event.date;
  if (!event.startTime) {
    return { allDay: true, start: { date: event.date }, end: { date: shiftDate(lastDay, 1) }, lastDay };
  }
  let endDate = lastDay;
  let endTime = event.endTime;
  if (!endTime) {
    // 沒寫結束時間就當一小時
    const [h, m] = event.startTime.split(":").map(Number);
    const total = h * 60 + m + 60;
    if (total >= 24 * 60) endDate = shiftDate(endDate, 1);
    endTime = `${String(Math.floor(total / 60) % 24).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
  } else if (endDate === event.date && endTime <= event.startTime) {
    // 23:00–01:00 這種跨過午夜
    endDate = shiftDate(endDate, 1);
  }
  return { allDay: false, start: { date: event.date, time: event.startTime }, end: { date: endDate, time: endTime }, lastDay };
}

const compactDate = (date: string) => date.replace(/-/g, "");
const compactTime = (time: string) => `${time.replace(":", "")}00`;

function escapeIcsText(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** .ics 每行最多 75 個位元組，超過要折行（中文一個字 3 個位元組，不能從字中間切） */
function foldIcsLine(line: string): string {
  const encoder = new TextEncoder();
  if (encoder.encode(line).length <= 75) return line;
  const parts: string[] = [];
  let current = "";
  let bytes = 0;
  for (const char of line) {
    const size = encoder.encode(char).length;
    const limit = parts.length === 0 ? 75 : 74;
    if (bytes + size > limit) {
      parts.push(current);
      current = "";
      bytes = 0;
    }
    current += char;
    bytes += size;
  }
  parts.push(current);
  return parts.join("\r\n ");
}

function utcStamp(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

export function buildIcs(event: PhoneCalendarEvent, options: { uid?: string; now?: Date } = {}): string {
  const range = resolveRange(event);
  const now = options.now ?? new Date();
  const uid = options.uid ?? `${now.getTime()}-${Math.random().toString(36).slice(2, 10)}@203phone`;
  // 不帶時區的時間會照手機自己的時區解讀，剛好就是使用者說的時間
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//203 Phone//Calendar//ZH-TW",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${utcStamp(now)}`,
    range.allDay
      ? `DTSTART;VALUE=DATE:${compactDate(range.start.date)}`
      : `DTSTART:${compactDate(range.start.date)}T${compactTime(range.start.time!)}`,
    range.allDay
      ? `DTEND;VALUE=DATE:${compactDate(range.end.date)}`
      : `DTEND:${compactDate(range.end.date)}T${compactTime(range.end.time!)}`,
    `SUMMARY:${escapeIcsText(event.title)}`,
    ...(event.description ? [`DESCRIPTION:${escapeIcsText(event.description)}`] : []),
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return `${lines.map(foldIcsLine).join("\r\n")}\r\n`;
}

export function buildGoogleCalendarUrl(
  event: PhoneCalendarEvent,
  timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone,
): string {
  const range = resolveRange(event);
  const dates = range.allDay
    ? `${compactDate(range.start.date)}/${compactDate(range.end.date)}`
    : `${compactDate(range.start.date)}T${compactTime(range.start.time!)}/${compactDate(range.end.date)}T${compactTime(range.end.time!)}`;
  const params = new URLSearchParams({ action: "TEMPLATE", text: event.title, dates });
  if (event.description) params.set("details", event.description);
  if (!range.allDay && timeZone) params.set("ctz", timeZone);
  return `https://calendar.google.com/calendar/render?${params}`;
}

/** 捷徑收到的 JSON（捷徑裡用「從輸入取得辭典」讀） */
export interface ShortcutCalendarPayload {
  title: string;
  /** 「YYYY-MM-DD」或「YYYY-MM-DD HH:MM」，iOS 看得懂的寫法 */
  start: string;
  end: string;
  allDay: boolean;
  notes: string;
}

export function buildShortcutPayload(event: PhoneCalendarEvent): ShortcutCalendarPayload {
  const range = resolveRange(event);
  return {
    title: event.title,
    start: range.allDay ? range.start.date : `${range.start.date} ${range.start.time}`,
    end: range.allDay ? range.lastDay : `${range.end.date} ${range.end.time}`,
    allDay: range.allDay,
    notes: event.description ?? "",
  };
}

export function buildShortcutUrl(event: PhoneCalendarEvent, shortcutName = DEFAULT_SHORTCUT_NAME): string {
  const text = JSON.stringify(buildShortcutPayload(event));
  return `shortcuts://run-shortcut?name=${encodeURIComponent(shortcutName)}&input=text&text=${encodeURIComponent(text)}`;
}

function clickLink(configure: (link: HTMLAnchorElement) => void): void {
  const link = document.createElement("a");
  configure(link);
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function safeFileName(title: string): string {
  return title.replace(/[\\/:*?"<>|\s]+/g, "_").slice(0, 40) || "event";
}

/**
 * 加到手機日曆，回傳實際用的方式。
 * 一定要在使用者點擊的處理函式裡直接呼叫（中間不能 await），不然瀏覽器可能擋下。
 */
export function addToPhoneCalendar(
  event: PhoneCalendarEvent,
  settings: PhoneCalendarSettings = loadPhoneCalendarSettings(),
): ResolvedPhoneCalendarMethod {
  const method = resolvePhoneCalendarMethod(settings.method);
  if (method === "shortcut") {
    const url = buildShortcutUrl(event, settings.shortcutName || DEFAULT_SHORTCUT_NAME);
    clickLink((link) => {
      link.href = url;
    });
  } else if (method === "google") {
    const url = buildGoogleCalendarUrl(event);
    clickLink((link) => {
      link.href = url;
      link.target = "_blank";
      link.rel = "noopener";
    });
  } else {
    const blobUrl = URL.createObjectURL(new Blob([buildIcs(event)], { type: "text/calendar;charset=utf-8" }));
    clickLink((link) => {
      link.href = blobUrl;
      link.download = `${safeFileName(event.title)}.ics`;
    });
    setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
  }
  return method;
}

/** 按下去之後給使用者看的提示 */
export function phoneCalendarHint(
  method: ResolvedPhoneCalendarMethod,
  platform: DevicePlatform = detectPlatform(),
  userAgent = typeof navigator === "undefined" ? "" : navigator.userAgent,
): string {
  if (method === "shortcut") return "已交給捷徑，加好後切回來就好";
  if (method === "google") return "已打開 Google 日曆，確認後按「儲存」";
  const inApp = detectInAppBrowser(userAgent);
  if (inApp) return `${inApp}裡下載不了行事曆檔：點右上角「···」選「在瀏覽器打開」，再按一次`;
  // Android 下載完通常不會跳提示，要自己去點開
  if (platform === "android") {
    return "行事曆檔已下載：從通知列或「檔案管理 › 下載」點開，選手機的日曆匯入。點了沒反應的話，到日曆的設定找「日程导入」選這個檔案";
  }
  return "已產生行事曆檔，照手機的提示加入日曆";
}
