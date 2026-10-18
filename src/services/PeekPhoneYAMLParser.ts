/**
 * PeekPhoneYAMLParser
 * 專用 YAML 解析器，針對 PeekPhoneData 結構設計
 * 解析 AI 回傳的 YAML 字串為結構化資料
 * 解析失敗時返回 fallback 空結構，不拋出異常
 */
import type {
    PeekBrowserEntry,
    PeekChatMessage,
    PeekChatThread,
    PeekDiaryEntry,
    PeekGalleryItem,
    PeekHiddenPhoto,
    PeekLockScreen,
    PeekMealRecord,
    PeekMemo,
    PeekNote,
    PeekScheduleItem,
    PeekScreenTime,
    PeekTransaction,
} from "@/types/peekPhone";

/** 計算行的縮排層級（空格數） */
function indentOf(line: string): number {
  const match = line.match(/^( *)/);
  return match ? match[1].length : 0;
}

/** 解析 YAML 字串值（處理引號和轉義） */
function parseValue(raw: string): string {
  const trimmed = raw.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    const inner = trimmed.slice(1, -1);
    return inner
      .replace(/\\n/g, "\n")
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, "\\");
  }
  return trimmed;
}

/** 解析布林值 */
function parseBool(raw: string): boolean {
  return raw.trim().toLowerCase() === "true";
}

/** 解析數字，失敗返回 0 */
function parseNum(raw: string): number {
  const n = Number(raw.trim());
  return Number.isFinite(n) ? n : 0;
}

/**
 * 訊息時間 → 毫秒時間戳。AI 寫的格式：
 * 「10/17 23:12」「2026-10-17 23:12」「23:12」（今天），或舊格式的時間戳數字（秒或毫秒）
 * 沒寫年份時用今年；算出來比現在晚超過一天，就當作去年
 * 都對不上回傳 0（畫面上就不顯示時間）
 */
export function parseMessageTime(raw: string, now: Date = new Date()): number {
  const text = raw.trim();
  if (/^\d{9,13}$/.test(text)) return Number(text);

  const full = text.match(/^(?:(\d{4})[-/.])?(\d{1,2})[-/.](\d{1,2})\s+(\d{1,2}):(\d{2})$/);
  if (full) {
    const year = full[1] ? Number(full[1]) : now.getFullYear();
    const d = new Date(year, Number(full[2]) - 1, Number(full[3]), Number(full[4]), Number(full[5]));
    if (!full[1] && d.getTime() > now.getTime() + 86_400_000) d.setFullYear(year - 1);
    return Number.isNaN(d.getTime()) ? 0 : d.getTime();
  }

  const clock = text.match(/^(\d{1,2}):(\d{2})$/);
  if (clock) {
    const d = new Date(now);
    d.setHours(Number(clock[1]), Number(clock[2]), 0, 0);
    // 只寫時間又比現在晚：是昨天的
    if (d.getTime() > now.getTime()) d.setDate(d.getDate() - 1);
    return d.getTime();
  }
  return 0;
}

/** 產生簡易 ID */
function genId(): string {
  return Math.random().toString(36).slice(2, 10);
}

/**
 * 將 YAML 文字拆分為 key-value 行和 block scalar 內容
 * 回傳結構化的行列表，每行包含 indent, key, value, isList
 */
interface ParsedLine {
  indent: number;
  key: string;
  value: string;
  isList: boolean; // 是否以 "- " 開頭
  raw: string;
}

