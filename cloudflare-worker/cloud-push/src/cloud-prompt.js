/**
 * 雲端主動訊息的純函式：App 組好的整份請求怎麼填時間、接上雲端自己發過的訊息、
 * 「已連發幾次」提醒、模型原文怎麼轉成通知和聊天紀錄。
 */

// ─── 主動訊息：user 沒回時別重複 ─────────────────────────────

function formatElapsed(ms) {
  const minutes = Math.max(1, Math.round(ms / 60000));
  if (minutes < 60) return `${minutes} 分鐘`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小時`;
  return `${Math.floor(hours / 24)} 天`;
}

/**
 * user 多久沒說話、角色已經連發幾次、這次別重複（跟 App 的 buildUnrepliedProactiveNote 同一段話）。
 * 沒連發時只寫多久沒說話；兩個都沒有回空字串。
 */
export function unrepliedNoteText(userName, count, lastUserAt) {
  const now = Date.now();
  const elapsed =
    typeof lastUserAt === "number" && lastUserAt < now ? formatElapsed(now - lastUserAt) : "";
  if (!count || count <= 0) {
    return elapsed ? `（${userName} 最後一次傳訊息是 ${elapsed}前。）` : "";
  }
  const since = elapsed ? `${userName} 最後一次傳訊息是 ${elapsed}前，` : "";
  return (
    `【注意：${userName} 還沒回】${since}之後你已經主動傳了 ${count} 次訊息，${userName} 都還沒回，可能在忙或睡了。` +
    `這次不要重複你前幾次講過的內容、開場和句型——同樣的天氣、同樣的問候、同樣的事情、同樣的晚安都算重複。` +
    `想想這段時間你身上有沒有新的事，或換個話題、換個角度；也可以只傳一兩句短的。` +
    `要接話的話，以 ${userName} 最後說的話為準，不要去接很久以前的話題。`
  );
}

/** 拿掉思考區塊（<think>…</think>、只剩結尾 </think> 時連前面一起拿掉） */
export function stripThinking(content) {
  let text = String(content || "").replace(/<(think|thinking)>[\s\S]*?<\/\1>/gi, "");
  const lone = text.search(/<\/(think|thinking)>/i);
  if (lone >= 0) text = text.slice(text.indexOf(">", lone) + 1);
  return text;
}

/** 模型原文裡的 <msg> 內容（沒有 <msg> 就整段）；保留心聲 */
function msgTexts(content) {
  const cleaned = stripThinking(content);
  const parts = cleaned.match(/<msg\b[^>]*>([\s\S]*?)<\/msg>/g);
  return parts ? parts.map((m) => m.replace(/<\/?msg\b[^>]*>/g, "")) : [cleaned];
}

/** 模型原文 → 通知裡顯示的字（拿掉 <msg> 標籤、思考、ˇ心聲ˇ、~(舊格式心聲)~） */
export function toVisibleText(content) {
  return msgTexts(content)
    .map((t) => t.replace(/\s*ˇ[^ˇ]+ˇ/g, "").replace(/\s*~\([^)]+\)~/g, "").trim())
    .filter(Boolean)
    .join("\n");
}

/** 模型原文 → 放回聊天紀錄的樣子（一則一行，保留心聲） */
export function visibleHistoryText(content) {
  return msgTexts(content)
    .map((t) => t.trim())
    .filter(Boolean)
    .join("\n");
}

/** OpenAI 格式的 content 可能是字串或文字塊陣列 */
export function textOfContent(content) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((b) => (typeof b === "string" ? b : b && typeof b.text === "string" ? b.text : ""))
      .join("");
  }
  return "";
}

// ─── App 組好的整份請求：記號（跟 App 的 CLOUD_PUSH_MARKERS 一樣） ──────

/** 每塊幾個字（UTF-16 一個字 2 bytes，留空間給序列化） */
export const PROMPT_CHUNK_CHARS = 30000;
export const CP_NOTE = "⟦CP_NOTE⟧";
const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];
const EN_WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** 某個時區的年月日時分星期；時區不認得就用 App 傳的 UTC 差距 */
function zonedParts(ms, timeZone, fallbackOffsetMinutes) {
  if (timeZone) {
    try {
      const parts = new Intl.DateTimeFormat("en-US", {
        timeZone,
        year: "numeric",
        month: "numeric",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
        weekday: "short",
      }).formatToParts(new Date(ms));
      const get = (t) => parts.find((p) => p.type === t)?.value;
      let h = Number(get("hour"));
      if (h === 24) h = 0;
      return {
        y: Number(get("year")),
        mo: Number(get("month")),
        d: Number(get("day")),
        h,
        mi: Number(get("minute")),
        wd: Math.max(0, EN_WEEKDAYS.indexOf(get("weekday"))),
      };
    } catch {
      // 不認得的時區，往下用差距
    }
  }
  const local = new Date(ms - (fallbackOffsetMinutes || 0) * 60000);
  return {
    y: local.getUTCFullYear(),
    mo: local.getUTCMonth() + 1,
    d: local.getUTCDate(),
    h: local.getUTCHours(),
    mi: local.getUTCMinutes(),
    wd: local.getUTCDay(),
  };
}

const pad2 = (n) => String(n).padStart(2, "0");

/** 把時間記號換成生成當下的時間（格式跟 App 的 zh-TW 寫法一樣） */
export function fillTimeMarkers(text, ms, schedule) {
  const p = zonedParts(ms, schedule?.timeZone, schedule?.timezoneOffset);
  const h12 = p.h % 12 === 0 ? 12 : p.h % 12;
  return text
    .split("⟦CP_TIME⟧").join(`${p.h < 12 ? "上午" : "下午"}${h12}:${pad2(p.mi)}`)
    .split("⟦CP_DATE⟧").join(`${p.y}/${p.mo}/${p.d}`)
    .split("⟦CP_YEAR⟧").join(String(p.y))
    .split("⟦CP_DAY⟧").join(WEEKDAYS[p.wd] || "")
    .replace(/⟦CP_TZTIME:([^⟧"\\]+)⟧/g, (_, tz) => {
      const z = zonedParts(ms, tz, schedule?.timezoneOffset);
      return `${z.y}/${pad2(z.mo)}/${pad2(z.d)} ${pad2(z.h)}:${pad2(z.mi)}`;
    });
}


/**
 * App 組好的請求本文 → 生成當下要送的本文：
 * 時間記號換成現在時間（聊天用假時間就照當初的差距往後推），
 * 話題引導結尾的記號換成「多久沒說話、已經連發幾次、別重複」，同步後雲端自己發過的也列在裡面。
 * （列在提醒裡，不另外插成角色訊息：有些預設會把最後一則複製到別處、或整份併成一則，插不準）
 */
export function finalizeCloudPromptBody(bodyText, opts) {
  const { nowMs, timeOffsetMs, schedule, userName, unrepliedCount, lastUserAt, sentTexts } = opts;
  const name = userName || "使用者";
  const sent = (sentTexts || []).filter(Boolean);
  let note = unrepliedNoteText(name, (unrepliedCount || 0) + sent.length, lastUserAt);
  if (sent.length) {
    note +=
      `\n你最近主動傳的是這些（${name} 還沒回），這次別再重複：\n` +
      sent.map((t) => `「${t.replace(/\n/g, " / ")}」`).join("\n");
  }
  const noteBlock = note ? `\n<request>${note}</request>` : "";
  const filled = fillTimeMarkers(bodyText, nowMs + (timeOffsetMs || 0), schedule)
    .split(CP_NOTE)
    .join(JSON.stringify(noteBlock).slice(1, -1));
  // 確認還是合法的 JSON 再送
  JSON.parse(filled);
  return filled;
}
