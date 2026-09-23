/// <reference types="vitest/globals" />

/**
 * 分包備份：切包不能丟訊息、不能重複，且每包都是可獨立解析的 ZIP。
 */
import "fake-indexeddb/auto";
import { deleteDB } from "idb";
import { strFromU8, unzipSync } from "fflate";
import { closeDatabase, db, DB_STORES } from "@/db/database";
import { appendChatMessages } from "@/db/chatMessageStore";
import type { ChatMessage } from "@/types/chat";
import {
  buildSplitBackup,
  getBackupGroupFilename,
  getBackupPartFilename,
  getBackupPartIndexFromFilename,
  getPartBudgetBytes,
  isMobileDevice,
  type ClosedBackupPart,
} from "@/services/AutoBackupService";

function message(chatId: string, index: number): ChatMessage {
  return {
    id: `${chatId}-msg-${String(index).padStart(4, "0")}`,
    sender: index % 2 === 0 ? "user" : "assistant",
    name: index % 2 === 0 ? "User" : "Assistant",
    is_user: index % 2 === 0,
    status: "sent",
    // 不可壓縮的內容，讓輸出大小隨訊息數成長
    content: `${index}:${Math.random().toString(36).repeat(8)}`,
    createdAt: index,
    updatedAt: index,
  };
}

async function seedChat(chatId: string, count: number) {
  await db.put(DB_STORES.CHATS, {
    id: chatId,
    name: `Chat ${chatId}`,
    characterId: "char-1",
    messages: [],
    createdAt: 1,
    updatedAt: 1,
  });
  await appendChatMessages(
    chatId,
    Array.from({ length: count }, (_, i) => message(chatId, i)),
  );
}

async function runBackup(partBudgetBytes: number) {
  const parts: Array<ClosedBackupPart & { files: Record<string, Uint8Array> }> =
    [];
  await buildSplitBackup({
    partBudgetBytes,
    openPart: async () => undefined,
    onPartClosed: async (part) => {
      parts.push({ ...part, files: unzipSync(part.data!) });
    },
  });
  return parts;
}

/** 把所有分包裡的聊天訊息依序拼回來 */
function collectMessages(
  parts: Array<{ files: Record<string, Uint8Array> }>,
): Map<string, string[]> {
  const result = new Map<string, string[]>();
  for (const { files } of parts) {
    const names = Object.keys(files).sort();
    for (const name of names) {
      if (!name.startsWith("chats/") && !name.startsWith("chat-segments/")) {
        continue;
      }
      const chat = JSON.parse(strFromU8(files[name]));
      const ids = result.get(chat.id) ?? [];
      ids.push(...chat.messages.map((m: ChatMessage) => m.id));
      result.set(chat.id, ids);
    }
  }
  return result;
}

