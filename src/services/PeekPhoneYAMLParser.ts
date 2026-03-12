/**
 * PeekPhoneYAMLParser
 * 專用 YAML 解析器，針對 PeekPhoneData 結構設計
 * 解析 AI 回傳的 YAML 字串為結構化資料
 * 解析失敗時返回 fallback 空結構，不拋出異常
 */
import type {
    PeekChatMessage,
    PeekChatThread,
    PeekDiaryEntry,
    PeekGalleryItem,
    PeekMealRecord,
    PeekMemo,
    PeekNote,
    PeekPhoneData,
    PeekScheduleItem,
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
        currentMsg = null;
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
          currentMsg.timestamp = parseNum(token.value);
      }
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

/** 解析 Group D YAML → PeekGalleryItem[] */
export function parseGroupD(yaml: string): PeekGalleryItem[] {
  try {
    const tokens = tokenize(yaml);
    const items = parseListItems(findSection(tokens, "gallery"));
    const validSources = ["selfie", "scene", "saved"] as const;
    return items.map((item) => {
      const rawSource = item.source ?? "scene";
      const source = validSources.includes(rawSource as any)
        ? (rawSource as PeekGalleryItem["source"])
        : "scene";
      return {
        id: genId(),
        description: item.description ?? "",
        source,
        reason: item.reason ?? "",
        date: item.date ?? "",
      };
    });
  } catch {
    console.warn("[PeekPhoneYAMLParser] parseGroupD failed");
    return [];
  }
}

/** 解析完整 PeekPhoneData YAML */
export function parseFullData(yaml: string): PeekPhoneData {
  try {
    const chats = parseGroupA(yaml);
    const { schedule, meals, memos } = parseGroupB(yaml);
    const { notes, diary, balance, transactions } = parseGroupC(yaml);
    const gallery = parseGroupD(yaml);

    return {
      characterId: "",
      chats,
      schedule,
      meals,
      balance,
      transactions,
      memos,
      notes,
      diary,
      gallery,
    };
  } catch {
    console.warn("[PeekPhoneYAMLParser] parseFullData failed");
    return {
      characterId: "",
      chats: [],
      schedule: [],
      meals: [],
      balance: 0,
      transactions: [],
      memos: [],
      notes: [],
      diary: [],
      gallery: [],
    };
  }
}