function tokenize(yaml: string): ParsedLine[] {
  const rawLines = yaml.split("\n");
  const result: ParsedLine[] = [];

  let i = 0;
  while (i < rawLines.length) {
    const line = rawLines[i];
    // 跳過空行
    if (line.trim() === "") {
      i++;
      continue;
    }

    const indent = indentOf(line);
    const content = line.trim();

    // 檢查是否為列表項
    let isList = false;
    let kvPart = content;
    if (content.startsWith("- ")) {
      isList = true;
      kvPart = content.slice(2);
    }

    // 解析 key: value
    const colonIdx = kvPart.indexOf(":");
    if (colonIdx === -1) {
      // 沒有冒號，整行當作值
      result.push({ indent, key: "", value: kvPart, isList, raw: line });
      i++;
      continue;
    }

    const key = kvPart.slice(0, colonIdx).trim();
    let value = kvPart.slice(colonIdx + 1).trim();

    // 檢查 block scalar (|)
    if (value === "|") {
      // 收集後續縮排行作為 block content
      const blockLines: string[] = [];
      const blockIndent = indent + (isList ? 2 : 0) + 2; // 預期的 block 縮排
      i++;
      while (i < rawLines.length) {
        const nextLine = rawLines[i];
        // 空行或縮排足夠的行都屬於 block
        if (nextLine.trim() === "") {
          // 空行可能是 block 的一部分，先看下一行
          if (
            i + 1 < rawLines.length &&
            indentOf(rawLines[i + 1]) >= blockIndent
          ) {
            blockLines.push("");
            i++;
            continue;
          }
          break;
        }
        if (indentOf(nextLine) >= blockIndent) {
          blockLines.push(nextLine.slice(blockIndent));
          i++;
        } else {
          break;
        }
      }
      value = blockLines.join("\n");
      result.push({ indent, key, value, isList, raw: line });
      continue;
    }

    result.push({ indent, key, value: parseValue(value), isList, raw: line });
    i++;
  }

  return result;
}

/**
 * 從 tokenized 行中找到指定 top-level key 的所有子行
 * 回傳該 section 的 token 子集
 */
function findSection(tokens: ParsedLine[], sectionKey: string): ParsedLine[] {
  let startIdx = -1;
  for (let i = 0; i < tokens.length; i++) {
    if (
      tokens[i].key === sectionKey &&
      tokens[i].indent === 0 &&
      !tokens[i].isList
    ) {
      startIdx = i + 1;
      break;
    }
  }
  if (startIdx === -1) return [];

  const result: ParsedLine[] = [];
  for (let i = startIdx; i < tokens.length; i++) {
    // 遇到下一個 top-level key 就停止
    if (tokens[i].indent === 0 && !tokens[i].isList && tokens[i].key !== "") {
      break;
    }
    result.push(tokens[i]);
  }
  return result;
}

/**
 * 從 section tokens 中解析列表項
 * 每個列表項是一組 key-value pairs
 */
function parseListItems(tokens: ParsedLine[]): Record<string, string>[] {
  const items: Record<string, string>[] = [];
  let current: Record<string, string> | null = null;

  for (const token of tokens) {
    if (token.isList) {
      current = { [token.key]: token.value };
      items.push(current);
    } else if (current && token.key) {
      current[token.key] = token.value;
    }
  }

  return items;
}