describe("分包備份", () => {
  beforeEach(async () => {
    closeDatabase();
    await deleteDB("aguaphone-db");
    await db.init();
    await db.put(DB_STORES.CHARACTERS, { id: "char-1", nickname: "小明" });
  });

  afterEach(() => {
    closeDatabase();
  });

  it("不分包時只有一包，格式與舊版相同", async () => {
    await seedChat("a", 30);
    await seedChat("b", 5);

    const parts = await runBackup(Infinity);
    expect(parts).toHaveLength(1);

    const files = parts[0].files;
    const backup = JSON.parse(strFromU8(files["backup.json"]));
    expect(backup.type).toBe("aguaphone-auto-backup");
    expect(backup.characters).toHaveLength(1);
    expect(Object.keys(files).some((n) => n.startsWith("chat-segments/"))).toBe(
      false,
    );

    const meta = JSON.parse(strFromU8(files["metadata.json"]));
    expect(meta).toMatchObject({
      format: "aguaphone-streaming-backup",
      partIndex: 0,
      isLastPart: true,
      totalParts: 1,
      chatCount: 2,
    });

    const chatA = JSON.parse(strFromU8(files["chats/a.json"]));
    expect(chatA.name).toBe("Chat a");
    expect(chatA.messages).toHaveLength(30);
  });

  it("巨大聊天被切成多段，拼回來訊息完整且不重複", async () => {
    await seedChat("big", 450);
    await seedChat("small", 3);

    // 預算極小：每個訊息批次（100 筆）之後都會切包
    const parts = await runBackup(1);
    expect(parts.length).toBeGreaterThan(3);

    // 只有第 1 包有 backup.json；每包都有 metadata
    expect(parts[0].files["backup.json"]).toBeDefined();
    for (const [i, part] of parts.entries()) {
      if (i > 0) expect(part.files["backup.json"]).toBeUndefined();
      const meta = JSON.parse(strFromU8(part.files["metadata.json"]));
      expect(meta.partIndex).toBe(i);
      expect(meta.isLastPart).toBe(i === parts.length - 1);
    }
    const lastMeta = JSON.parse(
      strFromU8(parts[parts.length - 1].files["metadata.json"]),
    );
    expect(lastMeta.totalParts).toBe(parts.length);

    // 續段在 chat-segments/，段號遞增
    const segments = parts.flatMap(({ files }) =>
      Object.keys(files)
        .filter((n) => n.startsWith("chat-segments/big."))
        .map((n) => JSON.parse(strFromU8(files[n]))._segment),
    );
    expect(segments).toEqual([1, 2, 3, 4]);

    const messages = collectMessages(parts);
    expect(messages.get("big")).toEqual(
      Array.from({ length: 450 }, (_, i) => message("big", i).id),
    );
    expect(messages.get("small")).toHaveLength(3);
  });

  it("每包自成一體：包內引用的媒體都在同一包裡", async () => {
    // 同一張圖在各段都出現：包內去重，跨包各存一份
    const shared = `data:image/png;base64,${btoa("shared-image".repeat(40))}`;
    const records = Array.from({ length: 350 }, (_, i) => {
      const msg = message("pics", i);
      if (i % 50 === 0) {
        msg.imageUrl =
          i % 100 === 0
            ? shared
            : `data:image/png;base64,${btoa(`image-${i}`.repeat(40))}`;
      }
      return msg;
    });
    await db.put(DB_STORES.CHATS, {
      id: "pics",
      name: "Pics",
      characterId: "char-1",
      messages: [],
      createdAt: 1,
      updatedAt: 1,
    });
    await appendChatMessages("pics", records);

    const parts = await runBackup(1);
    expect(parts.length).toBeGreaterThan(2);

    let referenced = 0;
    for (const { files } of parts) {
      for (const name of Object.keys(files)) {
        if (!name.startsWith("chats/") && !name.startsWith("chat-segments/")) {
          continue;
        }
        const chat = JSON.parse(strFromU8(files[name]));
        for (const msg of chat.messages) {
          if (!msg.imageUrl) continue;
          expect(msg.imageUrl).toMatch(/^media\//);
          expect(files[msg.imageUrl]).toBeDefined();
          referenced++;
        }
      }
    }
    expect(referenced).toBe(7);
  });

  it("中等預算時切在聊天之間", async () => {
    for (const id of ["c1", "c2", "c3", "c4"]) await seedChat(id, 40);

    const parts = await runBackup(8 * 1024);
    expect(parts.length).toBeGreaterThan(1);

    const messages = collectMessages(parts);
    for (const id of ["c1", "c2", "c3", "c4"]) {
      expect(messages.get(id)).toHaveLength(40);
    }
  });
});

describe("分包檔名", () => {
  const base = "aguaphone-backup-2026-09-24_10h00m00s.zip";

  it("第 1 包沿用原檔名，之後加 -partN", () => {
    expect(getBackupPartFilename(base, 0)).toBe(base);
    expect(getBackupPartFilename(base, 1)).toBe(
      "aguaphone-backup-2026-09-24_10h00m00s-part2.zip",
    );
  });

  it("可以從分包檔名還原所屬備份與序號", () => {
    const part3 = getBackupPartFilename(base, 2);
    expect(getBackupGroupFilename(part3)).toBe(base);
    expect(getBackupGroupFilename(base)).toBe(base);
    expect(getBackupPartIndexFromFilename(part3)).toBe(2);
    expect(getBackupPartIndexFromFilename(base)).toBe(0);
  });
});

describe("分包預算", () => {
  const MB = 1024 * 1024;

  it("辨識手機（含偽裝成 Mac 的 iPadOS）", () => {
    const iphone =
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15";
    const android = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36";
    const mac = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15";
    const windows = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";
    expect(isMobileDevice(iphone, 5)).toBe(true);
    expect(isMobileDevice(android, 5)).toBe(true);
    expect(isMobileDevice(mac, 5)).toBe(true); // iPadOS
    expect(isMobileDevice(mac, 0)).toBe(false);
    expect(isMobileDevice(windows, 0)).toBe(false);
  });

  it("手機與記憶體模式 300MB，電腦 1GB", () => {
    expect(getPartBudgetBytes("disk", true)).toBe(300 * MB);
    expect(getPartBudgetBytes("memory", true)).toBe(300 * MB);
    expect(getPartBudgetBytes("memory", false)).toBe(300 * MB);
    expect(getPartBudgetBytes("disk", false)).toBe(1024 * MB);
  });
});
