/**
 * PeekPhoneYAMLPrinter
 * 將 PeekPhoneData 結構序列化為 YAML 字串
 * 用於 round-trip 測試和 AI prompt 範例
 */
import type {
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

/**
 * 轉義 YAML 字串值
 * 包含特殊字元時加雙引號，否則直接輸出
 */
function yamlStr(value: string): string {
  if (
    value === "" ||
    value.includes(":") ||
    value.includes("#") ||
    value.includes("\n") ||
    value.includes('"') ||
    value.includes("'") ||
    value.startsWith(" ") ||
    value.endsWith(" ") ||
    value.startsWith("-") ||
    value.startsWith("{") ||
    value.startsWith("[") ||
    value === "true" ||
    value === "false" ||
    value === "null" ||
    /^\d/.test(value)
  ) {
    return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n")}"`;
  }
  return value;
}

/**
 * 將多行文字序列化為 YAML block scalar (|)
 * 單行文字則用普通字串格式
 */
function yamlContent(content: string, indent: number): string {
  if (!content.includes("\n")) {
    return yamlStr(content);
  }
  const pad = " ".repeat(indent);
  const lines = content.split("\n");
  return "|\n" + lines.map((l) => pad + l).join("\n");
}

/** 序列化 Group A (聊天) 為 YAML */
export function printGroupA(chats: PeekChatThread[]): string {
  const lines: string[] = ["chats:"];
  for (const thread of chats) {
    lines.push(`  - contact: ${yamlStr(thread.contactName)}`);
    lines.push("    messages:");
    for (const msg of thread.messages) {
      lines.push(`      - from: ${yamlStr(msg.senderName)}`);
      lines.push(`        text: ${yamlStr(msg.content)}`);
      lines.push(`        self: ${msg.isSelf}`);
      lines.push(`        time: ${msg.timestamp}`);
    }
  }
  return lines.join("\n");
}

/** 序列化 Group B (行程+飲食+備忘錄) 為 YAML */
export function printGroupB(data: {
  schedule: PeekScheduleItem[];
  meals: PeekMealRecord[];
  memos: PeekMemo[];
}): string {
  const lines: string[] = ["schedule:"];
  for (const item of data.schedule) {
    lines.push(`  - time: ${yamlStr(item.time)}`);
    lines.push(`    title: ${yamlStr(item.title)}`);
    if (item.location !== undefined) {
      lines.push(`    location: ${yamlStr(item.location)}`);
    }
    lines.push(`    done: ${item.done}`);
  }

  lines.push("");
  lines.push("meals:");
  for (const meal of data.meals) {
    lines.push(`  - type: ${meal.mealType}`);
    lines.push(`    food: ${yamlStr(meal.food)}`);
    lines.push(`    time: ${yamlStr(meal.time)}`);
    if (meal.note !== undefined) {
      lines.push(`    note: ${yamlStr(meal.note)}`);
    }
  }

  lines.push("");
  lines.push("memos:");
  for (const memo of data.memos) {
    lines.push(`  - text: ${yamlStr(memo.content)}`);
    lines.push(`    done: ${memo.done}`);
  }

  return lines.join("\n");
}

/** 序列化 Group C (記事本+日記+錢包) 為 YAML */
export function printGroupC(data: {
  notes: PeekNote[];
  diary: PeekDiaryEntry[];
  balance: number;
  transactions: PeekTransaction[];
}): string {
  const lines: string[] = ["notes:"];
  for (const note of data.notes) {
    lines.push(`  - title: ${yamlStr(note.title)}`);
    lines.push(`    content: ${yamlContent(note.content, 6)}`);
  }

  lines.push("");
  lines.push("diary:");
  for (const entry of data.diary) {
    lines.push(`  - date: ${yamlStr(entry.date)}`);
    lines.push(`    mood: ${entry.mood}`);
    lines.push(`    content: ${yamlContent(entry.content, 6)}`);
    if (entry.weather !== undefined) {
      lines.push(`    weather: ${yamlStr(entry.weather)}`);
    }
  }

  lines.push("");
  lines.push(`balance: ${data.balance}`);

  lines.push("");
  lines.push("transactions:");
  for (const tx of data.transactions) {
    lines.push(`  - description: ${yamlStr(tx.description)}`);
    lines.push(`    amount: ${tx.amount}`);
    lines.push(`    time: ${yamlStr(tx.time)}`);
  }

  return lines.join("\n");
}

/** 序列化完整 PeekPhoneData 為 YAML */
export function printFullData(data: PeekPhoneData): string {
  const groupA = printGroupA(data.chats);
  const groupB = printGroupB({
    schedule: data.schedule,
    meals: data.meals,
    memos: data.memos,
  });
  const groupC = printGroupC({
    notes: data.notes,
    diary: data.diary,
    balance: data.balance,
    transactions: data.transactions,
  });
  const groupD = printGroupD(data.gallery);
  return [groupA, "", groupB, "", groupC, "", groupD].join("\n");
}

/** 序列化 Group D (相冊) 為 YAML */
export function printGroupD(gallery: PeekGalleryItem[]): string {
  const lines: string[] = ["gallery:"];
  for (const item of gallery) {
    lines.push(`  - description: ${yamlStr(item.description)}`);
    lines.push(`    source: ${item.source}`);
    lines.push(`    reason: ${yamlStr(item.reason)}`);
    lines.push(`    date: ${yamlStr(item.date)}`);
  }
  return lines.join("\n");
}