/** 解析 Group A YAML → PeekChatThread[] */
export function parseGroupA(yaml: string): PeekChatThread[] {
  try {
    const tokens = tokenize(yaml);
    const chatTokens = findSection(tokens, "chats");
    if (chatTokens.length === 0) return [];

    const threads: PeekChatThread[] = [];
    let currentThread: PeekChatThread | null = null;
    let currentMsg: PeekChatMessage | null = null;
    let inMessages = false;
    // draft_history 底下的「- text:」是草稿的舊版本，不是訊息
    let inDraftHistory = false;

    for (const token of chatTokens) {
      // 新的 chat thread (indent 2, isList, key=contact)
      if (token.isList && token.key === "contact") {
        currentThread = {
          id: genId(),
          contactName: token.value,
          messages: [],
          updatedAt: Date.now(),
        };
        threads.push(currentThread);
        inMessages = false;
        inDraftHistory = false;
        currentMsg = null;
        continue;
      }

      if (inDraftHistory && currentThread && token.isList && token.key === "text") {
        if (token.value.trim()) {
          currentThread.draftHistory = [...(currentThread.draftHistory ?? []), token.value.trim()];
        }
        continue;
      }
      inDraftHistory = false;

      if (currentThread && !token.isList && token.key === "is_user") {
        if (parseBool(token.value)) currentThread.isUser = true;
        continue;
      }

      // 對話串層級的草稿（可能寫在 messages 前面或後面）
      if (currentThread && !token.isList && token.key === "draft") {
        if (token.value.trim()) currentThread.draft = token.value.trim();
        continue;
      }
      if (currentThread && token.key === "draft_history") {
        inDraftHistory = true;
        continue;
      }

      // messages: 標記
      if (token.key === "messages" && currentThread) {
        inMessages = true;
        currentMsg = null;
        continue;
      }

      // 新的 message (isList, key=from)
      if (inMessages && token.isList && token.key === "from" && currentThread) {
        currentMsg = {
          id: genId(),
          senderName: token.value,
          content: "",
          isSelf: false,
          timestamp: 0,
        };
        currentThread.messages.push(currentMsg);
        continue;
      }

      // message 屬性
      if (currentMsg) {
        if (token.key === "text") currentMsg.content = token.value;
        else if (token.key === "self")
          currentMsg.isSelf = parseBool(token.value);
        else if (token.key === "time")
          currentMsg.timestamp = parseMessageTime(token.value);
        else if (token.key === "recalled")
          currentMsg.recalled = parseBool(token.value) || undefined;
        else if (token.key === "recalled_after") {
          const seconds = parseNum(token.value);
          if (seconds > 0) currentMsg.recalledAfter = seconds;
        }
      }
    }

    // 只有草稿歷史、沒有草稿本身時，拿最新一版當草稿
    for (const thread of threads) {
      if (!thread.draft && thread.draftHistory?.length) {
        thread.draft = thread.draftHistory[thread.draftHistory.length - 1];
        thread.draftHistory = thread.draftHistory.slice(0, -1);
      }
      if (thread.draftHistory && thread.draftHistory.length === 0) delete thread.draftHistory;
    }

    return threads;
  } catch {
    console.warn("[PeekPhoneYAMLParser] parseGroupA failed");
    return [];
  }
}

/** 解析 Group B YAML → { schedule, meals, memos } */
export function parseGroupB(yaml: string): {
  schedule: PeekScheduleItem[];
  meals: PeekMealRecord[];
  memos: PeekMemo[];
} {
  const fallback = {
    schedule: [] as PeekScheduleItem[],
    meals: [] as PeekMealRecord[],
    memos: [] as PeekMemo[],
  };
  try {
    const tokens = tokenize(yaml);

    // Parse schedule
    const scheduleItems = parseListItems(findSection(tokens, "schedule"));
    const schedule: PeekScheduleItem[] = scheduleItems.map((item) => ({
      id: genId(),
      time: item.time ?? "",
      title: item.title ?? "",
      location: item.location,
      done: parseBool(item.done ?? "false"),
    }));

    // Parse meals
    const mealItems = parseListItems(findSection(tokens, "meals"));
    const validMealTypes = ["breakfast", "lunch", "dinner", "snack"] as const;
    const meals: PeekMealRecord[] = mealItems.map((item) => {
      const rawType = item.type ?? "snack";
      const mealType = validMealTypes.includes(rawType as any)
        ? (rawType as PeekMealRecord["mealType"])
        : "snack";
      return {
        id: genId(),
        mealType,
        food: item.food ?? "",
        time: item.time ?? "",
        note: item.note,
      };
    });

    // Parse memos
    const memoItems = parseListItems(findSection(tokens, "memos"));
    const memos: PeekMemo[] = memoItems.map((item) => ({
      id: genId(),
      content: item.text ?? "",
      done: parseBool(item.done ?? "false"),
      createdAt: Date.now(),
    }));

    return { schedule, meals, memos };
  } catch {
    console.warn("[PeekPhoneYAMLParser] parseGroupB failed");
    return fallback;
  }
}

/** 解析 Group C YAML → { notes, diary, balance, transactions } */
export function parseGroupC(yaml: string): {
  notes: PeekNote[];
  diary: PeekDiaryEntry[];
  balance: number;
  transactions: PeekTransaction[];
} {
  const fallback = {
    notes: [] as PeekNote[],
    diary: [] as PeekDiaryEntry[],
    balance: 0,
    transactions: [] as PeekTransaction[],
  };
  try {
    const tokens = tokenize(yaml);

    // Parse notes
    const noteItems = parseListItems(findSection(tokens, "notes"));
    const notes: PeekNote[] = noteItems.map((item) => ({
      id: genId(),
      title: item.title ?? "",
      content: item.content ?? "",
      updatedAt: Date.now(),
    }));

    // Parse diary
    const diaryItems = parseListItems(findSection(tokens, "diary"));
    const validMoods = ["happy", "neutral", "sad", "angry", "excited"] as const;
    const diary: PeekDiaryEntry[] = diaryItems.map((item) => {
      const rawMood = item.mood ?? "neutral";
      const mood = validMoods.includes(rawMood as any)
        ? (rawMood as PeekDiaryEntry["mood"])
        : "neutral";
      return {
        id: genId(),
        date: item.date ?? "",
        mood,
        content: item.content ?? "",
        weather: item.weather,
      };
    });

    // Parse balance (top-level key)
    let balance = 0;
    const allTokens = tokenize(yaml);
    for (const token of allTokens) {
      if (token.key === "balance" && token.indent === 0) {
        balance = parseNum(token.value);
        break;
      }
    }

    // Parse transactions
    const txItems = parseListItems(findSection(tokens, "transactions"));
    const transactions: PeekTransaction[] = txItems.map((item) => ({
      id: genId(),
      description: item.description ?? "",
      amount: parseNum(item.amount ?? "0"),
      time: item.time ?? "",
    }));

    return { notes, diary, balance, transactions };
  } catch {
    console.warn("[PeekPhoneYAMLParser] parseGroupC failed");
    return fallback;
  }
}

/** 解析 Group D YAML → { gallery, browserHistory, hiddenPhotos } */
export function parseGroupD(yaml: string): {
  gallery: PeekGalleryItem[];
  browserHistory: PeekBrowserEntry[];
  hiddenPhotos: PeekHiddenPhoto[];
} {
  const fallback = { gallery: [] as PeekGalleryItem[], browserHistory: [] as PeekBrowserEntry[], hiddenPhotos: [] as PeekHiddenPhoto[] };
  try {
    const tokens = tokenize(yaml);

    // Parse gallery
    const galleryItems = parseListItems(findSection(tokens, "gallery"));
    const validSources = ["selfie", "scene", "saved"] as const;
    const gallery: PeekGalleryItem[] = galleryItems.map((item) => {
      const rawSource = item.source ?? "scene";
      const source = validSources.includes(rawSource as any)
        ? (rawSource as PeekGalleryItem["source"])
        : "scene";
      const daysLeft = Math.round(parseNum(item.deleted ?? ""));
      return {
        id: genId(),
        description: item.description ?? "",
        source,
        reason: item.reason ?? "",
        date: item.date ?? "",
        // 最近刪除最多留 30 天
        deletedDaysLeft: daysLeft >= 1 && daysLeft <= 30 ? daysLeft : undefined,
        secret: item.secret?.trim() || undefined,
      };
    });

    // Parse browser_history
    const browserItems = parseListItems(findSection(tokens, "browser_history"));
    const validCategories = ["search", "adult", "general"] as const;
    const browserHistory: PeekBrowserEntry[] = browserItems.map((item) => {
      const rawCat = item.category ?? "general";
      const category = validCategories.includes(rawCat as any)
        ? (rawCat as PeekBrowserEntry["category"])
        : "general";
      return {
        id: genId(),
        title: item.title ?? "",
        url: item.url ?? "",
        time: item.time ?? "",
        category,
      };
    });

    // Parse hidden_photos
    const hiddenItems = parseListItems(findSection(tokens, "hidden_photos"));
    const validTypes = ["selfie", "saved", "screenshot"] as const;
    const hiddenPhotos: PeekHiddenPhoto[] = hiddenItems.map((item) => {
      const rawType = item.type ?? "saved";
      const type = validTypes.includes(rawType as any)
        ? (rawType as PeekHiddenPhoto["type"])
        : "saved";
      return {
        id: genId(),
        description: item.description ?? "",
        type,
        reason: item.reason ?? "",
        date: item.date ?? "",
      };
    });

    return { gallery, browserHistory, hiddenPhotos };
  } catch {
    console.warn("[PeekPhoneYAMLParser] parseGroupD failed");
    return fallback;
  }
}

/** 取 section 裡最外層（縮排最小、不是列表項）的 key-value */
function sectionScalars(section: ParsedLine[]): Record<string, string> {
  const result: Record<string, string> = {};
  if (section.length === 0) return result;
  const baseIndent = Math.min(...section.map((t) => t.indent));
  for (const token of section) {
    if (token.indent === baseIndent && !token.isList && token.key && !(token.key in result)) {
      result[token.key] = token.value;
    }
  }
  return result;
}

/** 解析鎖屏密碼 lock_screen；密碼不是 4 位數字就當作沒有 */
export function parseLockScreen(yaml: string): PeekLockScreen | undefined {
  try {
    const fields = sectionScalars(findSection(tokenize(yaml), "lock_screen"));
    const passcode = (fields.passcode ?? "").replace(/\D/g, "");
    if (passcode.length !== 4) return undefined;
    return {
      passcode,
      hint: (fields.hint ?? "").trim(),
      reveal: (fields.reveal ?? "").trim(),
    };
  } catch {
    console.warn("[PeekPhoneYAMLParser] parseLockScreen failed");
    return undefined;
  }
}

/** 解析螢幕使用時間 screen_time；沒有每小時資料就當作沒有 */
export function parseScreenTime(yaml: string): PeekScreenTime | undefined {
  try {
    const section = findSection(tokenize(yaml), "screen_time");
    const fields = sectionScalars(section);
    // hourly 通常是 [42, 38, ...] 這種一行陣列，也可能寫成「- 42」的列表；不足 24 個補 0
    let hourlyText = fields.hourly ?? "";
    if (!hourlyText.trim()) {
      const at = section.findIndex((t) => t.key === "hourly" && !t.isList);
      const listed: string[] = [];
      for (let i = at + 1; at !== -1 && i < section.length && section[i].isList && !section[i].key; i++) {
        listed.push(section[i].value);
      }
      hourlyText = listed.join(",");
    }
    const numbers = hourlyText.match(/\d+(\.\d+)?/g)?.map(Number) ?? [];
    if (numbers.length === 0) return undefined;
    const hourly = Array.from({ length: 24 }, (_, i) =>
      Math.min(60, Math.max(0, Math.round(numbers[i] ?? 0))),
    );

    const topStart = section.findIndex((t) => t.key === "top_apps" && !t.isList);
    const topApps =
      topStart === -1
        ? []
        : parseListItems(section.slice(topStart + 1))
            .filter((item) => item.name?.trim())
            .map((item) => ({
              name: item.name.trim(),
              minutes: Math.max(0, Math.round(parseNum(item.minutes ?? "0"))),
            }));

    return {
      hourly,
      topApps,
      pickups: Math.max(0, Math.round(parseNum(fields.pickups ?? "0"))),
      firstPickup: (fields.first_pickup ?? "").trim(),
      insight: (fields.insight ?? "").trim(),
    };
  } catch {
    console.warn("[PeekPhoneYAMLParser] parseScreenTime failed");
    return undefined;
  }
}
